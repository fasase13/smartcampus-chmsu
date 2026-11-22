import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import {
  CAMPUS_SLUGS,
  CROSS_CAMPUS_ROLES,
  PORTAL_ROLE_ACCESS,
  ROLES,
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

  const { pathname } = request.nextUrl;
  const segments = pathname.split("/").filter(Boolean);

  // Always allow API & Auth callback routes
  if (segments[0] === "api" || segments[0] === "auth") {
    return supabaseResponse;
  }

  // Check global System Maintenance Mode
  const { data: sysSettings } = await supabase
    .from("system_settings")
    .select("maintenance_mode")
    .eq("id", 1)
    .maybeSingle();

  const isMaintenanceMode = Boolean(sysSettings?.maintenance_mode);

  // Handle /maintenance route
  if (segments[0] === "maintenance") {
    if (!isMaintenanceMode) {
      const homeUrl = request.nextUrl.clone();
      homeUrl.pathname = "/";
      homeUrl.search = "";
      return redirectWithCookies(homeUrl, supabaseResponse);
    }
    return supabaseResponse;
  }

  // Fetch authenticated user profile once if logged in
  let profile = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select(
        "role, is_active, approval_status, profile_completed, campus_id, campuses:campus_id(slug)"
      )
      .eq("id", user.id)
      .single();
    profile = data ?? null;
  }

  const isSuperadmin = Boolean(
    profile &&
      profile.role === ROLES.SUPERADMIN &&
      profile.is_active &&
      profile.approval_status === "approved"
  );

  // Dedicated unlinked System Admin (superadmin ONLY) login route: /sys-admin
  // Always accessible during Maintenance Mode so superadmin can log in and disable it.
  if (segments[0] === "sys-admin") {
    if (isSuperadmin) {
      const superUrl = request.nextUrl.clone();
      superUrl.pathname = "/superadmin";
      superUrl.search = "";
      return redirectWithCookies(superUrl, supabaseResponse);
    }

    return supabaseResponse;
  }

  // Global Maintenance Mode Enforcement:
  // Only Superadmin can bypass; everyone else (including /campus-admin, kiosks, campus_admin, /register, /) goes to /maintenance
  if (isMaintenanceMode && !isSuperadmin) {
    const maintUrl = request.nextUrl.clone();
    maintUrl.pathname = "/maintenance";
    maintUrl.search = "";
    return redirectWithCookies(maintUrl, supabaseResponse);
  }

  // Dedicated unlinked Campus Admin login route: /campus-admin (blocked during maintenance above)
  if (segments[0] === "campus-admin") {
    if (
      profile?.role === ROLES.CAMPUS_ADMIN &&
      profile?.is_active &&
      profile?.approval_status === "approved" &&
      profile?.campuses?.slug
    ) {
      const adminUrl = request.nextUrl.clone();
      adminUrl.pathname = `/${profile.campuses.slug}/admin`;
      adminUrl.search = "";
      return redirectWithCookies(adminUrl, supabaseResponse);
    }
    return supabaseResponse;
  }

  // Public landing page, privacy notice, and password recovery flow (blocked during maintenance above)
  if (
    segments.length === 0 ||
    segments[0] === "privacy" ||
    segments[0] === "forgot-password" ||
    segments[0] === "reset-password"
  ) {
    return supabaseResponse;
  }

  // Legacy /login/* routes redirect cleanly to unified homepage login (/)
  if (segments[0] === "login") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return redirectWithCookies(homeUrl, supabaseResponse);
  }

  const needsCompletion = Boolean(
    profile &&
      (profile.profile_completed === false ||
        profile.approval_status === "returned")
  );

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

      if (needsCompletion) {
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

    if (user && profile) {
      const redirectUrl = request.nextUrl.clone();
      if (needsCompletion) {
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

    if (needsCompletion) {
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

  // Dedicated Superadmin Portal: /superadmin (Superadmin ONLY)
  if (segments[0] === "superadmin") {
    if (!user) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/";
      loginUrl.search = "";
      return redirectWithCookies(loginUrl, supabaseResponse);
    }

    if (!profile) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/";
      loginUrl.search = "?error=account_inactive";
      return redirectWithCookies(loginUrl, supabaseResponse);
    }

    if (needsCompletion) {
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

    if (profile.role !== ROLES.SUPERADMIN) {
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

  // Cross-campus Institutional Management / Superadmin route: /management
  if (segments[0] === "management") {
    if (!user) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/";
      loginUrl.search = `?next=${encodeURIComponent(pathname)}`;
      return redirectWithCookies(loginUrl, supabaseResponse);
    }

    if (!profile) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/";
      loginUrl.search = "?error=account_inactive";
      return redirectWithCookies(loginUrl, supabaseResponse);
    }

    if (needsCompletion) {
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

  // Strict RA 10173 public kiosk boundary: zero auth required (when not in maintenance)
  if (section === "kiosk") {
    return supabaseResponse;
  }

  // Protected campus portal sections: /[campus]/[section]
  const allowedRoles = PORTAL_ROLE_ACCESS[section];
  if (!allowedRoles) {
    return supabaseResponse;
  }

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/";
    loginUrl.search = `?next=${encodeURIComponent(pathname)}`;
    return redirectWithCookies(loginUrl, supabaseResponse);
  }

  if (!profile) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/";
    loginUrl.search = "?error=account_inactive";
    return redirectWithCookies(loginUrl, supabaseResponse);
  }

  if (needsCompletion) {
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

  // Strict separation of duties: /[campus]/admin is strictly for matching campus_admin ONLY
  if (section === "admin" && profile.role === ROLES.SUPERADMIN) {
    const superUrl = request.nextUrl.clone();
    superUrl.pathname = "/superadmin";
    superUrl.search = "";
    return redirectWithCookies(superUrl, supabaseResponse);
  }

  // Enforce strict campus isolation for campus-bound roles (including campus_admin)
  if (!hasCrossCampusAccess && userCampusSlug !== campusSlug) {
    const restrictedUrl = request.nextUrl.clone();
    restrictedUrl.pathname = getDefaultRouteForRole(profile.role, userCampusSlug);
    restrictedUrl.search = "?error=campus_restricted";
    return redirectWithCookies(restrictedUrl, supabaseResponse);
  }

  // Enforce role-based portal authorization
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
