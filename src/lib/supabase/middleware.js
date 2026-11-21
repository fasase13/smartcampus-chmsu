import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import {
  CAMPUS_SLUGS,
  CROSS_CAMPUS_ROLES,
  PORTAL_ROLE_ACCESS,
  getDefaultRouteForRole,
} from "@/lib/constants";

function redirectWithCookies(url, supabaseResponse) {
  const response = NextResponse.redirect(url);
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    response.cookies.set(cookie);
  });
  return response;
}

export async function updateSession(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Always verify session with Supabase Auth server-side
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, searchParams } = request.nextUrl;
  const segments = pathname.split("/").filter(Boolean);

  // Public landing page, privacy notice & auth callback
  if (segments.length === 0 || segments[0] === "auth" || segments[0] === "privacy") {
    return supabaseResponse;
  }

  // Dedicated unlinked System Administrator login route: /sys-admin
  if (segments[0] === "sys-admin") {
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, is_active, approval_status")
        .eq("id", user.id)
        .single();

      if (
        profile?.role === "admin" &&
        profile?.is_active &&
        profile?.approval_status === "approved"
      ) {
        const mgmtUrl = request.nextUrl.clone();
        mgmtUrl.pathname = "/management";
        mgmtUrl.search = "";
        return redirectWithCookies(mgmtUrl, supabaseResponse);
      }
    }
    return supabaseResponse;
  }

  // Self-registration routes: /register, /register/[campus], and /register/complete
  if (segments[0] === "register") {
    const isCompleteStep = segments[1] === "complete";

    if (isCompleteStep) {
      if (!user) {
        const regUrl = request.nextUrl.clone();
        regUrl.pathname = "/register";
        regUrl.search = "";
        return redirectWithCookies(regUrl, supabaseResponse);
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, is_active, approval_status, profile_completed, campuses:campus_id(slug)")
        .eq("id", user.id)
        .single();

      if (profile && profile.profile_completed === false) {
        return supabaseResponse;
      }

      const redirectUrl = request.nextUrl.clone();
      if (profile?.is_active && profile?.approval_status === "approved") {
        const assignedSlug = profile.campuses?.slug ?? "talisay";
        redirectUrl.pathname = getDefaultRouteForRole(profile.role, assignedSlug);
        redirectUrl.search = "";
        return redirectWithCookies(redirectUrl, supabaseResponse);
      }

      redirectUrl.pathname = "/pending-approval";
      redirectUrl.search = "";
      return redirectWithCookies(redirectUrl, supabaseResponse);
    }

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, is_active, approval_status, profile_completed, campuses:campus_id(slug)")
        .eq("id", user.id)
        .single();

      if (profile) {
        const redirectUrl = request.nextUrl.clone();
        if (profile.profile_completed === false) {
          redirectUrl.pathname = "/register/complete";
          redirectUrl.search =
            segments[1] && CAMPUS_SLUGS.includes(segments[1])
              ? `?campus=${encodeURIComponent(segments[1])}`
              : "";
          return redirectWithCookies(redirectUrl, supabaseResponse);
        }

        if (!profile.is_active || profile.approval_status !== "approved") {
          redirectUrl.pathname = "/pending-approval";
          redirectUrl.search = "";
          return redirectWithCookies(redirectUrl, supabaseResponse);
        }

        const assignedSlug = profile.campuses?.slug ?? "talisay";
        redirectUrl.pathname = getDefaultRouteForRole(profile.role, assignedSlug);
        redirectUrl.search = "";
        return redirectWithCookies(redirectUrl, supabaseResponse);
      }
    }
    return supabaseResponse;
  }

  // Pending / Declined registration verification screen
  if (segments[0] === "pending-approval") {
    if (!user) {
      const homeUrl = request.nextUrl.clone();
      homeUrl.pathname = "/";
      homeUrl.search = "";
      return redirectWithCookies(homeUrl, supabaseResponse);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active, approval_status, profile_completed, campuses:campus_id(slug)")
      .eq("id", user.id)
      .single();

    if (profile && profile.profile_completed === false) {
      const completeUrl = request.nextUrl.clone();
      completeUrl.pathname = "/register/complete";
      completeUrl.search = "";
      return redirectWithCookies(completeUrl, supabaseResponse);
    }

    if (profile?.is_active && profile?.approval_status === "approved") {
      const assignedSlug = profile.campuses?.slug ?? "talisay";
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = getDefaultRouteForRole(profile.role, assignedSlug);
      redirectUrl.search = "";
      return redirectWithCookies(redirectUrl, supabaseResponse);
    }

    return supabaseResponse;
  }

  // Legacy /login/* routes redirect cleanly to the unified homepage login (/)
  if (segments[0] === "login") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return redirectWithCookies(homeUrl, supabaseResponse);
  }

  // Cross-campus Institutional Management / System Admin route: /management
  if (segments[0] === "management") {
    if (!user) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/";
      loginUrl.search = `?next=${encodeURIComponent(pathname)}`;
      return redirectWithCookies(loginUrl, supabaseResponse);
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, is_active, approval_status, profile_completed, campuses:campus_id(slug)")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/";
      loginUrl.search = "?error=account_inactive";
      return redirectWithCookies(loginUrl, supabaseResponse);
    }

    if (profile.profile_completed === false) {
      const completeUrl = request.nextUrl.clone();
      completeUrl.pathname = "/register/complete";
      completeUrl.search = "";
      return redirectWithCookies(completeUrl, supabaseResponse);
    }

    if (!profile.is_active || profile.approval_status !== "approved") {
      const pendingUrl = request.nextUrl.clone();
      pendingUrl.pathname = "/pending-approval";
      pendingUrl.search = "";
      return redirectWithCookies(pendingUrl, supabaseResponse);
    }

    if (!CROSS_CAMPUS_ROLES.includes(profile.role)) {
      const userCampusSlug = profile.campuses?.slug ?? "talisay";
      const unauthorizedUrl = request.nextUrl.clone();
      unauthorizedUrl.pathname = getDefaultRouteForRole(
        profile.role,
        userCampusSlug
      );
      unauthorizedUrl.search = "?error=unauthorized";
      return redirectWithCookies(unauthorizedUrl, supabaseResponse);
    }

    return supabaseResponse;
  }

  const campusSlug = segments[0];
  const section = segments[1] ?? "";

  if (!CAMPUS_SLUGS.includes(campusSlug)) {
    return supabaseResponse;
  }

  // Strict RA 10173 public kiosk boundary: zero auth required
  if (section === "kiosk") {
    return supabaseResponse;
  }

  // Protected campus portal sections: /[campus]/[section]
  const allowedRoles = PORTAL_ROLE_ACCESS[section];
  if (!allowedRoles) {
    return supabaseResponse;
  }

  // 1. Require authenticated user
  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/";
    loginUrl.search = `?next=${encodeURIComponent(pathname)}`;
    return redirectWithCookies(loginUrl, supabaseResponse);
  }

  // 2. Fetch authoritative profile (role, campus, completion, active & approval status)
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_active, approval_status, profile_completed, campus_id, campuses:campus_id(slug)")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/";
    loginUrl.search = "?error=account_inactive";
    return redirectWithCookies(loginUrl, supabaseResponse);
  }

  if (profile.profile_completed === false) {
    const completeUrl = request.nextUrl.clone();
    completeUrl.pathname = "/register/complete";
    completeUrl.search = "";
    return redirectWithCookies(completeUrl, supabaseResponse);
  }

  if (!profile.is_active || profile.approval_status !== "approved") {
    const pendingUrl = request.nextUrl.clone();
    pendingUrl.pathname = "/pending-approval";
    pendingUrl.search = "";
    return redirectWithCookies(pendingUrl, supabaseResponse);
  }

  const userCampusSlug = profile.campuses?.slug ?? campusSlug;
  const hasCrossCampusAccess = CROSS_CAMPUS_ROLES.includes(profile.role);

  // 3. Enforce strict campus isolation for campus-bound roles
  if (!hasCrossCampusAccess && userCampusSlug !== campusSlug) {
    const restrictedUrl = request.nextUrl.clone();
    restrictedUrl.pathname = getDefaultRouteForRole(profile.role, userCampusSlug);
    restrictedUrl.search = "?error=campus_restricted";
    return redirectWithCookies(restrictedUrl, supabaseResponse);
  }

  // 4. Enforce role-based portal authorization
  if (!allowedRoles.includes(profile.role)) {
    const unauthorizedUrl = request.nextUrl.clone();
    unauthorizedUrl.pathname = getDefaultRouteForRole(
      profile.role,
      userCampusSlug
    );
    unauthorizedUrl.search = "?error=unauthorized";
    return redirectWithCookies(unauthorizedUrl, supabaseResponse);
  }

  return supabaseResponse;
}
