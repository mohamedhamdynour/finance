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
- Restricted service-worker caching to explicitly declared static app-shell files; arbitrary same-origin GET responses are no longer cached.
- Improved mobile touch targets, iOS safe-area spacing, compact dashboard KPI layout, keyboard focus visibility, and reduced-motion support in `style.css`.
- Added a dashboard warning for configured foreign currencies with missing/invalid exchange rates.
- Masked GoldAPI and Telegram bot tokens in the settings UI; migrated legacy token copies to device-local storage and excluded them from subsequent Supabase settings writes.
- Added paginated Supabase reads and used them for full application data loads and backup exports, avoiding silent truncation at the default per-response row cap.
- Corrected dangerous README instructions that falsely described `schema.sql` as safe to re-run.

## Confirmed high-priority findings

### 1. `schema.sql` is destructive on re-run
The script begins by dropping many tables and views with `CASCADE`. Re-running it against an existing database can delete financial records and dependent objects. The README previously claimed it was safe to re-run and recommended re-running it for troubleshooting. That guidance has been corrected on this branch. Do not run `schema.sql` against an existing database.

### 2. Offline app shell omitted local modules
The service worker's static asset list omitted 14 tracked JavaScript modules, including repositories, validation, routing, and domain modules. Since the app is modular, some screens or flows could fail when offline after a fresh install/cache reset. The missing paths are now listed and a regression test checks declared assets.

### 3. Complete reads and backup exports
Supabase/PostgREST can cap a single response, so the previous one-request-per-table load/export could silently omit rows in large tables. This branch adds `sbGetAll()` with Range-based pagination and uses it for `loadAll()` and JSON backup export. This does not make the bounded IndexedDB cache a full backup, and it still needs a restore drill against a test account.

### 4. Local cache is not a full backup
`js/core/cache.js` limits cached bank transactions to 2,000 and portfolio snapshots to 100. It is a performance/offline cache, not a complete backup or guaranteed recovery mechanism. The planned backup system must export and restore all supported records and attachments, with validation.

### 5. Service-worker caching scope
The previous fetch handler cached arbitrary same-origin GET responses. This branch restricts caching to URLs explicitly listed in `STATIC_ASSETS`, reducing the chance that future same-origin API responses are accidentally stored in Cache Storage. External API hosts remain network-only.

## High-priority items requiring further implementation/testing

### 6. Currency consistency in total portfolio value
`calcTotals()` converts bank balances through `toEGP()`, but values for stocks, metals, certificates, dividends, and cost bases are summed directly. If those records can be denominated in different currencies, the grand total and P/L can be materially wrong. The correct fix depends on the exact meaning and storage currency of each price/amount field; do not blindly convert without confirming the data model.

### 7. Missing exchange rates silently default to 1
`getRate()` returns 1 when a non-EGP currency has no rate record. That can silently make a foreign-currency balance appear equal to the same nominal amount in EGP. This branch adds a dashboard warning for configured foreign currencies with missing/invalid rates, but it does not yet change the fallback conversion behavior. Prevent unsupported conversions from being presented as accurate in the next calculation-model revision.

### 8. Provider tokens and browser storage
Before this branch, the GoldAPI key and Telegram bot token could be included in the JSON settings value persisted to Supabase and browser storage. This branch migrates legacy values to separate device-local storage, attempts to remove old copies from the Supabase settings row at login, and excludes the tokens from future cloud settings writes. The settings UI masks both tokens.

This is an improvement, not a full secrets vault: localStorage remains accessible to scripts running in the same origin and to anyone with access to the unlocked browser profile. The Telegram Bot API also requires the token in its request path. For stronger protection, use a trusted server-side proxy/secrets manager or disable these integrations. Verify the migration on a test account before relying on it.

### 9. Security-definer SQL functions need a focused privilege review
The schema defines multiple `SECURITY DEFINER` functions, including backup import, transfers, bank deletion, and portfolio summary. Some perform explicit authentication/authorization checks, but the final audit must verify function EXECUTE grants, owner privileges, RLS behavior, safe search paths, cross-user access, and behavior for shared viewer/editor roles. This review has not yet been completed against a live Supabase instance.

### 10. Encryption and migration are not implemented yet
The current IndexedDB cache is not encrypted. A secure local-first architecture needs explicit threat modeling, key derivation and rotation/recovery decisions, encrypted export/import, crash-safe migration, and tests proving that failed migration leaves the original data intact. Do not enable encryption or data migration until a recoverable backup is verified.

## UI/UX improvements

- Added larger touch targets and responsive topbar controls on narrow screens.
- Improved safe-area spacing for iPhone, modal scrolling, horizontal table scrolling, and keyboard focus outlines.
- Kept two KPI columns on narrow phones to reduce excessive vertical scrolling.
- Added reduced-motion handling for users who prefer less animation.
- These changes are static CSS and still need visual verification on actual iPhone Safari and desktop browsers.

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
