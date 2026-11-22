import { redirect } from "next/navigation";
import { getAuthenticatedProfile } from "@/lib/supabase/server";
import { STORAGE_BUCKETS, getDefaultRouteForRole } from "@/lib/constants";
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

  const isReturned = profile?.approval_status === "returned";
  const isIncomplete = profile?.profile_completed === false;

  if (profile && !isIncomplete && !isReturned) {
    redirect("/pending-approval");
  }

  const { data: campuses } = await supabase
    .from("campuses")
    .select("id, code, slug, name, address, is_main")
    .eq("is_active", true)
    .order("is_main", { ascending: false })
    .order("name", { ascending: true });

  // If returned and ID photos were NOT flagged, pre-sign existing photos so user doesn't have to re-upload
  const returnedFields = Array.isArray(profile?.returned_fields)
    ? profile.returned_fields
    : [];
  let existingFrontUrl = "";
  let existingBackUrl = "";

  if (
    isReturned &&
    !returnedFields.includes("id_photos") &&
    profile?.id_front_path &&
    profile?.id_back_path
  ) {
    const [frontRes, backRes] = await Promise.all([
      supabase.storage
        .from(STORAGE_BUCKETS.ID_VERIFICATIONS)
        .createSignedUrl(profile.id_front_path, 600),
      supabase.storage
        .from(STORAGE_BUCKETS.ID_VERIFICATIONS)
        .createSignedUrl(profile.id_back_path, 600),
    ]);
    existingFrontUrl = frontRes.data?.signedUrl ?? "";
    existingBackUrl = backRes.data?.signedUrl ?? "";
  }

  return (
    <CompleteRegistrationForm
      campuses={campuses ?? []}
      userId={user.id}
      verifiedEmail={user.email ?? profile?.email ?? ""}
      preselectedSlug={preselectedSlug}
      profile={profile}
      existingFrontUrl={existingFrontUrl}
      existingBackUrl={existingBackUrl}
    />
  );
}
