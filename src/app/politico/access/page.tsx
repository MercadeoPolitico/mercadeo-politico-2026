import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createPoliticoSessionCookieValue, POLITICO_COOKIE_NAME } from "@/lib/politico/session";
import { PublicPageShell } from "@/components/PublicPageShell";

export const runtime = "nodejs";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export default async function PoliticoAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const raw = typeof token === "string" ? token.trim() : "";

  if (!raw) {
    return (
      <PublicPageShell className="mx-auto w-full max-w-lg space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Acceso requerido</h1>
        <p className="text-sm text-muted">Usa el enlace exclusivo entregado por el equipo de campaña.</p>
      </PublicPageShell>
    );
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return (
      <PublicPageShell className="mx-auto w-full max-w-lg space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">No disponible</h1>
        <p className="text-sm text-muted">El sistema no está configurado para acceso móvil en este entorno.</p>
      </PublicPageShell>
    );
  }

  const token_hash = sha256Hex(raw);
  const { data: tokenRow } = await admin
    .from("politician_access_tokens")
    .select("id,politician_id,expires_at")
    .eq("token_hash", token_hash)
    .maybeSingle();

  if (!tokenRow) {
    return (
      <PublicPageShell className="mx-auto w-full max-w-lg space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Enlace inválido</h1>
        <p className="text-sm text-muted">Solicita un nuevo enlace al equipo de campaña.</p>
      </PublicPageShell>
    );
  }

  if (tokenRow.expires_at && Date.now() > Date.parse(tokenRow.expires_at)) {
    return (
      <PublicPageShell className="mx-auto w-full max-w-lg space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Enlace expirado</h1>
        <p className="text-sm text-muted">Solicita un nuevo enlace al equipo de campaña.</p>
      </PublicPageShell>
    );
  }

  const { data: politician } = await admin
    .from("politicians")
    .select("slug")
    .eq("id", tokenRow.politician_id)
    .maybeSingle();

  if (!politician) {
    return (
      <PublicPageShell className="mx-auto w-full max-w-lg space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">No disponible</h1>
        <p className="text-sm text-muted">No se encontró el político asociado.</p>
      </PublicPageShell>
    );
  }

  // 30 days session
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
  const cookieValue = createPoliticoSessionCookieValue({
    tokenId: tokenRow.id,
    politicianId: tokenRow.politician_id,
    exp,
  });

  if (!cookieValue) {
    return (
      <PublicPageShell className="mx-auto w-full max-w-lg space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">No disponible</h1>
        <p className="text-sm text-muted">Falta configurar el secreto de sesión del portal.</p>
      </PublicPageShell>
    );
  }

  const cookieStore = await cookies();
  cookieStore.set({
    name: POLITICO_COOKIE_NAME,
    value: cookieValue,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/politico",
    maxAge: 60 * 60 * 24 * 30,
  });

  // Best-effort usage mark (no logs)
  await admin.from("politician_access_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tokenRow.id);

  redirect(`/politico/${politician.slug}`);
}

