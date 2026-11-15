/* Roster engine: pure functions, no DOM. Works in browser (window.RosterEngine) and Node (require). */
(function (root) {
  'use strict';
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const CALENDARS = {
    '365': '365 days (incl. Sundays & holidays)',
    EXCL_HOL: 'Every day except public holidays',
    EXCL_SUN_HOL: 'Closed Sundays & public holidays'
  };
  const LABEL = { W: 'Working', WO: 'Weekly off', L: 'Leave', CO: 'Comp-off', H: 'Closed / holiday' };

  const pad = n => String(n).padStart(2, '0');
  const monthDates = ym => {
    const [y, m] = ym.split('-').map(Number);
    const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return Array.from({ length: n }, (_, i) => `${y}-${pad(m)}-${pad(i + 1)}`);
  };
  const dowOf = d => new Date(d + 'T00:00:00Z').getUTCDay();
  const fmt = d => `${DOW[dowOf(d)]} ${+d.slice(8)} ${MON[+d.slice(5, 7) - 1]}`;
  const weekKey = d => Math.floor((Date.parse(d + 'T00:00:00Z') / 864e5 + 3) / 7); // Mon-Sun weeks
  const weeksOf = dates => {
    const w = {};
    dates.forEach(d => (w[weekKey(d)] = w[weekKey(d)] || []).push(d));
    return Object.keys(w).sort((a, b) => a - b).map(k => w[k]);
  };
  const newId = p => p + Math.random().toString(36).slice(2, 8);

  /* ---- lookups ---- */
  function index(state) {
    const ix = { hol: new Set(state.holidays.map(h => h.date)), procById: {}, brandById: {}, empById: {}, podById: {},
      procsOf: {}, empsOf: {}, brandProcs: {}, leaveMap: {} };
    state.brands.forEach(b => { ix.brandById[b.id] = b; ix.brandProcs[b.id] = []; });
    state.pods.forEach(p => (ix.podById[p.id] = p));
    state.employees.forEach(e => { ix.empById[e.id] = e; ix.procsOf[e.id] = []; });
    state.processes.forEach(p => {
      ix.procById[p.id] = p; ix.empsOf[p.id] = [];
      if (ix.brandProcs[p.brandId]) ix.brandProcs[p.brandId].push(p);
    });
    const seen = new Set();
    state.assignments.forEach(a => {
      const p = ix.procById[a.procId];
      if (!p || !ix.empById[a.empId] || seen.has(a.empId + a.procId)) return;
      seen.add(a.empId + a.procId);
      ix.procsOf[a.empId].push(p); ix.empsOf[p.id].push(a.empId);
    });
    state.leaves.forEach(l => (ix.leaveMap[l.empId + '|' + l.date] = l.type));
    ix.brandPod = bid => {
      for (const p of ix.brandProcs[bid] || []) for (const id of ix.empsOf[p.id]) return ix.empById[id].podId;
      return null;
    };
    ix.brandEmps = bid => {
      const s = new Set();
      (ix.brandProcs[bid] || []).forEach(p => ix.empsOf[p.id].forEach(id => s.add(id)));
      return [...s];
    };
    return ix;
  }

  /* ---- operating calendar of a PROCESS (separate from an employee's own schedule) ---- */
  function operates(p, d, hol) {
    if (p.calendar === '365') return true;
    if (hol.has(d)) return false;
    if (p.calendar === 'EXCL_SUN_HOL' && dowOf(d) === 0) return false;
    return true;
  }
  function required(p, d, hol) {
    if (!operates(p, d, hol)) return 0;
    const o = p.minByDow && p.minByDow[dowOf(d)];
    return o !== undefined && o !== null && o !== '' ? Number(o) : Number(p.minStaff) || 0;
  }

  /* ---- candidates for temporary cover (backup resource recommendation) ---- */
  function rankCandidates(ix, state, roster, covers, brandId, d, procIds) {
    const today = covers.filter(c => c.date === d);
    const bpod = ix.brandPod(brandId);
    const brandEmps = new Set(ix.brandEmps(brandId));
    const month = {};
    covers.forEach(c => (month[c.empId] = (month[c.empId] || 0) + 1));
    return state.employees.filter(e => {
      if (e.role === 'lead' || !roster[e.id] || roster[e.id][d] !== 'W') return false;
      if (procIds.some(pid => ix.empsOf[pid].includes(e.id))) return false;
      const mine = today.filter(c => c.empId === e.id);
      if (mine.some(c => ix.procById[c.procId].brandId !== brandId || procIds.includes(c.procId))) return false;
      const load = ix.procsOf[e.id].filter(q => operates(q, d, ix.hol)).length + mine.length;
      return load + procIds.length <= state.config.maxLoad;
    }).map(e => {
      const same = brandEmps.has(e.id), pod = e.podId === bpod, fl = e.role === 'floater';
      return { e, rank: same ? 0 : fl && pod ? 1 : pod ? 2 : fl ? 3 : 4, n: month[e.id] || 0 };
    }).sort((a, b) => a.rank - b.rank || a.n - b.n || a.e.name.localeCompare(b.e.name));
  }

  /* ---- generation (optimising solver) ----
     Objective, minimised lexicographically-by-weight:
       1e6 x uncovered process-days          (mandatory coverage, never traded for anything else)
       60  x temporary-cover units           (prefer people working their own processes)
       20  x weekly offs not on preferred weekday
       40  x working days beyond the consecutive-days limit
       2   x sum over days of (offs that day)^2   (spreads offs, avoids everyone off together)
       3   x weekday changes between an employee's consecutive weekly offs (stable pattern)
       4   x sum of (covers per person)^2    (fair backup load)
       6   x variance of weekend offs across employees (fair weekend distribution)
     Steps:  (1) greedy construction, (2) local search with move + swap neighbourhoods,
     (3) every candidate roster is scored with an EXACT cover assignment (max bipartite matching per day). */
  const WT = { unmet: 1e6, cover: 60, pref: 20, streak: 40, spread: 2, consist: 3, coverBal: 4, weekend: 6 };

  function generate(state, opts) {
    opts = opts || {};
    const t0 = Date.now();
    const ix = index(state), dates = monthDates(state.month), cfg = state.config;
    const old = state.roster || {}, locks = state.locks || {};
    const idx = {}, dw = {}; dates.forEach((d, i) => { idx[d] = i; dw[d] = dowOf(d); });
    const roster = {};
    state.employees.forEach(e => {
      const r = (roster[e.id] = {}), ps = ix.procsOf[e.id];
      dates.forEach(d => {
        const lv = ix.leaveMap[e.id + '|' + d];
        const lk = locks[e.id] && locks[e.id][d] && old[e.id] && old[e.id][d];
        if (lv) r[d] = lv;
        else if (lk === 'W' || lk === 'WO') r[d] = lk;
        else if (ps.length ? ps.every(q => !operates(q, d, ix.hol)) : ix.hol.has(d)) r[d] = 'H';
        else r[d] = 'W';
      });
    });

    /* (1) greedy construction */
    const staffed = {};
    state.processes.forEach(q => {
      staffed[q.id] = {};
      dates.forEach(d => (staffed[q.id][d] = ix.empsOf[q.id].filter(id => roster[id][d] === 'W').length));
    });
    const offsOn = {}; dates.forEach(d => (offsOn[d] = state.employees.filter(e => roster[e.id][d] === 'WO').length));
    const lastWO = {}, movable = [];
    const runBefore = (id, i) => { let n = 0; for (let j = i - 1; j >= 0 && roster[id][dates[j]] === 'W'; j--) n++; return n; };
    const risk = e => ix.procsOf[e.id].filter(q => ix.empsOf[q.id].length <= 1).length;
    weeksOf(dates).forEach((wd, wi) => {
      const need = [];
      state.employees.forEach(e => {
        const sts = wd.map(d => roster[e.id][d]);
        const woDay = wd.find(d => roster[e.id][d] === 'WO');
        if (woDay) lastWO[e.id] = dw[woDay];
        const rest = sts.some((x, i) => x === 'H' && !ix.hol.has(wd[i])); // recurring closure (e.g. Sunday) counts as rest; a public holiday does not
        const partial = wd.length < 5 && runBefore(e.id, idx[wd[0]]) + wd.length <= cfg.maxConsecutive; // short edge week: only if the streak would break the limit
        if (partial || sts.includes('WO') || rest) return;
        const cand = wd.filter(d => roster[e.id][d] === 'W');
        if (cand.length) need.push({ e, cand });
      });
      need.sort((a, b) => risk(b.e) - risk(a.e) || a.cand.length - b.cand.length || a.e.name.localeCompare(b.e.name));
      need.forEach(({ e, cand }) => {
        let best = null;
        cand.forEach(d => {
          let short = 0;
          ix.procsOf[e.id].forEach(q => { const rq = required(q, d, ix.hol); if (rq && staffed[q.id][d] <= rq) short++; });
          const cost = short * 1000 + (e.prefOff != null && e.prefOff !== dw[d] ? 8 : 0) + offsOn[d] * 2
            + (lastWO[e.id] != null && lastWO[e.id] !== dw[d] ? 12 : 0) + (runBefore(e.id, idx[d]) > cfg.maxConsecutive ? 40 : 0) + idx[d] * 0.001;
          if (!best || cost < best.cost) best = { d, cost };
        });
        roster[e.id][best.d] = 'WO'; offsOn[best.d]++; lastWO[e.id] = dw[best.d];
        ix.procsOf[e.id].forEach(q => staffed[q.id][best.d]--);
        movable.push({ e: e.id, wd, wi, d: best.d });
      });
    });

    /* manual covers that are still valid are fixed inputs */
    const manual = (state.covers || []).filter(c => !c.auto && idx[c.date] !== undefined && ix.procById[c.procId] && roster[c.empId] && roster[c.empId][c.date] === 'W');
    const manualCnt = {}; manual.forEach(c => (manualCnt[c.procId + '|' + c.date] = (manualCnt[c.procId + '|' + c.date] || 0) + 1));
    const blocked = new Set(manual.map(c => c.empId + '|' + c.date));
    const procCount = (q, d) => ix.empsOf[q.id].reduce((n, id) => n + (roster[id][d] === 'W' ? 1 : 0), 0) + (manualCnt[q.id + '|' + d] || 0);

    /* exact cover assignment for one day: demands (brand + processes short by k) x candidates, maximum bipartite matching */
    function coverDate(d) {
      const demands = [], today = manual.filter(c => c.date === d);
      state.brands.forEach(b => {
        const gaps = [];
        ix.brandProcs[b.id].forEach(q => { const rq = required(q, d, ix.hol); if (!rq) return; const df = rq - procCount(q, d); if (df > 0) gaps.push({ q, df }); });
        const mx = gaps.reduce((m, g) => Math.max(m, g.df), 0);
        for (let k = 0; k < mx; k++) demands.push({ brandId: b.id, procIds: gaps.filter(g => g.df > k).map(g => g.q.id) });
      });
      if (!demands.length) return { unmet: 0, units: 0, assign: [] };
      demands.forEach(dm => (dm.cands = rankCandidates(ix, state, roster, today, dm.brandId, d, dm.procIds).map(c => c.e.id)));
      demands.sort((a, b) => a.cands.length - b.cands.length);
      const matchC = {}, matched = new Set();
      const tryD = (i, seen) => {
        for (const c of demands[i].cands) { if (seen.has(c)) continue; seen.add(c); if (matchC[c] === undefined || tryD(matchC[c], seen)) { matchC[c] = i; return true; } }
        return false;
      };
      demands.forEach((dm, i) => { if (tryD(i, new Set())) matched.add(i); });
      const assign = Object.keys(matchC).map(c => ({ empId: c, procIds: demands[matchC[c]].procIds }));
      let unmet = 0, units = 0; demands.forEach((dm, i) => { if (matched.has(i)) units += dm.procIds.length; else unmet += dm.procIds.length; });
      return { unmet, units, assign };
    }
    const res = {}; dates.forEach(d => (res[d] = coverDate(d)));

    function soft() {
      let J = 0; const offs = {}, wk = {};
      state.employees.forEach(e => {
        const r = roster[e.id]; let run = 0, prev = null, we = 0, has = false;
        dates.forEach(d => {
          const st = r[d];
          if (st === 'W') run++; else { if (run > cfg.maxConsecutive) J += WT.streak * (run - cfg.maxConsecutive); run = 0; }
          if (st === 'WO') {
            offs[d] = (offs[d] || 0) + 1; has = true; const w = dw[d];
            if (e.prefOff != null && e.prefOff !== w) J += WT.pref;
            if (prev !== null && prev !== w) J += WT.consist; prev = w;
            if (w === 0 || w === 6) we++;
          }
        });
        if (run > cfg.maxConsecutive) J += WT.streak * (run - cfg.maxConsecutive);
        if (has) wk[e.id] = we;
      });
      Object.keys(offs).forEach(d => (J += WT.spread * offs[d] * offs[d]));
      const v = Object.keys(wk).map(k => wk[k]), mean = v.reduce((a, b) => a + b, 0) / (v.length || 1);
      v.forEach(x => (J += WT.weekend * (x - mean) * (x - mean)));
      return J;
    }
    function metrics() {
      let U = 0, C = 0; const per = {};
      dates.forEach(d => { U += res[d].unmet; C += res[d].units; res[d].assign.forEach(a => (per[a.empId] = (per[a.empId] || 0) + 1)); });
      let pref = 0, streak = 0;
      state.employees.forEach(e => {
        let run = 0;
        dates.forEach(d => {
          if (roster[e.id][d] === 'WO' && e.prefOff != null && e.prefOff !== dw[d]) pref++;
          if (roster[e.id][d] === 'W') run++; else { if (run > cfg.maxConsecutive) streak += run - cfg.maxConsecutive; run = 0; }
        });
        if (run > cfg.maxConsecutive) streak += run - cfg.maxConsecutive;
      });
      const bal = Object.keys(per).reduce((s, k) => s + per[k] * per[k], 0) * WT.coverBal;
      return { uncovered: U, coverUnits: C, prefMisses: pref, streakExcess: streak, objective: Math.round(WT.unmet * U + WT.cover * C + bal + soft()) };
    }
    const greedyMetrics = metrics();

    /* (2) local search: single moves and swaps between coupled employees, accept only strict improvements */
    let moves = 0, passes = 0;
    if (opts.mode !== 'greedy') {
      let best = metrics().objective;
      const trial = (apply, undo, ds) => {
        const saved = ds.map(d => res[d]); apply(); ds.forEach(d => (res[d] = coverDate(d)));
        const c = metrics().objective;
        if (c < best) { best = c; moves++; return true; }
        undo(); ds.forEach((d, i) => (res[d] = saved[i])); return false;
      };
      const brandsOf = {}; state.employees.forEach(e => (brandsOf[e.id] = new Set(ix.procsOf[e.id].map(q => q.brandId))));
      const coupled = (a, b) => [...brandsOf[a]].some(x => brandsOf[b].has(x));
      const tEnd = t0 + (opts.timeMs || 3000);
      let improved = true;
      while (improved && passes < 12 && Date.now() < tEnd) {
        improved = false; passes++;
        movable.forEach(m => {
          const r = roster[m.e];
          m.wd.forEach(alt => {
            const from = m.d;
            if (alt === from || r[alt] !== 'W' || blocked.has(m.e + '|' + alt)) return;
            if (trial(() => { r[from] = 'W'; r[alt] = 'WO'; }, () => { r[from] = 'WO'; r[alt] = 'W'; }, [from, alt])) { m.d = alt; improved = true; }
          });
        });
        for (let i = 0; i < movable.length; i++) for (let j = i + 1; j < movable.length; j++) {
          const m1 = movable[i], m2 = movable[j];
          if (m1.wi !== m2.wi || m1.d === m2.d || !coupled(m1.e, m2.e)) continue;
          const r1 = roster[m1.e], r2 = roster[m2.e], d1 = m1.d, d2 = m2.d;
          if (r1[d2] !== 'W' || r2[d1] !== 'W' || blocked.has(m1.e + '|' + d2) || blocked.has(m2.e + '|' + d1)) continue;
          if (trial(() => { r1[d1] = 'W'; r1[d2] = 'WO'; r2[d2] = 'W'; r2[d1] = 'WO'; }, () => { r1[d1] = 'WO'; r1[d2] = 'W'; r2[d2] = 'WO'; r2[d1] = 'W'; }, [d1, d2])) { m1.d = d2; m2.d = d1; improved = true; }
        }
      }
    }
    const finalMetrics = metrics();

    /* (3) materialise covers from the exact assignment */
    const covers = manual.slice();
    dates.forEach(d => res[d].assign.forEach(a => a.procIds.forEach(pid => covers.push({ empId: a.empId, procId: pid, date: d, auto: true }))));
    const solver = { mode: opts.mode === 'greedy' ? 'greedy' : 'optimised', greedy: greedyMetrics, final: finalMetrics, passes, moves, ms: Date.now() - t0,
      status: finalMetrics.uncovered === 0 ? 'All required coverage is satisfied (optimal for the mandatory objective).' : `Best found: ${finalMetrics.uncovered} process-day(s) cannot be covered with the available people.` };
    return { roster, covers, solver };
  }

  /* ---- validation: derives coverage + issues from the roster. Mandatory = error, policy = warning, preference = pref ---- */
  function analyze(state) {
    const ix = index(state), dates = monthDates(state.month), cfg = state.config, roster = state.roster;
    const covers = (state.covers || []).filter(c => dates.includes(c.date));
    const cc = {};
    covers.forEach(c => (cc[c.procId + '|' + c.date] = (cc[c.procId + '|' + c.date] || 0) + 1));
    const coverage = {}, issues = [];
    const bn = p => (ix.brandById[p.brandId] ? ix.brandById[p.brandId].name : '?');
    let reqDays = 0, okDays = 0;

    state.processes.forEach(p => {
      coverage[p.id] = {};
      const assigned = ix.empsOf[p.id];
      let maxReq = 0;
      dates.forEach(d => {
        const rq = required(p, d, ix.hol); maxReq = Math.max(maxReq, rq);
        if (!rq) { coverage[p.id][d] = { req: 0, have: 0, cls: 'closed', working: [] }; return; }
        const working = assigned.filter(id => roster[id] && roster[id][d] === 'W');
        const cov = cc[p.id + '|' + d] || 0, have = working.length + cov;
        const cls = have >= rq ? (cov ? 'covered' : 'ok') : have === 0 ? 'none' : 'short';
        coverage[p.id][d] = { req: rq, have, cov, cls, working };
        reqDays++; if (have >= rq) okDays++;
        if (have < rq) {
          const out = assigned.filter(id => !working.includes(id)).map(id => `${ix.empById[id].name} (${LABEL[roster[id][d]] || '?'})`);
          issues.push({ id: `gap|${p.id}|${d}`, sev: 'error', type: have === 0 ? 'NO_COVERAGE' : 'UNDERSTAFFED', procId: p.id, date: d,
            title: `${bn(p)} › ${p.name}: ${have === 0 ? 'no coverage' : 'understaffed'} on ${fmt(d)}`,
            detail: `Needs ${rq}, has ${have}. ${out.length ? 'Unavailable: ' + out.join(', ') + '.' : 'No employees assigned.'}` });
        }
      });
      if (maxReq > 0 && assigned.length === 0)
        issues.push({ id: `noasg|${p.id}`, sev: 'error', type: 'NO_ASSIGNEE', procId: p.id, title: `${bn(p)} › ${p.name}: nobody assigned`, detail: 'Process requires coverage but has no employee. Assign someone in Setup.' });
      else if (assigned.length < maxReq)
        issues.push({ id: `struct|${p.id}`, sev: 'error', type: 'STRUCTURAL', procId: p.id, title: `${bn(p)} › ${p.name}: not enough people assigned`, detail: `Needs up to ${maxReq} people on a day but only ${assigned.length} assigned.` });
    });

    state.employees.forEach(e => {
      const r = roster[e.id]; if (!r) return;
      weeksOf(dates).forEach(wd => {
        if (wd.length < 5) return;
        const sts = wd.map(d => r[d]);
        const rest = sts.some((x, i) => x === 'H' && !ix.hol.has(wd[i]));
        if (!sts.includes('WO') && !rest && sts.includes('W'))
          issues.push({ id: `wo|${e.id}|${wd[0]}`, sev: 'error', type: 'WEEKLY_OFF_MISSING', empId: e.id, date: wd[0],
            title: `${e.name}: no weekly off in week of ${fmt(wd[0])}`, detail: 'Every employee needs one weekly off per week (or a closed day). Move a day off to a day with spare coverage.' });
        const wo = wd.find(d => r[d] === 'WO');
        if (wo && e.prefOff != null && dowOf(wo) !== e.prefOff)
          issues.push({ id: `pref|${e.id}|${wd[0]}`, sev: 'pref', type: 'PREFERENCE', empId: e.id, date: wo,
            title: `${e.name}: weekly off on ${fmt(wo)} (prefers ${DOW[e.prefOff]})`, detail: 'Preference only. Coverage requirements take priority.' });
      });
      let run = [];
      const flush = () => { if (run.length > cfg.maxConsecutive) issues.push({ id: `run|${e.id}|${run[0]}`, sev: 'warning', type: 'CONSECUTIVE', empId: e.id, date: run[0],
        title: `${e.name}: ${run.length} working days in a row`, detail: `${fmt(run[0])} to ${fmt(run[run.length - 1])} exceeds the limit of ${cfg.maxConsecutive}.` }); run = []; };
      dates.forEach(d => { if (r[d] === 'W') run.push(d); else flush(); }); flush();
      const heavy = dates.filter(d => r[d] === 'W' && ix.procsOf[e.id].filter(q => operates(q, d, ix.hol)).length + covers.filter(c => c.empId === e.id && c.date === d).length > cfg.maxLoad);
      if (heavy.length) issues.push({ id: `load|${e.id}`, sev: 'warning', type: 'OVERLOAD', empId: e.id, date: heavy[0],
        title: `${e.name}: overloaded on ${heavy.length} day(s)`, detail: `More than ${cfg.maxLoad} concurrent processes (including covers), e.g. ${fmt(heavy[0])}.` });
    });

    const order = { error: 0, warning: 1, pref: 2 };
    issues.sort((a, b) => order[a.sev] - order[b.sev] || (a.date || '').localeCompare(b.date || ''));
    const count = s => issues.filter(i => i.sev === s).length;
    const single = state.brands.filter(b => ix.brandEmps(b.id).length === 1).length;
    return { ix, coverage, issues, stats: { employees: state.employees.length, brands: state.brands.length, processes: state.processes.length,
      singleBrands: single, errors: count('error'), warnings: count('warning'), prefs: count('pref'), reqDays, okDays,
      coveragePct: reqDays ? Math.round(1000 * okDays / reqDays) / 10 : 100 } };
  }

  /* ---- resolution help for a coverage gap ---- */
  function suggest(state, issue) {
    if (!issue.procId || !issue.date) return [];
    const A = analyze(state), ix = A.ix, p = ix.procById[issue.procId], d = issue.date, out = [];
    const week = weeksOf(monthDates(state.month)).find(w => w.includes(d)) || [];
    ix.empsOf[p.id].forEach(eid => {
      const e = ix.empById[eid], st = state.roster[eid][d];
      if (st === 'WO') {
        const alts = week.filter(x => x !== d && state.roster[eid][x] === 'W' && !ix.procsOf[eid].some(q => {
          const rq = required(q, x, ix.hol); return rq && A.coverage[q.id][x].have - 1 < rq; }))
          .sort((a, b) => (dowOf(a) === e.prefOff ? 0 : 1) - (dowOf(b) === e.prefOff ? 0 : 1));
        alts.slice(0, 2).forEach(to => out.push({ type: 'shift_off', empId: eid, from: d, to,
          text: `Move ${e.name}'s weekly off from ${fmt(d)} to ${fmt(to)} (no new gap is created).` }));
      } else if (st === 'L' || st === 'CO') {
        out.push({ type: 'advice', text: `${e.name} is on ${LABEL[st].toLowerCase()} on ${fmt(d)}. Option: ask to reschedule it, or approve it only with a cover.` });
      }
    });
    const gap = ix.brandProcs[p.brandId].filter(q => { const c = A.coverage[q.id][d]; return c.req && c.have < c.req; });
    rankCandidates(ix, state, state.roster, state.covers || [], p.brandId, d, gap.map(q => q.id)).slice(0, 3).forEach(c => {
      const tag = c.rank === 0 ? 'same brand' : c.e.role === 'floater' ? 'floater' : c.rank === 2 ? 'same pod' : 'other pod';
      out.push({ type: 'cover', empId: c.e.id, date: d, procIds: gap.map(q => q.id),
        text: `Use ${c.e.name} (${ix.podById[c.e.podId] ? ix.podById[c.e.podId].name : ''}, ${tag}) as temporary cover for ${gap.map(q => q.name).join(' + ')} on ${fmt(d)}.` });
    });
    if (!out.some(o => o.type !== 'advice')) out.push({ type: 'advice', text: 'No automatic fix. Escalate: add a backup resource to this brand, relax the minimum for this day, or change the operating calendar.' });
    return out;
  }
  function applySuggestion(state, s) {
    if (s.type === 'shift_off') {
      state.roster[s.empId][s.from] = 'W'; state.roster[s.empId][s.to] = 'WO';
      state.locks[s.empId] = state.locks[s.empId] || {}; state.locks[s.empId][s.from] = true; state.locks[s.empId][s.to] = true;
    } else if (s.type === 'cover') {
      s.procIds.forEach(pid => state.covers.push({ empId: s.empId, procId: pid, date: s.date, auto: false }));
    }
  }

  /* ---- manual edits ---- */
  function setCell(state, empId, date, status) {
    state.leaves = state.leaves.filter(l => !(l.empId === empId && l.date === date));
    state.locks[empId] = state.locks[empId] || {};
    if (status === 'L' || status === 'CO') { state.leaves.push({ empId, date, type: status }); delete state.locks[empId][date]; }
    else state.locks[empId][date] = true;
    state.roster[empId][date] = status;
    if (status !== 'W') state.covers = state.covers.filter(c => !(c.empId === empId && c.date === date));
  }
  // Adds leave to the CURRENT roster without re-balancing, so the impact is visible as gaps.
  function addLeave(state, empId, dates, type) {
    const applied = [], skipped = [];
    dates.forEach(d => {
      if (!state.roster[empId] || !state.roster[empId][d]) return;
      state.leaves = state.leaves.filter(l => !(l.empId === empId && l.date === d));
      state.leaves.push({ empId, date: d, type });
      const st = state.roster[empId][d];
      if (st === 'WO' || st === 'H') { skipped.push(d); return; }
      state.roster[empId][d] = type; applied.push(d);
      state.covers = state.covers.filter(c => !(c.empId === empId && c.date === d));
    });
    return { applied, skipped };
  }

  const api = { DOW, MON, CALENDARS, LABEL, monthDates, dowOf, fmt, weeksOf, newId, operates, required, generate, analyze, suggest, applySuggestion, setCell, addLeave };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RosterEngine = api;
})(this);
