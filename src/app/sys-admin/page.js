import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthenticatedProfile } from "@/lib/supabase/server";
import { ROLES } from "@/lib/constants";
import SysAdminLoginForm from "@/components/SysAdminLoginForm";

export const dynamic = "force-dynamic";

export default async function SysAdminLoginPage() {
  const { user, profile } = await getAuthenticatedProfile();

  if (
    user &&
    profile?.role === ROLES.SUPERADMIN &&
    profile?.is_active &&
    profile?.approval_status === "approved"
  ) {
    redirect("/superadmin");
  }

  return (
    <Suspense fallback={null}>
      <SysAdminLoginForm />
    </Suspense>
  );
}
