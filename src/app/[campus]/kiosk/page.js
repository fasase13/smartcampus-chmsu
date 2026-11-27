import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import KioskDisplay from "@/components/KioskDisplay";

export const dynamic = "force-dynamic";

export default async function CampusKioskPage({ params }) {
  const { campus: campusSlug } = await params;
  const supabase = await createClient();

  const { data: campus, error: campusError } = await supabase
    .from("campuses")
    .select("id, code, slug, name, address, is_main")
    .eq("slug", campusSlug)
    .eq("is_active", true)
    .single();

  if (campusError || !campus) {
    notFound();
  }

  const nowIso = new Date().toISOString();

  // Strict RA 10173: Fetch ONLY active public announcements and public_faculty_availability
  const [announcementsRes, facultyRes] = await Promise.all([
    supabase
      .from("announcements")
      .select(
        "id, campus_id, title, body, category, priority, is_pinned, event_start_at, event_end_at, published_at, expires_at, attachment_url, attachment_path, attachment_name, attachment_type, attachment_size"
      )
      .eq("is_active", true)
      .eq("is_public", true)
      .lte("published_at", nowIso)
      .or(`campus_id.eq.${campus.id},campus_id.is.null`)
      .order("is_pinned", { ascending: false })
      .order("published_at", { ascending: false })
      .limit(50),
    supabase
      .from("public_faculty_availability")
      .select(
        "id, campus_id, full_name, department, job_title, office_location, availability_status, availability_note, availability_updated_at"
      )
      .eq("campus_id", campus.id)
      .order("full_name", { ascending: true }),
  ]);

  const activeAnnouncements = (announcementsRes.data ?? []).filter(
    (item) => !item.expires_at || new Date(item.expires_at) > new Date()
  );

  return (
    <KioskDisplay
      campus={campus}
      initialAnnouncements={activeAnnouncements}
      initialFaculty={facultyRes.data ?? []}
    />
  );
}
