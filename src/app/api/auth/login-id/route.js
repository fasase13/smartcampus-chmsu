import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CROSS_CAMPUS_ROLES, ROLES } from "@/lib/constants";

const ID_NUMBER_REGEX = /^\d{8}$/;

export async function POST(request) {
  try {
    const body = await request.json().catch(() => null);
    const idNumber = String(body?.idNumber ?? "").trim();
    const password = String(body?.password ?? "");
    const campusSlug = String(body?.campusSlug ?? "").trim();

    if (!ID_NUMBER_REGEX.test(idNumber) || !password) {
      return NextResponse.json(
        { error: "Invalid ID Number or password." },
        { status: 401 }
      );
    }

    const supabase = await createClient();

    // 1. Server-side lookup of stored email by 8-digit ID (never returned to client)
    const { data: lookedUpEmail, error: lookupError } = await supabase.rpc(
      "lookup_email_for_id_login",
      { p_id_number: idNumber }
    );

    if (lookupError || !lookedUpEmail) {
      return NextResponse.json(
        { error: "Invalid ID Number or password." },
        { status: 401 }
      );
    }

    // 2. Authenticate on the server so SSR session cookies are set automatically
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email: lookedUpEmail,
        password,
      });

    if (authError || !authData?.user) {
      return NextResponse.json(
        { error: "Invalid ID Number or password." },
        { status: 401 }
      );
    }

    // 3. Fetch authoritative profile (never expose email in response)
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(
        "id, role, campus_id, approval_status, is_active, campuses:campus_id(id, slug, name)"
      )
      .eq("id", authData.user.id)
      .single();

    if (profileError || !profile) {
      await supabase.auth.signOut();
      return NextResponse.json(
        {
          error:
            "No SmartCampus profile found for this account. Contact your campus ICT/Admin office.",
        },
        { status: 403 }
      );
    }

    // 4. Reject System Administrators on the ID login endpoint
    if (profile.role === ROLES.ADMIN) {
      await supabase.auth.signOut();
      return NextResponse.json(
        { error: "System Administrators must use the Admin Login view." },
        { status: 403 }
      );
    }

    const assignedSlug = profile.campuses?.slug ?? "talisay";
    const assignedName = profile.campuses?.name ?? "your assigned campus";
    const isCrossCampusRole = CROSS_CAMPUS_ROLES.includes(profile.role);

    // 5. Enforce campus / management portal boundary for approved active users
    if (profile.approval_status === "approved" && profile.is_active) {
      if (campusSlug === "management" && !isCrossCampusRole) {
        await supabase.auth.signOut();
        return NextResponse.json(
          {
            error: `This portal is restricted to Institutional Management and System Administrators. Please sign in through the CHMSU ${assignedName} Campus Portal instead.`,
          },
          { status: 403 }
        );
      }

      if (
        campusSlug &&
        campusSlug !== "management" &&
        !isCrossCampusRole &&
        assignedSlug !== campusSlug
      ) {
        await supabase.auth.signOut();
        return NextResponse.json(
          {
            error: `Access denied for this campus. Your account is assigned to CHMSU ${assignedName}. Please use the ${assignedName} campus login portal.`,
          },
          { status: 403 }
        );
      }

      // Best-effort audit log for non-student logins
      if (profile.role !== ROLES.STUDENT && profile.campus_id) {
        await supabase.from("audit_logs").insert({
          campus_id: profile.campus_id,
          actor_id: profile.id,
          actor_role: profile.role,
          action: "auth.campus_login",
          entity_type: "profile",
          entity_id: profile.id,
          metadata: {
            login_method: "id_number",
            campus_slug: campusSlug || assignedSlug,
          },
        });
      }
    }

    // Return ONLY non-email routing/status fields (RA 10173 compliant)
    return NextResponse.json({
      ok: true,
      role: profile.role,
      campus_slug: assignedSlug,
      approval_status: profile.approval_status,
      is_active: profile.is_active,
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred while signing in." },
      { status: 500 }
    );
  }
}
