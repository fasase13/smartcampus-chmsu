import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ID_NUMBER_REGEX = /^\d{8}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const GENERIC_SUCCESS_MESSAGE =
  "If an account matches that Email or School ID, a password reset link has been sent. Please check your inbox and spam folder.";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => null);
    const identifier = String(body?.identifier ?? "").trim();

    const isIdNumber = ID_NUMBER_REGEX.test(identifier);
    const isEmail = EMAIL_REGEX.test(identifier);

    if (!isIdNumber && !isEmail) {
      return NextResponse.json(
        { error: "Enter a valid School ID or Email address." },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Server-side SECURITY DEFINER check:
    // Resolves auth email ONLY for non-admin, non-rejected, non-banned accounts.
    // Returns NULL for missing, superadmin, campus_admin, or banned accounts.
    const { data: eligibleEmail, error: eligibilityError } = await supabase.rpc(
      "check_password_reset_eligibility",
      { p_identifier: isIdNumber ? identifier : identifier.toLowerCase() }
    );

    if (!eligibilityError && typeof eligibleEmail === "string" && eligibleEmail.trim()) {
      await supabase.auth
        .resetPasswordForEmail(eligibleEmail.trim(), {
          redirectTo: `${request.nextUrl.origin}/auth/callback?next=/reset-password`,
        })
        .catch(() => null);
    }

    // Always return identical 200 response to prevent account enumeration
    return NextResponse.json({
      ok: true,
      message: GENERIC_SUCCESS_MESSAGE,
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to process your request right now. Please try again." },
      { status: 500 }
    );
  }
}
