# Munka Supabase backend

Project: `pkgoupnhdpdeluychmqr` (`Munka Planner`, `us-east-1`). API URL: `https://pkgoupnhdpdeluychmqr.supabase.co`.

Applied migrations, in order:

1. `munka_backend_foundation` — `foundation.sql`
2. `munka_preserve_legacy_ids` — `preserve_legacy_ids.sql`
3. `munka_security_hardening` — `security_hardening.sql`
4. `munka_record_insert_guard` — `record_insert_guard.sql`
5. `munka_permanent_accounts` — `permanent_accounts.sql`

The second migration rebuilt the four tables while they were empty so Munka's imported text record IDs remain valid. Do not rerun it once data exists. The schema stores versioned record bodies, shared project/calendar spaces, editor/viewer membership, and record history. RLS permits only authenticated users to see their personal records or records in spaces they belong to. The client must never use a secret/service-role key.

October 5 update: `sync_sharing.sql` adds personal account snapshots, recipient-bound invitations, custom calendar event permissions and the version-checked `munka_cloud` API. Applied as `munka_sync_and_calendar_invitations`, followed by `munka_cloud_event_payload_scope` and `munka_shared_event_validation`. The current file includes the function-scope repair and payload validation. Direct record/member writes are revoked so the API's revisions and permissions cannot be bypassed. The old SQLite login/sync controls remain retired.

`sync-sharing-smoke.sql` passed against the live project using verified synthetic users in a rollback transaction: personal isolation/stale writes, invitation recipient/replay, Viewer reads, Editor create/edit, independent create/delete permission controls, direct-write rejection, revocation and anonymous-account denial. No synthetic users remained afterward. The shared adapter and permission UI are in the 0.12.0-beta.2 source; see [the sync/sharing guide](../../outputs/Sync-Sharing-0.12.0.md).

Remaining: real two-user/device acceptance, production email/provider setup, phone HTTPS preview and mobile Google/Outlook connection. Offline caches can retain previously authorized events until reconnecting. No end-to-end encryption or completed repository security audit is claimed.

`security-smoke.sql` runs synthetic owner, editor, viewer, unrelated, revoked, and anonymous-account checks in a transaction that rolls back all fixture rows. It passed against the live project on September 29, 2026; there are still no Munka or test user records in the new database.

See [the owner guide](../../outputs/Munka-Backend-Owner-Guide.md) for dashboard access, role groups, protections, and owner actions.
