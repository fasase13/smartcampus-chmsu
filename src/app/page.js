export default function HomePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-chmsu-canvas p-6">
      <div className="w-full max-w-lg rounded-2xl border border-chmsu-border bg-chmsu-card p-8 text-center">
        <img
          src="/images/chmsu-logo.jpg"
          alt="Carlos Hilado Memorial State University Seal"
          className="mx-auto mb-4 h-20 w-20 rounded-full object-contain"
        />
        <p className="text-xs font-semibold uppercase tracking-widest text-chmsu-green">
          Phase 0 — Foundation Ready
        </p>
        <h1 className="mt-2 text-2xl font-bold text-chmsu-forest">
          SmartCampus CHMSU
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Database foundation, Supabase clients, and multi-campus RBAC middleware
          are initialized. Portal interfaces will be built starting in Sprint 1.
        </p>
      </div>
    </main>
  );
}
