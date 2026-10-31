# FRSS bug audit and fixes

## Apply the update

Replace the website files with the files in this ZIP, preserving your own Supabase configuration in `js/config.js` if it differs.

- Existing FRSS database: run the updated `supabase-bug-fixes.sql` once in Supabase SQL Editor. The patch creates missing identity-verification objects and applies the final function grants and split public/authenticated listing policies. Use this smaller patch instead of replaying historical migrations.
- New database: run the corrected `supabase-all-in-one.sql` instead. Do not run both files for a fresh setup.
- The SQL was reviewed statically and was not executed against a live Supabase project. Applying the updated patch and checking it with anon, authenticated, and admin sessions is still required.

## Verified frontend fixes

1. Identity verification stopped with `Identifier '$' has already been declared`. Its helpers now have their own scope.
2. Null, empty, or missing coordinates became `(0, 0)`, producing incorrect distances and map routes. Coordinates are now checked before conversion; real zero coordinates remain valid.
3. Fully reserved posts with no remaining quantity disappeared. Frontend filtering and the SQL read policy now keep reserved posts visible.
4. Food-detail fallback images used the wrong path on the homepage. Paths now work at the site root and under `/pages/`.
5. Homepage empty-state content was erased. Empty results now retain a readable message.
6. Authentication failures could leave buttons disabled. Auth actions handle missing SDKs, returned errors, and thrown errors while restoring buttons.
7. Signing up with email confirmation disabled still asked the user to check email. An immediate session now opens the dashboard; confirmation links preserve deployment subpaths.
8. Auth state callbacks could run another Supabase request inside the auth callback. Navigation refreshes are now deferred outside that callback.
9. The admin Ban/Restore button always sent `banned`, even when restoring. It now sends `active`.
10. Notification badges counted only the five-item preview. They now query the full unread count.
11. Header notification subscriptions and menu actions could retain the previous user. They now follow the current account.
12. Donor activity queries filtered only the embedded food object, allowing unrelated rows to consume the history limit. They now use an inner join.
13. Failed identity uploads left earlier files behind and buttons stuck. Cleanup and button restoration now run on failure; selfie extensions match their real image type.
14. Donation publishing allowed duplicate submissions while waiting for authentication. The button now locks before the first asynchronous request and unlocks on validation/auth failures.
15. Claim, report, profile, and selected admin actions now handle thrown request errors.
16. Reservation countdowns stopped without actually refreshing availability and could keep running after the detail dialog closed. They now refresh and clear their timer.
17. The header kept the registration name after a profile edit. It now prefers the saved profile name.
18. Pages now use the bundled icon script instead of needing an extra icon CDN request.

## Database fixes included

- Fresh setup tried to set the profile-number sequence to zero, below its minimum. The sequence now starts safely and preserves an already advanced sequence.
- Duplicate-claim cleanup compared the older claim's creation timestamp on both sides. The newer claim's timestamp is now used correctly.
- Missing profiles and non-finite quantities are rejected when claiming; the profile lock serializes active-claim-limit checks.
- Claim code generation can find pgcrypto when it is installed in Supabase's `extensions` schema.
- Suspended/banned administrators no longer retain admin access through `is_admin()`.
- Claim status changes enforce the lifecycle, active account, reservation ownership, reservation deadline, and nonempty pickup code. Claim status changes and no-show handling lock food before its claims.
- Picked-up rescues awaiting completion are not expired by the automatic food-expiry routine. Completing a rescue does not reopen already expired leftover food.
- Expiring moderated drafts no longer forces them back to draft status.
- No-show handling cannot reopen expired food or restore quantity for a different reservation.
- Verification submission checks active profiles, duplicate pending requests, existing verification, and uploaded files. Reviews reject already reviewed or outdated submissions. Direct insertion no longer bypasses the submission RPC.
- Account closure cancels both the user's own claims and claims against the user's donations, restores held quantities where appropriate, notifies the other participant, and clears reservation data. Picked-up rescues must be completed before closing the account.
- Existing databases now receive the same final function privilege reset and split anonymous/authenticated category and food-post policies as fresh installations.

### Function privilege audit

- Front-end RPCs `claim_food`, `update_claim_status`, `release_expired_reservations`, and `expire_food_posts` are granted to `authenticated`, the role that calls them.
- RLS helpers `is_admin`, `has_claim_for_food_post`, `frss_setting_bool`, and `frss_setting_number` are granted to `authenticated`. Anonymous category and food-post policies call no custom functions.
- Trigger-only functions `set_updated_at`, `set_food_report_updated_at`, `handle_new_user`, `open_admin_case_from_claim_report`, `open_admin_case_from_food_report`, and `prepare_food_post` are intentionally not granted to API roles: PostgreSQL invokes them through their triggers, and they are not client RPCs.
- Supabase-managed `auth.uid()` and `storage.foldername()` calls remain governed by Supabase's managed schema permissions and do not need grants in the `public` schema list.

## Validation performed

- Combined JavaScript syntax checks for all 16 HTML pages, including shared scripts and page scripts together.
- Local HTML links, asset paths, and duplicate IDs checked.
- 22 automated regression checks for coordinates, routes, auth failures, duplicate requests, reserved listings, empty states, and notification counts.
- 3 additional verification regression checks for partial-upload cleanup, RPC failure cleanup, file extensions, and duplicate submission prevention.

Run the included checks from the project folder:

```bash
python tests/check_project.py
node tests/regression.cjs
node tests/verification.cjs
```

The regression tests use mocked DOM and Supabase responses. They do not use your live database or browser. Database changes were reviewed statically, not executed against PostgreSQL/Supabase here. This review does not establish that the whole system is bug-free.

## Still needs a live check after applying the SQL patch

Use donor, recipient, and admin accounts to check registration/confirmation, login, verification submission/review, food upload/publish, claim acceptance, ready status, pickup code, completion, expiration, notifications, account closure, and admin restoration. Check desktop/mobile light and dark modes in your browser. Confirm Supabase Auth redirect URLs and Google OAuth configuration; those are external project settings and cannot be verified from this ZIP.

## Custom donation controls

The date, time, unit, category, and pickup date/time controls now have custom popovers. They follow the app theme, use bottom sheets on narrow screens, support Escape and keyboard navigation, and preserve the original form field names and database values. Required-field errors focus the visible trigger. Reset clears the custom date/time display alongside the form. No SQL changes are required for this design update.

## Admin workspace redesign

The admin dashboard now uses an icon sidebar that expands on pointer entry and collapses on pointer exit. Keyboard users can reveal labels through focus. Mobile users open the drawer with a menu button and close it by choosing a section, tapping the backdrop, or pressing Escape. The layout uses the available page width, presents overview metrics and rescue analytics, and separates users, moderation, claims, categories, reports, cases, reputation, content, settings, and audit into focused views. Existing IDs, queries, role checks, and admin actions remain connected. No SQL changes are required.

The mocked navigation check covers all 11 views and pointer entry/exit. Run `node tests/admin-navigation.cjs`. Browser layout has not been visually tested here.

## Admin header cleanup

Removed the repeated section title from the toolbar, the duplicate Administrator badge beside the page heading, and the extra Admin Dashboard eyebrow. The current section now appears once as the page title, with one role label in the toolbar. Toolbar spacing is tighter. No SQL changes are required.

## Admin dropdown design

Audit filters, report status controls, and the other admin dropdowns now use custom rounded menus with red selection highlights and checkmarks. Menus follow light/dark theme colors, reposition within the viewport, support keyboard navigation and Escape, and attach to dynamically loaded report rows. Original selects and change handlers are preserved. No SQL change is required.

## Admin table readability

Management table body text is now 14 px, item names 15 px, headers 12 px, and status badges 11 px. Row padding is increased, action buttons have a 40 px minimum height, and search/filter controls have a 46 px minimum height. Tables keep horizontal scrolling on narrow screens. No SQL change is required.
