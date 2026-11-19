import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CampusLoginForm from "@/components/CampusLoginForm";

export const dynamic = "force-dynamic";

export default async function CampusLoginPage({ params }) {
  const { campus: campusSlug } = await params;

  if (campusSlug === "management") {
    return (
      <Suspense fallback={null}>
        <CampusLoginForm campus={null} isManagementLogin />
      </Suspense>
    );
  }

  const supabase = await createClient();
  const { data: campus, error } = await supabase
    .from("campuses")
    .select("id, code, slug, name, address, is_main")
    .eq("slug", campusSlug)
    .eq("is_active", true)
    .single();

  if (error || !campus) {
    notFound();
  }

  return (
    <Suspense fallback={null}>
      <CampusLoginForm campus={campus} isManagementLogin={false} />
    </Suspense>
  );
}
