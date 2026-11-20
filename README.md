# SmartCampus CHMSU

A full-stack, multi-campus university web system for **Carlos Hilado Memorial State University (CHMSU)** featuring public interactive information kiosks, campus-isolated role-based portals, a mobile-first student web portal, a faculty/staff announcement & availability publisher, a QR-based intra/inter-campus document tracking system with real-time SLA delay alerts, and immutable RA 10173-compliant audit logs.

---

## Covered CHMSU Campuses (4)

| Code | Campus Name | URL Slug |
| :--- | :--- | :--- |
| `TAL` | Talisay (Main) | `talisay` |
| `ALJ` | Alijis | `alijis` |
| `BIN` | Binalbagan | `binalbagan` |
| `FTW` | Fortune Towne | `fortune-towne` |

## User Roles & Access Matrix (7)

| Role | Default Portal | Scope | Capabilities |
| :--- | :--- | :--- | :--- |
| `admin` | `/management` | Cross-campus | Full oversight, SLA checks, reports, user/role management, immutable audit logs, and access to all campus portals |
| `management` | `/management` | Cross-campus | Multi-campus KPIs, Red Delay Alerts, bottleneck analytics, CSV/PDF reports, audit log review, university-wide announcements |
| `rmo` | `/[campus]/rmo` | Assigned campus | Document intake, private file upload (`document-files`), printable QR routing slips, live registry, office scanning |
| `dept_head` | `/[campus]/office` | Assigned campus | Webcam QR scanner & manual fallback, Receive / Forward / Mark Processed / Return custody actions, office queues |
| `faculty` | `/[campus]/faculty` | Assigned campus | Live kiosk availability status toggle, office/note updates, campus announcement publishing (CRUD) |
| `staff` | `/[campus]/faculty` | Assigned campus | Campus announcement publishing & office document handoffs |
| `student` | `/[campus]/student` | Assigned campus | Mobile-first Campus News, Instructor Locator, Private Document ID Tracker (via sanitized RPC), Notification Center |

---

## Tech Stack & Architecture

- **Frontend & Server Framework:** Next.js 16 (App Router, JavaScript), React 19, Tailwind CSS v4, `lucide-react`
- **Backend & Database:** Supabase PostgreSQL (7 normalized tables + strict Row-Level Security), Supabase Auth (`@supabase/ssr`), Supabase Storage (private `document-files` bucket with signed URLs), Supabase Realtime (`postgres_changes`)
- **QR Code & Camera Scanning:** `qrcode.react` (`QRCodeSVG` encoding opaque `qr_token` UUIDs) & `@yudiel/react-qr-scanner` (client-only webcam scanning on `localhost` with cooldown deduplication & manual fallback)
- **Privacy & Security (RA 10173):**
  - Public kiosks (`/[campus]/kiosk`) query ONLY active public announcements and `public.public_faculty_availability` (zero PII, zero QR scanning, zero document tracking).
  - Campus-bound roles are isolated via Next.js proxy (`src/proxy.js`), Server Component guards, and PostgreSQL RLS policies.
  - All critical actions write to an append-only `public.audit_logs` table protected by a database-level immutability trigger.
  - Zero `SUPABASE_SERVICE_ROLE_KEY` or secret keys are exposed to browser code.

---

## Local Setup Instructions

### 1. Prerequisites
- Node.js 20+ and npm
- A Supabase project (Free tier works out of the box)

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy `.env.local.example` to `.env.local` and fill in your Supabase project credentials (**Supabase Dashboard → Project Settings → API**):

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-or-publishable-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Execute SQL Migrations (Exact Order)
Open **Supabase Dashboard → SQL Editor → New query** and run each file in order:

1. `supabase/schema.sql` — Creates 7 core tables, enums, indexes, `handle_new_user` auth trigger, `audit_logs` immutability trigger, private RLS helper functions, `public_faculty_availability` view, strict RLS policies, Realtime publication, and private `document-files` Storage bucket.
2. `supabase/seed.sql` — Seeds the 4 official CHMSU campuses (`Talisay (Main)`, `Alijis`, `Binalbagan`, `Fortune Towne`).
3. `supabase/sprint2_student_tracking.sql` — Adds the `SECURITY DEFINER` RPC `lookup_document_by_tracking_code` for RA 10173-safe student tracking.
4. `supabase/sprint3_storage_intercampus.sql` — Enables inter-campus signed-URL file downloads and cross-campus handoff notifications.
5. `supabase/sprint4_delay_alerts.sql` — Adds `run_sla_delay_check()` and `get_management_analytics()` RPCs.

### 5. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

---

## Live Capstone Defense Demo Script

Use this 5-minute end-to-end flow during a live evaluation:

1. **Campus Gateway & Campus Isolation (`/`, `/login/[campus]`):**
   - Open `http://localhost:3000/` to show all 4 campuses loaded live from Supabase.
   - Attempt to log a **Talisay (Main)** faculty account into `/login/alijis` → demonstrate instant rejection and assigned-campus error message.
2. **Real-Time Public Kiosk Sync (`/[campus]/kiosk` + `/[campus]/faculty`):**
   - Open `/talisay/kiosk` in full-screen (`F11`) on one window and `/talisay/faculty` in another.
   - Toggle instructor status (`Available` → `In Class`) and publish a pinned announcement → watch the Kiosk update live without refreshing.
   - Highlight the RA 10173 Privacy Notice footer confirming zero PII or document tracking on public kiosks.
3. **Inter-Campus RMO Intake & QR Routing (`/[campus]/rmo` → `/[campus]/office`):**
   - Sign in as Alijis RMO at `/login/alijis` → register an official document with a PDF attachment routed to **CHMSU Talisay (Main)** (`Office of the VPAA`) and display/print the generated QR Routing Slip.
   - Sign in as Talisay Department Head at `/login/talisay` → open `/talisay/office`, scan the QR slip via webcam (or paste the tracking code), download the attached PDF via signed URL, and execute **Receive → Forward → Mark Processed**.
4. **Mobile-First Student Document ID Tracking (`/[campus]/student`):**
   - Sign in as a Talisay student at `/login/talisay` (resize to `375px` mobile view to showcase bottom navigation).
   - Open **Track Doc**, enter the tracking code, and display the live sanitized custody timeline (with zero internal staff remarks exposed).
5. **Executive Red Delay Alerts, Reports & Audit Logs (`/management`):**
   - Sign in at `/login/management` as `admin@chmsu.edu.ph`.
   - Click **Run SLA Delay Check** to highlight overdue documents in red, inspect a bottleneck custody trail, switch the **Campus Scope Filter**, export a **CSV** / **Print PDF Report**, review **User & Role Permissions**, and inspect the JSON trail inside **Immutable Audit Logs**.
