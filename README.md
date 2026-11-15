# Smart Roster Manager

Plan, generate, validate and change monthly rosters for many brands, processes and pods.
Built for the Datastraw assessment. It prioritises **correct coverage and clear conflict detection** over looks.

## Run it (no install, no build)
- **Easiest:** double-click `index.html`.
- **Local server (optional):** `npx serve .` or `python3 -m http.server 8000`, then open http://localhost:8000
- **Tests (optional, Node 18+):** `node test/engine.test.js && node test/smoke.test.js`
- **No `.env` needed.** There is no backend; data is saved in the browser's localStorage (Reset button restores the sample).

## Deploy (public URL, free, about 2 minutes)
- **Netlify Drop:** go to app.netlify.com/drop and drag the project folder in.
- **Vercel:** push to GitHub, "Add New Project", import the repo, Framework = Other, no build command.
- **GitHub Pages:** repo Settings → Pages → deploy from the `main` branch, root folder.

## Sample data (December 2026 by default)
4 pods · 32 employees (4 leads, 24 agents, 4 floaters) · 20 brands · 40 processes · sample holidays and leaves.
16 brands (80%) are run by one person; 4 brands have 2 to 3 people, with both separate processes (UrbanStride: CS, ACC, NDR) and shared ones (two agents on one CS). Some employees run two brands. Calendars include 365-day, "all days except public holidays" and "closed Sundays and holidays". Names and dates are fictional and editable.

## Features
- **Setup tab:** add, edit and remove pods, employees, brands, processes, calendars, minimum staff (plus per-weekday minimums such as `Sat=2`), assignments and rules, with no code changes.
- **Generate** a roster for any month. **Validate** it continuously.
- **Five views:** company, pod, brand, process, employee (calendar). Click any cell to edit; the impact shows immediately.
- **Issues tab:** mandatory errors, warnings and preferences, each with who is unavailable and why, plus **Suggest fixes** (move a weekly off, or assign a backup).
- **Changes tab:** one-click scenarios, add leave or comp-off, add holidays, re-balance automatically, manage covers. CSV export.

## How the system works (design answers)

### 1. How are employees, brands, processes and pods modelled?
`Pod` (name, lead) → `Employee` (pod, role agent/floater/lead, preferred weekly off). `Brand` → `Process` (brand, calendar type, minimum staff, optional per-weekday minimums). `Assignment` is a many-to-many link between an employee and a process, so one person can handle several processes or brands and a process can have several people. `Leave`, `Holiday` and `Cover` are separate records. A brand's *operating calendar* lives on the process; an employee's *schedule* is a derived day-by-day status (Working, Weekly off, Leave, Comp-off, Closed). They are deliberately separate.

### 2. How is a roster generated and checked?
`js/engine.js` (pure functions, unit-tested):
1. Start from fixed facts: leave, comp-offs, closed days, manual edits.
2. Give each employee one weekly off per Mon–Sun week. The most constrained employees go first. Each candidate day is scored: *coverage shortfall* (mandatory, heavily weighted) ≫ preferred weekday (soft) > spreading offs across the team > consistent weekday and short work streaks.
3. Fill any remaining gaps with temporary covers.
4. `analyze()` independently recomputes, for every process and day, available vs required staff and emits issues. The validator never trusts the generator, so manual edits are checked the same way.

### 3. Single-resource vs multi-employee brands
Same model, different outcome. With several people, the scorer avoids giving two people of a process the same off day. With one person, every off day on a required day is an unavoidable gap, so the system resolves it with a cover (a same-brand colleague, else a pod floater, else a pod colleague) and marks the brand as single-resource.

### 4. An employee who runs all processes of a brand is unavailable on a required day
Their processes show a red *no coverage* cell and an Issue appears listing the unavailable person and reason. **Suggest fixes** offers: ranked backup candidates (working that day, not overloaded) and, if it was a weekly off, a day it can move to without creating a new gap. Nothing is hidden or auto-approved when the change comes from a person; the manager applies the fix.

### 5. Conflicting requirements or insufficient staffing
Constraints are classed as **mandatory** (coverage, one weekly off per week, enough people assigned), **policy** (max consecutive days, max concurrent processes) and **preference** (preferred weekly off). Mandatory always beats preference. If it cannot be satisfied, the roster is still produced but the gap is flagged with the cause and an escalation hint (add a backup, relax the minimum or change the calendar). Structural problems (a process with nobody assigned, or fewer people than the minimum) are flagged separately.

### 6. Automated vs human control
Automated: weekly-off placement, backup selection, validation, fix suggestions. Human: approving leave, applying a fix to a gap caused by a change, overriding any cell. Manual weekly-off edits are locked and survive regeneration. Why: coverage decisions have client and people impact, and a manager should be accountable for them.

### 7. If the team and brand count doubled
Move state from localStorage to Postgres/Supabase with auth and per-pod permissions. Run generation server-side or in a worker; replace the greedy pass with a constraint solver (OR-Tools CP-SAT) for global optimality and fairness. Cache coverage per day, paginate the grids, and add pod-lead approval and change notifications.

### 8. One more week
(1) A CP-SAT solver with a fairness objective (equal weekend/holiday load) and comparison of alternative plans. (2) Shift timings and handoffs. (3) Supabase persistence, login and a pod-lead → ops-manager approval workflow. (4) An AI explanation of conflicts, using the Claude API on the issue list.

## Assumptions (all configurable in Setup)
- A week is Mon–Sun and needs one weekly off. A recurring closed day (e.g. Sunday for a "closed Sundays" process) counts as that rest. A public holiday does **not**; it is an extra day off for people whose processes are all closed.
- An employee who is working covers all of their assigned processes that day. Temporary covers are limited to one brand per person per day and a load cap (default 4 concurrent processes).
- Leaders (`lead`) are rostered but not used as cover. Floaters have no processes of their own and are preferred as cover.
- Leave never overwrites a weekly off or closed day. Short edge weeks (fewer than 5 days in the month) get a weekly off only if the streak would break the limit.
- One shift per day (no shift-level modelling). Each month is planned independently, so streaks across month boundaries are not checked.

## Project layout
`index.html` · `css/style.css` · `js/engine.js` (scheduling + validation) · `js/data.js` (sample data and demo scenarios) · `js/app.js` (UI) · `test/` (engine + UI smoke tests) · `docs/SUBMISSION.md` (demo script and email)
