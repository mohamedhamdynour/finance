# Phase 0 — Repository audit (working branch)

Date: 2026-11-15  
Branch: `hardening/phase-0-audit-fixes`  
Scope: static review and targeted regression tests. This is not a full penetration test, a live Supabase test, or proof that all defects have been found.

## Changes made

- Corrected the loan schedule/goal calculation defects already identified in `js/domain/loan.js`; added regression tests in `tests/loan.test.js`.
- Hardened `N2` so non-finite numeric values such as `Infinity` do not flow into calculations as valid numbers.
- Changed `today()` and period boundaries in `js/core/utils.js` to use local calendar dates rather than UTC ISO date slices, and clamped month/year shifts to valid calendar days.
- Added utility regression tests in `tests/utils.test.js`.
- Added missing local JavaScript modules to the service worker's static asset list and bumped the cache version to `v4.6.0`.
- Added a PWA asset-list regression test in `tests/pwa-assets.test.js`.
- Corrected dangerous README instructions that falsely described `schema.sql` as safe to re-run.

## Confirmed high-priority findings

### 1. `schema.sql` is destructive on re-run
The script begins by dropping many tables and views with `CASCADE`. Re-running it against an existing database can delete financial records and dependent objects. The README previously claimed it was safe to re-run and recommended re-running it for troubleshooting. That guidance has been corrected on this branch. Do not run `schema.sql` against an existing database.

### 2. Offline app shell omitted local modules
The service worker's static asset list omitted 14 tracked JavaScript modules, including repositories, validation, routing, and domain modules. Since the app is modular, some screens or flows could fail when offline after a fresh install/cache reset. The missing paths are now listed and a regression test checks declared assets.

### 3. Local cache is not a full backup
`js/core/cache.js` limits cached bank transactions to 2,000 and portfolio snapshots to 100. It is a performance/offline cache, not a complete backup or guaranteed recovery mechanism. The planned backup system must export and restore all supported records and attachments, with validation.

## High-priority items requiring further implementation/testing

### 4. Currency consistency in total portfolio value
`calcTotals()` converts bank balances through `toEGP()`, but values for stocks, metals, certificates, dividends, and cost bases are summed directly. If those records can be denominated in different currencies, the grand total and P/L can be materially wrong. The correct fix depends on the exact meaning and storage currency of each price/amount field; do not blindly convert without confirming the data model.

### 5. Missing exchange rates silently default to 1
`getRate()` returns 1 when a non-EGP currency has no rate record. That can silently make a foreign-currency balance appear equal to the same nominal amount in EGP. Add an explicit missing-rate state/warning and prevent unsupported conversions from being presented as accurate.

### 6. Sensitive settings are stored client-side
The GoldAPI key is included in app settings and can be persisted in browser storage and/or the user's Supabase settings row. This is not equivalent to a server-side secret store. The key should be treated as exposed to anyone who can access that browser profile or the stored settings; remove it from exported backups and avoid putting provider secrets in URLs/logs.

### 7. Security-definer SQL functions need a focused privilege review
The schema defines multiple `SECURITY DEFINER` functions, including backup import, transfers, bank deletion, and portfolio summary. Some perform explicit authentication/authorization checks, but the final audit must verify function EXECUTE grants, owner privileges, RLS behavior, safe search paths, cross-user access, and behavior for shared viewer/editor roles. This review has not yet been completed against a live Supabase instance.

### 8. Encryption and migration are not implemented yet
The current IndexedDB cache is not encrypted. A secure local-first architecture needs explicit threat modeling, key derivation and rotation/recovery decisions, encrypted export/import, crash-safe migration, and tests proving that failed migration leaves the original data intact. Do not enable encryption or data migration until a recoverable backup is verified.

## Validation status

- GitHub Actions runs Node's built-in test runner for `tests/*.test.js`.
- Some runs on intermediate commits failed while the PWA test was being added; subsequent runs reported success. The final branch head still needs a final completed run to be considered validated.
- No live database was changed, no deployment was made, and no pull request was merged.
- iOS Safari, Home Screen installation, real Shortcuts execution, restore drills, and Supabase RLS integration tests have not been run.

## Next work sequence

1. Finish the static audit and run all unit/asset tests against the final branch head.
2. Add explicit currency metadata/validation and fix portfolio calculations only after confirming the storage semantics.
3. Review RLS and all `SECURITY DEFINER` functions; add integration tests for owner, viewer, editor, and unauthorized users.
4. Design a full, verified backup/restore format before changing storage.
5. Implement local encryption and a crash-safe migration behind an opt-in flow.
6. Implement optional encrypted sync and conflict resolution.
7. Finish iPhone PWA and Shortcut actions, then test on a real device.
8. Open a draft PR for review; do not merge or deploy automatically.
