import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RegistrationForm from "@/components/RegistrationForm";

export const dynamic = "force-dynamic";

export default async function CampusRegisterPage({ params }) {
  const { campus: campusSlug } = await params;
  const supabase = await createClient();

  const { data: campuses } = await supabase
    .from("campuses")
    .select("id, code, slug, name, address, is_main")
    .eq("is_active", true)
    .order("is_main", { ascending: false })
    .order("name", { ascending: true });

  const matched = (campuses ?? []).find((c) => c.slug === campusSlug);
  if (!matched) {
    notFound();
  }

  return (
    <RegistrationForm
      campuses={campuses ?? []}
      preselectedSlug={matched.slug}
    />
  );
}
