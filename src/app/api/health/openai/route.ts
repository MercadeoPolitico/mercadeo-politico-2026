import { NextResponse } from "next/server";

export const runtime = "nodejs";

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export async function GET() {
  const enabled = process.env.OPENAI_ENABLED === "true";
  const configured = enabled && Boolean(process.env.OPENAI_API_KEY);

  return NextResponse.json({
    ok: true,
    openai: {
      enabled,
      configured,
      base_url_host: hostOf(process.env.OPENAI_BASE_URL ?? "https://api.openai.com"),
      model: process.env.OPENAI_MODEL ? String(process.env.OPENAI_MODEL) : null,
    },
  });
}

