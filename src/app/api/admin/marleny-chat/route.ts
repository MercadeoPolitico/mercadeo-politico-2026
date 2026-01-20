import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { readJsonBodyWithLimit } from "@/lib/automation/readBody";
import { callMarlenyAI } from "@/lib/si/marleny-ai/client";

export const runtime = "nodejs";

type ChatMsg = { role: "user" | "assistant"; content: string };

function isChatMsgArray(v: unknown): v is ChatMsg[] {
  return (
    Array.isArray(v) &&
    v.every(
      (m) =>
        m &&
        typeof m === "object" &&
        ("role" in m ? (m as any).role === "user" || (m as any).role === "assistant" : false) &&
        typeof (m as any).content === "string"
    )
  );
}

export async function POST(req: Request) {
  await requireAdmin();

  const body = await readJsonBodyWithLimit(req);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!body.data || typeof body.data !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const b = body.data as Record<string, unknown>;
  const candidate_id = typeof b.candidate_id === "string" ? b.candidate_id.trim() : "";
  const messages = b.messages;
  if (!candidate_id) return NextResponse.json({ error: "candidate_id_required" }, { status: 400 });
  if (!isChatMsgArray(messages)) return NextResponse.json({ error: "invalid_messages" }, { status: 400 });

  const transcript = messages
    .slice(-12)
    .map((m) => `${m.role === "user" ? "Usuario" : "Asistente"}: ${m.content}`)
    .join("\n\n");

  const result = await callMarlenyAI({
    candidateId: candidate_id,
    contentType: "blog",
    topic: [
      "Modo chat. Responde de forma breve, útil y segura para un admin.",
      "Prohibido: desinformación, ataques personales, miedo, urgencia falsa.",
      "Si falta información, pide un dato concreto.",
      "",
      transcript,
    ].join("\n"),
    tone: "Groq-style: directo, sobrio, sin relleno",
  });

  if (!result.ok) {
    const status = result.error === "disabled" || result.error === "not_configured" ? 503 : 502;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ ok: true, reply: result.text });
}

