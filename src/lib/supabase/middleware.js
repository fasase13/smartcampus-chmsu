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

  // Public landing page & auth callback
  if (segments.length === 0 || segments[0] === "auth") {
    return supabaseResponse;
  }

  // Dedicated campus & management login routes: /login/[campus]
  if (segments[0] === "login") {
    if (user && !searchParams.get("error") && !searchParams.get("switch")) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, is_active, campuses:campus_id(slug)")
        .eq("id", user.id)
        .single();

      if (profile?.is_active) {
        const assignedSlug = profile.campuses?.slug ?? "talisay";
        const requestedSlug = segments[1];
        const targetCampus =
          CROSS_CAMPUS_ROLES.includes(profile.role) &&
          CAMPUS_SLUGS.includes(requestedSlug)
            ? requestedSlug
            : assignedSlug;

        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = getDefaultRouteForRole(profile.role, targetCampus);
        redirectUrl.search = "";
        return redirectWithCookies(redirectUrl, supabaseResponse);
      }
    }
    return supabaseResponse;
  }

  // Cross-campus Institutional Management / System Admin route: /management
  if (segments[0] === "management") {
    if (!user) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login/management";
      loginUrl.search = `?next=${encodeURIComponent(pathname)}`;
      return redirectWithCookies(loginUrl, supabaseResponse);
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, is_active, campuses:campus_id(slug)")
      .eq("id", user.id)
      .single();

    if (profileError || !profile || !profile.is_active) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login/management";
      loginUrl.search = "?error=account_inactive";
      return redirectWithCookies(loginUrl, supabaseResponse);
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
    loginUrl.pathname = `/login/${campusSlug}`;
    loginUrl.search = `?next=${encodeURIComponent(pathname)}`;
    return redirectWithCookies(loginUrl, supabaseResponse);
  }

  // 2. Fetch authoritative profile (role, campus, active status)
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_active, campus_id, campuses:campus_id(slug)")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || !profile.is_active) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = `/login/${campusSlug}`;
    loginUrl.search = "?error=account_inactive";
    return redirectWithCookies(loginUrl, supabaseResponse);
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
