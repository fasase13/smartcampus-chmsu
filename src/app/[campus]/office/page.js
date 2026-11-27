import { notFound, redirect } from "next/navigation";
import { getAuthenticatedProfile } from "@/lib/supabase/server";
import {
  CROSS_CAMPUS_ROLES,
  PORTAL_ROLE_ACCESS,
  ROLES,
  getDefaultRouteForRole,
} from "@/lib/constants";
import PortalShell from "@/components/PortalShell";
import MyDocumentsClient from "@/components/MyDocumentsClient";

export const dynamic = "force-dynamic";

export default async function OfficeScannerPage({ params }) {
  const { campus: campusSlug } = await params;
  const { supabase, user, profile } = await getAuthenticatedProfile();

  if (!user) {
    redirect(`/?next=/${campusSlug}/office`);
  }

  if (!profile) {
    redirect("/?error=account_inactive");
  }

  if (!profile.is_active || profile.approval_status !== "approved") {
    redirect("/pending-approval");
  }

  if (profile.role === ROLES.MANAGEMENT) {
    redirect("/management");
  }

  if (profile.role === "dept_head") {
    redirect(`/${campusSlug}/faculty`);
  }

  if (!PORTAL_ROLE_ACCESS.office.includes(profile.role)) {
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

  if (
    !CROSS_CAMPUS_ROLES.includes(profile.role) &&
    profile.campus_id !== campus.id
  ) {
    const userCampusSlug = profile.campuses?.slug ?? "talisay";
    redirect(
      `${getDefaultRouteForRole(profile.role, userCampusSlug)}?error=campus_restricted`
    );
  }

  const [allCampusesRes, staffRes, documentsRes] = await Promise.all([
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
    <PortalShell
      profile={profile}
      campus={campus}
      allCampuses={allCampusesRes.data ?? []}
    >
      <MyDocumentsClient
        profile={profile}
        campus={campus}
        allCampuses={allCampusesRes.data ?? []}
        initialDocuments={documentsRes.data ?? []}
      />
    </PortalShell>
  );
}
