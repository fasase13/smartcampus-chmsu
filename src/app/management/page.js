import { redirect } from "next/navigation";
import { getAuthenticatedProfile } from "@/lib/supabase/server";
import { ROLES, getDefaultRouteForRole } from "@/lib/constants";
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

  // Strictly enforce Institutional Management access only
  if (profile.role !== ROLES.MANAGEMENT) {
    const userCampusSlug = profile.campuses?.slug ?? "talisay";
    redirect(
      `${getDefaultRouteForRole(profile.role, userCampusSlug)}?error=unauthorized`
    );
  }

  const assignedCampusId = profile.campus_id;

  let docsQuery = supabase
    .from("documents")
    .select(
      "id, tracking_code, qr_token, origin_campus_id, current_campus_id, title, description, document_type, priority, status, sender_name, sender_office, current_office, current_holder_id, created_by, file_path, file_name, file_mime_type, file_size_bytes, sla_hours, due_at, is_delayed, delayed_at, completed_at, created_at, updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (assignedCampusId) {
    docsQuery = docsQuery.or(
      `origin_campus_id.eq.${assignedCampusId},current_campus_id.eq.${assignedCampusId}`
    );
  }

  let logsQuery = supabase
    .from("audit_logs")
    .select(
      "id, campus_id, actor_id, actor_role, action, entity_type, entity_id, metadata, created_at, actor:actor_id(full_name, email)"
    )
    .or(
      "entity_type.in.(document,document_route,documents,document_routes),action.ilike.document%,action.ilike.%sla%"
    )
    .order("created_at", { ascending: false })
    .limit(400);

  if (assignedCampusId) {
    logsQuery = logsQuery.eq("campus_id", assignedCampusId);
  }

  const [campusesRes, documentsRes, usersRes, auditLogsRes, unreadAlertsRes] =
    await Promise.all([
      supabase
        .from("campuses")
        .select("id, code, slug, name, is_main")
        .eq("is_active", true)
        .order("is_main", { ascending: false })
        .order("name", { ascending: true }),
      docsQuery,
      Promise.resolve({ data: [] }),
      logsQuery,
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
