import { notFound, redirect } from "next/navigation";
import { getAuthenticatedProfile } from "@/lib/supabase/server";
import {
  CROSS_CAMPUS_ROLES,
  PORTAL_ROLE_ACCESS,
  getDefaultRouteForRole,
} from "@/lib/constants";
import FacultyPortalClient from "@/components/FacultyPortalClient";

export const dynamic = "force-dynamic";

export default async function FacultyPortalPage({ params, searchParams }) {
  const { campus: campusSlug } = await params;
  const resolvedSearchParams = await searchParams;
  const rawTab = resolvedSearchParams?.tab;
  const initialTab =
    rawTab === "send" ||
    rawTab === "queue" ||
    rawTab === "announcements" ||
    rawTab === "manage" ||
    rawTab === "profile"
      ? rawTab
      : "manage";

  const { supabase, user, profile } = await getAuthenticatedProfile();

  if (!user) {
    redirect(`/?next=/${campusSlug}/faculty`);
  }

  if (!profile) {
    redirect("/?error=account_inactive");
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

  const [announcementsRes, allCampusesRes, staffRes, documentsRes] =
    await Promise.all([
      supabase
        .from("announcements")
        .select(
          "id, campus_id, author_id, title, body, category, priority, is_public, is_pinned, event_start_at, event_end_at, published_at, expires_at, is_active, created_at, author:author_id(full_name, department, office_location)"
        )
        .or(`campus_id.eq.${campus.id},campus_id.is.null`)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("campuses")
        .select("id, code, slug, name, is_main")
        .eq("is_active", true)
        .order("is_main", { ascending: false })
        .order("name", { ascending: true }),
      supabase
        .from("profiles")
        .select("id, full_name, role, department, office_location, campus_id")
        .eq("is_active", true)
        .neq("role", "student")
        .order("full_name", { ascending: true }),
      supabase
        .from("documents")
        .select(
          "id, tracking_code, qr_token, origin_campus_id, current_campus_id, title, description, document_type, priority, status, sender_name, sender_office, current_office, current_holder_id, created_by, file_path, file_name, file_mime_type, file_size_bytes, sla_hours, due_at, is_delayed, delayed_at, completed_at, created_at, updated_at"
        )
        .order("updated_at", { ascending: false })
        .limit(120),
    ]);

  return (
    <FacultyPortalClient
      profile={profile}
      campus={campus}
      initialTab={initialTab}
      initialAnnouncements={announcementsRes.data ?? []}
      allCampuses={allCampusesRes.data ?? []}
      staffDirectory={staffRes.data ?? []}
      initialDocuments={documentsRes.data ?? []}
    />
  );
}
