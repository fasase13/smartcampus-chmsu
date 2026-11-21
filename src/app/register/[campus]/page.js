import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RegistrationForm from "@/components/RegistrationForm";

export const dynamic = "force-dynamic";

export default async function CampusRegisterPage({ params }) {
  const { campus: campusSlug } = await params;
  const supabase = await createClient();

  const { data: campus, error } = await supabase
    .from("campuses")
    .select("slug")
    .eq("slug", campusSlug)
    .eq("is_active", true)
    .single();

  if (error || !campus) {
    notFound();
  }

  return <RegistrationForm preselectedSlug={campus.slug} />;
}
