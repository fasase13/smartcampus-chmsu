import { notFound, redirect } from "next/navigation";
import { getAuthenticatedProfile } from "@/lib/supabase/server";
import {
  CROSS_CAMPUS_ROLES,
  PORTAL_ROLE_ACCESS,
  getDefaultRouteForRole,
} from "@/lib/constants";
import StudentPortalClient from "@/components/StudentPortalClient";

export const dynamic = "force-dynamic";

export default async function StudentPortalPage({ params }) {
  const { campus: campusSlug } = await params;
  const { supabase, user, profile } = await getAuthenticatedProfile();

  if (!user) {
    redirect(`/login/${campusSlug}?next=/${campusSlug}/student`);
  }

  if (!profile || !profile.is_active) {
    redirect(`/login/${campusSlug}?error=account_inactive`);
  }

  // Server-side RBAC enforcement (defense-in-depth alongside proxy middleware)
  if (!PORTAL_ROLE_ACCESS.student.includes(profile.role)) {
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

  // Strict campus isolation for student accounts
  if (
    !CROSS_CAMPUS_ROLES.includes(profile.role) &&
    profile.campus_id !== campus.id
  ) {
    const userCampusSlug = profile.campuses?.slug ?? "talisay";
    redirect(
      `${getDefaultRouteForRole(profile.role, userCampusSlug)}?error=campus_restricted`
    );
  }

  const nowIso = new Date().toISOString();

  // Parallel server fetches (zero client waterfalls)
  const [announcementsRes, facultyRes, notificationsRes] = await Promise.all([
    supabase
      .from("announcements")
      .select(
        "id, campus_id, title, body, category, priority, is_pinned, event_start_at, event_end_at, published_at, expires_at"
      )
      .eq("is_active", true)
      .lte("published_at", nowIso)
      .or(`campus_id.eq.${campus.id},campus_id.is.null`)
      .order("is_pinned", { ascending: false })
      .order("published_at", { ascending: false })
      .limit(60),
    supabase
      .from("public_faculty_availability")
      .select(
        "id, campus_id, full_name, department, job_title, office_location, availability_status, availability_note, availability_updated_at"
      )
      .eq("campus_id", campus.id)
      .order("full_name", { ascending: true }),
    supabase
      .from("notifications")
      .select("id, type, title, message, is_read, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const activeAnnouncements = (announcementsRes.data ?? []).filter(
    (item) => !item.expires_at || new Date(item.expires_at) > new Date()
  );

  return (
    <StudentPortalClient
      profile={profile}
      campus={campus}
      initialAnnouncements={activeAnnouncements}
      initialFaculty={facultyRes.data ?? []}
      initialNotifications={notificationsRes.data ?? []}
    />
  );
}
