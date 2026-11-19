import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import {
  CAMPUS_SLUGS,
  DEFAULT_PORTAL_BY_ROLE,
  PORTAL_ROLE_ACCESS,
  ROLES,
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

  // Allow local boot before .env.local is configured without crashing.
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

  // Always validate the session with Supabase Auth on the server.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, searchParams } = request.nextUrl;
  const segments = pathname.split("/").filter(Boolean);

  // Public root, global login, and auth callback routes
  if (
    segments.length === 0 ||
    segments[0] === "login" ||
    segments[0] === "auth"
  ) {
    return supabaseResponse;
  }

  const campusSlug = segments[0];
  const section = segments[1] ?? "";

  // Non-campus top-level routes (e.g., API health checks handled by route handlers)
  if (!CAMPUS_SLUGS.includes(campusSlug)) {
    return supabaseResponse;
  }

  // Strict RA 10173 public kiosk boundary: always public, never requires auth
  if (section === "kiosk") {
    return supabaseResponse;
  }

  // Campus login page
  if (section === "login") {
    if (user && !searchParams.get("error")) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, is_active, campuses:campus_id(slug)")
        .eq("id", user.id)
        .single();

      if (profile?.is_active && profile?.campuses?.slug) {
        const targetCampus =
          profile.role === ROLES.ADMIN || profile.role === ROLES.MANAGEMENT
            ? campusSlug
            : profile.campuses.slug;
        const defaultPortal =
          DEFAULT_PORTAL_BY_ROLE[profile.role] ?? "student";
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = `/${targetCampus}/${defaultPortal}`;
        redirectUrl.search = "";
        return redirectWithCookies(redirectUrl, supabaseResponse);
      }
    }
    return supabaseResponse;
  }

  // Check if this is a protected campus portal section
  const allowedRoles = PORTAL_ROLE_ACCESS[section];
  if (!allowedRoles) {
    return supabaseResponse;
  }

  // 1. Require authenticated user
  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = `/${campusSlug}/login`;
    loginUrl.search = `?next=${encodeURIComponent(pathname)}`;
    return redirectWithCookies(loginUrl, supabaseResponse);
  }

  // 2. Fetch authoritative profile (role, campus, active status) from Postgres
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_active, campus_id, campuses:campus_id(slug)")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || !profile.is_active) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = `/${campusSlug}/login`;
    loginUrl.search = "?error=account_inactive";
    return redirectWithCookies(loginUrl, supabaseResponse);
  }

  const userCampusSlug = profile.campuses?.slug ?? campusSlug;
  const userDefaultPortal = DEFAULT_PORTAL_BY_ROLE[profile.role] ?? "student";
  const hasCrossCampusAccess =
    profile.role === ROLES.ADMIN || profile.role === ROLES.MANAGEMENT;

  // 3. Enforce strict campus isolation for campus-bound roles
  if (!hasCrossCampusAccess && userCampusSlug !== campusSlug) {
    const restrictedUrl = request.nextUrl.clone();
    restrictedUrl.pathname = `/${userCampusSlug}/${userDefaultPortal}`;
    restrictedUrl.search = "?error=campus_restricted";
    return redirectWithCookies(restrictedUrl, supabaseResponse);
  }

  // 4. Enforce role-based portal authorization
  if (!allowedRoles.includes(profile.role)) {
    const unauthorizedUrl = request.nextUrl.clone();
    unauthorizedUrl.pathname = `/${userCampusSlug}/${userDefaultPortal}`;
    unauthorizedUrl.search = "?error=unauthorized";
    return redirectWithCookies(unauthorizedUrl, supabaseResponse);
  }

  return supabaseResponse;
}
