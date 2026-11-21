import { redirect } from "next/navigation";
import { getAuthenticatedProfile } from "@/lib/supabase/server";
import {
  CROSS_CAMPUS_ROLES,
  ROLES,
  getDefaultRouteForRole,
} from "@/lib/constants";
import ManagementPortalClient from "@/components/ManagementPortalClient";

export const dynamic = "force-dynamic";

export default async function ManagementPortalPage() {
  const { supabase, user, profile } = await getAuthenticatedProfile();

  if (!user) {
    redirect("/?next=/management");
  }

  if (!profile) {
    redirect("/?error=account_inactive");
  }

  if (!profile.is_active || profile.approval_status !== "approved") {
    redirect("/pending-approval");
  }

  // Strictly enforce admin & management access (defense-in-depth alongside proxy middleware)
  if (!CROSS_CAMPUS_ROLES.includes(profile.role)) {
    const userCampusSlug = profile.campuses?.slug ?? "talisay";
    redirect(
      `${getDefaultRouteForRole(profile.role, userCampusSlug)}?error=unauthorized`
    );
  }

  const isAdmin = profile.role === ROLES.SUPERADMIN;

  const [campusesRes, documentsRes, usersRes, auditLogsRes, unreadAlertsRes] =
    await Promise.all([
      supabase
        .from("campuses")
        .select("id, code, slug, name, is_main")
        .eq("is_active", true)
        .order("is_main", { ascending: false })
        .order("name", { ascending: true }),
      supabase
        .from("documents")
        .select(
          "id, tracking_code, qr_token, origin_campus_id, current_campus_id, title, description, document_type, priority, status, sender_name, sender_office, current_office, current_holder_id, created_by, file_path, file_name, file_mime_type, file_size_bytes, sla_hours, due_at, is_delayed, delayed_at, completed_at, created_at, updated_at"
        )
        .order("created_at", { ascending: false })
        .limit(500),
      isAdmin
        ? supabase
            .from("profiles")
            .select(
              "id, campus_id, email, full_name, role, requested_role, employee_or_student_id, approval_status, profile_completed, id_front_path, id_back_path, rejection_reason, reviewed_by, reviewed_at, department, job_title, office_location, show_on_kiosk, is_active, created_at"
            )
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      supabase
        .from("audit_logs")
        .select(
          "id, campus_id, actor_id, actor_role, action, entity_type, entity_id, metadata, created_at, actor:actor_id(full_name, email)"
        )
        .order("created_at", { ascending: false })
        .limit(400),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false),
    ]);

  return (
    <ManagementPortalClient
      profile={profile}
      campuses={campusesRes.data ?? []}
      initialDocuments={documentsRes.data ?? []}
      initialUsers={usersRes.data ?? []}
      initialAuditLogs={auditLogsRes.data ?? []}
      initialUnreadAlerts={unreadAlertsRes.count ?? 0}
    />
  );
}
