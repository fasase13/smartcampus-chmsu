import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const DOCS_DIR = path.join(ROOT, "docs");
const OUTPUT_PDF = path.join(DOCS_DIR, "SmartCampus_CHMSU_System_Process_Guide.pdf");
const TEMP_HTML = path.join(DOCS_DIR, "_tmp_smartcampus_guide.html");
const LOGO_PATH = path.join(ROOT, "public", "images", "chmsu-logo.jpg");

fs.mkdirSync(DOCS_DIR, { recursive: true });

let logoDataUri = "";
if (fs.existsSync(LOGO_PATH)) {
  const b64 = fs.readFileSync(LOGO_PATH).toString("base64");
  logoDataUri = `data:image/jpeg;base64,${b64}`;
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>SmartCampus CHMSU — Complete System Process &amp; User Workflow Guide</title>
<style>
  @page {
    size: A4 portrait;
    margin: 18mm 15mm 17mm 15mm;
    @top-left {
      content: "SmartCampus CHMSU — System Process Guide";
      font-family: "Segoe UI", Inter, -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 8pt;
      font-weight: 600;
      color: #475569;
      border-bottom: 0.75pt solid #CBD5E1;
      padding-bottom: 4pt;
      white-space: nowrap;
    }
    @top-right {
      content: "Carlos Hilado Memorial State University";
      font-family: "Segoe UI", Inter, -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 8pt;
      color: #64748B;
      border-bottom: 0.75pt solid #CBD5E1;
      padding-bottom: 4pt;
      white-space: nowrap;
    }
    @bottom-left {
      content: "Official Operational Reference • Ground-Truth Codebase Edition";
      font-family: "Segoe UI", Inter, -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 7.5pt;
      color: #64748B;
      border-top: 0.75pt solid #E2E8F0;
      padding-top: 4pt;
      white-space: nowrap;
    }
    @bottom-right {
      content: "Page " counter(page) " of " counter(pages);
      font-family: "Segoe UI", Inter, -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 8pt;
      font-weight: 600;
      color: #143D29;
      border-top: 0.75pt solid #E2E8F0;
      padding-top: 4pt;
      white-space: nowrap;
    }
  }

  @page :first {
    margin: 0;
    @top-left { content: none; border: none; }
    @top-right { content: none; border: none; }
    @bottom-left { content: none; border: none; }
    @bottom-right { content: none; border: none; }
  }

  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  html, body {
    margin: 0;
    padding: 0;
    font-family: "Segoe UI", Inter, -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
    font-size: 9.4pt;
    line-height: 1.5;
    color: #1E293B;
    background: #FFFFFF;
  }

  /* Cover Page */
  .cover-page {
    position: relative;
    width: 210mm;
    height: 297mm;
    background: #FFFFFF;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    overflow: hidden;
    page-break-after: always;
  }

  .cover-top-band {
    background: #143D29;
    color: #FFFFFF;
    padding: 17mm 18mm 14mm 18mm;
    border-bottom: 5pt solid #D97706;
  }

  .cover-brand-row {
    display: flex;
    align-items: center;
    gap: 14pt;
    margin-bottom: 18pt;
  }

  .cover-logo {
    width: 56pt;
    height: 56pt;
    border-radius: 50%;
    background: #FFFFFF;
    padding: 3pt;
    object-fit: contain;
    border: 2pt solid #F59E0B;
  }

  .cover-univ {
    font-size: 9.5pt;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #FACC15;
    margin: 0 0 3pt 0;
  }

  .cover-platform {
    font-size: 13pt;
    font-weight: 700;
    color: #FFFFFF;
    margin: 0;
  }

  .cover-kicker {
    display: inline-block;
    background: rgba(245, 158, 11, 0.18);
    border: 1pt solid #F59E0B;
    color: #FDE68A;
    font-size: 8.5pt;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 4pt 10pt;
    border-radius: 6px;
    margin-bottom: 14pt;
  }

  .cover-title {
    font-size: 27pt;
    font-weight: 800;
    line-height: 1.15;
    letter-spacing: -0.02em;
    margin: 0 0 12pt 0;
    color: #FFFFFF;
  }

  .cover-subtitle {
    font-size: 11.5pt;
    line-height: 1.5;
    color: #E2E8F0;
    margin: 0;
    max-width: 155mm;
  }

  .cover-body {
    padding: 12mm 18mm;
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .cover-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10pt;
  }

  .cover-card {
    border: 1pt solid #E2E8F0;
    border-left: 3.5pt solid #143D29;
    border-radius: 6px;
    padding: 10pt 12pt;
    background: #F8FAFC;
  }

  .cover-card.gold {
    border-left-color: #D97706;
  }

  .cover-card-label {
    font-size: 7.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #64748B;
    margin: 0 0 3pt 0;
  }

  .cover-card-value {
    font-size: 10pt;
    font-weight: 700;
    color: #0F172A;
    margin: 0 0 2pt 0;
  }

  .cover-card-sub {
    font-size: 8.3pt;
    color: #475569;
    margin: 0;
  }

  .cover-campuses {
    margin-top: 14pt;
    border: 1pt solid #E2E8F0;
    border-radius: 6px;
    padding: 12pt 14pt;
    background: #FFFFFF;
  }

  .cover-campuses h3 {
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #143D29;
    margin: 0 0 8pt 0;
  }

  .campus-chips {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 7pt;
  }

  .campus-chip {
    background: #F0FDF4;
    border: 1pt solid #BBF7D0;
    border-radius: 6px;
    padding: 7pt 8pt;
    text-align: center;
  }

  .campus-chip .code {
    display: inline-block;
    background: #143D29;
    color: #FACC15;
    font-family: Consolas, monospace;
    font-size: 7.5pt;
    font-weight: 700;
    padding: 1.5pt 5pt;
    border-radius: 4px;
    margin-bottom: 3pt;
  }

  .campus-chip .name {
    display: block;
    font-size: 8.5pt;
    font-weight: 700;
    color: #143D29;
  }

  .cover-footer {
    border-top: 1pt solid #E2E8F0;
    padding: 7mm 18mm;
    background: #F8FAFC;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 8.2pt;
    color: #475569;
  }

  /* Typography & Structure */
  .section-break {
    page-break-before: always;
  }

  h1.sec-title {
    font-size: 16pt;
    font-weight: 800;
    color: #143D29;
    border-bottom: 2pt solid #143D29;
    padding-bottom: 5pt;
    margin: 0 0 10pt 0;
    display: flex;
    align-items: center;
    gap: 8pt;
    page-break-after: avoid;
  }

  .sec-num {
    display: inline-block;
    background: #143D29;
    color: #FACC15;
    font-size: 10pt;
    font-weight: 800;
    padding: 2pt 7pt;
    border-radius: 6px;
  }

  h2.sub-title {
    font-size: 11.5pt;
    font-weight: 700;
    color: #143D29;
    margin: 14pt 0 6pt 0;
    padding-left: 8pt;
    border-left: 3pt solid #D97706;
    page-break-after: avoid;
  }

  h3.role-title {
    font-size: 10.5pt;
    font-weight: 700;
    color: #0F172A;
    background: #F1F5F9;
    border: 1pt solid #CBD5E1;
    border-left: 4pt solid #143D29;
    border-radius: 6px;
    padding: 6pt 10pt;
    margin: 12pt 0 6pt 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    page-break-after: avoid;
  }

  p {
    margin: 0 0 7pt 0;
  }

  ul, ol {
    margin: 0 0 8pt 0;
    padding-left: 16pt;
  }

  li {
    margin-bottom: 3.5pt;
  }

  code {
    font-family: Consolas, "Courier New", monospace;
    font-size: 8.3pt;
    background: #F1F5F9;
    color: #143D29;
    padding: 1pt 4pt;
    border-radius: 4px;
    border: 0.5pt solid #E2E8F0;
  }

  /* Badges (Strict rounded-md 6px — NO pill/oval 9999px) */
  .badge {
    display: inline-block;
    font-size: 7.5pt;
    font-weight: 700;
    padding: 1.5pt 6pt;
    border-radius: 6px;
    border: 0.75pt solid transparent;
    vertical-align: middle;
  }
  .badge-green { background: #ECFDF5; color: #143D29; border-color: #A7F3D0; }
  .badge-gold { background: #FFFBEB; color: #92400E; border-color: #FCD34D; }
  .badge-red { background: #FEF2F2; color: #991B1B; border-color: #FECACA; }
  .badge-slate { background: #F1F5F9; color: #334155; border-color: #CBD5E1; }
  .badge-blue { background: #EFF6FF; color: #1E40AF; border-color: #BFDBFE; }

  /* Tables */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 8pt 0 11pt 0;
    font-size: 8.4pt;
    break-inside: avoid;
  }

  thead th {
    background: #143D29;
    color: #FFFFFF;
    font-weight: 700;
    text-align: left;
    padding: 6pt 7pt;
    border: 0.75pt solid #143D29;
    font-size: 8pt;
    letter-spacing: 0.02em;
  }

  tbody td {
    padding: 5.5pt 7pt;
    border: 0.75pt solid #CBD5E1;
    vertical-align: top;
  }

  tbody tr:nth-child(even) {
    background: #F8FAFC;
  }

  /* Callout Boxes & Workflow Cards */
  .callout {
    border: 1pt solid #CBD5E1;
    border-left: 3.5pt solid #143D29;
    background: #F8FAFC;
    border-radius: 6px;
    padding: 8pt 10pt;
    margin: 8pt 0 10pt 0;
    break-inside: avoid;
  }

  .callout.gold {
    border-color: #FDE68A;
    border-left-color: #D97706;
    background: #FFFBEB;
  }

  .callout.red {
    border-color: #FECACA;
    border-left-color: #DC2626;
    background: #FEF2F2;
  }

  .callout-title {
    font-size: 8.6pt;
    font-weight: 700;
    color: #143D29;
    margin: 0 0 3pt 0;
  }

  .callout.gold .callout-title { color: #92400E; }
  .callout.red .callout-title { color: #991B1B; }

  .workflow-card {
    border: 1pt solid #CBD5E1;
    border-radius: 6px;
    padding: 9pt 11pt;
    margin: 8pt 0 10pt 0;
    background: #FFFFFF;
    break-inside: avoid;
  }

  .workflow-card-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1pt solid #E2E8F0;
    padding-bottom: 5pt;
    margin-bottom: 6pt;
  }

  .workflow-card-head strong {
    color: #143D29;
    font-size: 9.5pt;
  }

  .step-list {
    list-style: none;
    padding: 0;
    margin: 4pt 0 0 0;
  }

  .step-list li {
    position: relative;
    padding-left: 20pt;
    margin-bottom: 5pt;
  }

  .step-num {
    position: absolute;
    left: 0;
    top: 1pt;
    width: 14pt;
    height: 14pt;
    background: #143D29;
    color: #FACC15;
    border-radius: 4px;
    font-size: 7.5pt;
    font-weight: 800;
    text-align: center;
    line-height: 14pt;
  }

  /* TOC */
  .toc-box {
    border: 1pt solid #CBD5E1;
    border-radius: 6px;
    padding: 12pt 14pt;
    background: #F8FAFC;
    margin-top: 8pt;
  }

  .toc-item {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 5pt 0;
    border-bottom: 0.75pt dotted #CBD5E1;
    font-size: 9.5pt;
  }

  .toc-item:last-child { border-bottom: none; }
  .toc-item strong { color: #143D29; }
  .toc-sub {
    padding-left: 16pt;
    font-size: 8.6pt;
    color: #475569;
    padding-top: 2.5pt;
    padding-bottom: 2.5pt;
    border-bottom: none;
  }

  /* Diagram Box */
  .diagram-box {
    border: 1pt solid #CBD5E1;
    border-radius: 6px;
    padding: 10pt;
    background: #FFFFFF;
    margin: 8pt 0 12pt 0;
    text-align: center;
    break-inside: avoid;
  }

  .diagram-caption {
    font-size: 8pt;
    color: #64748B;
    margin-top: 5pt;
    font-style: italic;
  }

  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10pt;
    break-inside: avoid;
  }
</style>
</head>
<body>

<!-- ==================== COVER PAGE ==================== -->
<div class="cover-page">
  <div class="cover-top-band">
    <div class="cover-brand-row">
      ${logoDataUri ? `<img src="${logoDataUri}" alt="CHMSU Seal" class="cover-logo" />` : ""}
      <div>
        <p class="cover-univ">Carlos Hilado Memorial State University</p>
        <p class="cover-platform">SmartCampus CHMSU Unified Platform</p>
      </div>
    </div>
    <span class="cover-kicker">Official Operational &amp; Workflow Reference</span>
    <h1 class="cover-title">Complete System Process &amp;<br/>User Workflow Guide</h1>
    <p class="cover-subtitle">
      End-to-end operational procedures, role-based portal workflows, registration &amp; ID verification protocols, QR document custody enforcement, SLA delay monitoring, and RA 10173 privacy safeguards across all four CHMSU campuses.
    </p>
  </div>

  <div class="cover-body">
    <div>
      <div class="cover-grid">
        <div class="cover-card">
          <p class="cover-card-label">Architecture &amp; Stack</p>
          <p class="cover-card-value">Next.js App Router + Supabase</p>
          <p class="cover-card-sub">PostgreSQL RLS, SECURITY DEFINER RPCs, Storage Buckets &amp; Realtime Sync</p>
        </div>
        <div class="cover-card gold">
          <p class="cover-card-label">Governance &amp; Privacy</p>
          <p class="cover-card-value">RA 10173 Compliant RBAC</p>
          <p class="cover-card-sub">7 Active Roles, Campus Isolation, Mandatory Consent &amp; Immutable Audit Logs</p>
        </div>
        <div class="cover-card">
          <p class="cover-card-label">Document Lifecycle</p>
          <p class="cover-card-value">QR Custody &amp; SLA Monitoring</p>
          <p class="cover-card-sub">Single-Receive Custody Lock, Inter-Campus Routing &amp; Permanent Processed Lock</p>
        </div>
        <div class="cover-card gold">
          <p class="cover-card-label">Verification Standard</p>
          <p class="cover-card-value">100% Live Codebase Ground Truth</p>
          <p class="cover-card-sub">Audited directly against <code>src/app</code>, <code>src/components</code>, <code>src/lib</code>, and <code>supabase/</code></p>
        </div>
      </div>

      <div class="cover-campuses">
        <h3>Covered CHMSU Campuses</h3>
        <div class="campus-chips">
          <div class="campus-chip">
            <span class="code">TAL</span>
            <span class="name">Talisay (Main)</span>
          </div>
          <div class="campus-chip">
            <span class="code">ALJ</span>
            <span class="name">Alijis</span>
          </div>
          <div class="campus-chip">
            <span class="code">BIN</span>
            <span class="name">Binalbagan</span>
          </div>
          <div class="campus-chip">
            <span class="code">FTW</span>
            <span class="name">Fortune Towne</span>
          </div>
        </div>
      </div>
    </div>

    <div class="callout">
      <p class="callout-title">Document Scope &amp; Accuracy Guarantee</p>
      <p style="margin:0; font-size:8.5pt; color:#334155;">
        Every route path, button label, form field, sidebar tab, storage bucket, and database enforcement rule documented in this guide reflects the exact deployed implementation of <strong>SmartCampus CHMSU</strong>. Deprecated or unbuilt features are intentionally excluded.
      </p>
    </div>
  </div>

  <div class="cover-footer">
    <span><strong>Deliverable:</strong> <code>docs/SmartCampus_CHMSU_System_Process_Guide.pdf</code></span>
    <span><strong>Edition:</strong> v1.0 &bull; Production Codebase Reference</span>
  </div>
</div>

<!-- ==================== TABLE OF CONTENTS ==================== -->
<div class="toc-section">
  <h1 class="sec-title"><span class="sec-num">TOC</span> Table of Contents</h1>
  <p style="color:#475569; margin-bottom:10pt;">
    Use this operational guide as the authoritative reference for onboarding users, administering campus portals, managing official document custody, and auditing platform compliance.
  </p>

  <div class="toc-box">
    <div class="toc-item"><strong>Section 1: System Overview &amp; Architecture</strong> <span class="badge badge-green">4 Campuses &bull; 7 Roles</span></div>
    <div class="toc-sub">1.1 Multi-Campus Purpose &bull; 1.2 Role &amp; Portal Access Matrix &bull; 1.3 Integrated System Process Flowchart</div>

    <div class="toc-item"><strong>Section 2: Account Registration, Verification &amp; Approval Process</strong> <span class="badge badge-gold">3-Step Intake</span></div>
    <div class="toc-sub">2.1 Applicant Registration Flow (Email OTP &amp; Google OAuth) &bull; 2.2 Pending Approval &amp; Returned Resubmission &bull; 2.3 Admin ID Verification &amp; Mandatory RA 10173 Consent Gate</div>

    <div class="toc-item"><strong>Section 3: Authentication, Profile &amp; Security Process</strong> <span class="badge badge-green">RBAC &amp; Audit</span></div>
    <div class="toc-sub">3.1 Login Entry Points &amp; Route Isolation &bull; 3.2 Universal Sign In / Sign Out Activity Logging &bull; 3.3 My Profile, Avatar Upload &amp; 6-Digit OTP Password Reset</div>

    <div class="toc-item"><strong>Section 4: Role-by-Role Step-by-Step Operational Workflows</strong> <span class="badge badge-blue">All 7 Portals + Kiosk</span></div>
    <div class="toc-sub">4.1 System Admin (<code>/superadmin</code>) &bull; 4.2 Campus Admin (<code>/[campus]/admin</code>) &bull; 4.3 Institutional Management (<code>/management</code>) &bull; 4.4 Records Management Officer (<code>/[campus]/rmo</code>) &bull; 4.5 Faculty &amp; Administrative Staff (<code>/[campus]/faculty</code>) &bull; 4.6 Student (<code>/[campus]/student</code>) &bull; 4.7 Public Campus Kiosk (<code>/[campus]/kiosk</code>)</div>

    <div class="toc-item"><strong>Section 5: End-to-End Document Lifecycle &amp; SLA Delay Process</strong> <span class="badge badge-red">Custody Lock</span></div>
    <div class="toc-sub">5.1 Registration to Processed Lifecycle &bull; 5.2 Single-Receive &amp; Permanent Lock Database Rules &bull; 5.3 Storage Buckets &amp; Automated Notifications</div>

    <div class="toc-item"><strong>Section 6: Quick Reference Summary Table</strong> <span class="badge badge-slate">1-Page Cheat Sheet</span></div>
    <div class="toc-sub">Role-to-Route, Sidebar Tab, and Core Operational Actions Reference</div>
  </div>
</div>

<!-- ==================== SECTION 1 ==================== -->
<div class="section-break">
  <h1 class="sec-title"><span class="sec-num">01</span> System Overview &amp; Architecture</h1>

  <h2 class="sub-title">1.1 Purpose of SmartCampus CHMSU</h2>
  <p>
    <strong>SmartCampus CHMSU</strong> is the unified multi-campus digital operations, communication, and QR-based document tracking platform of <strong>Carlos Hilado Memorial State University (CHMSU)</strong>. It connects all four campuses—<strong>Talisay (Main)</strong> (<code>/talisay</code>, code <code>TAL</code>), <strong>Alijis</strong> (<code>/alijis</code>, code <code>ALJ</code>), <strong>Binalbagan</strong> (<code>/binalbagan</code>, code <code>BIN</code>), and <strong>Fortune Towne</strong> (<code>/fortune-towne</code>, code <code>FTW</code>)—under a single role-isolated, Republic Act No. 10173 (Data Privacy Act of 2012) compliant web application.
  </p>
  <p>
    Every campus operates with strict Row-Level Security (RLS) boundaries in PostgreSQL while supporting seamless inter-campus document routing, real-time campus announcements (with attachments up to 15 MB), live opt-in faculty availability syncing to Student portals and Public Kiosks, and immutable system/document audit logging.
  </p>

  <h2 class="sub-title">1.2 Summary of All 7 User Roles</h2>
  <table>
    <thead>
      <tr>
        <th style="width:20%;">User Role (DB Key)</th>
        <th style="width:17%;">Portal Route</th>
        <th style="width:15%;">Data Scope</th>
        <th style="width:48%;">Primary Operational Responsibilities</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>System Admin</strong><br/><code>superadmin</code></td>
        <td><code>/superadmin</code><br/><span style="color:#64748B;font-size:7.6pt;">Login: <code>/sys-admin</code></span></td>
        <td><span class="badge badge-green">All 4 Campuses</span></td>
        <td>University-wide health KPIs, cross-campus user &amp; registration verification, university/campus announcements, global Maintenance Mode, and System Logs / Document Logs oversight. <em>No document intake/custody modules.</em></td>
      </tr>
      <tr>
        <td><strong>Campus Admin</strong><br/><code>campus_admin</code></td>
        <td><code>/[campus]/admin</code><br/><span style="color:#64748B;font-size:7.6pt;">Login: <code>/campus-admin</code></span></td>
        <td><span class="badge badge-gold">Assigned Campus</span></td>
        <td>Campus-scoped KPIs, Campus Users directory, School ID verification queue, campus announcements, and strictly isolated Campus Reports (non-document logs only). <em>No document modules.</em></td>
      </tr>
      <tr>
        <td><strong>Institutional Management</strong><br/><code>management</code></td>
        <td><code>/management</code><br/><span style="color:#64748B;font-size:7.6pt;">Login: <code>/</code></span></td>
        <td><span class="badge badge-gold">Assigned Campus</span></td>
        <td>Strictly read-only executive oversight: SLA delay alerts, <strong>Run SLA Delay Check</strong>, read-only QR Document Tracker, Bottlenecks &amp; Reports (CSV/Print), and campus Document Logs. <em>Zero custody mutation rights.</em></td>
      </tr>
      <tr>
        <td><strong>Records Management Officer</strong><br/><code>rmo</code></td>
        <td><code>/[campus]/rmo</code><br/><span style="color:#64748B;font-size:7.6pt;">Login: <code>/</code></span></td>
        <td><span class="badge badge-gold">Assigned Campus</span></td>
        <td>Official document registration &amp; QR routing slip generation, intra-/inter-campus routing, single-receive custody handoffs (<code>Receive</code>, <code>Forward</code>, <code>Return</code>, <code>Mark as Processed</code>), and campus announcements.</td>
      </tr>
      <tr>
        <td><strong>Faculty</strong><br/><code>faculty</code></td>
        <td><code>/[campus]/faculty</code><br/><span style="color:#64748B;font-size:7.6pt;">Login: <code>/</code></span></td>
        <td><span class="badge badge-gold">Assigned Campus</span></td>
        <td>Document registration &amp; custody handling, reading/publishing campus announcements, and <strong>Live Availability Control</strong> (exclusive to <code>faculty</code>) synced to Student Instructor Locator &amp; Public Kiosk.</td>
      </tr>
      <tr>
        <td><strong>Administrative Staff</strong><br/><code>staff</code></td>
        <td><code>/[campus]/faculty</code><br/><span style="color:#64748B;font-size:7.6pt;">(+ <code>/[campus]/office</code>)</span></td>
        <td><span class="badge badge-gold">Assigned Campus</span></td>
        <td>Document registration, My Documents custody queue, reading and publishing campus announcements via <strong>Manage Announcements</strong>. <em>Does not have Live Availability Control.</em></td>
      </tr>
      <tr>
        <td><strong>Student</strong><br/><code>student</code></td>
        <td><code>/[campus]/student</code><br/><span style="color:#64748B;font-size:7.6pt;">Login: <code>/</code></span></td>
        <td><span class="badge badge-gold">Assigned Campus</span></td>
        <td>Mobile-first portal for official Campus &amp; University-Wide Announcements (with attachments), real-time Faculty <strong>Instructor Locator</strong>, and personal <strong>My Profile</strong> &amp; password security.</td>
      </tr>
    </tbody>
  </table>

  <h2 class="sub-title">1.3 High-Level System Architecture &amp; Process Flow</h2>
  <div class="diagram-box">
    <svg viewBox="0 0 740 235" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, Inter, sans-serif">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#143D29" />
        </marker>
        <marker id="arrowGold" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#D97706" />
        </marker>
      </defs>

      <!-- Row 1: Onboarding & Auth -->
      <rect x="10" y="14" width="155" height="62" rx="6" fill="#F0FDF4" stroke="#143D29" stroke-width="1.5"/>
      <text x="87" y="33" text-anchor="middle" font-size="9.5" font-weight="700" fill="#143D29">1. Registration &amp; ID</text>
      <text x="87" y="47" text-anchor="middle" font-size="8" fill="#334155">/register &bull; OTP / Google</text>
      <text x="87" y="59" text-anchor="middle" font-size="8" fill="#334155">Front &amp; Back ID Upload</text>

      <line x1="165" y1="45" x2="198" y2="45" stroke="#143D29" stroke-width="1.5" marker-end="url(#arrow)"/>

      <rect x="200" y="14" width="165" height="62" rx="6" fill="#FFFBEB" stroke="#D97706" stroke-width="1.5"/>
      <text x="282" y="33" text-anchor="middle" font-size="9.5" font-weight="700" fill="#92400E">2. Admin Verification</text>
      <text x="282" y="47" text-anchor="middle" font-size="8" fill="#475569">System / Campus Admin</text>
      <text x="282" y="59" text-anchor="middle" font-size="8" fill="#475569">Activate &bull; Return &bull; Reject</text>

      <line x1="365" y1="45" x2="398" y2="45" stroke="#143D29" stroke-width="1.5" marker-end="url(#arrow)"/>

      <rect x="400" y="14" width="155" height="62" rx="6" fill="#F0FDF4" stroke="#143D29" stroke-width="1.5"/>
      <text x="477" y="33" text-anchor="middle" font-size="9.5" font-weight="700" fill="#143D29">3. Auth &amp; RA 10173 Gate</text>
      <text x="477" y="47" text-anchor="middle" font-size="8" fill="#334155">School ID / Email / OAuth</text>
      <text x="477" y="59" text-anchor="middle" font-size="8" fill="#334155">1st-Login Privacy Consent</text>

      <line x1="555" y1="45" x2="585" y2="45" stroke="#143D29" stroke-width="1.5" marker-end="url(#arrow)"/>

      <rect x="587" y="14" width="143" height="62" rx="6" fill="#143D29" stroke="#143D29" stroke-width="1.5"/>
      <text x="658" y="33" text-anchor="middle" font-size="9.5" font-weight="700" fill="#FACC15">7 Role Portals</text>
      <text x="658" y="47" text-anchor="middle" font-size="8" fill="#FFFFFF">Strict RBAC &amp; Campus</text>
      <text x="658" y="59" text-anchor="middle" font-size="8" fill="#E2E8F0">Route + RLS Isolation</text>

      <!-- Vertical connectors down to core modules -->
      <line x1="658" y1="76" x2="658" y2="96" stroke="#143D29" stroke-width="1.4"/>
      <line x1="120" y1="96" x2="658" y2="96" stroke="#143D29" stroke-width="1.4"/>
      <line x1="120" y1="96" x2="120" y2="112" stroke="#143D29" stroke-width="1.4" marker-end="url(#arrow)"/>
      <line x1="365" y1="96" x2="365" y2="112" stroke="#143D29" stroke-width="1.4" marker-end="url(#arrow)"/>
      <line x1="615" y1="96" x2="615" y2="112" stroke="#143D29" stroke-width="1.4" marker-end="url(#arrow)"/>

      <!-- Row 2: Three Core Operational Pillars -->
      <rect x="10" y="114" width="225" height="58" rx="6" fill="#EFF6FF" stroke="#2563EB" stroke-width="1.3"/>
      <text x="122" y="132" text-anchor="middle" font-size="9.5" font-weight="700" fill="#1E40AF">Document Routing &amp; QR Custody</text>
      <text x="122" y="146" text-anchor="middle" font-size="8" fill="#334155">RMO, Faculty, Staff &rarr; Single-Receive Lock</text>
      <text x="122" y="158" text-anchor="middle" font-size="8" fill="#334155">Management &rarr; Read-Only SLA &amp; QR Tracker</text>

      <rect x="252" y="114" width="225" height="58" rx="6" fill="#FFFBEB" stroke="#D97706" stroke-width="1.3"/>
      <text x="364" y="132" text-anchor="middle" font-size="9.5" font-weight="700" fill="#92400E">Announcements &amp; Attachments</text>
      <text x="364" y="146" text-anchor="middle" font-size="8" fill="#334155">Admins, RMO, Faculty, Staff &rarr; 15 MB Files</text>
      <text x="364" y="158" text-anchor="middle" font-size="8" fill="#334155">Live Sync to Student Portal &amp; Public Kiosk</text>

      <rect x="494" y="114" width="236" height="58" rx="6" fill="#F0FDF4" stroke="#143D29" stroke-width="1.3"/>
      <text x="612" y="132" text-anchor="middle" font-size="9.5" font-weight="700" fill="#143D29">Live Faculty Availability</text>
      <text x="612" y="146" text-anchor="middle" font-size="8" fill="#334155">Faculty ONLY (Opt-in Kiosk Visibility)</text>
      <text x="612" y="158" text-anchor="middle" font-size="8" fill="#334155">Real-Time Locator for Students &amp; Lobby Kiosk</text>

      <!-- Row 3: Immutable Audit & Notifications Foundation -->
      <line x1="122" y1="172" x2="122" y2="190" stroke="#D97706" stroke-width="1.3" marker-end="url(#arrowGold)"/>
      <line x1="364" y1="172" x2="364" y2="190" stroke="#D97706" stroke-width="1.3" marker-end="url(#arrowGold)"/>
      <line x1="612" y1="172" x2="612" y2="190" stroke="#D97706" stroke-width="1.3" marker-end="url(#arrowGold)"/>

      <rect x="10" y="192" width="720" height="34" rx="6" fill="#1E293B" stroke="#0F172A" stroke-width="1.2"/>
      <text x="370" y="213" text-anchor="middle" font-size="9" font-weight="700" fill="#FACC15">
        Immutable Audit Logs (System Logs &amp; Document Logs)  &bull;  Live Realtime Notification Bell  &bull;  PostgreSQL RLS &amp; Triggers
      </text>
    </svg>
    <div class="diagram-caption">Figure 1.1 — SmartCampus CHMSU integrated architecture connecting onboarding, RBAC portals, operational workflows, and immutable audit trails.</div>
  </div>
</div>

<!-- ==================== SECTION 2 ==================== -->
<div class="section-break">
  <h1 class="sec-title"><span class="sec-num">02</span> Account Registration, Verification &amp; Approval Process</h1>

  <h2 class="sub-title">2.1 Step-by-Step User Self-Registration Flow</h2>
  <p>
    Self-registration is available for four campus roles: <strong>Student</strong>, <strong>Faculty</strong>, <strong>Staff</strong>, and <strong>Records Management Officer (RMO)</strong>. Administrative accounts (<code>superadmin</code>, <code>campus_admin</code>) and <code>management</code> accounts are provisioned directly by the university.
  </p>

  <div class="workflow-card">
    <div class="workflow-card-head">
      <strong>Step 1 &amp; Step 2: Account Creation &amp; Email Verification</strong>
      <span class="badge badge-green">Route: <code>/register</code> or <code>/register/[campus]</code></span>
    </div>
    <ol class="step-list">
      <li><span class="step-num">1</span><strong>Choose Registration Method:</strong> Click <strong>Register Account</strong> from the Unified Portal Sign In page (<code>/</code>). Applicants may register via <strong>Email &amp; Password</strong> (minimum 8 characters + Confirm Password) or click <strong>Sign up with Google</strong>.</li>
      <li><span class="step-num">2</span><strong>Email Uniqueness &amp; Ban Check:</strong> Before creating the account, the system calls <code>check_registration_email_status</code> RPC to enforce one account per email and block permanently banned addresses.</li>
      <li><span class="step-num">3</span><strong>6-Digit Email OTP (Email Path):</strong> Clicking <strong>Continue &amp; Send Email OTP</strong> sends a 6-digit signup verification code to the applicant's inbox. Enter the 6-digit code and click <strong>Verify Email &amp; Continue</strong> (a 60-second cooldown applies to <strong>Resend OTP</strong>).</li>
      <li><span class="step-num">4</span><strong>Google OAuth Fast-Track:</strong> Applicants who choose <strong>Sign up with Google</strong> authenticate via <code>/auth/callback</code>, bypass the Email OTP step, and proceed directly to Step 3 (<code>/register/complete</code>).</li>
    </ol>
  </div>

  <div class="workflow-card">
    <div class="workflow-card-head">
      <strong>Step 3: School Credentials &amp; ID Verification Upload</strong>
      <span class="badge badge-gold">Route: <code>/register/complete</code></span>
    </div>
    <ol class="step-list">
      <li><span class="step-num">1</span><strong>Select Campus &amp; Enter Identity:</strong> Select the assigned <strong>CHMSU Campus</strong> (<code>Talisay (Main)</code>, <code>Alijis</code>, <code>Binalbagan</code>, or <code>Fortune Towne</code>), enter the unique 8-digit <strong>School ID</strong> (verified live via <code>check_id_number_available</code>), and enter <strong>Full Name</strong>.</li>
      <li><span class="step-num">2</span><strong>Select Requested Role &amp; Dynamic Affiliation:</strong> Choose from the campus-specific verified directory (<code>src/lib/chmsuDirectory.js</code>):
        <ul style="margin-top:3pt;">
          <li><strong>Student:</strong> Select <strong>College / Department</strong> &rarr; then cascading <strong>Program</strong> (e.g., <em>College of Computer Studies (CCS) &rarr; BS in Information Systems</em>).</li>
          <li><strong>Faculty, Staff, or RMO:</strong> Select <strong>Office Category</strong> &rarr; then cascading <strong>Office</strong> (e.g., <em>Administrative, Finance, &amp; Operations Offices &rarr; Records Management Office</em>).</li>
        </ul>
      </li>
      <li><span class="step-num">3</span><strong>Upload Front &amp; Back School ID Photos:</strong> Attach clear images of both the <strong>Front of School ID</strong> and <strong>Back of School ID</strong> (JPG, PNG, or WebP; maximum <strong>5 MB</strong> each). Files upload to the private <code>id-verifications</code> Storage bucket.</li>
      <li><span class="step-num">4</span><strong>Submit for Review:</strong> Submitting executes the <code>complete_registration_credentials</code> SECURITY DEFINER RPC, sets <code>approval_status = 'pending'</code> and <code>profile_completed = true</code>, triggers real-time notifications to the campus's Campus Admin and System Admin, and redirects the applicant to <code>/pending-approval</code>.</li>
    </ol>
  </div>

  <h2 class="sub-title">2.2 Pending Approval &amp; Returned-for-Correction Resubmission</h2>
  <div class="two-col">
    <div class="callout">
      <p class="callout-title">While Status is Pending (<code>/pending-approval</code>)</p>
      <p style="font-size:8.5pt; margin-bottom:4pt;">
        Applicants see <strong>Pending Admin Verification</strong> (displayed as status <strong>Pending</strong>—never <em>Deactivated</em>—across admin directories), along with a read-only summary of their submitted School ID, Campus, Role, and College/Office.
      </p>
      <p style="font-size:8.5pt; margin:0;">
        Clicking <strong>Check Status</strong> re-queries their profile: if approved, they enter their portal immediately; if returned, they are routed to <code>/register/complete</code>.
      </p>
    </div>
    <div class="callout gold">
      <p class="callout-title">Returned for Correction Workflow</p>
      <p style="font-size:8.5pt; margin-bottom:4pt;">
        If an admin flags errors, <code>/register/complete</code> opens with an amber <strong>Registration Returned for Correction</strong> banner showing the <strong>Admin Note</strong> and a list of flagged fields.
      </p>
      <p style="font-size:8.5pt; margin:0;">
        Unflagged fields and valid ID photos are preserved. Flagged fields are cleared and validated against <code>returned_snapshot</code> so the applicant cannot resubmit the exact same invalid value.
      </p>
    </div>
  </div>

  <h2 class="sub-title">2.3 Admin Verification &amp; Mandatory First-Login Privacy Gate</h2>
  <div class="workflow-card">
    <div class="workflow-card-head">
      <strong>Admin Verification Queue (<code>RegistrationReviewModal</code>)</strong>
      <span class="badge badge-green">System Admin &amp; Campus Admin</span>
    </div>
    <ol class="step-list">
      <li><span class="step-num">1</span><strong>Inspect Submission:</strong> Open <strong>Pending Registrations</strong> (System Admin) or <strong>Campus Registrations</strong> (Campus Admin) and click an applicant to view read-only registration details and 5-minute private signed URLs for the <strong>Front &amp; Back School ID Photos</strong> (with full-size Zoom lightbox).</li>
      <li><span class="step-num">2</span><strong>Execute Review Decision (<code>review_user_registration</code> RPC):</strong>
        <ul style="margin-top:3pt;">
          <li><strong>Activate Account:</strong> Approves and activates the user (<code>is_active = true</code>, <code>approval_status = 'approved'</code>), assigning their requested role and campus.</li>
          <li><strong>Return &rarr; Confirm Return:</strong> Select one or more invalid fields from the 7-item checklist (<code>Campus</code>, <code>Role</code>, <code>School ID</code>, <code>Full Name</code>, <code>College / Department</code> or <code>Office Category</code>, <code>Program</code> or <code>Office</code>, <code>School ID Photos</code>) and enter a required <strong>Reason for Return</strong>.</li>
          <li><strong>Reject &rarr; Confirm Reject &amp; Ban Email:</strong> Reserved for fraudulent/troll submissions. Requires a <strong>Reason for Rejection</strong> and permanently bans the email address from registering on SmartCampus CHMSU.</li>
        </ul>
      </li>
      <li><span class="step-num">3</span><strong>Mandatory First-Login Privacy &amp; Terms Consent (<code>PrivacyTermsGate</code>):</strong> Upon first sign-in after approval, all non-admin users (<code>student</code>, <code>faculty</code>, <code>staff</code>, <code>rmo</code>, <code>management</code>) are presented with a non-dismissible modal containing the <strong>Terms &amp; Conditions and RA 10173 Privacy Consent Notice</strong>. Users must scroll to the bottom to unlock both checkboxes, check both, and click <strong>Accept &amp; Continue</strong> (calling <code>accept_privacy_terms</code> RPC and logging <code>Privacy Terms Accepted</code>).</li>
    </ol>
  </div>
</div>

<!-- ==================== SECTION 3 ==================== -->
<div class="section-break">
  <h1 class="sec-title"><span class="sec-num">03</span> Authentication, Profile &amp; Security Process</h1>

  <h2 class="sub-title">3.1 Login Entry Points &amp; Strict Role Isolation</h2>
  <table>
    <thead>
      <tr>
        <th style="width:22%;">Entry Point</th>
        <th style="width:18%;">Route</th>
        <th style="width:24%;">Accepted Roles</th>
        <th style="width:36%;">Authentication &amp; Isolation Rules</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Unified Portal Sign In</strong></td>
        <td><code>/</code></td>
        <td>Student, Faculty, Staff, RMO, Institutional Management</td>
        <td>Accepts 8-digit <strong>School ID</strong> or <strong>Email</strong> + Password (via <code>POST /api/auth/login-id</code>) or <strong>Continue with Google</strong> (<code>/auth/callback</code>). Automatically detects campus &amp; role. Rejects <code>superadmin</code> &amp; <code>campus_admin</code> with generic 401.</td>
      </tr>
      <tr>
        <td><strong>Campus Admin Sign In</strong></td>
        <td><code>/campus-admin</code></td>
        <td><code>campus_admin</code> ONLY</td>
        <td>Dedicated unlinked email/password portal. Automatically routes to <code>/[campus]/admin</code>. Blocked during System Maintenance Mode.</td>
      </tr>
      <tr>
        <td><strong>System Admin Sign In</strong></td>
        <td><code>/sys-admin</code></td>
        <td><code>superadmin</code> ONLY</td>
        <td>Dedicated unlinked email/password portal routing to <code>/superadmin</code>. <strong>Remains accessible during Maintenance Mode</strong> so System Admin can restore the platform.</td>
      </tr>
      <tr>
        <td><strong>Password Recovery</strong></td>
        <td><code>/forgot-password</code> &rarr; <code>/reset-password</code></td>
        <td>Self-service accounts</td>
        <td>Initiates email recovery link through <code>/auth/callback?next=/reset-password</code> so users can securely set a new password.</td>
      </tr>
    </tbody>
  </table>

  <h2 class="sub-title">3.2 Universal Sign In &amp; Sign Out Activity Logging</h2>
  <p>
    Every successful authentication and sign-out event across all 7 roles is recorded into the immutable <code>public.audit_logs</code> table via the <code>log_auth_activity(p_event, p_portal)</code> SECURITY DEFINER RPC:
  </p>
  <ul>
    <li><strong>Sign In Events (<code>auth.sign_in</code> &rarr; "Signed In"):</strong> Automatically logged in <code>/api/auth/login-id</code> (ID/Email login), <code>/auth/callback</code> (Google OAuth), <code>CampusAdminLoginForm</code>, and <code>SysAdminLoginForm</code>.</li>
    <li><strong>Sign Out Events (<code>auth.sign_out</code> &rarr; "Signed Out"):</strong> Automatically logged before <code>supabase.auth.signOut()</code> across all 7 portals, capturing <code>full_name</code>, <code>email</code>, <code>role</code>, <code>campus_id</code>, and portal context.</li>
  </ul>

  <h2 class="sub-title">3.3 My Profile, Avatar Upload &amp; 6-Digit OTP Password Reset</h2>
  <div class="workflow-card">
    <div class="workflow-card-head">
      <strong>In-Portal Profile &amp; Security Management (<code>UserProfileView</code>)</strong>
      <span class="badge badge-green">All 7 Portals</span>
    </div>
    <ol class="step-list">
      <li><span class="step-num">1</span><strong>Open My Profile:</strong> Click the user profile card at the top of the left sidebar or select <strong>My Profile</strong> from the top-right header account menu.</li>
      <li><span class="step-num">2</span><strong>Review Verified Institutional Details:</strong> View read-only Full Name, Email Address, School ID, Assigned Campus, Verified/Created Date, and dynamic affiliation labels:
        <ul style="margin-top:3pt;">
          <li><strong>Students</strong> see <code>College / Department</code> and <code>Program</code>.</li>
          <li><strong>Faculty, Staff, and RMO</strong> see <code>Office Category</code> and <code>Office</code>.</li>
        </ul>
      </li>
      <li><span class="step-num">3</span><strong>Upload or Replace Profile Avatar:</strong> Click the circular profile avatar in the forest-green header to upload a <strong>JPG, PNG, or WebP</strong> image (max <strong>5 MB</strong>). The file uploads to the public <code>avatars</code> Storage bucket under <code>&lt;userId&gt;/</code>, updates <code>profiles.avatar_url</code> via <code>update_my_avatar</code> RPC, removes old avatar files, and broadcasts the update immediately across the sidebar and header. Click <strong>Remove photo</strong> to revert to initials.</li>
      <li><span class="step-num">4</span><strong>Change Password via 6-Digit Reauthentication OTP:</strong> Available to <code>student</code>, <code>faculty</code>, <code>staff</code>, and <code>rmo</code> accounts under the <strong>Account Password</strong> footer:
        <ol style="margin-top:3pt;">
          <li>Click <strong>Reset Password</strong> &mdash; calls <code>supabase.auth.reauthenticate()</code> to email a 6-digit verification code (60-second cooldown for <strong>Resend OTP</strong>).</li>
          <li>Enter the <strong>6-Digit OTP Code</strong>, <strong>New Password</strong> (minimum 8 characters), and <strong>Confirm New Password</strong>.</li>
          <li>Submit &mdash; calls <code>supabase.auth.updateUser({ password, nonce })</code> and displays a confirmation banner upon success.</li>
        </ol>
      </li>
    </ol>
  </div>
</div>

<!-- ==================== SECTION 4 ==================== -->
<div class="section-break">
  <h1 class="sec-title"><span class="sec-num">04</span> Role-by-Role Step-by-Step Operational Workflows</h1>

  <!-- 4.1 SYSTEM ADMIN -->
  <h3 class="role-title">
    <span>4.1 System Admin Portal (<code>superadmin</code>)</span>
    <span class="badge badge-green">Route: <code>/superadmin</code></span>
  </h3>
  <p>
    The System Admin governs university-wide accounts, cross-campus verification, global announcements, maintenance mode, and platform-wide audit logs. <em>Document intake and custody tabs are intentionally excluded from System Admin.</em>
  </p>
  <ol>
    <li><strong>Dashboard:</strong> Filter by <em>All Campuses</em> or an individual campus. Click any of the 5 interactive KPI cards (<em>Total Users</em>, <em>Active Accounts</em>, <em>Pending Registrations</em>, <em>Inactive Accounts</em>, <em>Announcements</em>), hover or click slices on the <strong>Campus User Distribution</strong> donut chart, inspect the <strong>Accounts by Role</strong> breakdown, or click any of the 4 <strong>Campus Overview</strong> cards (Talisay Main, Alijis, Binalbagan, Fortune Towne) to jump directly to filtered views.</li>
    <li><strong>Platform Users:</strong> Search by name, School ID, email, or department, and filter by Campus, Role, or Status (<code>Active</code>, <code>Pending</code>, <code>Deactivated</code>). Click <strong>View Details</strong> to open <code>UserDetailsModal</code>—displaying the user's Profile Picture, verified account metadata, and private signed Front &amp; Back School ID photos (with Zoom). For approved accounts (excluding self), click <strong>Deactivate Account</strong> or <strong>Reactivate Account</strong>.</li>
    <li><strong>Pending Registrations:</strong> Filter pending ID submissions by campus and click to open <code>RegistrationReviewModal</code> to <strong>Activate Account</strong>, <strong>Return</strong>, or <strong>Reject</strong>.</li>
    <li><strong>Announcements:</strong> Click <strong>+ New Announcement</strong> to open the composer. Select Target Scope (<em>University-Wide</em> or a specific CHMSU campus), enter Title &amp; Content, optionally attach a file up to <strong>15 MB</strong> (JPG, PNG, WebP, GIF, PDF, Word, Excel, PowerPoint &rarr; <code>announcement-attachments</code> bucket), select Category (<code>General</code>, <code>Academic</code>, <code>Emergency</code>, <code>Event</code>), Priority (<code>Normal</code>, <code>High</code>, <code>Urgent</code>), and toggle <strong>Public / Kiosk</strong> or <strong>Pin</strong>. Edit, pin, toggle active status, or delete published notices from the list.</li>
    <li><strong>System Maintenance:</strong> Edit the maintenance banner message and click <strong>Enable Maintenance Mode...</strong> &rarr; confirm <strong>Yes, Enable Maintenance Mode Now</strong>. All non-System Admin traffic (including Campus Admins and Public Kiosks) is redirected to <code>/maintenance</code>. Click <strong>Turn Maintenance Mode OFF (Restore System)</strong> to bring all portals back online.</li>
    <li><strong>Reports:</strong> Switch between two dedicated audit views, searchable and filterable by campus:
      <ul>
        <li><strong>System Logs (4 Columns):</strong> <code>Timestamp</code>, <code>Actor / User</code> (full name + email), <code>Log Category</code> (Authentication, Registration, Privacy &amp; Terms, User Management, Announcements, System Settings), and <code>Action Performed</code>. <em>Contains zero document logs.</em></li>
        <li><strong>Document Logs (3 Columns):</strong> <code>Timestamp</code>, <code>Actor / User</code> (full name + email), and <code>Action Performed</code> (covering university-wide document registrations, custody handoffs, and SLA delay flags).</li>
      </ul>
    </li>
  </ol>

  <!-- 4.2 CAMPUS ADMIN -->
  <h3 class="role-title">
    <span>4.2 Campus Admin Portal (<code>campus_admin</code>)</span>
    <span class="badge badge-gold">Route: <code>/[campus]/admin</code></span>
  </h3>
  <p>
    Campus Admins operate strictly within their assigned campus (e.g., <em>Talisay Admin</em>, <em>Alijis Admin</em>, <em>Binalbagan Admin</em>, <em>Fortune Towne Admin</em>) with zero document management modules.
  </p>
  <ol>
    <li><strong>Dashboard:</strong> Monitor 5 interactive campus KPI cards (<em>Total Users</em>, <em>Active Accounts</em>, <em>Pending Registrations</em>, <em>Inactive Accounts</em>, <em>Announcements</em>), interact with the <strong>Campus Role Distribution</strong> donut chart (Students, Faculty, Staff, RMO, Management), and review the <strong>Accounts by Role</strong> breakdown.</li>
    <li><strong>Campus Users:</strong> Search and filter campus-only accounts by Role and Status (<code>Active</code>, <code>Pending</code>, <code>Deactivated</code>). Open <strong>View Details</strong> (<code>UserDetailsModal</code>) to inspect Profile Pictures and Front &amp; Back School ID photos, and deactivate/reactivate approved campus accounts.</li>
    <li><strong>Campus Registrations:</strong> Review campus-only pending registrations in <code>RegistrationReviewModal</code> and execute <strong>Activate Account</strong>, <strong>Return</strong>, or <strong>Reject</strong>.</li>
    <li><strong>Campus Announcements:</strong> Click <strong>+ New Announcement</strong> to expand the minimized composer, attach optional files (up to 15 MB), choose Category (<code>General</code>, <code>Academic</code>, <code>Emergency</code>, <code>Event</code>) and Priority, and publish campus-scoped notices (plus pin, edit, deactivate, or delete).</li>
    <li><strong>Campus Reports:</strong> Search and filter by Log Category to audit strictly isolated campus non-document system activity logs. Enforced by PostgreSQL RLS (<code>audit_logs_authorized_read</code>), System Admin logs, other Campus Admins' logs, and all document/SLA logs are completely excluded.</li>
  </ol>

  <!-- 4.3 INSTITUTIONAL MANAGEMENT -->
  <h3 class="role-title">
    <span>4.3 Institutional Management Portal (<code>management</code>)</span>
    <span class="badge badge-blue">Route: <code>/management</code></span>
  </h3>
  <p>
    Institutional Management provides strictly <strong>read-only</strong> executive oversight locked to the user's assigned CHMSU campus. Zero document registration or custody mutation buttons exist in this portal.
  </p>
  <ol>
    <li><strong>Overview &amp; Delay Alerts:</strong> Review campus-scoped KPIs (Total Documents, Active, Overdue, Inter-Campus in Transit, On-Time Rate) and live SLA delay alerts. An automatic SLA check runs on portal load.</li>
    <li><strong>Document Alerts:</strong> Search by tracking code, title, office, or document type; toggle <strong>Overdue Only</strong>; click <strong>Run SLA Delay Check</strong> (executes <code>run_sla_delay_check()</code> RPC to flag overdue documents and dispatch real-time alerts); and click any document to inspect its <strong>strictly read-only</strong> custody trail and download attached files via 5-minute signed URLs.</li>
    <li><strong>QR Document Tracker:</strong> Click <strong>Start Camera</strong> to scan a printed CHMSU QR routing slip via webcam, or enter a Tracking Code / UUID manually and click <strong>Track</strong> (calls <code>POST /api/documents/lookup</code>). Displays real-time document status, SLA countdown/overdue banner, and full chronological routing history in Read-Only Oversight Mode.</li>
    <li><strong>Bottlenecks &amp; Reports:</strong> Filter analytics by date preset (<code>All Time</code>, <code>Last 7 Days</code>, <code>Last 30 Days</code>, <code>Last 90 Days</code>, or <code>Custom Range</code>), identify office bottlenecks and holding times, and export CSV or printable executive reports.</li>
    <li><strong>Document Logs:</strong> Filter and paginate (25 rows/page) campus-scoped document &amp; SLA audit logs by role, action query, or date range.</li>
  </ol>

  <!-- 4.4 RMO -->
  <h3 class="role-title">
    <span>4.4 Records Management Officer Portal (<code>rmo</code>)</span>
    <span class="badge badge-green">Route: <code>/[campus]/rmo</code></span>
  </h3>
  <p>
    RMOs serve as primary document intake and custody custodians for their campus. Live Availability Control is <strong>not</strong> displayed for RMO accounts.
  </p>
  <ol>
    <li><strong>Register / Send Document:</strong>
      <ul>
        <li>Review the auto-generated <strong>Tracking Code</strong> (format <code>CHMSU-CODE-YYYY-NNNN</code>, with regenerate button), select <strong>Document Type</strong> (9 official types) and <strong>Priority</strong> (<code>Routine</code>, <code>Urgent</code>, <code>Confidential</code>), and enter <strong>Document Title / Subject</strong> and optional Description.</li>
        <li><strong>Sender Name</strong> and <strong>Sender Office</strong> are auto-filled and locked (read-only) from the authenticated RMO profile.</li>
        <li>Select cascading <strong>Destination Campus</strong> (same campus or inter-campus) and <strong>Destination Office</strong> (grouped by verified campus office categories).</li>
        <li>Optionally select a specific <strong>Assign Recipient</strong> (populated via <code>get_eligible_document_recipients</code> RPC; self-assignment is strictly blocked) or leave as <em>Unassigned (Office Queue)</em>.</li>
        <li>Choose an <strong>SLA Target</strong> preset (<code>1 Day</code>, <code>2 Days</code>, <code>3 Days</code>, <code>5 Days</code>) or custom 1–90 days, optionally attach a scanned file (max <strong>15 MB</strong>, private <code>document-files</code> bucket), and submit.</li>
        <li>Immediately upon save, <strong>Printable QR Routing Slip</strong> (<code>QrSlipModal</code>) opens with an opaque <code>qr_token</code> QR code, <strong>Copy ID</strong>, and <strong>Print Slip</strong> actions.</li>
      </ul>
    </li>
    <li><strong>My Documents:</strong> Manage four real-time document buckets—<strong>Incoming / Assigned to Me</strong>, <strong>In Progress</strong>, <strong>Sent by Me</strong>, and <strong>Processed Records</strong>. Select any document to inspect its SLA deadline, download attachments, open its <strong>QR Slip</strong>, or execute the <strong>strict single-receive custody workflow</strong>:
      <ul>
        <li>Click <strong>Receive Document</strong> once to take custody (optional Receipt Remarks).</li>
        <li>Once received, the Receive button disappears and only three actions are unlocked: <strong>Forward</strong> (select Destination Campus, Office, and optional Recipient), <strong>Return</strong> (requires Action Remarks; routes back to previous sender with status <code>Action Required</code>), or <strong>Mark as Processed</strong> (confirmation prompt &rarr; permanently locked in records).</li>
      </ul>
    </li>
    <li><strong>Manage Announcements:</strong> Click <strong>+ New Announcement</strong> to publish campus notices with optional 15 MB attachments, and pin, edit, deactivate, or delete own announcements.</li>
  </ol>

  <!-- 4.5 FACULTY & STAFF -->
  <h3 class="role-title">
    <span>4.5 Faculty &amp; Administrative Staff Portal (<code>faculty</code> &amp; <code>staff</code>)</span>
    <span class="badge badge-green">Route: <code>/[campus]/faculty</code></span>
  </h3>
  <p>
    Both <strong>Faculty</strong> and <strong>Administrative Staff</strong> share the <code>/[campus]/faculty</code> portal (and may also open <code>/[campus]/office</code> for direct access to <strong>My Documents</strong>), with one key role distinction: <strong>Live Availability Control is restricted exclusively to <code>faculty</code> accounts.</strong>
  </p>
  <ol>
    <li><strong>Send / Register Document:</strong> Identical intake workflow to RMO—locked Sender Name &amp; Office, cascading Destination Campus &amp; Office, eligible recipient assignment (no self-assignment), SLA target, optional 15 MB attachment, and immediate printable QR Routing Slip.</li>
    <li><strong>My Documents:</strong> View Incoming, In Progress, Sent by Me, and Processed Records; execute single-receive custody actions (<strong>Receive Document</strong> &rarr; <strong>Forward</strong>, <strong>Return</strong>, or <strong>Mark as Processed</strong>).</li>
    <li><strong>Campus Announcements:</strong> Read-only feed of active campus and university-wide advisories with live search, category filters, attachment previews/downloads, and an automatic unread badge count.</li>
    <li><strong>Announcements &amp; Availability (Faculty) / Manage Announcements (Staff):</strong>
      <ul>
        <li><strong>Publish Notices (Faculty &amp; Staff):</strong> Compose, attach files (up to 15 MB), schedule optional event start/end or expiration dates, pin, edit, deactivate, or delete own campus announcements.</li>
        <li><strong>Live Availability Control (Faculty ONLY):</strong> One-click status buttons—<code>Available</code>, <code>In Class</code>, <code>In Meeting</code>, <code>On Leave</code>, <code>Offline</code>—plus <strong>Office / Room Location</strong>, optional <strong>Public Status Note</strong> (max 140 chars), and <strong>Show on Public Kiosk</strong> opt-in toggle. Clicking any status or <strong>Save Office &amp; Note</strong> logs <code>profile.availability_updated</code> and syncs instantly via Supabase Realtime to the Student Instructor Locator and Public Campus Kiosk.</li>
      </ul>
    </li>
  </ol>

  <!-- 4.6 STUDENT -->
  <h3 class="role-title">
    <span>4.6 Student Portal (<code>student</code>)</span>
    <span class="badge badge-gold">Route: <code>/[campus]/student</code></span>
  </h3>
  <p>
    A mobile-first responsive portal (with collapsible desktop sidebar and 3-tab mobile bottom navigation bar) focused on campus advisories and real-time instructor availability.
  </p>
  <ol>
    <li><strong>Announcements (Campus News &amp; Advisories):</strong> Browse pinned, urgent, campus-scoped, and university-wide official updates with live unread badge tracking, keyword search, category filter buttons (<code>All</code>, <code>General</code>, <code>Academic</code>, <code>Emergency</code>, <code>Event</code>), schedule dates, and inline image/file attachment viewers.</li>
    <li><strong>Instructor Locator:</strong> View real-time availability cards of active <strong>Faculty</strong> members on the student's campus who have opted into public visibility (sourced from the RA 10173-safe <code>public_faculty_availability</code> view). Search by name, room, or title, filter by Department, and filter by status (<code>All Statuses</code>, <code>Available</code>, <code>In Class</code>, <code>In Meeting</code>, <code>On Leave</code>, <code>Offline</code>).</li>
    <li><strong>My Profile:</strong> Review verified Student ID, College/Department, and Degree Program, manage Profile Avatar, and reset password via 6-digit OTP.</li>
  </ol>
  <div class="callout">
    <p class="callout-title">Document Access Boundary for Students</p>
    <p style="margin:0; font-size:8.4pt;">
      In the current live system, operational document registration, QR scanning (<code>/api/documents/lookup</code>), and custody actions are restricted to active <code>faculty</code>, <code>staff</code>, and <code>rmo</code> accounts (plus read-only oversight for <code>management</code>). Students do not have document tracking tabs in the Student Portal.
    </p>
  </div>

  <!-- 4.7 PUBLIC KIOSK -->
  <div style="break-inside: avoid;">
  <h3 class="role-title">
    <span>4.7 Public Campus Kiosk (Login-Free Lobby Display)</span>
    <span class="badge badge-slate">Route: <code>/[campus]/kiosk</code></span>
  </h3>
  <p>
    Designed for wall-mounted touchscreens and lobby TVs across each CHMSU campus with zero login required (except when global System Maintenance Mode is enabled).
  </p>
  <ol>
    <li><strong>Header &amp; Live Status:</strong> Displays CHMSU seal, campus name, <strong>Live Sync</strong> Supabase Realtime indicator, live Philippine time/date clock, and a <strong>Fullscreen</strong> toggle button.</li>
    <li><strong>Featured Pinned / Urgent Banner:</strong> Automatically highlights the top <code>Urgent</code> / <code>Emergency</code> advisory or pinned notice across the full width.</li>
    <li><strong>Left Panel — Campus Announcements &amp; Upcoming Events:</strong> Touch-friendly category tabs (<code>All Notices</code>, <code>General</code>, <code>Academic</code>, <code>Emergency</code>, <code>Event</code>) showing only active, non-expired notices where <code>is_public = true</code> (with inline attachments), plus an <strong>Upcoming Campus Calendar &amp; Events</strong> strip at the bottom.</li>
    <li><strong>Right Panel — Searchable Instructor Locator:</strong> Displays the count of <strong>Available Now</strong> faculty, a touch-friendly search bar, quick status filter buttons (<code>All</code>, <code>Available</code>, <code>In Class</code>, <code>In Meeting</code>, <code>On Leave</code>), and real-time instructor cards queried strictly from <code>public_faculty_availability</code>.</li>
    <li><strong>RA 10173 Privacy Boundary:</strong> Personal ID numbers, emails, School ID photos, and all document tracking records are <strong>never</strong> exposed on the Public Kiosk.</li>
  </ol>
  </div>
</div>

<!-- ==================== SECTION 5 ==================== -->
<div class="section-break">
  <h1 class="sec-title"><span class="sec-num">05</span> End-to-End Document Lifecycle &amp; SLA Delay Process</h1>

  <h2 class="sub-title">5.1 Lifecycle Flowchart (Registration to Permanent Record Lock)</h2>
  <div class="diagram-box">
    <svg viewBox="0 0 740 165" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, Inter, sans-serif">
      <defs>
        <marker id="arr2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#143D29" />
        </marker>
        <marker id="arrRed" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#DC2626" />
        </marker>
      </defs>

      <!-- Step 1 -->
      <rect x="8" y="16" width="118" height="58" rx="6" fill="#F0FDF4" stroke="#143D29" stroke-width="1.4"/>
      <text x="67" y="34" text-anchor="middle" font-size="8.8" font-weight="700" fill="#143D29">1. Register</text>
      <text x="67" y="47" text-anchor="middle" font-size="7.5" fill="#334155">RMO / Faculty / Staff</text>
      <text x="67" y="59" text-anchor="middle" font-size="7.5" fill="#334155">QR Slip + SLA Due Date</text>
      <line x1="126" y1="45" x2="148" y2="45" stroke="#143D29" stroke-width="1.4" marker-end="url(#arr2)"/>

      <!-- Step 2 -->
      <rect x="150" y="16" width="118" height="58" rx="6" fill="#FFFBEB" stroke="#D97706" stroke-width="1.4"/>
      <text x="209" y="34" text-anchor="middle" font-size="8.8" font-weight="700" fill="#92400E">2. Transit / Queue</text>
      <text x="209" y="47" text-anchor="middle" font-size="7.5" fill="#334155">registered / in_transit</text>
      <text x="209" y="59" text-anchor="middle" font-size="7.5" fill="#334155">Notify Assigned Holder</text>
      <line x1="268" y1="45" x2="290" y2="45" stroke="#143D29" stroke-width="1.4" marker-end="url(#arr2)"/>

      <!-- Step 3 -->
      <rect x="292" y="16" width="128" height="58" rx="6" fill="#EFF6FF" stroke="#2563EB" stroke-width="1.4"/>
      <text x="356" y="34" text-anchor="middle" font-size="8.8" font-weight="700" fill="#1E40AF">3. Single Receive</text>
      <text x="356" y="47" text-anchor="middle" font-size="7.5" fill="#334155">Receive Document (1x)</text>
      <text x="356" y="59" text-anchor="middle" font-size="7.5" fill="#334155">DB Trigger Blocks Dups</text>
      <line x1="420" y1="45" x2="442" y2="45" stroke="#143D29" stroke-width="1.4" marker-end="url(#arr2)"/>

      <!-- Step 4 -->
      <rect x="444" y="16" width="132" height="58" rx="6" fill="#FFFFFF" stroke="#143D29" stroke-width="1.4"/>
      <text x="510" y="34" text-anchor="middle" font-size="8.8" font-weight="700" fill="#143D29">4. Next Custody Action</text>
      <text x="510" y="47" text-anchor="middle" font-size="7.5" fill="#334155">Forward (New Hop) OR</text>
      <text x="510" y="59" text-anchor="middle" font-size="7.5" fill="#334155">Return (Remarks Req.)</text>
      <line x1="576" y1="45" x2="598" y2="45" stroke="#143D29" stroke-width="1.4" marker-end="url(#arr2)"/>

      <!-- Step 5 -->
      <rect x="600" y="16" width="132" height="58" rx="6" fill="#143D29" stroke="#143D29" stroke-width="1.4"/>
      <text x="666" y="34" text-anchor="middle" font-size="8.8" font-weight="700" fill="#FACC15">5. Processed (Locked)</text>
      <text x="666" y="47" text-anchor="middle" font-size="7.5" fill="#FFFFFF">status = completed</text>
      <text x="666" y="59" text-anchor="middle" font-size="7.5" fill="#BBF7D0">Permanently Immutable</text>

      <!-- Loopback arrow from Forward/Return to Step 2 -->
      <path d="M 510 74 L 510 98 L 209 98 L 209 76" fill="none" stroke="#143D29" stroke-width="1.2" stroke-dasharray="4 2" marker-end="url(#arr2)"/>
      <text x="360" y="94" text-anchor="middle" font-size="7.5" font-weight="600" fill="#143D29">Forward / Return starts next handoff hop (requires new Receive)</text>

      <!-- SLA Overdue Monitor Box -->
      <rect x="45" y="114" width="650" height="40" rx="6" fill="#FEF2F2" stroke="#DC2626" stroke-width="1.3"/>
      <text x="370" y="131" text-anchor="middle" font-size="8.5" font-weight="700" fill="#991B1B">SLA Delay Monitoring (run_sla_delay_check RPC)</text>
      <text x="370" y="144" text-anchor="middle" font-size="7.6" fill="#7F1D1D">If active &amp; due_at &lt; now() &rarr; sets is_delayed=true, status=delayed, appends delay_flagged route &amp; alerts Holder + Management + RMO</text>
      <line x1="356" y1="114" x2="356" y2="76" stroke="#DC2626" stroke-width="1.2" stroke-dasharray="3 2" marker-end="url(#arrRed)"/>
    </svg>
    <div class="diagram-caption">Figure 5.1 — Sequential document custody state machine enforced by PostgreSQL triggers and RLS policies.</div>
  </div>

  <h2 class="sub-title">5.2 Database-Enforced Custody &amp; Security Rules</h2>
  <table>
    <thead>
      <tr>
        <th style="width:26%;">Enforcement Rule</th>
        <th style="width:24%;">Database Mechanism</th>
        <th style="width:50%;">Exact Operational Behavior</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Operational Custodian Gate</strong></td>
        <td><code>trg_enforce_single_receive_custody</code></td>
        <td>Restricts <code>received</code>, <code>forwarded</code>, <code>returned</code>, and <code>completed</code> actions strictly to active, approved <code>faculty</code>, <code>staff</code>, and <code>rmo</code> accounts. Blocks <code>superadmin</code>, <code>campus_admin</code>, <code>management</code>, and <code>student</code>.</td>
      </tr>
      <tr>
        <td><strong>Strict Single-Receive Lock</strong></td>
        <td><code>enforce_single_receive_custody_flow()</code></td>
        <td>Locks parent document row (<code>FOR UPDATE</code>) to prevent double-clicks. Blocks duplicate <code>received</code> entries once received, and blocks <code>forwarded</code>/<code>returned</code>/<code>completed</code> until <code>received</code> is recorded for the current hop.</td>
      </tr>
      <tr>
        <td><strong>Permanent Processed Lock</strong></td>
        <td><code>trg_lock_processed_documents</code> &amp; <code>trg_lock_processed_document_routes</code></td>
        <td>Once a document reaches <code>completed</code>/<code>processed</code>, PostgreSQL triggers reject all subsequent <code>UPDATE</code>/<code>DELETE</code> on <code>documents</code> and all <code>INSERT</code>/<code>UPDATE</code>/<code>DELETE</code> on <code>document_routes</code>.</td>
      </tr>
      <tr>
        <td><strong>No Self-Assignment</strong></td>
        <td><code>get_eligible_document_recipients</code> + UI</td>
        <td>Excludes the signed-in user from eligible recipient lists during registration and forwarding; client-side guard also rejects self-assignment.</td>
      </tr>
      <tr>
        <td><strong>Automated Live Notifications</strong></td>
        <td><code>trg_notify_on_document_event</code>, <code>trg_notify_on_pending_registration</code>, <code>trg_notify_on_announcement_published</code></td>
        <td>Automatically dispatches real-time alerts into <code>public.notifications</code> (self-only RLS) powering the header <code>LiveNotificationBell</code> across document handoffs, new registrations, announcements, and SLA delays.</td>
      </tr>
    </tbody>
  </table>

  <h2 class="sub-title">5.3 Supabase Storage Buckets &amp; Privacy Controls</h2>
  <table>
    <thead>
      <tr>
        <th style="width:24%;">Bucket Name</th>
        <th style="width:14%;">Visibility</th>
        <th style="width:14%;">Max Size</th>
        <th style="width:48%;">Allowed Types &amp; Access Rules</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><code>avatars</code></td>
        <td><span class="badge badge-green">Public</span></td>
        <td>5 MB</td>
        <td>JPG, PNG, WebP. Owner-only upload/delete under <code>&lt;userId&gt;/</code>; updated via <code>update_my_avatar</code> RPC.</td>
      </tr>
      <tr>
        <td><code>announcement-attachments</code></td>
        <td><span class="badge badge-green">Public</span></td>
        <td>15 MB</td>
        <td>JPG, PNG, WebP, GIF, PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX. Upload by active publishers; readable in portals &amp; Public Kiosk.</td>
      </tr>
      <tr>
        <td><code>id-verifications</code></td>
        <td><span class="badge badge-red">Private</span></td>
        <td>5 MB</td>
        <td>JPG, PNG, WebP (Front &amp; Back School ID). Viewed exclusively by System Admin &amp; Campus Admin via 5-minute signed URLs.</td>
      </tr>
      <tr>
        <td><code>document-files</code></td>
        <td><span class="badge badge-red">Private</span></td>
        <td>15 MB</td>
        <td>PDF, Word, Excel, JPG, PNG, WebP. Scanned document attachments accessed via 5-minute signed URLs by authorized custodians/management.</td>
      </tr>
    </tbody>
  </table>
</div>

<!-- ==================== SECTION 6 ==================== -->
<div class="section-break">
  <h1 class="sec-title" style="margin-bottom:6pt;"><span class="sec-num">06</span> Quick Reference Summary Table</h1>
  <p style="margin-bottom:6pt; font-size:8.6pt;">
    One-page operational cheat sheet mapping every SmartCampus CHMSU role (plus the login-free Public Campus Kiosk) to its exact login URL, portal route, sidebar tabs, and core actions.
  </p>

  <table style="font-size:7.35pt; line-height:1.36; margin:4pt 0 7pt 0;">
    <style>
      .cheat-table th { padding: 4.5pt 5.5pt !important; font-size: 7.5pt !important; }
      .cheat-table td { padding: 3.8pt 5.5pt !important; }
    </style>
    <thead>
      <tr>
        <th style="width:15%; padding:4.5pt 5.5pt;">User Role</th>
        <th style="width:17%; padding:4.5pt 5.5pt;">Login URL &amp; Portal</th>
        <th style="width:27%; padding:4.5pt 5.5pt;">Sidebar Navigation Tabs</th>
        <th style="width:41%; padding:4.5pt 5.5pt;">Core Operational Actions</th>
      </tr>
    </thead>
    <tbody class="cheat-table">
      <tr>
        <td><strong>System Admin</strong><br/><code>superadmin</code></td>
        <td>Login: <code>/sys-admin</code><br/>Portal: <code>/superadmin</code></td>
        <td>
          &bull; Dashboard<br/>
          &bull; Platform Users<br/>
          &bull; Pending Registrations<br/>
          &bull; Announcements<br/>
          &bull; System Maintenance<br/>
          &bull; Reports <em>(System &amp; Document Logs)</em><br/>
          &bull; <em>My Profile (via profile card)</em>
        </td>
        <td>
          Monitor university-wide KPIs &amp; 4-campus donut chart; inspect User Details &amp; School ID photos; deactivate/reactivate accounts; approve/return/reject registrations; publish university/campus announcements (+15 MB files); toggle global Maintenance Mode; audit System &amp; Document Logs.
        </td>
      </tr>
      <tr>
        <td><strong>Campus Admin</strong><br/><code>campus_admin</code></td>
        <td>Login: <code>/campus-admin</code><br/>Portal: <code>/[campus]/admin</code></td>
        <td>
          &bull; Dashboard<br/>
          &bull; Campus Users<br/>
          &bull; Campus Registrations<br/>
          &bull; Campus Announcements<br/>
          &bull; Campus Reports<br/>
          &bull; <em>My Profile (via profile card)</em>
        </td>
        <td>
          Monitor campus KPIs &amp; role distribution; manage campus-only users &amp; view School ID photos; verify campus registrations (Activate / Return / Reject); publish campus announcements; audit strictly isolated campus non-document system logs.
        </td>
      </tr>
      <tr>
        <td><strong>Institutional Management</strong><br/><code>management</code></td>
        <td>Login: <code>/</code><br/>Portal: <code>/management</code></td>
        <td>
          &bull; Overview &amp; Delay Alerts<br/>
          &bull; Document Alerts<br/>
          &bull; QR Document Tracker<br/>
          &bull; Bottlenecks &amp; Reports<br/>
          &bull; Document Logs<br/>
          &bull; <em>My Profile (via profile card)</em>
        </td>
        <td>
          Strictly read-only campus oversight: monitor overdue documents; run <strong>SLA Delay Check</strong>; inspect read-only custody trails; scan/track documents via webcam QR or tracking code; analyze office bottlenecks &amp; export CSV/Print reports; audit campus Document Logs.
        </td>
      </tr>
      <tr>
        <td><strong>Records Management Officer</strong><br/><code>rmo</code></td>
        <td>Login: <code>/</code><br/>Portal: <code>/[campus]/rmo</code></td>
        <td>
          &bull; Register / Send Document<br/>
          &bull; My Documents<br/>
          &bull; Manage Announcements<br/>
          &bull; <em>My Profile (via profile card)</em>
        </td>
        <td>
          Register documents with locked Sender info, SLA target, optional 15 MB scan, &amp; printable QR slip; execute single-receive custody (<strong>Receive Document</strong> &rarr; <strong>Forward</strong> / <strong>Return</strong> / <strong>Mark as Processed</strong>); publish campus announcements.
        </td>
      </tr>
      <tr>
        <td><strong>Faculty</strong><br/><code>faculty</code></td>
        <td>Login: <code>/</code><br/>Portal: <code>/[campus]/faculty</code></td>
        <td>
          &bull; Send / Register Document<br/>
          &bull; My Documents<br/>
          &bull; Campus Announcements<br/>
          &bull; Announcements &amp; Availability<br/>
          &bull; <em>My Profile (via profile card)</em>
        </td>
        <td>
          Register &amp; route documents; manage My Documents custody queue; read &amp; publish campus announcements; update real-time <strong>Live Availability Control</strong> (<code>Available</code>, <code>In Class</code>, <code>In Meeting</code>, <code>On Leave</code>, <code>Offline</code> + Kiosk opt-in).
        </td>
      </tr>
      <tr>
        <td><strong>Administrative Staff</strong><br/><code>staff</code></td>
        <td>Login: <code>/</code><br/>Portal: <code>/[campus]/faculty</code><br/><em>(+ <code>/[campus]/office</code>)</em></td>
        <td>
          &bull; Send / Register Document<br/>
          &bull; My Documents<br/>
          &bull; Campus Announcements<br/>
          &bull; Manage Announcements<br/>
          &bull; <em>My Profile (via profile card)</em>
        </td>
        <td>
          Register &amp; route documents with printable QR slips; execute single-receive custody actions in My Documents; read campus announcements and publish/manage own campus announcements. <em>No Live Availability Control.</em>
        </td>
      </tr>
      <tr>
        <td><strong>Student</strong><br/><code>student</code></td>
        <td>Login: <code>/</code><br/>Portal: <code>/[campus]/student</code></td>
        <td>
          &bull; Announcements<br/>
          &bull; Instructor Locator<br/>
          &bull; My Profile <em>(mobile bottom nav &amp; profile card)</em>
        </td>
        <td>
          Read campus &amp; university-wide announcements with inline attachments; search and filter live <strong>Faculty</strong> availability &amp; office locations; manage profile avatar and 6-digit OTP password reset.
        </td>
      </tr>
      <tr>
        <td><strong>Public Campus Kiosk</strong><br/><em>(Unauthenticated)</em></td>
        <td>Login: <em>None required</em><br/>Display: <code>/[campus]/kiosk</code></td>
        <td>
          &bull; Full-Screen Split Display<br/>
          &bull; Category Filter Tabs<br/>
          &bull; Instructor Locator Panel
        </td>
        <td>
          Touch-friendly lobby display showing live clock, Realtime sync indicator, Featured Urgent/Pinned banner, public campus announcements, upcoming events, and opt-in live Faculty availability (zero PII or private documents).
        </td>
      </tr>
    </tbody>
  </table>

  <div class="callout gold" style="margin-top:12pt;">
    <p class="callout-title">Key Security &amp; Compliance Reminders for All Users</p>
    <ul style="margin:0; font-size:8.3pt; color:#78350F;">
      <li><strong>Campus Slugs:</strong> Replace <code>[campus]</code> with <code>talisay</code>, <code>alijis</code>, <code>binalbagan</code>, or <code>fortune-towne</code>.</li>
      <li><strong>Processed Documents Are Permanent:</strong> Once marked <strong>Processed</strong>, documents are locked at the PostgreSQL trigger level and cannot be edited, forwarded, or deleted.</li>
      <li><strong>Maintenance Mode Bypass:</strong> Only <code>superadmin</code> via <code>/sys-admin</code> can access the platform while Maintenance Mode is active.</li>
    </ul>
  </div>
</div>

</body>
</html>`;

fs.writeFileSync(TEMP_HTML, html, "utf8");

const chromeCandidates = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];

const browserPath = chromeCandidates.find((p) => fs.existsSync(p));
if (!browserPath) {
  throw new Error("No headless Chromium/Chrome executable found.");
}

const fileUrl = `file:///${TEMP_HTML.replace(/\\/g, "/")}`;

execFileSync(
  browserPath,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--print-to-pdf-no-header",
    `--print-to-pdf=${OUTPUT_PDF}`,
    fileUrl,
  ],
  { stdio: "inherit" }
);

// Clean up temporary HTML file
fs.unlinkSync(TEMP_HTML);

const stats = fs.statSync(OUTPUT_PDF);
console.log(`Generated: ${OUTPUT_PDF} (${(stats.size / 1024).toFixed(1)} KB)`);
