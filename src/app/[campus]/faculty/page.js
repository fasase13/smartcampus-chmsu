import { notFound, redirect } from "next/navigation";
import { getAuthenticatedProfile } from "@/lib/supabase/server";
import {
  CROSS_CAMPUS_ROLES,
  PORTAL_ROLE_ACCESS,
  getDefaultRouteForRole,
} from "@/lib/constants";
import PortalShell from "@/components/PortalShell";
import FacultyPortalClient from "@/components/FacultyPortalClient";

export const dynamic = "force-dynamic";

export default async function FacultyPortalPage({ params }) {
  const { campus: campusSlug } = await params;
  const { supabase, user, profile } = await getAuthenticatedProfile();

  if (!user) {
    redirect(`/login/${campusSlug}?next=/${campusSlug}/faculty`);
  }

  if (!profile) {
    redirect(`/login/${campusSlug}?error=account_inactive`);
  }

  if (!profile.is_active || profile.approval_status !== "approved") {
    redirect("/pending-approval");
  }

  // Server-side RBAC check (defense-in-depth alongside proxy middleware)
  if (!PORTAL_ROLE_ACCESS.faculty.includes(profile.role)) {
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

  // Strict campus isolation for non-cross-campus roles
  if (
    !CROSS_CAMPUS_ROLES.includes(profile.role) &&
    profile.campus_id !== campus.id
  ) {
    const userCampusSlug = profile.campuses?.slug ?? "talisay";
    redirect(
      `${getDefaultRouteForRole(profile.role, userCampusSlug)}?error=campus_restricted`
    );
  }

  const { data: announcements } = await supabase
    .from("announcements")
    .select(
      "id, campus_id, author_id, title, body, category, priority, is_public, is_pinned, event_start_at, event_end_at, published_at, expires_at, is_active, created_at"
    )
    .or(`campus_id.eq.${campus.id},campus_id.is.null`)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <PortalShell profile={profile} campus={campus}>
      <FacultyPortalClient
        profile={profile}
        campus={campus}
        initialAnnouncements={announcements ?? []}
      />
    </PortalShell>
  );
}
