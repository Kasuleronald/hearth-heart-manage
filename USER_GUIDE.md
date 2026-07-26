# My Church — User Guide

This guide explains how to use the My Church app day-to-day: signing in, finding your way
around, and working with each part of the system. It's written for church staff and volunteers
who use the app, not for the people who build or host it.

A quick note on names: several terms in this app can be renamed by your Admin to match how your
church talks (for example, "Cell Fellowship" could become "Zonal Fellowship", or "Department"
could become "Ministry"). This guide uses the default names. If your church has renamed
something, look for it under its new name — the feature works the same either way.

---

## 1. Signing in

- **Log in** at your church's app address with your email and password. If you get your password
  wrong five times in a row, the app will briefly lock further attempts for 30 seconds — just wait
  and try again.
- **Forgot your password?** Use the "Forgot password?" link on the login page. If your church has
  email set up, you'll receive a reset link. If not, ask your Admin — they can generate a reset
  link for you from the Users page.
- **Accepted an invite or reset link?** Clicking the link takes you to a page where you choose a
  new password (at least 8 characters). Once set, you're signed in automatically.
- **Changing your password anytime:** click the key icon at the bottom of the sidebar (next to
  your name), enter your current password and a new one.
- Only people set up with a login (an "account") can sign in — see [Roles](#2-roles-who-can-do-what)
  below. Everyone else in the church is simply a record in the Members directory.

---

## 2. Roles — who can do what

Every account has one role, which controls what they can see and do. An Admin sets this when
creating your account (Users page).

| Role | Typically used for |
|---|---|
| **Admin** | Full control of the app — every feature, every record, church-wide. Manages user accounts, branches, and all settings. |
| **Pastor** | Broad oversight of ministry activity (members, cells, classes, events, departments, requisitions, reports) — everything except managing user accounts/branches and directly recording money (Givings/Expenses). |
| **Cell Fellowship Leader** *(role name: cell_leader)* | Leads one or more Cell Fellowships (small groups) — manages their own group's roster, meetings, and attendance. |
| **Department Leader** *(role name: leader)* | Leads a ministry/department — can submit funding requests (requisitions) and manage their department's activity. |
| **Treasurer** | Handles money — Givings, Expenses, deciding requisitions and expense accountability, reconciling cell offertory reports. |

A couple of things that don't show up as separate roles but affect what you can do:

- **Extra finance access.** An Admin can grant a Cell Fellowship Leader or Department Leader
  extra finance powers (approving requisitions, seeing Partners/Pledges, switching the currency
  view) without changing their main role. If you have more buttons than you expected, this is
  likely why.
- **Being assigned to lead something specific.** You can be assigned to lead a particular cell,
  class, or department even if that's not your main role — you'll get access to just that record.
- **Module access.** An Admin can also grant a department's leader visibility into specific extra
  screens (Givings, Projects, Pledges, or Partners) on top of what their role normally allows —
  set up per department under Departments.
- **Branch scoping.** If your account is tied to one branch (campus), you'll only see and manage
  records for that branch. Church-wide accounts (no branch set) see everything and can switch
  which branch they're viewing from the header.

---

## 3. Finding your way around

- **Sidebar** (left side): every page you have access to is listed here. Items you don't have
  permission for simply don't appear.
- **Quick search** (press Ctrl+K, or ⌘K on a Mac): jump straight to a member, cell, class, or
  event by typing part of its name.
- **Branch switcher**: only shown if your account isn't tied to a single branch — lets you filter
  the whole app to one branch, or view everything.
- **Currency toggle**: shown to Admins, Treasurers, and finance-elevated leaders on money-related
  pages — switches amounts between your church's base currency and USD.
- **Notification bell**: shows updates relevant to you (new members added, requisitions submitted,
  events posted, etc.) — see [Notifications](#12-notifications) below.
- **Your account, bottom of the sidebar**: shows your name and role, and three icons — a
  notification-preferences toggle, change password, and sign out.

---

## 4. Members and Households

**Members** is your church directory. Everyone with access to the app can view it, search and
filter (by name, phone, email, status, join date), choose which columns to show, and export the
list. Anyone can add a new member. Editing or deleting a member, and assigning an official member
number, is limited to Admins — deleting requires a short written reason and notifies whoever
originally added that member, plus pastors.

Open a member's profile to see their full details — contact info, personal details, household and
cell links, and notes.

**Households** group members into family units. Anyone can create a household, add members to it,
and mark someone as head of household. Deleting a household doesn't delete its members — it just
un-links them.

---

## 5. Cell Fellowships (small groups)

Cell Fellowships are your church's small groups. Admins, Pastors, and whoever heads the Cell
Fellowships department can create groups and assign a leader; only Admins can delete one (this
also removes its meeting and attendance history).

Who sees which groups: Admins, Pastors, Treasurers, and finance-elevated leaders see every group.
A regular Cell Fellowship Leader only sees the group(s) they're actually assigned to lead.

On a group's own page, the assigned leader (or an Admin/Pastor) can:
- Manage the group's roster.
- Log a meeting — topic, the offertory the group reports collecting, and (optionally) a claim for
  an expense they need reimbursed.
- Take attendance, including adding walk-in guests who aren't yet members.

Finance roles (Admin, Treasurer, or a finance-elevated leader) then reconcile the group's report —
recording the offertory actually *received* against what was reported — and approve or reject any
expense claim. An approved claim automatically becomes a real expense entry under Expenses.

If a Cell Fellowship Leader needs to correct an already-submitted meeting, they submit an edit
request rather than changing it directly; an Admin or Treasurer approves or declines that request.

**Cell Reports** is a church-wide view of every group's offertory reports, with filters by
reference number, date, group, and reconciliation status, running balances, and a weekly grouped
summary. It's visible to Admins, Pastors, Treasurers, finance-elevated leaders, and whoever heads
the Cell Fellowships department.

---

## 6. Discipleship Classes

Classes work the same way as Cell Fellowships, but for structured courses. Admins and Pastors
create classes and assign a facilitator; only Admins can delete one. A facilitator who isn't also
an Admin/Pastor only sees the class(es) they're assigned to.

On a class's own page, the facilitator (or Admin/Pastor) manages the roster, logs sessions (topic
and an optional offertory), and takes attendance.

---

## 7. Events and attendance

The Events calendar covers services, prayer meetings, and special gatherings. Only Admins and
Pastors can create, edit, or delete events — including choosing, for a recurring event, whether to
delete just one occurrence or the whole series, and choosing who gets notified when the event is
created ("Everyone" or "Leaders only").

Everyone with access to the app can view the calendar. Open an event to take attendance — check
off members who are present, or add a guest who isn't yet in the directory.

When a new event is created, everyone who should be notified gets an in-app notification and,
if they have email notifications turned on, an email as well — see
[Notifications](#12-notifications).

---

## 8. Testimonies

A shared space for testimonies. Any signed-in user can post one (with a category, like Salvation),
and everyone with access can read the feed. Only Admins can remove a testimony; there's no edit
option once posted.

---

## 9. Departments and ministries

Departments represent your church's ministries and teams (Ushering, Sound, Worship, and so on),
each with an assigned leader. Admins and Pastors create, edit, and delete departments (deleting
also removes that department's expense and requisition history), and can quickly add a starter
set of common departments.

You can view this page if you're an Admin, a Pastor, hold the Department Leader role, or are
personally assigned to lead a department — everyone else is taken back to the dashboard.

When editing a department, an Admin/Pastor can also grant its leader access to extra screens
(Givings, Projects, Pledges, Partners) beyond what their role normally shows them.

---

## 10. Requisitions and Expenses (the money workflow)

This is how a department gets funded and accounts for what it spends:

1. **Submit a requisition.** A Department Leader, Pastor, or Admin requests money for their
   department — how much, and why.
2. **Decide it.** An Admin, Pastor, or Treasurer approves or rejects the request. Only Admins,
   Pastors, Treasurers, and finance-elevated leaders can even see the Requisitions list.
3. **Submit accountability.** Once funds are approved and received, the department leader goes to
   the Expenses page and submits an accountability entry against that requisition — what the
   money was actually spent on. This shows as *pending* and doesn't count toward the department's
   totals yet.
4. **Approve the spend.** An Admin, Pastor, or Treasurer reviews and approves (or rejects) the
   accountability entry. Once approved, it counts as a real expense.

Admins and Treasurers can also record or edit an expense directly (without going through a
requisition first) — these post immediately. Everyone else only sees expenses for their own
department.

---

## 11. Givings, Projects, Pledges, and Partners

- **Givings** records tithes, offerings, first fruits, seeds, and project-designated giving, each
  optionally linked to a member or a partner. Viewing is limited to Admins, Pastors, Treasurers,
  and departments specifically granted the Givings screen; only Admins and Treasurers can actually
  record, edit, or delete entries. The page shows this month's totals by category and can be
  exported.
- **Projects** are fundraising initiatives (like a building fund), with optional overall, weekly,
  or monthly targets — progress updates automatically as Givings are recorded against the project.
  Admins and Pastors manage projects; everyone with app access can view them.
- **Pledges** are commitments to give a set amount by a certain date, toward a Seed or a specific
  project. Anyone can make a pledge and manage their own while it's still active. Admins,
  Treasurers, and finance-elevated leaders can see and manage everyone's pledges, mark them
  fulfilled, and restore one that's overdue and was automatically archived.
- **Partners** are outside individuals, organizations, or churches who give financially without
  being members — the page tracks what they've given to date and any recurring pledge. Available
  to Admins, Pastors, Treasurers, finance-elevated leaders, and departments granted the Partners
  screen.

---

## 12. Notifications

The bell icon in the header keeps you updated on things relevant to you — new members added,
requisitions submitted, events posted, expense approvals, and more. Click a notification to jump
straight to what it's about; unread ones are highlighted, and you can mark one or all of them as
read.

By default you'll also get an email for new-event notifications. You can turn email notifications
on or off for yourself at any time from the mail icon at the bottom of the sidebar, next to change
password — this doesn't affect the in-app bell, only whether you're also emailed.

---

## 13. Reports

The Reports page covers four areas — Attendance, Givings, Membership & growth, and Cell/Class
performance — each with a date range filter, a chart, and a data table you can export as CSV,
Excel, or PDF. If you're viewing church-wide (not scoped to one branch), you'll also see a
per-branch breakdown. Available to Admins, Pastors, Treasurers, and departments granted the
Givings screen.

---

## 14. Branches (multi-campus churches)

If your church has more than one location, Branches lets an Admin set them up, assign a
branch-in-charge, and scope users and records to a specific campus. This page is Admin-only.
Deleting a branch doesn't delete its records — they simply become church-wide instead.

---

## 15. Managing user accounts

Admins manage who can sign in from the Users page: create an account (name, email, role, optional
department assignment, optional finance-elevated access, optional link to an existing member),
edit or remove one, and reset someone's password (this generates a one-time link you can copy and
send them). You can't remove your own account this way.

---

## 16. Settings

Available to Admins and Pastors:

- **Church branding** — church name and logo (Admin only).
- **Terminology** — rename any of the church-specific terms (Cell, Department, Class,
  Requisition, Branch, Treasurer, Givings) to match how your church talks. Leave a field blank to
  fall back to the default. Changes apply everywhere in the app immediately.
- **Currency** — set your church's base currency and the USD exchange rate (Admin only).
- **Week start day** — which day your week begins on, used for weekly groupings like Cell Reports
  (Admin only).
- **Backup** — download a full backup of your church's data as a file, or restore from one
  (merge with or replace existing data).

---

## Quick reference: common tasks

- **Add a new member:** Members → New member.
- **Log this week's cell meeting:** Dashboard (if you lead a cell, there's a shortcut) or Cell
  Fellowships → open your group → log a meeting.
- **Request funding for my department:** Requisitions → Submit requisition.
- **Account for money I received:** Expenses → Submit accountability (only shows for approved
  requisitions you haven't accounted for yet).
- **Take attendance at an event:** Events → open the event → check off who's present.
- **Rename something church-wide:** Settings → Terminology.
- **Turn off notification emails:** mail icon at the bottom of the sidebar.
- **Reset someone's password:** Users → find them → reset password (Admin only).
