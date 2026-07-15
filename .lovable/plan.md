# My Church — Build Plan (MVP)

Local-first church admin app, styled in Deep Purple Faith, packaged later as Electron. Cloud sync is intentionally deferred — the data layer will be abstracted so we can swap in Lovable Cloud later without rewriting screens.

## Tech approach

- **Frontend**: existing TanStack Start template.
- **Storage (now)**: IndexedDB via Dexie — persists locally, works offline, works inside Electron with zero setup.
- **Auth (now)**: local users table with hashed passwords (PBKDF2 via WebCrypto). Roles: `admin`, `pastor`, `cell_leader`.
- **Data layer**: a single `repositories/*` module wraps Dexie. When we later add Lovable Cloud, only these files change — screens stay the same.
- **Electron packaging**: done at the end via `@electron/packager` (per sandbox knowledge).

## Design

- Palette: `#1E1B4B` (deep indigo bg), `#6D28D9` (primary), `#A78BFA` (accent), `#F5F3FF` (surface/text on dark).
- Typography: `Fraunces` (display, reverent serif) + `Inter` (body). Loaded via `<link>` in `__root.tsx`.
- Layout: fixed sidebar (collapsible) + top bar showing current user + church name. Cards with soft indigo gradients, subtle shadows, generous spacing.

## Modules (MVP)

**1. Auth & Users**
- Login screen, logout, "first-run" setup that creates the initial admin.
- Admin can create pastor / cell leader accounts.
- Route guard via a `_authenticated` layout that reads session from localStorage.

**2. Members & Households**
- CRUD: name, phone, email, gender, DOB, address, status (visitor / member / baptized / inactive), join date, notes.
- Households: group members under one household; mark head of household.
- Search + filter by status; member detail page.

**3. Cell Fellowships / Small Groups**
- CRUD cell: name, meeting day, meeting location, description.
- Assign one **leader** (from users with role `cell_leader` or `pastor`).
- Assign members to a cell (many members → one cell for MVP).
- Cell detail page: roster + attendance history.
- **Cell meeting attendance**: create a meeting (date, topic), mark present/absent for the roster.

**4. Events & Service Attendance**
- CRUD events: title, date, type (Sunday service / prayer / special).
- Take attendance for an event by checking off members.

**5. Dashboard**
- KPIs: total members, active members, # cells, avg cell attendance (last 4 meetings), upcoming events, new members this month.
- Recent activity list.
- Simple charts (attendance trend) using Recharts.

## Permissions

- `admin` — everything, including user management.
- `pastor` — everything except user management.
- `cell_leader` — read members, full control over **their own** cell (roster + attendance), read events.

## Out of scope for MVP (noted for later)

Giving/tithes, communications (SMS/email), volunteer scheduling, sacraments register, reports export, cloud sync, multi-church tenancy.

## Build order

1. Design system tokens + fonts + sidebar shell + auth scaffolding (Dexie, hashing, first-run admin, login/logout).
2. Members + Households.
3. Cells (with leader assignment, roster, meeting attendance).
4. Events + service attendance.
5. Dashboard.
6. Electron packaging pass — produce a `.tar.gz` (Linux) and `.zip` (macOS/Windows) for download.

I'll build steps 1–5 in the preview first so you can click through and validate. Electron packaging happens once the app feels right.

Reply **"go"** to start, or tell me what to change (e.g. swap a module, adjust permissions, tweak palette).