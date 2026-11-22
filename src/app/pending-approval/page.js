import { redirect } from "next/navigation";
import { getAuthenticatedProfile } from "@/lib/supabase/server";
import { getDefaultRouteForRole } from "@/lib/constants";
import PendingApprovalClient from "@/components/PendingApprovalClient";

export const dynamic = "force-dynamic";

export default async function PendingApprovalPage() {
  const { user, profile } = await getAuthenticatedProfile();

  if (!user) {
    redirect("/");
  }

  if (
    profile &&
    (profile.profile_completed === false ||
      profile.approval_status === "returned")
  ) {
    redirect("/register/complete");
  }

  if (profile?.is_active && profile?.approval_status === "approved") {
    const campusSlug = profile.campuses?.slug ?? "talisay";
    redirect(getDefaultRouteForRole(profile.role, campusSlug));
  }

  return <PendingApprovalClient initialProfile={profile} userId={user.id} />;
}
