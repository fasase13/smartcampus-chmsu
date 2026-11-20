export default function PageSkeleton({ title = "Loading SmartCampus CHMSU..." }) {
  return (
    <div className="min-h-dvh bg-chmsu-canvas p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center gap-3 rounded-2xl border border-chmsu-border bg-white p-4">
          <div className="h-10 w-10 animate-pulse rounded-full bg-chmsu-forest/15" />
          <div className="space-y-2">
            <div className="h-4 w-48 animate-pulse rounded bg-slate-200" />
            <p className="text-xs font-medium text-slate-500">{title}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl border border-chmsu-border bg-white p-4"
            >
              <div className="h-3 w-24 rounded bg-slate-200" />
              <div className="mt-4 h-7 w-16 rounded bg-slate-200" />
            </div>
          ))}
        </div>

        <div className="h-72 animate-pulse rounded-2xl border border-chmsu-border bg-white p-5">
          <div className="h-4 w-40 rounded bg-slate-200" />
          <div className="mt-4 space-y-3">
            <div className="h-10 w-full rounded-xl bg-slate-100" />
            <div className="h-10 w-full rounded-xl bg-slate-100" />
            <div className="h-10 w-3/4 rounded-xl bg-slate-100" />
          </div>
        </div>
      </div>
    </div>
  );
}
