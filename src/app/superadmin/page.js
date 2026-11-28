import { redirect } from "next/navigation";
import { getAuthenticatedProfile } from "@/lib/supabase/server";
import { ROLES, getDefaultRouteForRole } from "@/lib/constants";
import SuperadminPortalClient from "@/components/SuperadminPortalClient";

export const dynamic = "force-dynamic";

const VALID_SUPERADMIN_TABS = new Set([
  "dashboard",
  "users",
  "registrations",
  "announcements",
  "maintenance",
  "audit",
  "profile",
]);

export default async function SuperadminPortalPage({ searchParams }) {
  const { supabase, user, profile } = await getAuthenticatedProfile();
  const resolvedSearchParams = await searchParams;
  const rawTab = String(resolvedSearchParams?.tab ?? "").toLowerCase();
  const initialTab =
    rawTab === "overview" ||
    rawTab === "analytics" ||
    rawTab === "alerts" ||
    rawTab === "documents"
      ? "dashboard"
      : VALID_SUPERADMIN_TABS.has(rawTab)
        ? rawTab
        : "dashboard";

  if (!user) {
    redirect("/");
  }

  if (!profile) {
    redirect("/?error=account_inactive");
  }

  if (!profile.is_active || profile.approval_status !== "approved") {
    redirect("/pending-approval");
  }

  if (profile.role !== ROLES.SUPERADMIN) {
    const userCampusSlug = profile.campuses?.slug ?? "talisay";
    redirect(
      `${getDefaultRouteForRole(profile.role, userCampusSlug)}?error=unauthorized`
    );
  }

  const [
    campusesRes,
    usersRes,
    announcementsRes,
    auditLogsRes,
    documentRoutesRes,
    settingsRes,
  ] = await Promise.all([
    supabase
      .from("campuses")
      .select("id, code, slug, name, address, is_main")
      .eq("is_active", true)
      .order("is_main", { ascending: false })
      .order("name", { ascending: true }),
    supabase
      .from("profiles")
      .select(
        "id, campus_id, email, full_name, avatar_url, role, requested_role, employee_or_student_id, approval_status, profile_completed, id_front_path, id_back_path, rejection_reason, department, program_or_course, job_title, office_location, is_teaching, show_on_kiosk, is_active, created_at"
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("announcements")
      .select(
        "id, campus_id, author_id, title, body, category, priority, is_public, is_pinned, event_start_at, event_end_at, published_at, expires_at, is_active, created_at, attachment_url, attachment_path, attachment_name, attachment_type, attachment_size"
      )
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("audit_logs")
      .select(
        "id, campus_id, actor_id, actor_role, action, entity_type, entity_id, metadata, created_at, actor:actor_id(full_name, email)"
      )
      .order("created_at", { ascending: false })
      .limit(400),
    supabase
      .from("document_routes")
      .select(
        "id, document_id, campus_id, from_office, to_office, action, remarks, acted_by, created_at, actor:acted_by(full_name, email, role), document:document_id(tracking_code, title, origin_campus_id)"
      )
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("system_settings")
      .select("id, maintenance_mode, maintenance_message, maintenance_updated_at")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  return (
    <SuperadminPortalClient
      profile={profile}
      initialTab={initialTab}
      campuses={campusesRes.data ?? []}
      initialUsers={usersRes.data ?? []}
      initialAnnouncements={announcementsRes.data ?? []}
      initialAuditLogs={auditLogsRes.data ?? []}
      initialDocumentRoutes={documentRoutesRes.data ?? []}
      initialSettings={
        settingsRes.data ?? {
          id: 1,
          maintenance_mode: false,
          maintenance_message:
            "SmartCampus CHMSU is currently undergoing scheduled system maintenance. Please check back shortly.",
          maintenance_updated_at: null,
        }
      }
    />
  );
}
