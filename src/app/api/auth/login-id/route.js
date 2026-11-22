import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_PORTAL_ROLES, ROLES, getDefaultRouteForRole } from "@/lib/constants";

const ID_NUMBER_REGEX = /^\d{8}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request) {
  try {
    const body = await request.json().catch(() => null);
    const identifier = String(body?.identifier ?? body?.idNumber ?? "").trim();
    const password = String(body?.password ?? "");

    if (!password) {
      return NextResponse.json(
        { error: "Invalid credentials." },
        { status: 401 }
      );
    }

    const isIdNumber = ID_NUMBER_REGEX.test(identifier);
    const isEmail = EMAIL_REGEX.test(identifier);

    if (!isIdNumber && !isEmail) {
      return NextResponse.json(
        { error: "Enter a valid School ID or Email address." },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // 1. Resolve email either from School ID lookup or directly from user input
    let resolvedEmail = "";
    if (isIdNumber) {
      const { data: lookedUpEmail, error: lookupError } = await supabase.rpc(
        "lookup_email_for_id_login",
        { p_id_number: identifier }
      );

      if (lookupError || !lookedUpEmail) {
        return NextResponse.json(
          { error: "Invalid credentials." },
          { status: 401 }
        );
      }
      resolvedEmail = lookedUpEmail;
    } else {
      resolvedEmail = identifier.toLowerCase();
    }

    // 2. Authenticate on the server so SSR session cookies are set automatically
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email: resolvedEmail,
        password,
      });

    if (authError || !authData?.user) {
      return NextResponse.json(
        { error: "Invalid credentials." },
        { status: 401 }
      );
    }

    // 3. Automatically detect assigned campus, role, completion, and approval status
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(
        "id, role, campus_id, profile_completed, approval_status, is_active, campuses:campus_id(id, slug, name)"
      )
      .eq("id", authData.user.id)
      .single();

    if (profileError || !profile) {
      await supabase.auth.signOut();
      return NextResponse.json(
        { error: "Invalid credentials." },
        { status: 401 }
      );
    }

    // 4. Reject Superadmin & Campus Admin accounts with generic 401 (admin login is /sys-admin only)
    if (ADMIN_PORTAL_ROLES.includes(profile.role)) {
      await supabase.auth.signOut();
      return NextResponse.json(
        { error: "Invalid credentials." },
        { status: 401 }
      );
    }

    const campusSlug = profile.campuses?.slug ?? "talisay";

    let redirectTo;
    if (
      profile.profile_completed === false ||
      profile.approval_status === "returned"
    ) {
      redirectTo = "/register/complete";
    } else if (profile.approval_status !== "approved" || !profile.is_active) {
      redirectTo = "/pending-approval";
    } else {
      redirectTo = getDefaultRouteForRole(profile.role, campusSlug);

      // Best-effort audit log for approved non-student logins
      if (profile.role !== ROLES.STUDENT && profile.campus_id) {
        await supabase.from("audit_logs").insert({
          campus_id: profile.campus_id,
          actor_id: profile.id,
          actor_role: profile.role,
          action: "auth.campus_login",
          entity_type: "profile",
          entity_id: profile.id,
          metadata: {
            login_method: isIdNumber ? "id_number" : "email",
            campus_slug: campusSlug,
          },
        });
      }
    }

    // Return ONLY non-email routing/status fields (RA 10173 compliant)
    return NextResponse.json({
      ok: true,
      role: profile.role,
      campus_slug: campusSlug,
      profile_completed: profile.profile_completed,
      approval_status: profile.approval_status,
      is_active: profile.is_active,
      redirect_to: redirectTo,
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred while signing in." },
      { status: 500 }
    );
  }
}
