import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ROLES } from "@/lib/constants";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const UNAUTHORIZED_ERROR =
  "Invalid document. You are not authorized to scan or view this document.";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => null);
    const cleaned = String(body?.query ?? "").trim();

    if (!cleaned) {
      return NextResponse.json(
        { error: "Please provide a valid QR code or tracking code." },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role, campus_id, is_active, approval_status")
      .eq("id", user.id)
      .maybeSingle();

    if (
      !profile ||
      !profile.is_active ||
      profile.approval_status !== "approved" ||
      profile.role === ROLES.STUDENT
    ) {
      return NextResponse.json({ error: UNAUTHORIZED_ERROR }, { status: 403 });
    }

    // Primary path: SECURITY DEFINER lookup_authorized_document RPC
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "lookup_authorized_document",
      { p_query: cleaned }
    );

    if (!rpcError) {
      if (!rpcResult?.document) {
        return NextResponse.json(
          { error: UNAUTHORIZED_ERROR },
          { status: 403 }
        );
      }
      return NextResponse.json({
        ok: true,
        document: rpcResult.document,
        routes: Array.isArray(rpcResult.routes) ? rpcResult.routes : [],
      });
    }

    // Fallback when migration has not yet been applied in local DB: RLS-protected lookup
    let docQuery = supabase
      .from("documents")
      .select(
        "id, tracking_code, qr_token, origin_campus_id, current_campus_id, title, description, document_type, priority, status, sender_name, sender_office, current_office, current_holder_id, created_by, file_path, file_name, file_mime_type, file_size_bytes, sla_hours, due_at, is_delayed, delayed_at, completed_at, created_at, updated_at"
      );

    if (UUID_REGEX.test(cleaned)) {
      docQuery = docQuery.eq("qr_token", cleaned);
    } else {
      docQuery = docQuery.ilike("tracking_code", cleaned);
    }

    const { data: doc, error: docError } = await docQuery.maybeSingle();

    if (docError || !doc) {
      return NextResponse.json({ error: UNAUTHORIZED_ERROR }, { status: 403 });
    }

    const { data: routes } = await supabase
      .from("document_routes")
      .select(
        "id, campus_id, from_office, to_office, action, remarks, scanned_via_qr, created_at, actor:acted_by(full_name, role)"
      )
      .eq("document_id", doc.id)
      .order("created_at", { ascending: true });

    return NextResponse.json({
      ok: true,
      document: doc,
      routes: routes ?? [],
    });
  } catch {
    return NextResponse.json({ error: UNAUTHORIZED_ERROR }, { status: 403 });
  }
}
