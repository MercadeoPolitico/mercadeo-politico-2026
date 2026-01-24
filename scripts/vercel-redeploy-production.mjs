/**
 * Trigger a Vercel Production redeploy (non-interactive).
 *
 * - Uses Vercel REST API (requires VERCEL_TOKEN in shell env or .env.local)
 * - Uses existing .vercel/project.json linkage (projectId + orgId/teamId)
 * - Does NOT print any secret values
 */
import fs from "node:fs";

function readText(p) {
  return fs.readFileSync(p, "utf8");
}

function parseDotenv(raw) {
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (val.endsWith("\\n")) val = val.slice(0, -2);
    env[key] = val;
  }
  return env;
}

async function vercelApi(token, path, { method = "GET", body } = {}) {
  const resp = await fetch(`https://api.vercel.com${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await resp.json().catch(() => null);
  return { ok: resp.ok, status: resp.status, json };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const envLocal = fs.existsSync(".env.local") ? parseDotenv(readText(".env.local")) : {};
  const token = (process.env.VERCEL_TOKEN || envLocal.VERCEL_TOKEN || "").trim();
  assert(token, "Missing VERCEL_TOKEN (set in shell env or .env.local)");

  const project = JSON.parse(readText(".vercel/project.json"));
  const projectId = project.projectId;
  const teamId = project.orgId;
  assert(projectId && teamId, "Missing .vercel project linkage");

  // Auth check
  const me = await vercelApi(token, "/v2/user");
  assert(me.ok, `Vercel token unauthorized (status ${me.status})`);

  const proj = await vercelApi(token, `/v9/projects/${projectId}?teamId=${teamId}`);
  assert(proj.ok, `Failed to read Vercel project (status ${proj.status})`);

  const name = proj.json?.name || "mercadeo-politico-2026";
  const link = proj.json?.link || null;
  assert(link?.type === "github" && (link.repoId || link.repo), "Project is not linked to GitHub (cannot redeploy via API)");

  const body = {
    name,
    project: projectId,
    target: "production",
    gitSource: {
      type: "github",
      ref: "main",
      ...(link.repoId ? { repoId: link.repoId } : {}),
      ...(link.repo ? { repo: link.repo } : {}),
      ...(link.org ? { org: link.org } : {}),
    },
  };

  const dep = await vercelApi(token, `/v13/deployments?teamId=${teamId}`, { method: "POST", body });
  assert(dep.ok, `Failed to create deployment (status ${dep.status})`);

  const url = dep.json?.url ? `https://${dep.json.url}` : null;
  console.log("[vercel-redeploy] created", {
    id: dep.json?.id || null,
    url,
    name: dep.json?.name || null,
    target: dep.json?.target || null,
  });
}

main().catch((err) => {
  console.error("[vercel-redeploy] fatal", { message: err?.message || String(err) });
  process.exit(1);
});

