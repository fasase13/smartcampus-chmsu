import { notFound, redirect } from "next/navigation";
import { getAuthenticatedProfile } from "@/lib/supabase/server";
import { ROLES, getDefaultRouteForRole } from "@/lib/constants";
import CampusAdminPortalClient from "@/components/CampusAdminPortalClient";

export const dynamic = "force-dynamic";

export default async function CampusAdminPage({ params }) {
  const { campus: campusSlug } = await params;
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

  const [allCampusesRes, usersRes, announcementsRes, documentsRes] =
    await Promise.all([
      supabase
        .from("campuses")
        .select("id, code, slug, name, is_main")
        .eq("is_active", true)
        .order("is_main", { ascending: false })
        .order("name", { ascending: true }),
      supabase
        .from("profiles")
        .select(
          "id, campus_id, email, full_name, role, requested_role, employee_or_student_id, approval_status, profile_completed, id_front_path, id_back_path, rejection_reason, department, program_or_course, job_title, office_location, show_on_kiosk, is_active, created_at"
        )
        .eq("campus_id", campus.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("announcements")
        .select(
          "id, campus_id, author_id, title, body, category, priority, is_public, is_pinned, published_at, is_active, created_at"
        )
        .eq("campus_id", campus.id)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(150),
      supabase
        .from("documents")
        .select(
          "id, tracking_code, origin_campus_id, current_campus_id, title, document_type, priority, status, current_office, sla_hours, due_at, is_delayed, created_at, updated_at"
        )
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

  return (
    <CampusAdminPortalClient
      profile={profile}
      campus={campus}
      allCampuses={allCampusesRes.data ?? []}
      initialUsers={usersRes.data ?? []}
      initialAnnouncements={announcementsRes.data ?? []}
      initialDocuments={documentsRes.data ?? []}
    />
  );
}
