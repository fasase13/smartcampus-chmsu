import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.local.example to .env.local and fill in your Supabase project credentials."
    );
  }

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component where mutating cookies is not allowed.
          // Session refresh is handled by proxy/middleware.
        }
      },
    },
  });
}

/**
 * Convenience server helper that returns the verified Supabase Auth user
 * along with their active CHMSU profile and assigned campus.
 */
export async function getAuthenticatedProfile() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { supabase, user: null, profile: null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, campus_id, email, full_name, role, requested_role, employee_or_student_id, approval_status, profile_completed, rejection_reason, id_front_path, id_back_path, department, office_location, job_title, availability_status, availability_note, show_on_kiosk, is_active, campuses:campus_id(id, code, slug, name, is_main)"
    )
    .eq("id", user.id)
    .single();

  return { supabase, user, profile: profile ?? null };
}
