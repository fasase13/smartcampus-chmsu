import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_PORTAL_ROLES, getDefaultRouteForRole } from "@/lib/constants";

export async function GET(request) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const oauthError = searchParams.get("error");
  const oauthErrorDesc = searchParams.get("error_description") ?? "";

  if (oauthError || !code) {
    const isBannedErr = oauthErrorDesc.toLowerCase().includes("banned");
    return NextResponse.redirect(
      new URL(
        isBannedErr ? "/?error=email_banned" : "/?error=oauth_failed",
        request.url
      )
    );
  }

  const supabase = await createClient();

  const { data: exchangeData, error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError || !exchangeData?.user) {
    const isBannedErr = (exchangeError?.message ?? "")
      .toLowerCase()
      .includes("banned");
    return NextResponse.redirect(
      new URL(
        isBannedErr ? "/?error=email_banned" : "/?error=oauth_failed",
        request.url
      )
    );
  }

  const user = exchangeData.user;

  // Fetch profile, email ban status, and system maintenance flag in parallel
  const [profileRes, emailStatusRes, settingsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, role, campus_id, profile_completed, approval_status, is_active, campuses:campus_id(slug)"
      )
      .eq("id", user.id)
      .maybeSingle(),
    user.email
      ? supabase.rpc("check_registration_email_status", {
          p_email: user.email,
        })
      : Promise.resolve({ data: null }),
    supabase
      .from("system_settings")
      .select("maintenance_mode")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  const profile = profileRes.data ?? null;
  const isBanned =
    Boolean(emailStatusRes.data?.banned) ||
    profile?.approval_status === "rejected";

  // 1. Banned Email Guard
  if (isBanned) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/?error=email_banned", request.url));
  }

  // 2. Admin Isolation Guard (superadmin & campus_admin must use /sys-admin or /campus-admin)
  if (profile && ADMIN_PORTAL_ROLES.includes(profile.role)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      new URL("/?error=invalid_credentials", request.url)
    );
  }

  // 3. Maintenance Mode Guard
  if (settingsRes.data?.maintenance_mode) {
    return NextResponse.redirect(new URL("/maintenance", request.url));
  }

  // 4. Automatic Routing
  if (
    !profile ||
    profile.profile_completed === false ||
    profile.approval_status === "returned"
  ) {
    return NextResponse.redirect(new URL("/register/complete", request.url));
  }

  if (profile.approval_status !== "approved" || !profile.is_active) {
    return NextResponse.redirect(new URL("/pending-approval", request.url));
  }

  const campusSlug = profile.campuses?.slug ?? "talisay";
  const destination = getDefaultRouteForRole(profile.role, campusSlug);
  return NextResponse.redirect(new URL(destination, request.url));
}
