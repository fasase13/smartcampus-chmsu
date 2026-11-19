---
name: tailwind-minimal-ui
description: >-
  Tailwind CSS and minimal UI/UX design guidance for the multi-campus university
  prototype. Use when designing or styling the mobile-first student portal,
  publisher/document-tracking dashboards, printable QR slips, or full-screen
  interactive kiosk displays.
---

# Tailwind CSS & Minimal UI/UX Design

Use this skill when creating layouts, components, or stylesheets for the multi-campus university prototype.

## Design System Principles

- **Minimal, high-clarity hierarchy**: Neutral light canvas (`slate-50`/`white`), high-contrast ink (`slate-900`), muted secondary copy (`slate-600`), and one primary accent color per campus (mapped cleanly via campus theme tokens or CSS variables).
- **Status semantics**: Reserve color strictly for state:
  - Normal / On-track: `emerald`
  - Pending / In-transit: `amber`
  - Delayed / Overdue alert: `rose`/`red` (paired with an icon and text label, never color alone)
  - Neutral / Archived: `slate`
- **Consistent spacing & radius**: Use 4px/8px grid (`gap-4`, `p-4`/`p-6`), subtle `border border-slate-200`, and soft `rounded-xl` cards instead of heavy drop shadows.

## Viewport-Specific Patterns

### 1. Public Full-Screen Interactive Kiosk (`/kiosk/[campus]`)
- Lock outer shell to `h-dvh w-screen overflow-hidden flex flex-col` so the kiosk never scrolls unexpectedly on 16:9 / 1080p displays.
- Use large, legible typography (`text-lg`–`text-4xl`) readable from 1–2 meters away.
- Ensure all interactive touch targets are at least `min-h-14 min-w-14` (`56px`) with generous spacing (`gap-4`).
- Keep navigation flat (large campus/section tabs or big action tiles); avoid hover-only menus or tiny icon buttons.
- Include a visible real-time clock, campus badge, and an auto-return / idle reset behavior back to the kiosk home view.

### 2. Mobile-First Student Portal
- Design for `375px` width first (`grid-cols-1`, sticky top header, bottom tab bar or simple single-row nav on mobile, expanding at `md:` / `lg:`).
- Keep cards scannable: title, timestamp/status pill, 2–3 line preview, and clear tap action.
- Prevent horizontal overflow (`overflow-x-hidden`, responsive tables converted to stacked cards on mobile).

### 3. Publisher & Document Tracking Dashboards
- Use a clean sidebar + topbar shell on `lg:` that collapses to a drawer on mobile.
- Place primary actions (e.g., "New Announcement", "Register Document", "Scan QR") in the top-right header.
- Highlight overdue/delayed document alerts in a dedicated pinned banner or alert strip above the main table/list.
- Use tabular numerals (`tabular-nums`) for tracking codes, timestamps, and elapsed delay counters.

### 4. Print Styles for QR Slips
- Use Tailwind `print:` variants (`print:hidden` for chrome/nav, `print:shadow-none`, `print:border-slate-400`) so document QR routing slips print cleanly on standard paper or thermal labels.

## Verification Checklist

- Confirm zero horizontal scroll at `375px` (mobile) and `1440px` (desktop).
- Confirm kiosk view fits cleanly inside `1920x1080` and `1280x720` with no clipped content.
- Verify contrast ratios (WCAG AA minimum) for all status badges and buttons.
