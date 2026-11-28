import { notFound, redirect } from "next/navigation";
import { getAuthenticatedProfile } from "@/lib/supabase/server";
import { ROLES, getDefaultRouteForRole } from "@/lib/constants";
import { isDocumentLog } from "@/lib/auditLogFormat";
import CampusAdminPortalClient from "@/components/CampusAdminPortalClient";

export const dynamic = "force-dynamic";

const VALID_CAMPUS_ADMIN_TABS = new Set([
  "dashboard",
  "users",
  "registrations",
  "announcements",
  "reports",
  "profile",
]);

export default async function CampusAdminPage({ params, searchParams }) {
  const { campus: campusSlug } = await params;
  const resolvedSearchParams = await searchParams;
  const rawTab = String(resolvedSearchParams?.tab ?? "").toLowerCase();
  const initialTab =
    rawTab === "documents" || rawTab === "alerts"
      ? "dashboard"
      : VALID_CAMPUS_ADMIN_TABS.has(rawTab)
        ? rawTab
        : "dashboard";

  const { supabase, user, profile } = await getAuthenticatedProfile();

  if (!user) {
    redirect(`/?next=/${campusSlug}/admin`);
  }

  if (!profile) {
    redirect("/?error=account_inactive");
  }

  if (!profile.is_active || profile.approval_status !== "approved") {
    redirect("/pending-approval");
  }

  // Strict separation of duties: superadmin cannot operate inside /[campus]/admin
  if (profile.role === ROLES.SUPERADMIN) {
    redirect("/superadmin");
  }

  if (profile.role !== ROLES.CAMPUS_ADMIN) {
    const userCampusSlug = profile.campuses?.slug ?? "talisay";
    redirect(
      `${getDefaultRouteForRole(profile.role, userCampusSlug)}?error=unauthorized`
    );
  }

  const { data: campus, error: campusError } = await supabase
    .from("campuses")
    .select("id, code, slug, name, address, is_main")
    .eq("slug", campusSlug)
    .eq("is_active", true)
    .single();

  if (campusError || !campus) {
    notFound();
  }

  // Strictly enforce campus isolation for campus_admin
  if (
    profile.role === ROLES.CAMPUS_ADMIN &&
    profile.campus_id !== campus.id
  ) {
    const assignedSlug = profile.campuses?.slug ?? "talisay";
    redirect(`/${assignedSlug}/admin?error=campus_restricted`);
  }

  const [usersRes, announcementsRes, auditLogsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, campus_id, email, full_name, avatar_url, role, requested_role, employee_or_student_id, approval_status, profile_completed, id_front_path, id_back_path, rejection_reason, department, program_or_course, job_title, office_location, is_teaching, show_on_kiosk, is_active, created_at"
      )
      .eq("campus_id", campus.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("announcements")
      .select(
        "id, campus_id, author_id, title, body, category, priority, is_public, is_pinned, published_at, is_active, created_at, attachment_url, attachment_path, attachment_name, attachment_type, attachment_size"
      )
      .eq("campus_id", campus.id)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(150),
    supabase
      .from("audit_logs")
      .select(
        "id, campus_id, actor_id, actor_role, action, entity_type, entity_id, metadata, created_at, actor:actor_id(full_name, email, role, campus_id)"
      )
      .eq("campus_id", campus.id)
      .order("created_at", { ascending: false })
      .limit(400),
  ]);

  const scopedAuditLogs = (auditLogsRes.data ?? []).filter((log) => {
    if (log.campus_id !== campus.id) return false;
    if (isDocumentLog(log)) return false;
    const metaRole = String(log.metadata?.role ?? "").toLowerCase();
    const actorRole = String(
      log.actor?.role ?? log.actor_role ?? ""
    ).toLowerCase();
    if (
      actorRole === ROLES.SUPERADMIN ||
      metaRole === ROLES.SUPERADMIN ||
      String(log.actor_role ?? "").toLowerCase() === ROLES.SUPERADMIN
    ) {
      return false;
    }
    if (!log.actor || log.actor.campus_id !== campus.id) return false;
    return true;
  });

  return (
    <CampusAdminPortalClient
      profile={profile}
      campus={campus}
      initialTab={initialTab}
      initialUsers={usersRes.data ?? []}
      initialAnnouncements={announcementsRes.data ?? []}
      initialAuditLogs={scopedAuditLogs}
    />
  );
}
