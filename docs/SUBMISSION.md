# Submission kit

## Demo video script (about 4 minutes)
1. **0:00 Intro.** "Smart Roster Manager: 32 employees, 20 brands, 4 pods. 16 brands have a single owner, 4 have 2 to 3 people."
2. **0:20 Roster tab, Company view.** Open the Solver card: greedy start vs optimised (coverage, streaks, objective). Then: Show who is working, weekly offs, leave. Point to the coverage grid: green = covered, teal = temporary cover. Header shows 0 mandatory errors, 100% coverage.
3. **0:50 Different brand schedules.** Brand view → VoltGear (CS 365 days, single owner), then UrbanStride (3 people, CS needs 2 on Saturdays), then Glowbar (closed Sundays). Show the calendar rule per process.
4. **1:40 Employee and pod views.** Employee view for Rohit Banerjee (calendar), Pod view for Delta.
5. **2:00 Handle a change.** Changes tab → "Sole owner of a brand is unavailable". Errors go 0 → 2.
6. **2:30 Conflict detection.** Issues tab: read one issue (who is unavailable and why). Click Suggest fixes → apply a backup cover → error disappears. Then apply scenario 2 (Saturday minimum of 2) and show "understaffed" vs "no coverage".
7. **3:15 Manual edit.** Click a cell, set Weekly off, show the gap appear in the coverage row. Change month, edit a brand's minimum staff in Setup.
8. **3:45 Wrap-up.** Mandatory vs preference, what's automated vs human, what you'd do next (solver, Supabase, approvals).

Tip: use Reset sample data before recording and between scenarios.

## Email
**To:** ozair.shaikh@datastraw.in, aryan.jaiswal@datastraw.in  **CC:** talent@datastraw
**Subject:** Smart Roster Management System Assignment - [Your Full Name]

Hi team,

Please find my submission for the Smart Roster Management System assignment.

- Application URL: [paste]
- GitHub repository: [paste]
- Demo video: [paste]
- LinkedIn: [paste, make sure it is public]

Approach: Employees, brands, processes and pods are modelled as data with many-to-many assignments, and each process has its own operating calendar and minimum staffing, separate from an employee's schedule. A greedy construction is improved by a local search (moves and swaps) over a weighted objective with coverage as the dominant term, and every candidate is scored with an exact per-day cover assignment (bipartite matching); an independent validator recomputes coverage and flags mandatory, policy and preference issues with suggested fixes. The manager stays in control of changes and overrides.

Thanks,
[Your Full Name]
