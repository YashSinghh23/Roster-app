/* Sample dataset: 4 pods, 32 employees (4 leads, 24 agents, 4 floaters), 20 brands (16 single-resource = 80%, 4 multi-resource). */
(function (root) {
  const A = '365', H = 'EXCL_HOL', S = 'EXCL_SUN_HOL';
  function buildSample() {
    const pods = [{ id: 'pod1', name: 'Alpha Pod' }, { id: 'pod2', name: 'Bravo Pod' }, { id: 'pod3', name: 'Charlie Pod' }, { id: 'pod4', name: 'Delta Pod' }];
    const employees = [], ID = {}; let n = 0; const prefs = [0, 1, 2, 3, 4, 5, 6, null];
    const emp = (name, podId, role) => { const id = 'e' + (++n); ID[name] = id; employees.push({ id, name, podId, role, prefOff: role === 'agent' ? prefs[n % 8] : role === 'lead' ? 0 : null }); };
    [['Neha Kapoor', 'pod1'], ['Rohan Desai', 'pod2'], ['Sana Qureshi', 'pod3'], ['Vikram Joshi', 'pod4']].forEach(([nm, p], i) => { emp(nm, p, 'lead'); pods[i].leadId = ID[nm]; });
    const team = {
      pod1: ['Aarav Mehta', 'Isha Nair', 'Karan Shah', 'Priya Iyer', 'Dev Malhotra', 'Manav Gupta', 'Tanvi Rao*'],
      pod2: ['Riya Sharma', 'Aditya Verma', 'Sneha Kulkarni', 'Arjun Reddy', 'Meera Pillai', 'Yash Patel', 'Kabir Singh*'],
      pod3: ['Anika Bose', 'Rahul Chopra', 'Pooja Menon', 'Siddharth Jain', 'Zoya Khan', 'Harsh Vora', 'Nisha Agarwal*'],
      pod4: ['Aman Trivedi', 'Divya Sethi', 'Rohit Banerjee', 'Kavya Naidu', 'Varun Bhatt', 'Ishaan Kohli', 'Simran Kaur*']
    };
    Object.keys(team).forEach(p => team[p].forEach(nm => emp(nm.replace('*', ''), p, nm.endsWith('*') ? 'floater' : 'agent')));

    const brands = [], processes = [], assignments = [];
    const brand = (name, specs) => {
      const b = { id: 'b' + (brands.length + 1), name }; brands.push(b);
      specs.forEach(([pn, cal, min, mbd, emps]) => {
        const p = { id: 'p' + (processes.length + 1), brandId: b.id, name: pn, calendar: cal, minStaff: min, minByDow: mbd || {} };
        processes.push(p); emps.forEach(en => assignments.push({ empId: ID[en], procId: p.id }));
      });
    };
    const solo = (name, en, specs) => brand(name, specs.map(([pn, cal]) => [pn, cal, 1, null, [en]]));
    // Multi-resource brands (shared and separate processes, a Saturday minimum of 2)
    brand('UrbanStride Footwear', [['CS', A, 1, { 6: 2 }, ['Aarav Mehta', 'Isha Nair']], ['ACC', H, 1, null, ['Karan Shah']], ['NDR', S, 1, null, ['Karan Shah']]]);
    brand('NutriNest Wellness', [['CS', H, 1, null, ['Riya Sharma', 'Aditya Verma']], ['Retention', S, 1, null, ['Sneha Kulkarni']]]);
    brand('LuxeLoom Home', [['CS', A, 1, null, ['Anika Bose']], ['NDR', H, 1, null, ['Rahul Chopra']]]);
    brand('PetPulse Supplies', [['CS', H, 1, null, ['Aman Trivedi', 'Divya Sethi']], ['ACC', S, 1, null, ['Divya Sethi']]]);
    // Single-resource brands: one person runs every process of the brand
    solo('Glowbar Skincare', 'Priya Iyer', [['CS', S], ['ACC', S]]);
    solo('Kiddo Kingdom', 'Dev Malhotra', [['CS', H], ['NDR', H]]);
    solo('Trek & Tent Outdoors', 'Manav Gupta', [['CS', S], ['ACC', S], ['NDR', S]]);
    solo('Zenith Watches', 'Arjun Reddy', [['CS', H], ['Retention', H]]);
    solo('Spice Route Gourmet', 'Meera Pillai', [['CS', S], ['ACC', S]]);
    solo('Chai & Co', 'Meera Pillai', [['CS', S]]);
    solo('MotoMate Accessories', 'Yash Patel', [['CS', S], ['NDR', S]]);
    solo('FreshCrate Foods', 'Pooja Menon', [['CS', A], ['NDR', H]]);
    solo('BloomBox Florals', 'Siddharth Jain', [['CS', H], ['ACC', H]]);
    solo('Aurora Jewels', 'Zoya Khan', [['CS', S], ['Retention', S]]);
    solo('Pixel Play Gaming', 'Harsh Vora', [['CS', S], ['ACC', S]]);
    solo('Mint Mobiles', 'Harsh Vora', [['CS', S]]);
    solo('VoltGear Electronics', 'Rohit Banerjee', [['CS', A], ['ACC', H]]);
    solo('ThreadTales Apparel', 'Kavya Naidu', [['CS', H], ['NDR', H]]);
    solo('Ayur Veda Naturals', 'Varun Bhatt', [['CS', S], ['ACC', S]]);
    solo('Sparkle Home Cleaning', 'Ishaan Kohli', [['CS', S], ['NDR', S]]);

    const holidays = [['2026-11-08', 'Diwali'], ['2026-11-24', 'Guru Nanak Jayanti'], ['2026-12-25', 'Christmas Day'], ['2027-01-01', "New Year's Day"], ['2027-01-26', 'Republic Day']].map(([date, name]) => ({ date, name }));
    const leaves = [['Dev Malhotra', '2026-12-14', 'L'], ['Dev Malhotra', '2026-12-15', 'L'], ['Zoya Khan', '2026-12-21', 'CO'], ['Aditya Verma', '2026-12-09', 'L'],
      ['Varun Bhatt', '2026-12-28', 'L'], ['Varun Bhatt', '2026-12-29', 'L'], ['Isha Nair', '2026-12-18', 'CO'], ['Kavya Naidu', '2026-12-30', 'L']]
      .map(([nm, date, type]) => ({ empId: ID[nm], date, type }));
    return { month: '2026-12', pods, employees, brands, processes, assignments, holidays, leaves, covers: [], locks: {}, roster: null, plans: {},
      config: { maxConsecutive: 6, maxLoad: 4 } };
  }
  const scenarios = [
    { id: 's1', title: 'Sole owner of a brand is unavailable', emp: 'Rohit Banerjee', from: '2026-12-09', to: '2026-12-10', type: 'L',
      desc: 'Rohit alone runs VoltGear (CS is required 365 days, ACC every day except holidays). Leave on two required days leaves the brand uncovered.' },
    { id: 's2', title: "One of the brand's employees is out on a peak day", emp: 'Aarav Mehta', from: '2026-12-12', to: '2026-12-12', type: 'L',
      desc: 'UrbanStride CS needs 2 people on Saturdays. With one of the two CS agents out, the brand is understaffed.' },
    { id: 's3', title: 'Holiday coverage for a 365-day process', emp: 'Pooja Menon', from: '2026-12-24', to: '2026-12-25', type: 'L',
      desc: 'FreshCrate CS must run on Christmas Day. Its only agent applies for leave over the holiday.' }
  ];
  const api = { buildSample, scenarios };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RosterData = api;
})(this);
