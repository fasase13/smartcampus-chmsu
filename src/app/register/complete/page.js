import { redirect } from "next/navigation";
import { getAuthenticatedProfile } from "@/lib/supabase/server";
import { getDefaultRouteForRole } from "@/lib/constants";
import CompleteRegistrationForm from "@/components/CompleteRegistrationForm";

export const dynamic = "force-dynamic";

export default async function CompleteRegistrationPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const preselectedSlug =
    typeof resolvedSearchParams?.campus === "string"
      ? resolvedSearchParams.campus
      : "";

  const { supabase, user, profile } = await getAuthenticatedProfile();

  if (!user) {
    redirect("/register");
  }

  if (profile?.is_active && profile?.approval_status === "approved") {
    const campusSlug = profile.campuses?.slug ?? "talisay";
    redirect(getDefaultRouteForRole(profile.role, campusSlug));
  }

  if (profile && profile.profile_completed !== false) {
    redirect("/pending-approval");
  }

  const { data: campuses } = await supabase
    .from("campuses")
    .select("id, code, slug, name, address, is_main")
    .eq("is_active", true)
    .order("is_main", { ascending: false })
    .order("name", { ascending: true });

  return (
    <CompleteRegistrationForm
      campuses={campuses ?? []}
      userId={user.id}
      verifiedEmail={user.email ?? profile?.email ?? ""}
      preselectedSlug={preselectedSlug}
    />
  );
}
