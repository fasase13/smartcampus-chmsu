import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthenticatedProfile } from "@/lib/supabase/server";
import { ROLES } from "@/lib/constants";
import CampusAdminLoginForm from "@/components/CampusAdminLoginForm";

export const dynamic = "force-dynamic";

export default async function CampusAdminLoginPage() {
  const { user, profile } = await getAuthenticatedProfile();

  if (
    user &&
    profile?.role === ROLES.CAMPUS_ADMIN &&
    profile?.is_active &&
    profile?.approval_status === "approved" &&
    profile?.campuses?.slug
  ) {
    redirect(`/${profile.campuses.slug}/admin`);
  }

  return (
    <Suspense fallback={null}>
      <CampusAdminLoginForm />
    </Suspense>
  );
}
