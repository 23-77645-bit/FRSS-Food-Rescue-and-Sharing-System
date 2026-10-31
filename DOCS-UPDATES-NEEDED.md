# Project document updates needed

The `.docx` and `.pdf` project documents were intentionally left unchanged. Update their editable source documents, then regenerate the exported copies.

## Test Plan

Replace statements that say all testing is manual or that no automated suite exists. The repository now contains mocked Node tests for authentication, regressions, identity verification, and admin navigation; a Python static-page script check; and read-only Appium smoke tests for Android Chrome. Document the commands and prerequisites from `README.md` and `tests/mobile/README.md`, and keep manual/live Supabase testing as a separate activity.

## BRD and Test Plan coverage gaps

Assign BR/FR/BRU identifiers and matching test cases to these implemented capabilities:

- **Identity verification:** user ID/selfie submission and admin review live in `pages/verification.html` and `pages/dashboard.html`; private storage, `identity_verifications`, `submit_identity_verification`, and `admin_review_identity_verification` live in `supabase-all-in-one.sql`.
- **Reputation ratings:** participant submission and history/admin views live in `pages/dashboard.html` and `pages/account.html`; `reputation_ratings` and `submit_reputation_rating` live in `supabase-all-in-one.sql`.
- **Food moderation:** admin approve, hide, archive, and restore controls live in `pages/dashboard.html`; moderation columns, policies, `prepare_food_post`, and `admin_moderate_food` live in `supabase-all-in-one.sql`.
- **Claim reports and admin cases:** food-report submission begins in `js/app.js`, while claim-report and case workflows live in `pages/dashboard.html`; `food_reports`, `claim_reports`, `admin_cases`, their policies, and automatic case triggers live in `supabase-all-in-one.sql`.
- **Notifications:** inbox, unread counts, mark-read actions, and Realtime subscriptions live in `js/app.js`; `notifications`, policies, Realtime publication, and notification-producing claim functions live in `supabase-all-in-one.sql`.
- **Admin settings:** settings controls live in `pages/dashboard.html`; `system_settings`, setting readers, enforcement in moderation/claims/expiration, and `admin_update_setting` live in `supabase-all-in-one.sql`.

For each feature, add positive, authorization, validation, failure, and relevant workflow-transition test cases. The current mocked and Appium tests do not provide complete live-database coverage for these capabilities.

## BRD numbering

Add or reconcile the missing **NFR-06** entry so the NFR sequence and cross-references are complete.

## Name consistency

Choose the correct spelling for each person and use it consistently across every source and exported document:

- `Jomhar` / `Johmar`
- `Leya Marie` / `Lea Marie`
