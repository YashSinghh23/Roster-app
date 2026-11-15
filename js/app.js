(function () {
  'use strict';
  const R = window.RosterEngine, D = window.RosterData, KEY = 'datastraw-roster-v1';
  let S, A;
  const ui = { tab: 'roster', view: 'company', entity: '', filter: 'error', sugg: {}, edit: null, msg: '' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const $ = id => document.getElementById(id);
  const opt = (v, label, sel) => `<option value="${esc(v)}"${String(sel) === String(v) ? ' selected' : ''}>${esc(label)}</option>`;
  const SHORT = { W: 'W', WO: 'OFF', L: 'L', CO: 'CO', H: '–' };

  /* ---------- state ---------- */
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable */ } }
  function regen() { const r = R.generate(S); S.roster = r.roster; S.covers = r.covers; }
  function commit(msg) { if (msg !== undefined) ui.msg = msg; ui.sugg = {}; save(); render(); }
  function ensure() {
    const ds = R.monthDates(S.month);
    if (!S.roster || S.employees.some(e => !S.roster[e.id] || ds.some(d => !S.roster[e.id][d]))) regen();
  }
  function load() {
    try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; }
    if (!S || !S.employees) { S = D.buildSample(); regen(); }
  }
  function setMonth(m) {
    if (!m || m === S.month) return;
    S.plans[S.month] = { roster: S.roster, covers: S.covers, locks: S.locks };
    S.month = m; const p = S.plans[m];
    if (p) { S.roster = p.roster; S.covers = p.covers; S.locks = p.locks; } else { S.roster = null; S.covers = []; S.locks = {}; regen(); }
    ui.edit = null; commit('');
  }
  const rangeDates = (from, to) => R.monthDates(S.month).filter(d => d >= from && d <= to);
  const empName = id => (A.ix.empById[id] || { name: '?' }).name;
  const bName = id => (A.ix.brandById[id] || { name: '?' }).name;
  const pName = p => `${bName(p.brandId)} › ${p.name}`;
  const podName = id => (A.ix.podById[id] || { name: '—' }).name;

  /* ---------- scope for views ---------- */
  function entities() {
    switch (ui.view) {
      case 'pod': return S.pods.map(p => [p.id, p.name]);
      case 'brand': return S.brands.map(b => [b.id, b.name]);
      case 'process': return S.processes.map(p => [p.id, pName(p)]);
      case 'employee': return S.employees.map(e => [e.id, `${e.name} (${podName(e.podId)})`]);
      default: return [];
    }
  }
  function scope() {
    const ix = A.ix, uniq = a => [...new Set(a)];
    const empsOfProcs = ps => uniq(ps.flatMap(p => ix.empsOf[p.id])).map(id => ix.empById[id]);
    if (ui.view === 'pod') {
      const emps = S.employees.filter(e => e.podId === ui.entity);
      return { emps, procs: uniq(emps.flatMap(e => ix.procsOf[e.id])) };
    }
    if (ui.view === 'brand') { const procs = ix.brandProcs[ui.entity] || []; return { emps: empsOfProcs(procs), procs }; }
    if (ui.view === 'process') { const p = ix.procById[ui.entity]; return { emps: p ? empsOfProcs([p]) : [], procs: p ? [p] : [] }; }
    return { emps: S.employees, procs: S.processes };
  }

  /* ---------- pieces ---------- */
  function header() {
    return `<header><div><h1>Smart Roster Manager</h1><div class="sub">Sample data · ${A.stats.employees} employees · ${A.stats.brands} brands · saved in this browser</div></div>
    <div class="ctrl"><label>Month <input type="month" data-chg="month" value="${S.month}"></label>
    <button class="pri" data-act="generate" title="Re-optimises weekly offs, keeps your manual edits">Regenerate roster</button>
    <button data-act="csv">Export CSV</button><button class="ghost" data-act="reset">Reset sample data</button></div></header>`;
  }
  function stats() {
    const s = A.stats;
    return `<div class="stats"><div class="stat ${s.errors ? 'bad' : 'good'}"><b>${s.errors}</b><span>Coverage / mandatory errors</span></div>
    <div class="stat"><b>${s.warnings}</b><span>Warnings</span></div><div class="stat"><b>${s.prefs}</b><span>Preference misses</span></div>
    <div class="stat ${s.coveragePct < 100 ? 'bad' : 'good'}"><b>${s.coveragePct}%</b><span>Process-days covered</span></div>
    <div class="stat"><b>${S.covers.length}</b><span>Temporary covers</span></div><div class="stat"><b>${s.singleBrands}/${s.brands}</b><span>Single-resource brands</span></div></div>`;
  }
  function tabs() {
    const t = [['roster', 'Roster'], ['issues', `Issues (${A.stats.errors + A.stats.warnings})`], ['changes', 'Changes & leave'], ['setup', 'Setup data']];
    return '<nav>' + t.map(([k, l]) => `<button class="${ui.tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${l}</button>`).join('') + '</nav>';
  }
  const legend = () => `<div class="legend"><span class="s-W">W working</span><span class="s-WO">OFF weekly off</span><span class="s-L">L leave</span><span class="s-CO">CO comp-off</span><span class="s-H">– closed / holiday</span>
    <span style="box-shadow:inset 0 0 0 2px var(--covt)">outlined = also covering another process</span> <span class="k-ok">covered</span><span class="k-covered">covered by temporary cover</span><span class="k-short">understaffed</span><span class="k-none">no coverage</span></div>`;

  function grid(emps) {
    const dates = R.monthDates(S.month), hol = A.ix.hol;
    let h = `<div class="scroll"><table class="grid"><thead><tr><th class="name">Employee</th>${dates.map(d => `<th class="d ${R.dowOf(d) === 0 ? 'we' : ''} ${hol.has(d) ? 'ph' : ''}" title="${R.fmt(d)}${hol.has(d) ? ' – holiday' : ''}"><b>${+d.slice(8)}</b><i>${R.DOW[R.dowOf(d)][0]}</i></th>`).join('')}</tr></thead><tbody>`;
    [...emps].sort((a, b) => a.podId.localeCompare(b.podId) || (a.role === 'lead' ? -1 : 0) - (b.role === 'lead' ? -1 : 0) || a.name.localeCompare(b.name)).forEach(e => {
      h += `<tr><td class="name">${esc(e.name)}<span class="tag">${esc(podName(e.podId))}</span>${e.role !== 'agent' ? `<span class="tag warn">${e.role}</span>` : ''}</td>`;
      dates.forEach(d => {
        const st = S.roster[e.id][d], cv = S.covers.filter(c => c.empId === e.id && c.date === d);
        h += `<td class="c s-${st}${cv.length ? ' cv' : ''}" data-act="cell" data-e="${e.id}" data-d="${d}" title="${esc(e.name)} · ${R.fmt(d)} · ${R.LABEL[st]}${cv.length ? ' · covering ' + esc(cv.map(c => pName(A.ix.procById[c.procId])).join(', ')) : ''}">${SHORT[st]}</td>`;
      });
      h += '</tr>';
    });
    return h + '</tbody></table></div>';
  }
  function covGrid(procs) {
    const dates = R.monthDates(S.month);
    let h = `<div class="scroll"><table class="grid"><thead><tr><th class="name">Brand › Process</th>${dates.map(d => `<th class="d ${R.dowOf(d) === 0 ? 'we' : ''}"><b>${+d.slice(8)}</b><i>${R.DOW[R.dowOf(d)][0]}</i></th>`).join('')}</tr></thead><tbody>`;
    procs.forEach(p => {
      h += `<tr><td class="name">${esc(pName(p))}</td>`;
      dates.forEach(d => {
        const c = A.coverage[p.id][d];
        h += `<td class="c k-${c.cls}" style="cursor:default" title="${R.fmt(d)}: ${c.req ? c.have + ' of ' + c.req + ' required' : 'closed'}${c.working.length ? ' · working: ' + esc(c.working.map(empName).join(', ')) : ''}">${c.req ? c.have + '/' + c.req : '–'}</td>`;
      });
      h += '</tr>';
    });
    return h + '</tbody></table></div>';
  }
  function info() {
    if (!['brand', 'process', 'pod'].includes(ui.view)) return '';
    const sc = scope();
    if (ui.view === 'pod') { const pod = A.ix.podById[ui.entity]; return `<div class="card"><b>${esc(podName(ui.entity))}</b> · lead: ${pod && pod.leadId ? esc(empName(pod.leadId)) : '—'} · ${sc.emps.length} employees · ${sc.procs.length} processes</div>`; }
    const single = ui.view === 'brand' && sc.emps.length === 1;
    return `<div class="card"><table class="plain"><thead><tr><th>Process</th><th>Operating calendar</th><th>Min staff</th><th>Assigned</th></tr></thead><tbody>${sc.procs.map(p =>
      `<tr><td>${esc(pName(p))}</td><td>${R.CALENDARS[p.calendar]}</td><td>${p.minStaff}${Object.keys(p.minByDow || {}).length ? ' · ' + esc(fmtMin(p.minByDow)) : ''}</td><td>${A.ix.empsOf[p.id].map(empName).map(esc).join(', ') || '—'}</td></tr>`).join('')}</tbody></table>
      ${single ? '<span class="tag warn">Single-resource brand: any absence on a required day needs a cover</span>' : ''}</div>`;
  }
  function editPanel() {
    if (!ui.edit) return '';
    const { e, d } = ui.edit, st = S.roster[e][d];
    if (st === 'H') return `<div class="card">${esc(empName(e))} · ${R.fmt(d)}: all of this employee's processes are closed. <button class="sm" data-act="closeedit">Close</button></div>`;
    const covers = S.covers.filter(c => c.empId === e && c.date === d);
    return `<div class="card"><b>${esc(empName(e))} · ${R.fmt(d)}</b> (currently ${R.LABEL[st]}). Change to:
      ${['W', 'WO', 'L', 'CO'].map(k => `<button class="sm" data-act="setcell" data-st="${k}">${R.LABEL[k]}</button>`).join(' ')}
      ${covers.length ? `<button class="sm" data-act="rmcoverday">Remove cover duty (${covers.length})</button>` : ''} <button class="sm ghost" data-act="closeedit">Cancel</button>
      <div class="sub">Edits are validated instantly; see the coverage rows and the Issues tab. Manual weekly-off edits are kept when you regenerate.</div></div>`;
  }
  function rosterTab() {
    const ents = entities(); if (ents.length && !ents.some(x => x[0] === ui.entity)) ui.entity = ents[0][0];
    const views = [['company', 'Company'], ['pod', 'Pod'], ['brand', 'Brand'], ['process', 'Process'], ['employee', 'Employee']];
    let h = `<div class="bar">View <select data-chg="view">${views.map(([k, l]) => opt(k, l, ui.view)).join('')}</select>
      ${ents.length ? `<select data-chg="entity">${ents.map(([k, l]) => opt(k, l, ui.entity)).join('')}</select>` : ''}</div>${legend()}${editPanel()}`;
    if (ui.view === 'employee') return h + employeeView();
    const sc = scope();
    return h + info() + '<h3>Who is working (click a cell to edit)</h3>' + grid(sc.emps) + '<h3>Coverage: staff available / required</h3>' + covGrid(sc.procs);
  }
  function employeeView() {
    const e = A.ix.empById[ui.entity]; if (!e) return '';
    const dates = R.monthDates(S.month), cnt = k => dates.filter(d => S.roster[e.id][d] === k).length;
    let h = `<div class="card"><b>${esc(e.name)}</b> · ${esc(podName(e.podId))} · ${e.role}${e.prefOff != null ? ' · prefers ' + R.DOW[e.prefOff] + ' off' : ''}<br>
      Working ${cnt('W')} · Weekly off ${cnt('WO')} · Leave ${cnt('L')} · Comp-off ${cnt('CO')} · Closed/holiday ${cnt('H')}<br>
      Processes: ${A.ix.procsOf[e.id].map(p => esc(pName(p)) + ' <span class="tag">' + R.CALENDARS[p.calendar].split(' ')[0] + '</span>').join(' · ') || 'none (floater / lead)'}</div>`;
    h += '<table class="cal"><thead><tr>' + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(x => `<th>${x}</th>`).join('') + '</tr></thead><tbody>';
    R.weeksOf(dates).forEach(w => {
      const cells = Array(7).fill(null); w.forEach(d => (cells[(R.dowOf(d) + 6) % 7] = d));
      h += '<tr>' + cells.map(d => {
        if (!d) return '<td></td>';
        const st = S.roster[e.id][d], hn = (S.holidays.find(x => x.date === d) || {}).name;
        const cv = S.covers.filter(c => c.empId === e.id && c.date === d);
        return `<td class="s-${st}" data-act="cell" data-e="${e.id}" data-d="${d}"><b>${+d.slice(8)}</b>${R.LABEL[st]}${hn ? '<br>🎉 ' + esc(hn) : ''}${cv.length ? '<br>+ cover: ' + esc(cv.map(c => A.ix.procById[c.procId].name).join(', ')) : ''}</td>`;
      }).join('') + '</tr>';
    });
    return h + '</tbody></table>';
  }

  function sugList(key) {
    const l = ui.sugg[key]; if (!l) return '';
    return l.map((s, i) => `<div class="sg"><span>${esc(s.text)}</span>${s.type === 'advice' ? '' : `<button class="pri sm" data-act="apply" data-key="${esc(key)}" data-i="${i}">Apply</button>`}</div>`).join('');
  }
  function issuesTab() {
    const f = ui.filter, list = A.issues.filter(i => f === 'all' || i.sev === f);
    const fl = [['error', `Mandatory errors (${A.stats.errors})`], ['warning', `Warnings (${A.stats.warnings})`], ['pref', `Preferences (${A.stats.prefs})`], ['all', 'All']];
    let h = `<div class="bar">${fl.map(([k, l]) => `<button class="${f === k ? 'pri' : ''}" data-act="filter" data-f="${k}">${l}</button>`).join('')}</div>
      <p class="sub">Mandatory: client coverage and weekly offs. Warnings: policy limits. Preferences: nice to have; coverage always wins.</p>`;
    if (!list.length) h += '<div class="card">Nothing to show here. All mandatory constraints are satisfied. ✅</div>';
    list.slice(0, 120).forEach(i => {
      h += `<div class="issue ${i.sev}"><span class="badge">${i.sev === 'pref' ? 'pref' : i.sev}</span><div><b>${esc(i.title)}</b><p>${esc(i.detail)}</p>
        ${i.procId && i.date ? `<button class="sm" data-act="fix" data-key="${esc(i.id)}">${ui.sugg[i.id] ? 'Hide' : 'Suggest fixes'}</button>` : ''}${sugList(i.id)}</div></div>`;
    });
    return h + (list.length > 120 ? `<p class="sub">Showing 120 of ${list.length}.</p>` : '');
  }

  function changesTab() {
    const emps = S.employees.filter(e => e.role !== 'lead');
    let h = `<div class="card"><b>Handle a change after the roster is generated</b><p class="sub">These apply leave to the <i>current</i> roster without re-balancing, so you can see the gap, get suggested fixes and decide. Use "Reset sample data" in the header to start over.</p><div class="two">`;
    D.scenarios.forEach((s, i) => { h += `<div class="card scn"><b>${esc(s.title)}</b><p>${esc(s.desc)}</p><span class="sub">${esc(s.emp)} · ${s.from === s.to ? s.from : s.from + ' → ' + s.to}</span><button class="pri sm" data-act="demo" data-i="${i}">Apply this change</button></div>`; });
    h += `</div></div><div class="card"><b>Add leave / comp-off</b><div class="bar" style="margin-top:8px">
      <select id="lv-emp">${emps.map(e => opt(e.id, e.name, '')).join('')}</select>
      <input type="date" id="lv-from" value="${S.month}-10"><input type="date" id="lv-to" value="${S.month}-10">
      <select id="lv-type">${opt('L', 'Leave', '')}${opt('CO', 'Comp-off', '')}</select>
      <button class="pri" data-act="addleave">Apply to roster</button>
      <button data-act="generate">Re-balance automatically</button><button class="ghost" data-act="fresh">Clear manual edits &amp; regenerate</button></div>
      <div class="sub">Leave never overwrites a weekly off or closed day. "Re-balance" re-optimises weekly offs and covers around all leave while keeping manual edits.</div></div>`;
    const lv = S.leaves.filter(l => l.date.startsWith(S.month)).sort((a, b) => a.date.localeCompare(b.date));
    h += `<div class="two"><div class="card"><b>Leaves &amp; comp-offs this month (${lv.length})</b><table class="plain"><tbody>${lv.map(l => `<tr><td>${esc(empName(l.empId))}</td><td>${R.fmt(l.date)}</td><td>${l.type === 'L' ? 'Leave' : 'Comp-off'}</td><td><button class="sm" data-act="rmleave" data-e="${l.empId}" data-d="${l.date}">Remove</button></td></tr>`).join('') || '<tr><td>None</td></tr>'}</tbody></table></div>
      <div class="card"><b>Public holidays</b><table class="plain"><tbody>${[...S.holidays].sort((a, b) => a.date.localeCompare(b.date)).map(x => `<tr><td>${x.date}</td><td>${esc(x.name)}</td><td><button class="sm" data-act="rmhol" data-d="${x.date}">Remove</button></td></tr>`).join('')}</tbody></table>
      <div class="bar" style="margin-top:8px"><input type="date" id="hol-date"><input id="hol-name" placeholder="Holiday name"><button class="sm" data-act="addhol">Add</button></div></div></div>`;
    const cv = S.covers.filter(c => c.date.startsWith(S.month)).sort((a, b) => a.date.localeCompare(b.date) || a.empId.localeCompare(b.empId));
    h += `<div class="card"><b>Temporary covers (${cv.length})</b><p class="sub">Auto = chosen by the generator. Manual = chosen by you and preserved on regenerate.</p><table class="plain"><tbody>${cv.slice(0, 80).map((c, i) => `<tr><td>${R.fmt(c.date)}</td><td>${esc(empName(c.empId))}</td><td>covers ${esc(pName(A.ix.procById[c.procId]))}</td><td>${c.auto ? 'auto' : 'manual'}</td><td><button class="sm" data-act="rmcover" data-i="${S.covers.indexOf(c)}">Remove</button></td></tr>`).join('') || '<tr><td>None</td></tr>'}</tbody></table></div>`;
    return h;
  }

  const fmtMin = o => Object.keys(o || {}).map(k => `${R.DOW[k]}=${o[k]}`).join(', ');
  function parseMin(t) { const o = {}; String(t).split(/[,;]/).forEach(x => { const m = x.trim().match(/^(\w{3})\w*\s*[=:]\s*(\d+)$/i); if (m) { const i = R.DOW.findIndex(d => d.toLowerCase() === m[1].toLowerCase()); if (i >= 0) o[i] = Number(m[2]); } }); return o; }
  const inp = (ent, id, key, val, extra) => `<input ${extra || ''} data-ent="${ent}" data-id="${id}" data-key="${key}" value="${esc(val)}">`;
  function setupTab() {
    const ix = A.ix;
    let h = `<p class="sub">Everything here is data, not code. Changes regenerate the roster automatically (manual edits are kept) and are saved in this browser.</p>`;
    h += `<div class="card"><b>Pods</b><table class="plain"><tbody>${S.pods.map(p => `<tr><td>${inp('pods', p.id, 'name', p.name)}</td><td>Lead <select data-ent="pods" data-id="${p.id}" data-key="leadId"><option value="">—</option>${S.employees.filter(e => e.podId === p.id).map(e => opt(e.id, e.name, p.leadId)).join('')}</select></td></tr>`).join('')}</tbody></table>
      <button class="sm" data-act="addpod">+ Add pod</button></div>`;
    h += `<div class="card"><b>Employees (${S.employees.length})</b><div class="scroll" style="max-height:420px;overflow:auto"><table class="plain"><thead><tr><th>Name</th><th>Pod</th><th>Role</th><th>Preferred weekly off</th><th></th></tr></thead><tbody>${S.employees.map(e => `<tr><td>${inp('employees', e.id, 'name', e.name)}</td>
      <td><select data-ent="employees" data-id="${e.id}" data-key="podId">${S.pods.map(p => opt(p.id, p.name, e.podId)).join('')}</select></td>
      <td><select data-ent="employees" data-id="${e.id}" data-key="role">${['agent', 'floater', 'lead'].map(r => opt(r, r, e.role)).join('')}</select></td>
      <td><select data-ent="employees" data-id="${e.id}" data-key="prefOff"><option value="">none</option>${R.DOW.map((d, i) => opt(i, d, e.prefOff)).join('')}</select></td>
      <td><button class="sm ghost" data-act="delemp" data-id="${e.id}">Remove</button></td></tr>`).join('')}</tbody></table></div><button class="sm" data-act="addemp">+ Add employee</button>
      <div class="sub">Floater = backup resource without own processes, preferred for temporary cover. Lead = oversees a pod, never used as cover.</div></div>`;
    h += `<div class="card"><b>Brands, processes &amp; assignments</b><div class="scroll" style="max-height:520px;overflow:auto"><table class="plain"><thead><tr><th>Brand</th><th>Process</th><th>Operating calendar</th><th>Min staff</th><th>Min on specific days</th><th>Assigned employees</th><th></th></tr></thead><tbody>`;
    S.brands.forEach(b => {
      const ps = ix.brandProcs[b.id];
      if (!ps.length) h += `<tr><td>${inp('brands', b.id, 'name', b.name)}</td><td colspan="5" class="sub">No processes yet</td><td><button class="sm ghost" data-act="delbrand" data-id="${b.id}">Remove brand</button></td></tr>`;
      ps.forEach((p, k) => {
        h += `<tr><td>${k === 0 ? inp('brands', b.id, 'name', b.name) + ` <button class="sm ghost" data-act="delbrand" data-id="${b.id}" title="Remove brand">✕</button>` : ''}</td><td>${inp('processes', p.id, 'name', p.name, 'style="width:90px"')}</td>
          <td><select data-ent="processes" data-id="${p.id}" data-key="calendar">${Object.keys(R.CALENDARS).map(c => opt(c, R.CALENDARS[c], p.calendar)).join('')}</select></td>
          <td>${inp('processes', p.id, 'minStaff', p.minStaff, 'type="number" min="0" data-type="num"')}</td><td>${inp('processes', p.id, 'minByDow', fmtMin(p.minByDow), 'placeholder="Sat=2, Sun=0" style="width:120px"')}</td>
          <td class="chips">${ix.empsOf[p.id].map(id => `<span>${esc(empName(id))}<button data-act="rmassign" data-e="${id}" data-p="${p.id}">×</button></span>`).join('')}
            <select data-chg="assign" data-p="${p.id}"><option value="">+ assign</option>${S.employees.filter(e => !ix.empsOf[p.id].includes(e.id)).map(e => opt(e.id, e.name, '')).join('')}</select></td>
          <td><button class="sm ghost" data-act="delproc" data-id="${p.id}">✕</button></td></tr>`;
      });
      h += `<tr><td></td><td colspan="6"><button class="sm" data-act="addproc" data-id="${b.id}">+ process for ${esc(b.name)}</button></td></tr>`;
    });
    h += `</tbody></table></div><button class="sm" data-act="addbrand">+ Add brand</button></div>`;
    h += `<div class="card"><b>Rules</b><div class="bar" style="margin-top:8px">Max consecutive working days ${inp('config', 'x', 'maxConsecutive', S.config.maxConsecutive, 'type="number" data-type="num"')}
      Max concurrent processes per person (incl. covers) ${inp('config', 'x', 'maxLoad', S.config.maxLoad, 'type="number" data-type="num"')}</div></div>`;
    return h;
  }

  /* ---------- render ---------- */
  function render() {
    ensure(); A = R.analyze(S);
    const body = { roster: rosterTab, issues: issuesTab, changes: changesTab, setup: setupTab }[ui.tab]();
    const html = header() + stats() + tabs() + `<main>${ui.msg ? `<div class="msg">${esc(ui.msg)}</div>` : ''}${body}</main>`;
    $('app').innerHTML = html; return html;
  }

  /* ---------- events ---------- */
  function csv() {
    const ds = R.monthDates(S.month), rows = [['Employee', 'Pod', 'Role', ...ds]];
    S.employees.forEach(e => rows.push([e.name, podName(e.podId), e.role, ...ds.map(d => S.roster[e.id][d] + (S.covers.some(c => c.empId === e.id && c.date === d) ? '+C' : ''))]));
    const text = rows.map(r => r.map(x => '"' + String(x).replace(/"/g, '""') + '"').join(',')).join('\n');
    if (typeof Blob === 'undefined') return text;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = `roster-${S.month}.csv`; a.click(); return text;
  }
  const cascade = { emp: id => { S.employees = S.employees.filter(e => e.id !== id); S.assignments = S.assignments.filter(a => a.empId !== id); S.leaves = S.leaves.filter(l => l.empId !== id); S.covers = S.covers.filter(c => c.empId !== id); delete S.locks[id]; S.pods.forEach(p => { if (p.leadId === id) p.leadId = ''; }); delete S.roster[id]; },
    proc: id => { S.processes = S.processes.filter(p => p.id !== id); S.assignments = S.assignments.filter(a => a.procId !== id); S.covers = S.covers.filter(c => c.procId !== id); } };

  function onClick(ev) {
    const el = ev.target.closest && ev.target.closest('[data-act]'); if (!el) return;
    const d = el.dataset, a = d.act;
    if (a === 'tab') { ui.tab = d.tab; ui.msg = ''; return render(); }
    if (a === 'filter') { ui.filter = d.f; return render(); }
    if (a === 'cell') { ui.edit = { e: d.e, d: d.d }; ui.tab = 'roster'; return render(); }
    if (a === 'closeedit') { ui.edit = null; return render(); }
    if (a === 'setcell') { R.setCell(S, ui.edit.e, ui.edit.d, d.st); const x = ui.edit; ui.edit = null; return commit(`${empName(x.e)} on ${R.fmt(x.d)} set to "${R.LABEL[d.st]}". Check the coverage rows and Issues tab.`); }
    if (a === 'rmcoverday') { S.covers = S.covers.filter(c => !(c.empId === ui.edit.e && c.date === ui.edit.d)); ui.edit = null; return commit('Cover duty removed.'); }
    if (a === 'generate') { regen(); return commit('Roster regenerated. Manual edits were kept; weekly offs and covers were re-optimised around all leave.'); }
    if (a === 'fresh') { S.locks = {}; S.covers = []; regen(); return commit('Roster regenerated from scratch (manual edits cleared).'); }
    if (a === 'csv') return csv();
    if (a === 'reset') { if (typeof confirm === 'function' && !confirm('Reset all data to the sample dataset?')) return; S = D.buildSample(); regen(); ui.edit = null; return commit('Sample data restored.'); }
    if (a === 'fix') { const iss = A.issues.find(i => i.id === d.key); if (ui.sugg[d.key]) delete ui.sugg[d.key]; else ui.sugg[d.key] = R.suggest(S, iss); return render(); }
    if (a === 'apply') { const s = ui.sugg[d.key][+d.i]; R.applySuggestion(S, s); return commit('Applied: ' + s.text); }
    if (a === 'demo') {
      const s = D.scenarios[+d.i], e = S.employees.find(x => x.name === s.emp), before = A.stats.errors;
      const r = R.addLeave(S, e.id, rangeDates(s.from, s.to), s.type), after = R.analyze(S).stats.errors; ui.tab = 'issues'; ui.filter = 'error';
      return commit(`${s.emp}: ${r.applied.length} day(s) of leave applied${r.skipped.length ? ` (${r.skipped.length} fell on a day off and was skipped)` : ''}. Mandatory errors ${before} → ${after}. Click "Suggest fixes" on a gap.`);
    }
    if (a === 'addleave') {
      const e = $('lv-emp').value, from = $('lv-from').value, to = $('lv-to').value || from, type = $('lv-type').value, before = A.stats.errors;
      const r = R.addLeave(S, e, rangeDates(from, to), type), after = R.analyze(S).stats.errors;
      return commit(`${empName(e)}: ${r.applied.length} day(s) applied${r.skipped.length ? `, ${r.skipped.length} skipped (already off/closed)` : ''}. Mandatory errors ${before} → ${after}.${after > before ? ' See the Issues tab.' : ''}`);
    }
    if (a === 'rmleave') { S.leaves = S.leaves.filter(l => !(l.empId === d.e && l.date === d.d)); if (['L', 'CO'].includes(S.roster[d.e][d.d])) S.roster[d.e][d.d] = 'W'; regen(); return commit('Leave removed and roster re-balanced.'); }
    if (a === 'addhol') { const dt = $('hol-date').value; if (!dt) return; S.holidays.push({ date: dt, name: $('hol-name').value || 'Holiday' }); regen(); return commit('Holiday added. Operating calendars updated.'); }
    if (a === 'rmhol') { S.holidays = S.holidays.filter(h => h.date !== d.d); regen(); return commit('Holiday removed.'); }
    if (a === 'rmcover') { S.covers.splice(+d.i, 1); return commit('Cover removed.'); }
    if (a === 'addpod') { S.pods.push({ id: R.newId('pod'), name: 'New Pod', leadId: '' }); return commit(''); }
    if (a === 'addemp') { S.employees.push({ id: R.newId('e'), name: 'New Employee', podId: S.pods[0].id, role: 'agent', prefOff: null }); regen(); return commit(''); }
    if (a === 'delemp') { cascade.emp(d.id); regen(); return commit('Employee removed. Gaps (if any) are flagged in Issues.'); }
    if (a === 'addbrand') { S.brands.push({ id: R.newId('b'), name: 'New Brand' }); return commit(''); }
    if (a === 'delbrand') { S.processes.filter(p => p.brandId === d.id).forEach(p => cascade.proc(p.id)); S.brands = S.brands.filter(b => b.id !== d.id); regen(); return commit('Brand removed.'); }
    if (a === 'addproc') { S.processes.push({ id: R.newId('p'), brandId: d.id, name: 'CS', calendar: 'EXCL_HOL', minStaff: 1, minByDow: {} }); regen(); return commit('Process added. Assign someone to it, otherwise it is flagged.'); }
    if (a === 'delproc') { cascade.proc(d.id); regen(); return commit('Process removed.'); }
    if (a === 'rmassign') { S.assignments = S.assignments.filter(x => !(x.empId === d.e && x.procId === d.p)); regen(); return commit('Assignment removed. Check Issues for new gaps.'); }
  }
  function onChange(ev) {
    const t = ev.target, d = t.dataset || {};
    if (d.ent) {
      let v = t.value;
      if (d.ent === 'config') { S.config[d.key] = Number(v) || 0; }
      else {
        const o = S[d.ent].find(x => x.id === d.id); if (d.type === 'num') v = Number(v) || 0;
        if (d.key === 'prefOff') v = v === '' ? null : Number(v); if (d.key === 'minByDow') v = parseMin(v); o[d.key] = v;
      }
      regen(); return commit('');
    }
    if (d.chg === 'month') return setMonth(t.value);
    if (d.chg === 'view') { ui.view = t.value; ui.entity = ''; ui.edit = null; return render(); }
    if (d.chg === 'entity') { ui.entity = t.value; return render(); }
    if (d.chg === 'assign' && t.value) { S.assignments.push({ empId: t.value, procId: d.p }); regen(); return commit('Assignment added.'); }
  }

  function start() { load(); document.addEventListener('click', onClick); document.addEventListener('change', onChange); render(); }
  window.RosterApp = { render, onClick, onChange, get state() { return S; }, ui, csv };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
