# FINDINGS

Working notes from the collaboration/elder-access workflow. Phase 0 first; later phases append.

---

## Phase 0 — Audit vs. code reconciliation (2026-07-13)

**Question:** The invitee-permissions audit (April 10, 2026) says a MEMBER invitee could edit and delete ANY unclaimed node. `canEditPerson` in `src/lib/personRules.ts` says MEMBERs can only edit unclaimed nodes they created. Which is right?

**Answer: both, in a sense — the rule is written correctly but is only enforced on one of five person-mutation endpoints.** The UI's profile-save path goes through `/api/save-profile`, which performs **no authorization at all**. The audit accurately describes deployed behavior; `personRules.ts` describes intended policy that most routes never consult.

### Enforcement map — every route that mutates a Person or relationship

| Route | Method | Auth check performed | Membership check | Uses shared rules? | Verdict |
|---|---|---|---|---|---|
| `/api/people` | POST | logged-in only; person created in own primary graph | implicit (bootstraps own graph) | partial (local `normalizeFullName`) | OK for creation |
| `/api/people/[id]` | PATCH | `canEditPerson` (claimed→claimer; unclaimed→creator or verified role; admin) | ✅ yes | ✅ `personRules.canEditPerson` + `buildPersonPatch` | **Enforces intended policy** |
| `/api/people/[id]` | DELETE | creator-only (+global admin); claimed persons protected; **soft delete** (`deletedAt` + 30-day `purgeAfter`) | ❌ none (creator check suffices in practice) | ❌ inline | Enforces, stricter than `canEditPerson` |
| `/api/save-profile` | POST | **NONE — any logged-in user can edit ANY person by id: claimed, unclaimed, any graph** | ❌ none | ❌ none (no validation, no rate limit either) | **🔴 Unprotected. This is the route the profile editor UI actually calls** (`src/app/pedigree/page.tsx:544`) |
| `/api/profile/[id]` | PATCH | **NONE — any logged-in user can edit ANY person** (name, gender, dates, isPrivate) | ❌ none | ❌ none | **🔴 Unprotected** (appears unused by current UI, but live) |
| `/api/person-detail/[id]` | PATCH | inline: `claimer OR creator` | ❌ none | ❌ inline | **🟠 Creator can edit a CLAIMED person** — violates trust-model invariant #1. (Unused by current UI, but live) |
| `/api/member-info/[id]` | PATCH | inline: `claimer OR creator` | ❌ none | ❌ inline (raw SQL) | **🟠 Same claimed-person violation** (unused by current UI, but live) |
| `/api/relationships/parent-child` | POST/DELETE | `assertCanEditRelationship`: admin OR both people created by me | ❌ actor's graph membership never checked (proxied by created-both) | ✅ `relationshipRules` incl. same-graph, cycle, max-2-parents | Enforces "both created by me" |
| `/api/relationships/spouse` | POST/DELETE | same as parent-child | ❌ same | ✅ same | Enforces "both created by me" |
| `/api/vouch` | POST | voucher must have claimed+verified person in graph; target claimed+unverified; `CANNOT_VOUCH_OWN_INVITEE` for everyone incl. founders | uses `membership.findFirst` (assumes single graph) | ❌ inline | Enforces |
| `/api/invitations/accept` (+ `accept-and-register`) | POST | token-gated claim; claim races guarded (`updateMany` where `claimedByUserId IS NULL`) | creates MEMBER membership | invitationRules | Enforces |

Side note on relationship POSTs: the "auto-link children to spouses" side effects (`spouse/route.ts:67-100`, `parent-child/route.ts:66-86`) insert ParentChild rows **without** re-running the permission, cycle, or max-2-parents checks that the primary link gets.

### Reconciling each audit claim

1. **"Invitee edits stranger's unclaimed node" (audit: allowed)** — TRUE in deployed behavior. The editor UI saves via `/api/save-profile`, which checks nothing. `canEditPerson` never runs on this path. Worse than the audit knew: the same route also edits **claimed** persons and persons in **other graphs** (the audit's claimed-node test at the UI level passed only because the *client* hides the form; the API does not enforce it).
2. **"Invitee deletes any unclaimed node" (audit: allowed)** — NOT supported by code. `/api/people/[id]` DELETE is creator-only. The nodes the audit deleted ("Test Sibling", "Mobile Sibling") were created by the auditing invitee during the test, so the observed deletions are consistent with creator-only. The audit's "any node" generalization was not actually exercised. Also, deletion is **soft** (30-day purge), not "permanent" as the audit says.
3. **"Invitee adds siblings linked to existing (founder-created) parents" (audit: allowed)** — **UNRESOLVED CONTRADICTION.** `assertCanEditRelationship` requires *both* endpoints be created by the actor, so linking a new invitee-created child to a founder-created parent should return 403. Either the deployed build differs from this working copy, or the audit's sibling links happened to connect invitee-created people only. Needs a live check against pedigreeroots.com before Phase 1 test expectations are written. (Phase 1 removes the both-created-by-me rule anyway, so this only affects our baseline understanding.)
4. **"Claimed profile locked" (audit: correctly restricted)** — enforced in UI only on the save-profile path; enforced at API level only on `/api/people/[id]` PATCH. Via `/api/save-profile` or `/api/profile/[id]` PATCH, a claimed profile is editable by anyone logged in.

### Additional gaps found while tracing (not fixing — Phase 1 changes these rules)

- **Cross-graph reads:** `GET /api/person-detail/[id]`, `GET /api/profile/[id]`, `GET /api/member-info/[id]` do **no membership check and ignore `isPrivate`** — any logged-in user can read any person (full bio-level detail incl. relatives) in any family graph by id. Violates trust-model invariant #3 on the read side. (`/api/people/[id]` GET, `/api/tree`, `/api/people/search` are properly membership-scoped and use `canViewPerson`.)
- **"Verified" ≠ vouched today:** `/api/invitations/accept` auto-verifies the **first 10 accepted invitees** of a graph creator (`accept/route.ts` ~line 100). Relevant baseline for Phase 1d.
- **Founder bootstrap asymmetry (Phase 1d context):** `/api/register` creates the founder's person already claimed + `isVerified: true`. But the lazy bootstrap in `/api/people` POST (`getOrCreatePrimaryMembership`) creates graph + FOUNDER membership with **no claimed person at all** — a founder on that path can never vouch (`VOUCHER_NOT_VERIFIED`). Phase 1d's "founder auto-verified" must cover both paths.
- **`/api/vouch` single-graph assumption:** voucher membership resolved via `findFirst` on userId (arbitrary graph if multi-graph), and the target person's graph is only matched against that first membership.
- **Duplicate route families:** three parallel "person read/edit" APIs exist (`people/[id]`, `person-detail/[id]`, `profile/[id]`, plus `member-info/[id]`) with divergent rules; only `people/[id]` is on-policy. `person-detail`, `profile`, and `member-info` PATCH appear to have no current UI callers (checked all `fetch()` calls; mutations live in `src/app/pedigree/page.tsx`) but are reachable. Phase 1's ChangeLog work must cover or retire them, or they become unaudited side doors.
- `save-profile` also skips all input validation (`buildPersonPatch` normalizers, birth<death check) and rate limiting.

### ⚠️ Migration path / sqlite–postgres drift (ground rule 4)

- `prisma/schema.prisma` datasource: `provider = "sqlite"`, hardcoded `url = "file:./dev.db"`.
- `prisma/migrations/migration_lock.toml`: `provider = "postgresql"`, and migration SQL is Postgres-only (CHECK constraints, `::int` casts).
- `src/lib/neon-db.ts` is **not** a Neon driver — it's a template-tag polyfill that rewrites Postgres syntax (`NOW()`, `::casts`) and feeds it to the regular Prisma client (`$queryRaw`). So whatever Prisma points at is what "raw SQL" hits too. Some raw queries use `= ANY(...)` and recursive CTEs that the polyfill does *not* rewrite — those only work on Postgres.
- `.env` defines `DATABASE_URL`/`DATABASE_URL_UNPOOLED` (Neon), but the sqlite datasource URL is hardcoded, so the env var is currently unused by Prisma; `prisma.config.ts.disabled` (which would wire `DATABASE_URL`) is disabled.
- `vercel-build` runs `prisma generate && prisma migrate deploy && next build`. With provider `sqlite` vs. lock `postgresql`, `migrate deploy` errors (provider mismatch) — so **the checked-in schema cannot be what production last deployed with**. Production schema changes have evidently been applied out-of-band via ad-hoc scripts (`scripts/add-person-profile-fields.js`, `scripts/*.sql`, `prisma/backfill_family_graph.ts`).
- **Conclusion:** the "live" migration path today is ad-hoc scripts against Neon Postgres; the local schema.prisma was flipped to sqlite for local dev and has drifted. Before Phase 1b (ChangeLog model), we must restore a Postgres datasource driven by `DATABASE_URL` (or get Bon's call on the intended setup) so `prisma migrate` is usable again. ⚠️ Flagging for Bon per ground rule 5 — resolving the drift touches deploy configuration.

**RESOLVED (2026-07-13, `fix-migration-path` branch), approved by Bon:**
- `prisma migrate status` against Neon showed all 9 checked-in migrations recorded as applied — `prisma migrate` IS the live path; the drift is only the ad-hoc script changes layered on top.
- schema.prisma restored to `postgresql` + `env("DATABASE_URL")` and replaced with the introspected production schema (`prisma db pull`), which is authoritative. Notable prod-vs-old-schema differences now captured: real Postgres enums (`UserRole`, `GraphRole`, `InvitationStatus`), `Person.story`, `Person.isVerified` *nullable*, `FamilyGraph.updatedAt`, `Membership.updatedAt`, `Passcode` table (VARCHAR(8) code, no expiresAt, no FK), `PasswordResetToken` table, `User.email` NOT NULL, `User.phone`/`Invitation.phone`.
- New idempotent migration `20260713000000_reconcile_out_of_band_drift` mirrors the script-applied DDL (IF NOT EXISTS everywhere): no-op on prod, full DDL on fresh DBs. `prisma migrate diff --from-schema-datamodel --to-url` is empty — schema and prod match exactly.
- `neon-db.ts` polyfill de-fanged: it no longer strips `::casts` / rewrites `NOW()` (that was sqlite-only compensation that would corrupt Postgres queries). Added `::uuid` cast in `register` for the `Passcode."usedByUserId"` update (UUID column, text param).
- Remaining local-dev caveats: `.env`'s `DATABASE_URL` points at **production Neon** — local `next dev` reads/writes prod (decision for Bon: Neon dev branch vs local Postgres). `pnpm build` locally requires `RESEND_API_KEY` to be set (module-scope `new Resend(...)` in `src/lib/email.ts` / webhook route throws without it); Vercel has it.
- Future migrations in this workflow will be hand-authored SQL files (no shadow DB available for `migrate dev`), applied by `vercel-build`'s `prisma migrate deploy`.

### Test baseline

`pnpm vitest run`: **7 files, 58 tests, all passing** (untouched). `personRules.test.ts` and `relationshipRules.unit.test.ts` test the shared rule functions — i.e., the *intended* policy — which is exactly what Phase 1 will deliberately change.

---

## Phase 1 — implementation notes (2026-07-13, `phase-1-open-editing` branch)

- Open editing + ChangeLog + activity feed + vouch bootstrap implemented per spec. Notes on judgment calls:
  - **All five person-mutation routes now enforce `canEditPerson`** (people/[id], save-profile, profile/[id], person-detail/[id], member-info/[id]) with a graph-membership check — the loosened rules are meaningless if the side doors stay open. member-info PATCH was rewritten from COALESCE raw SQL to a Prisma update so it can diff fields for the log.
  - **save-profile input validation left lenient deliberately** (no buildPersonPatch normalization) — it is the live UI save path and tightening it risks breaking the editor; flagging rather than changing. Also: save-profile maps `story` → `bio` even though production has a separate `story` column; left as-is (changing it silently moves user data).
  - **Relationship auto-link side effects** (spouse's children etc.) now run in the same transaction as the primary link and produce their own ChangeLog rows. They still bypass the cycle/max-2-parents integrity asserts (pre-existing; noted Phase 0).
  - **people POST bootstrap** (user with no graph creates first person): per Bon's 1d decision the created person is auto-claimed + verified for the founder, but only when the graph was just created AND the user has no claimed person anywhere (claims are globally unique per user).
  - **Invitation contact details are kept out of ChangeLog** (`newValue` is just "email invite"/"phone invite") — the feed is visible to the whole graph.
  - The **read-side cross-graph leak** on `person-detail`/`profile`/`member-info` GETs (Phase 0 finding) is NOT fixed in this phase — it's a read-path change, queued as a decision/follow-up rather than smuggled into the permissions diff.
  - The stale "raw SQL to bypass Prisma's cached schema" workaround in invitations POST was removed (schema now matches prod), making the invite INSERT + log transactional.
