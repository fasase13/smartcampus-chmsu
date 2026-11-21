import Image from "next/image";
import { redirect } from "next/navigation";
import { Clock, Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function formatUpdatedAt(isoString) {
  if (!isoString) return "";
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(isoString));
}

export default async function MaintenancePage() {
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from("system_settings")
    .select("maintenance_mode, maintenance_message, maintenance_updated_at")
    .eq("id", 1)
    .maybeSingle();

  if (!settings?.maintenance_mode) {
    redirect("/");
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-chmsu-canvas px-4 py-10 text-slate-900">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-chmsu-border bg-chmsu-card shadow-xs">
        <div className="bg-chmsu-forest px-6 py-7 text-center text-white">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white p-1.5 shadow-sm">
            <Image
              src="/images/chmsu-logo.jpg"
              alt="Carlos Hilado Memorial State University Seal"
              width={56}
              height={56}
              priority
              className="h-full w-full rounded-full object-contain"
            />
          </div>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-chmsu-gold">
            Carlos Hilado Memorial State University
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            System Under Maintenance
          </h1>
        </div>

        <div className="space-y-5 p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-700">
            <Wrench className="h-6 w-6" />
          </div>

          <p className="text-sm leading-relaxed text-slate-700 sm:text-base">
            {settings.maintenance_message ||
              "SmartCampus CHMSU is currently undergoing scheduled system maintenance. Please check back shortly."}
          </p>

          {settings.maintenance_updated_at && (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-chmsu-border bg-chmsu-canvas px-3 py-1 text-xs font-medium text-slate-600 tabular-nums">
              <Clock className="h-3.5 w-3.5 text-chmsu-green" />
              Last updated: {formatUpdatedAt(settings.maintenance_updated_at)}
            </div>
          )}

          <p className="border-t border-chmsu-border pt-4 text-xs text-slate-500">
            SmartCampus CHMSU &bull; All 4 Campuses (Talisay, Alijis,
            Binalbagan, Fortune Towne)
          </p>
        </div>
      </div>
    </div>
  );
}
