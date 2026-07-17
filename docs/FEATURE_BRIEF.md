# My Church — Consolidated Feature & Architecture Brief

This combines two sets of requirements into one prompt:
1. Feature requests from product notes (bugs, workflows, UI).
2. Architecture decisions from planning discussion (identity, multi-branch, notifications-readiness).

**Constraint for this pass:** keep everything running on the current local-first
Dexie/IndexedDB setup — no real server, no real email sending yet. Where a feature
will eventually need a server (email delivery, cross-device sync, multi-church
hosting), build the **local-mode equivalent** now and leave clear seams so it can
be swapped for the real thing later without a rewrite. Prioritize keeping dev/login
friction-free (no SMTP setup, no external services required to run `npm run dev`).

---

## Success criteria

A feature is only complete if:
- `tsc --noEmit` passes with zero errors.
- `npm run dev` and `npm run build` both succeed.
- Existing functionality continues to work (don't regress features while
  building adjacent ones — e.g. building notifications should not break
  event creation).
- No duplicate implementations of something that already exists elsewhere
  in the codebase (check `src/lib/` and `src/components/` before writing a
  new utility or component).
- New Dexie schema versions preserve existing local data — use `db.version(n)`
  upgrades, not a fresh schema that would wipe a dev database on reload.
- Every new form validates its required fields and surfaces errors via the
  existing `toast` pattern (Sonner), not silent failures or raw thrown errors.

## Coding standards

- Reuse existing components before creating new ones (check `src/components/ui/`
  for shadcn primitives and `src/components/` for app-specific ones like
  `member-combobox.tsx`, `page-header.tsx`, `delete-button.tsx` first).
- Keep functions small and put reusable business logic in `src/lib/`, not
  inline in route components.
- Maintain strict TypeScript typing — no `any`, no unchecked casts.
- Follow existing naming conventions (`camelCase` fields, `PascalCase` types,
  file names matching the route/component pattern already in `src/routes/`
  and `src/components/`).
- Do not break backward compatibility with existing routes, exported types,
  or the existing backup/export JSON format in `db.ts` unless a section
  above explicitly calls for changing it.
- Keep UI consistent with the shadcn/Radix components already in use —
  don't introduce a different UI library or hand-rolled equivalent of
  something shadcn already provides (dialogs, dropdowns, tables, etc.).

---

## 1. Identity & login overhaul

**Replace username with email as the sole login identifier.**

- `User.username` → remove. Add `User.email: string`, mandatory, unique
  (Dexie schema: `"id, &email, role"` — the `&` enforces uniqueness at the DB level).
- Every place a username is currently collected (first-run admin setup in
  `login.tsx`, `createUser` in `auth.ts`, the add-user form in
  `_authenticated.users.tsx`) switches to an email field with real format
  validation (`user@domain.tld` shape, not just non-empty).
- `login()` looks users up by `email` (trimmed, lowercased) instead of username.
- Reject duplicate emails with a friendly error ("An account with this email
  already exists") rather than a raw Dexie constraint exception.
- Keep `fullName` as the human-readable display identity — unaffected.

**Login screen: add a show/hide password toggle.**
- Eye icon inside the right side of the password `Input` on both the login
  form and anywhere else a password is entered (first-run admin setup,
  change-password dialog, admin reset-password dialog). Toggling switches the
  input `type` between `password` and `text`; icon swaps (eye / eye-off).

**Forgot password (local-mode version):**
- No SMTP in dev, so implement the interim path honestly instead of faking
  email delivery: a "Forgot password?" link on the login screen explains that
  password resets must be done by another admin (Settings → Users → Reset
  password — this already exists via `resetPassword()`), and if there is no
  other admin, points to the recovery note in Settings.
- Structure the code so this swaps cleanly later: put the "generate a
  single-use token, expire it, mark used" logic behind a small
  `createPasswordResetToken(email)` / `consumePasswordResetToken(token, newPassword)`
  pair in `auth.ts` now, even though in local-mode the "delivery" step is just
  showing the token on-screen to whoever is signed in as admin (not emailed).
  That keeps the eventual real-email version a delivery-layer swap, not a
  logic rewrite.

---

## 2. Generalized terminology settings

The existing cell-terminology feature (`src/lib/terminology.ts` — `useCellTerm()`
/ `setCellTerm()`, stored as `cellTermSingular`/`cellTermPlural` in the
`settings` key/value table) already proves the pattern. Generalize it so any
renameable concept is a one-line registry addition instead of a new feature:

```ts
export const TERM_DEFINITIONS = [
  { key: "cell",        defaultSingular: "Cell Fellowship", defaultPlural: "Cell Fellowships" },
  { key: "department",  defaultSingular: "Department",       defaultPlural: "Departments" },
  { key: "class",       defaultSingular: "Class",             defaultPlural: "Classes" },
  { key: "requisition", defaultSingular: "Requisition",       defaultPlural: "Requisitions" },
  { key: "branch",      defaultSingular: "Branch",            defaultPlural: "Branches" },
] as const;
```

- Each entry auto-derives its two settings keys (`{key}TermSingular` /
  `{key}TermPlural`). Replace `useCellTerm()` with a generic `useTerm(key)`
  hook (keep `useCellTerm()` as a thin wrapper calling `useTerm("cell")` so
  existing call sites don't all need touching at once).
- **Settings UI**: replace the single cell-only "Terminology" card with a
  table — one row per `TERM_DEFINITIONS` entry, three columns: **System name
  (default, read-only)** | **Singular (editable)** | **Plural (editable)**.
  Inputs pre-fill with the current override, or the default if unset.
  Save per-row on blur with a toast confirmation (simpler than one big form).
- **Hard constraint:** this only ever changes *displayed labels*. Every route
  path, field name (`Department.leaderId`, `cellId`, etc.), and permission
  check stays exactly as-is — the rename is a display-layer lookup, same as
  the existing cell implementation. Do not let this leak into data model or
  URLs.
- Stretch (not required this pass): add member category labels
  (`MemberCategory` values, §5 below) to the same registry, since phrasing
  like "Visitor" vs. "First Timer" is just as church-specific as "Cell" vs.
  "Zonal Fellowship."

---

## 3. Export picker on Members (and anywhere else exports live)

Members already has a working CSV export, plus `export-pdf.ts` and
`export-xlsx.ts` already exist in `src/lib/`. Replace the single "Export CSV"
button with one **Export** button that opens a `DropdownMenu` (already used
elsewhere in the app — no new UI pattern) with three items:

```
[Export ▾]
   Export as CSV
   Export as Excel (.xlsx)
   Export as PDF
```

A dropdown is preferable to a modal here since none of the three formats need
extra options right now (no per-format settings to collect) — a modal would
just add an extra click for no benefit. Route each item to the existing
export utilities. The export should respect whatever column-visibility
selection is currently active (§5 below) — i.e. export exactly the columns
currently shown, not unconditionally every field. Apply this same pattern
anywhere else in the app that currently has a raw single-format export button.

---

## 4. Multi-branch support

Add a `Branch` entity under the (single, local) church:

- New table: `Branch { id, name, address?, createdAt }`.
- Add optional `branchId?: string` to `Member`, `Household`, `Cell`,
  `CellMeeting`, `Event`, `Class`, `Department`, `Project`, `Partner`, `Giving`,
  `Expense` (see §6). `branchId: undefined`/`null` means "applies to whole
  church" (e.g. a church-wide department or building-fund project) — don't
  force every record into exactly one branch.
- Add optional `branchId?: string` to `User`. `undefined` = church-wide access
  (sees every branch); a set value = scoped to just that branch.
- Add a **branch switcher** in the authenticated header (next to the existing
  "Signed in as / role" chip) for church-wide users only — options are "All
  branches" or a specific one. Branch-scoped users don't see the switcher.
- Every list/report screen (`members`, `givings`, `reports`, `events`, `cells`,
  `classes`, `departments`) respects the current branch filter selection.
- `reports.tsx` gains a branch dimension so a church-wide admin can compare
  totals per branch, not just one flat church-wide number.
- Extend the existing permission helpers (`canAccessGivings`,
  `canManageEvents`, etc. in `auth.ts`) to also check branch match, not just role.

---

## 5. Member records — categories, numbering, linking to users

**Update `MemberCategory`** (currently `pastor | leader | member | new_member |
convert`) to the full set requested:

```
Member, Committed, Pastor, Leader, New Recruit, New Convert, Visitor,
Uncommitted, Fellowship Member
```

Add a short description tooltip/help text on the add-member form for each,
using these definitions:
- **New Convert** — someone who has undergone a spiritual rebirth during
  outreach, mission, a gathering/encounter, or revival context.
- **New Recruit** — a believer with no current church, or newly relocated to
  the area, choosing to commit to this church.
- **Visitor** — attending services/programs but not yet committed; needs
  follow-up.
- **Fellowship Member** — attends cell/home/zonal fellowships only, not main
  services/programs.
- **Other** — free-text description field appears when selected.

**Member numbers:**
- Add `Member.number?: string` — admin-assigned only (never shown as
  editable to non-admin roles), minimum 3 digits, zero-padded (`001`, `1123`).
- Numbers are sequential: the "assign number" action on a member's detail
  page suggests the next available number (highest existing + 1, formatted
  to at least 3 digits), which the admin can accept or override.
- Until assigned, the member shows as "unnumbered" in lists — don't force a
  number at creation time, since the flow described is: someone else adds the
  member, admin reviews and assigns the number afterward (see notifications, §7).

**User ↔ Member linking:**
- When adding a **User** (in the Users admin screen), add a toggle: "Is this
  user also a church member?" If yes, show a searchable combobox — reuse
  `src/components/member-combobox.tsx` as-is rather than building a new one —
  to link to an existing `Member` record, or a shortcut to create a new one
  inline. Store this as `User.memberId?: string`.

**Member filtering (columns):**
- On the Members list, add a column-visibility control (checkbox dropdown —
  shadcn has patterns for this via the `DropdownMenu`/`Popover` components
  already in use) so users can show/hide columns (phone, address, DOB,
  category, cell, class, number, etc.) rather than always seeing every field.
  This selection also drives what the export picker (§3) includes.

**Member edit/delete with mandatory reason:**
- Admin can edit or delete a member. Delete requires a reason field,
  minimum 15 characters, validated before the delete proceeds.
- On delete, notify (via the notification system, §7) both the member's
  original creator (`Member.createdBy`) and any pastor-role users, including
  who deleted it and the reason given.

---

## 6. Expenses — mandatory department link

- New table: `Expense { id, departmentId, amount, description, enteredBy,
  branchId?, createdAt }`. `departmentId` is **required**, not optional —
  every expense must be tied to a department so departmental reports
  (existing per-department report views, and whatever a departmental leader
  pulls when they log in) include it automatically.
- Only Treasurer and Admin roles can enter expenses (extend
  `canAccessGivings`-style helper or add `canEnterExpenses(role)` in `auth.ts`).
- Departmental report views/exports must sum expenses alongside whatever
  they already report for that department.

---

## 7. Notification system (in-app, local-mode)

Build a real in-app notification system now (not deferred) — it doesn't need
a server, just a local `Notification` table plus a bell icon:

- New table: `Notification { id, recipientUserId, type, message, entityType?,
  entityId?, read: boolean, createdAt }`.
- Bell icon in the authenticated header (next to the branch switcher / user
  chip) with an unread-count badge and a dropdown/panel listing recent
  notifications, newest first, click-through to the relevant record.
- Notification triggers to implement:
  - **Member added** → notify Admin + Pastor-role users. Message format:
    "*{fullName} added a member: {member name}*". Clicking opens the member
    detail page where the admin can assign a number (§5).
  - **Member deleted** → notify the original creator + Pastor-role users,
    including the reason given (§5).
  - **Event created** → add `audience: "all" | "leaders"` to the
    `ChurchEvent` interface in `db.ts` (currently: `id, title, date, type,
    notes?, offertoryAmount?, createdAt`). If `audience` is `"all"`, notify
    every user; if `"leaders"`, notify only users whose `Role` is one of
    `leader`, `cell_leader`, `pastor`, `admin` (i.e. every role except
    `treasurer`) — assume this set unless told otherwise.
  - **Finance requisition submitted** (§8) → notify Admin, Pastor, Treasurer,
    and Tier-A Finance Leaders (§8).
  - **Cell report submitted with offertory** (§9) → notify Finance-role
    users, Admin, and Pastor. Message format: "*{cell name} entered a
    report*".
- Keep this table/UI local for now; the only thing that changes when a real
  server exists later is whether notifications are also pushed via
  email/websocket — the in-app bell and data model stay the same.

---

## 8. Finance requisitions & Tier-A finance leaders

- New table: `Requisition { id, requestedBy, departmentId, amount, reason,
  status: "pending" | "approved" | "rejected", decidedBy?, decidedAt?,
  branchId?, createdAt }`.
- Departmental leaders, Pastors, and Admin can submit a requisition from
  their dashboard (a form: department, amount, reason).
- Visible to: Admin, Treasurer, Pastors, and **Tier-A Finance Leaders** — a
  new permission tier, not a new `Role` value. Add
  `financeTier?: "A"` (or similar) as an optional field on `User` for users
  whose base role is `leader`/`cell_leader` but who have been granted
  elevated finance powers. Tier-A finance leaders can also access/manage
  Partners (reuse/extend `canAccessPartners`).
- Approving/rejecting a requisition is restricted to Admin, Treasurer, and
  Pastor. Assume Tier-A Finance Leaders can view requisitions but not
  approve/reject them, since the source note says requisitions are "seen by"
  Tier-A leaders, not decided by them — build to that assumption unless
  told otherwise.
- Triggers the finance-requisition notification (§7).

---

## 9. Cell reports — offertory reconciliation workflow

This is the most stateful new workflow — build it as its own small module.

- `CellMeeting` (already exists) gains: `offertoryReported: number` (what the
  cell leader says they collected), `offertoryReceived: number` (what
  finance has actually confirmed receiving, starts at 0 until finance acts
  on it), `reportRef: string` (see numbering below), `editRequestStatus?:
  "none" | "requested" | "approved"`.
- **Reference number format:** `DDMMYYYY` + 2-digit sequence for that date,
  e.g. `2312202601` for the first report on 23 Dec 2026, `2312202602` for the
  second that same day. Generate this automatically when a cell report is
  submitted (query existing reports for that date, increment the sequence).
- **Flow:**
  1. Cell leader submits their cell report, entering `offertoryReported`.
     This does **not** touch the finance ledger yet. Triggers the
     "cell entered a report" notification (§7) to Finance-role users, Admin,
     Pastor.
  2. A finance-role user (Treasurer/Admin/Tier-A) reviews and records what
     was actually received into `offertoryReceived` — can be less than,
     equal to, or more than `offertoryReported`.
  3. Compute and display a running **balance** per cell:
     `offertoryReceived - offertoryReported` across their reports —
     negative = deficit (cell owes/still to bring), positive = credit
     (cell brought more than reported previously, or a shortfall from an
     earlier report was made up). Show this on the cell's detail page.
  4. If a cell leader needs to correct an already-submitted report (e.g. they
     made an entry error), they cannot edit it directly — they submit an
     **edit request** (`editRequestStatus: "requested"`), which Admin/
     Treasurer approve (`"approved"`) before the report becomes editable
     again. Once edited, reset to `"none"`.
- Keep the ledger logic in one place (e.g. `src/lib/finance.ts`) rather than
  scattering balance math across route components, since departmental and
  overall financial reports will need to read the same numbers.

---

## 10. Known bug to fix first

- **Departments not appearing under leaders**: when a new user is created,
  departments they should be associated with (as leader of that department)
  aren't showing up. `Department` is `{ id, name, description?, leaderId?,
  createdAt }` — trace the assignment flow starting from wherever a
  department's `leaderId` gets set (department create/edit form) through to
  whatever query renders "my departments" for a logged-in leader (likely in
  the dashboard or a departments list filtered by `leaderId === session.userId`),
  and fix whichever step in that chain is preventing the leader from seeing
  their assigned department(s).

---

## 11. Suggested build order

1. Fix the departments-under-leaders bug (§10) — isolated, unblocks testing
   of everything else that touches departments.
2. Identity overhaul: email-based login, password show/hide toggle (§1) —
   touches auth broadly, best done before adding more user-facing screens.
3. Member category/number/linking updates + column filtering (§5), then the
   export picker (§3) since it depends on column visibility.
4. Generalized terminology settings (§2) — small, isolated, good early win.
5. Notification system core (table + bell UI) (§7) — needed by everything after.
6. Branches (§4) — cross-cuts most entities, easier once the schema is
   otherwise stable.
7. Expenses (§6) and Requisitions/Tier-A (§8).
8. Cell report offertory reconciliation (§9) — most complex, do last.
9. Multi-currency support (§12) — added after the rest was already underway;
   safe to slot in once Givings/Reports/Projects/Partners screens are stable,
   since it touches display logic across all of them rather than adding new
   entities.

---

## 12. Multi-currency support

- Add to the existing `settings` key/value table (same pattern as
  terminology, §2): `baseCurrency: string` (ISO 4217 code, e.g. `"UGX"`),
  `baseCurrencyToUsdRate: number` (how many units of the base currency equal
  1 USD), `baseCurrencyRateUpdatedAt?: number`.
- **Admin-only Settings UI**: a new card (alongside Terminology) with a
  searchable dropdown of major world currencies — a practical list of ~30-40
  common ISO codes (USD, EUR, GBP, UGX, KES, TZS, RWF, NGN, GHS, ZAR, INR,
  and similar — doesn't need to be the full ISO 4217 set of ~180) — to pick
  the church's base/local currency, plus a numeric input for the current
  exchange rate to USD and a read-only "last updated" timestamp.
- Replace the hardcoded `formatUGX()` in `src/lib/currency.ts` — currently
  called from `cells.$id.tsx`, `classes.$id.tsx`, `events.tsx`,
  `events.$id.tsx`, `givings.tsx`, `partners.tsx`, and `projects.tsx` — with
  a generic `formatCurrency(amount, currencyCode)`, and a `useBaseCurrency()`
  hook (same settings-table pattern as `useTerm()`) that reads the current
  base currency and rate.
- **The toggle**: assume only Treasurer, Tier-A Finance Leaders, and Admin
  see a currency toggle (a small "[Base Currency] | USD" control near amount
  displays) — everyone else only ever sees the base currency, since USD
  conversion is a finance-oversight feature, not a general display
  preference. Build to this assumption unless told otherwise.
- Toggling recalculates every visible amount on that screen using the stored
  rate — apply it everywhere `formatUGX`/`formatCurrency` is currently
  called: Givings, Reports, Projects (targets/raised), Partners
  (pledges/totals), and cell/class/event offertory displays.
- **Exports must reflect the active toggle state**: the CSV/XLSX/PDF export
  picker (§3) and the report exports in `reports.ts` (which currently
  hardcode `"Amount (UGX)"` / `"Total (UGX)"` / `"Offertory total (UGX)"` as
  column headers) must label the currency dynamically based on what's
  currently toggled at export time, not hardcode UGX.
- **Data is always stored in the base currency, never converted at write
  time.** Currency conversion is a display/export-time calculation only,
  always using the *current* rate — this deliberately does not implement
  historical rate tracking (e.g. what the rate was on the date a specific
  giving was recorded). That's a materially bigger feature and out of scope
  for this pass; state clearly to Claude Code that recomputing past amounts
  with the current rate on toggle is the expected, accepted behavior.
- **No live exchange-rate API** — the rate is manually entered/updated by the
  admin, consistent with keeping the app fully offline-capable in local mode.
  Do not add an external FX API call.



For every feature above:
- Verify existing features still work after the change (e.g. adding
  `branchId` everywhere shouldn't break existing member/event/cell flows
  that don't set it).
- Consider edge cases explicitly: empty states (no branches yet, no
  departments yet), the very first record of a kind (first cell report of
  the day for the ref-number sequence, first user for the first-run admin
  flow), and boundary values (a member number exactly 3 digits, a requisition
  amount of 0).
- Validate required fields before writing to Dexie — don't rely on TypeScript
  types alone to catch a missing value at runtime, since form inputs are
  untyped strings until parsed/validated.
- Prevent duplicate records where uniqueness matters (emails, member numbers,
  cell report ref numbers) — check for an existing match before inserting,
  don't rely solely on a Dexie unique-index throw.
- Handle Dexie transaction failures gracefully — wrap multi-table writes
  (e.g. creating a member + a notification, or approving a requisition +
  updating a balance) in `db.transaction(...)` so a failure partway through
  doesn't leave inconsistent state, and surface a toast on failure rather
  than an unhandled rejection.

---

## 13. Cell reports index/search

Currently, cell reports (the reconciliation records added in §9 — `reportRef`,
`offertoryReported`, `offertoryReceived`, `editRequestStatus` on
`CellMeeting`) are only browsable from each cell's own detail page
(`_authenticated.cells.$id.tsx`). Add a standalone list view across **all**
cells so finance/admin can find a specific report without knowing which cell
it belongs to first — e.g. matching a `reportRef` written on a paper receipt.

- New route, e.g. `_authenticated.cell-reports.tsx` (or a "Reports" tab on
  the existing Cells list page if that reads more naturally in the nav —
  either is fine, pick whichever fits the existing route/nav structure
  better).
- **Table columns**: `reportRef`, cell name, date, `offertoryReported`,
  `offertoryReceived`, running balance (deficit/credit, same calculation
  already used on the per-cell detail page), `editRequestStatus`.
- **Filters**, matching the existing filter pattern already used on the
  Givings page (`Select`/`SelectTrigger`/`SelectContent` for the dropdowns —
  see `_authenticated.givings.tsx` for the exact pattern to reuse):
  - **Ref number** — free-text search box, matches on partial/full `reportRef`.
  - **Date range** — from/to date pickers, filtering on the meeting date.
  - **Cell** — a `Select` populated from existing cells, "All cells" default.
  - **Reconciliation status** — a `Select` with options: All, Fully received
    (`offertoryReceived === offertoryReported`), Deficit
    (`offertoryReceived < offertoryReported`), Credit
    (`offertoryReceived > offertoryReported`), Edit requested
    (`editRequestStatus === "requested"`).
- Access: same roles who can already see cell financials today (Finance-role
  users, Admin, Pastor) — don't introduce a new permission check, reuse
  whatever gate already exists on the per-cell offertory view.
- Respect the branch filter (§4) and the currency toggle (§12) if both are
  already implemented by the time this is built — amounts shown here should
  behave the same as everywhere else in the app, not diverge into their own
  formatting.
- This is additive only — it doesn't change the reconciliation workflow
  itself (§9), just adds a way to browse/search what already exists.

---

- No real SMTP/email sending — local-mode stand-ins only, built with clear
  seams to swap in real delivery later.
- No SuperAdmin / multi-church hosting yet — that requires a real server and
  is out of scope while still on local Dexie storage. Branches (§4) are
  still worth building now since they work fine within a single local
  church; cross-church tenancy is a separate, later project.
- No billing/tier-limit enforcement (the "10 users / 50 users" plan tiers) —
  deferred until there's a server to enforce them against.
- No live/automatic exchange-rate fetching and no per-transaction historical
  rate tracking (§12) — the admin sets the rate manually, and toggled views
  always use the current rate, not the rate at the time each amount was
  recorded.