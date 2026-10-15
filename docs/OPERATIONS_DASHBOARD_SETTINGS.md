# Operations settings and navigation

Open `/opmanager/settings`. Settings categories use the shared full-width frame and grouped top navigation. They preserve independent section routes, permissions, draft guards, keyboard operation, Arabic RTL, English LTR and the supported themes.

Settings visibility is a presentation preference. A page hidden from one role or navigation profile is not an excluded feature. Direct routes and APIs still require the appropriate current page permission and branch scope.

## Configuration ownership

The existing Settings area owns dashboard display preferences, operational master data, schedules and shifts, rotation configuration, print layout, recognition artwork, access controls and performance/report configuration. Shared settings services reuse the existing `SystemSetting` storage, explicit publications, branch inheritance, effective dates, revision conflicts and audit records.

Saving a UI preference does not modify employee records, schedule history, attendance, appraisals or recognition results. Reset actions change the draft; an explicit authorized save is required. Preview reads do not apply business changes.

## Rotation

Each shift has independent enabled locations, exclusions, priorities and distribution requirements. Priority zero, disabled and archived locations are excluded from generation. The preview presents employee/hour assignments, protected manual or locked cells, breaks, required coverage and existing warnings. It does not change generator rules. Regenerate and Apply retain the existing reason and permission checks.

## Performance and reports

The performance settings editor configures report processes, surveys, source rubrics, approval policies and scheduling. Proposed operational steps are editor suggestions only; adding a proposal changes a draft and requires explicit publication. Historical approved snapshots remain intact.

Recognition and Guest Feedback sources retain numeric evidence, eligibility, branch/effective-date scope, caps and minimum-response rules. Missing sources remain explicit pending conditions. Do not publish test configuration as workplace rules.

## Navigation compatibility

The canonical route map is `lib/operations/page-routes.js`; Settings sections are catalogued in `lib/operations/settings-routes.js`. A clickable sidebar destination owns its page and stable URL. Legacy tab/query bookmarks redirect to dedicated routes while retaining supported filters. Employee-profile sections and within-page filters remain ordinary controls within their page.

## Verification

Relevant unit, permissions and desktop browser tests cover route ownership, Settings draft protection, RTL/LTR and themes. Browser evidence and runtime outputs remain outside source control. Build and test the clean source without workplace databases or employee files before deployment.
