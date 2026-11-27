#!/usr/bin/env node
/**
 * SmartCampus CHMSU — Provision 4 Campus Institutional Management Accounts
 *
 * Usage:
 *   node scripts/seed-management-accounts.mjs
 *
 * Requirements:
 *   - NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 *     (or in your shell environment).
 *   - Optional: SEED_MANAGEMENT_PASSWORD (defaults to "ChmsuTest123!").
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = process.env.SEED_MANAGEMENT_PASSWORD || "ChmsuTest123!";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local or environment."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const MANAGEMENT_ACCOUNTS = [
  {
    campusSlug: "talisay",
    email: "mgmt.talisay@chmsu.edu.ph",
    schoolId: "90000001",
    fullName: "Institutional Management — Talisay (Main)",
    department: "Office of the University President",
    officeLocation: "Office of the University President",
    jobTitle: "Institutional Management Officer",
  },
  {
    campusSlug: "alijis",
    email: "mgmt.alijis@chmsu.edu.ph",
    schoolId: "90000002",
    fullName: "Institutional Management — Alijis",
    department: "Campus Administration & Support",
    officeLocation: "Office of the Campus Executive Director",
    jobTitle: "Institutional Management Officer",
  },
  {
    campusSlug: "binalbagan",
    email: "mgmt.binalbagan@chmsu.edu.ph",
    schoolId: "90000003",
    fullName: "Institutional Management — Binalbagan",
    department: "Campus Administration & Support",
    officeLocation: "Office of the Campus Executive Director",
    jobTitle: "Institutional Management Officer",
  },
  {
    campusSlug: "fortune-towne",
    email: "mgmt.fortunetowne@chmsu.edu.ph",
    schoolId: "90000004",
    fullName: "Institutional Management — Fortune Towne",
    department: "Campus Administration & Support",
    officeLocation: "Office of the Campus Executive Director",
    jobTitle: "Institutional Management Officer",
  },
];

async function main() {
  const { data: campuses, error: campusErr } = await supabase
    .from("campuses")
    .select("id, slug, name")
    .eq("is_active", true);

  if (campusErr || !campuses?.length) {
    console.error("Failed to fetch campuses:", campusErr?.message || "No campuses found");
    process.exit(1);
  }

  const campusBySlug = Object.fromEntries(campuses.map((c) => [c.slug, c]));
  const { data: existingUsersData, error: listErr } =
    await supabase.auth.admin.listUsers({ perPage: 1000 });

  if (listErr) {
    console.error("Failed to list auth users:", listErr.message);
    process.exit(1);
  }

  const existingByEmail = new Map(
    (existingUsersData?.users ?? []).map((u) => [
      String(u.email || "").toLowerCase(),
      u,
    ])
  );

  const summary = [];

  for (const spec of MANAGEMENT_ACCOUNTS) {
    const campus = campusBySlug[spec.campusSlug];
    if (!campus) {
      console.warn(`Skipping ${spec.campusSlug}: campus not found in public.campuses.`);
      continue;
    }

    let userId = existingByEmail.get(spec.email.toLowerCase())?.id ?? null;

    if (!userId) {
      const { data: created, error: createErr } =
        await supabase.auth.admin.createUser({
          email: spec.email,
          password: PASSWORD,
          email_confirm: true,
          user_metadata: {
            full_name: spec.fullName,
            role: "management",
            campus_slug: spec.campusSlug,
          },
        });

      if (createErr || !created?.user?.id) {
        console.error(
          `Failed to create auth user ${spec.email}:`,
          createErr?.message
        );
        continue;
      }
      userId = created.user.id;
    } else {
      await supabase.auth.admin.updateUserById(userId, {
        password: PASSWORD,
        email_confirm: true,
      });
    }

    const nowIso = new Date().toISOString();
    const { error: upsertErr } = await supabase.from("profiles").upsert(
      {
        id: userId,
        campus_id: campus.id,
        email: spec.email,
        full_name: spec.fullName,
        role: "management",
        requested_role: null,
        employee_or_student_id: spec.schoolId,
        department: spec.department,
        office_location: spec.officeLocation,
        job_title: spec.jobTitle,
        approval_status: "approved",
        is_active: true,
        profile_completed: true,
        privacy_terms_accepted: true,
        privacy_terms_accepted_at: nowIso,
        is_teaching: false,
        show_on_kiosk: false,
        updated_at: nowIso,
      },
      { onConflict: "id" }
    );

    if (upsertErr) {
      console.error(
        `Failed to upsert profile for ${spec.email}:`,
        upsertErr.message
      );
      continue;
    }

    summary.push({
      Campus: `CHMSU ${campus.name}`,
      Email: spec.email,
      "School ID": spec.schoolId,
      Password: PASSWORD,
      Role: "management",
    });
  }

  console.log("\n=== Provisioned Institutional Management Accounts ===");
  console.table(summary);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
