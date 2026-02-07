# Universal Runbook — Cursor + Human Workflow

**Purpose:** Use in **any** project. Aligns Cursor with your setup so we don’t waste prompts on repeated basics. When you say *“read the Runbook_universal and let’s start”*, we’re aligned.

**Primary language:** English. Translation/locale is handled per project/zone.

---

## 1) What Cursor Assumes (do not re-ask)

- **CLI:** You have (or the project has) **Vercel**, **Railway**, **Supabase**, **Git**, and when relevant **n8n** CLI/tooling. Cursor uses them (e.g. `npx vercel`, `npx railway`, `npx supabase`, `git`). **Do not ask** “Do you want me to verify CLI is installed?” — use it.
- **Secrets:** You keep a **`.env.local`** (or equivalent) with keys, tokens, API keys. Cursor **reads** it when needed and **never prints** secrets, keys, or passwords in output.
- **Docker:** When the project uses Docker, assume it is **installed and running**. Do not suggest “you need to install Docker” unless there is a concrete error showing it’s missing.
- **Vercel / Railway / Supabase:** Cursor can sync env from `.env.local` via scripts or CLI. Do not say “you need to add keys in Vercel” when a sync script exists and Cursor can run it.
- **Git:** When a task is “fix / finalize / blockeer” or “complete the work”, **close with commit + push** to the target branch (usually `main`) unless you explicitly say “no push” or “local commit only”.

---

## 2) What Cursor Does Not Ask (save prompts)

- “Do you want me to verify environment variables in Vercel?” → **Just verify/sync** when it’s part of the task.
- “Do you want a push to GitHub?” → **Push** when the work is done (see §1).
- “Should I add the keys to Supabase / Vercel?” → **Use** `.env.local` and **sync** via existing scripts (e.g. `vercel:sync-env`, `railway:sync-n8n-env`).
- “Do you have Docker installed?” → **Assume yes** unless the context says otherwise.
- “Would you like the images to auto-adjust?” / “Would you like the app to work on any device?” → **Do the obvious** (responsive/images) when it’s in scope; don’t spend a prompt asking.

---

## 3) CLI and Tools (how Cursor behaves)

- **Before claiming** “CLI not installed” or “I can’t run X”:
  - **Windows (PowerShell):** try `where <tool>` (e.g. `where vercel`, `where git`).
  - **Fallback:** `npx <tool> --version` or project scripts in `package.json`.
- **Supabase (Windows):** if the repo uses a local binary, prefer it (e.g. `.\supabase\tools\supabase.exe` if documented). For Edge Functions, use flags the project expects (e.g. `--use-api` where documented).
- **Railway:** `npx railway link` to the **correct service** (Worker vs n8n) before running sync scripts. Worker env ≠ n8n env.
- **n8n:** Workflows can be imported/activated via API when `N8N_API_KEY` and `N8N_WEBHOOK_URL` (public base URL) are in `.env.local`. Otherwise: import JSON in UI and activate.

---

## 4) Environment and Sync (no prints of secrets)

- **Source of truth (local):** `.env.local`.
- **Vercel:** Sync with project script (e.g. `npm run vercel:sync-env`) which reads `.env.local` and pushes only listed keys. Requires `VERCEL_TOKEN` in `.env.local` when the script uses the API.
- **Railway Worker:** Script (e.g. `railway:sync-worker-env`) syncs e.g. `MP26_BASE_URL`, `CRON_SECRET` from `.env.local`. Requires `railway link` to the **Worker** service.
- **Railway n8n:** Script (e.g. `railway:sync-n8n-env`) syncs e.g. `N8N_WEBHOOK_TOKEN`, `FACEBOOK_CENTRO_PAGE_ID`, `FACEBOOK_CENTRO_PAGE_TOKEN`. Requires `railway link` to the **n8n** service.
- **Supabase:** Migrations with `supabase db push` or equivalent; secrets stay in Supabase dashboard or CI; Cursor does not echo them.

---

## 5) AI / Marleny Synthetic Intelligence (MSI)

- **Primary AI:** Marleny Synthetic Intelligence (MSI) is used as primary where configured; other AIs are rotated as needed.
- **API keys:** It’s **normal** to report “this API key is invalid or rate-limited” and suggest rotation or fallback. Don’t spend multiple prompts re-explaining that “we use .env.local and MSI”.

---

## 6) Workflow (reconnect / new session)

1. **Read** project runbooks first (e.g. `START_HERE.md`, `RECONNECT.md`, this `Runbook_universal.md`).
2. **Pull** repo, `npm ci` (or equivalent), run any smoke/verify the project defines.
3. **Do the task:** use CLI, scripts, `.env.local`; never print secrets.
4. **Verify:** run project checks (e.g. `npm run smoke`, `npm run verify:connections`).
5. **Close:** commit + push unless you said “no push” or “local only”.

---

## 7) n8n (Railway)

- **Import workflow:** From repo file (e.g. `docs/automation/n8n-centro-informativo-facebook.json`) — via **Import from file** in UI, or via API with `n8n:ensure-centro-facebook`-style script if `N8N_API_KEY` and public `N8N_WEBHOOK_URL` are set.
- **Env on n8n service:** Set in Railway for the **n8n** service (e.g. `N8N_WEBHOOK_TOKEN`, `FACEBOOK_CENTRO_PAGE_ID`, `FACEBOOK_CENTRO_PAGE_TOKEN`). Use `railway:sync-n8n-env` with `railway link` to n8n.
- **Activate:** Workflow must be **active** (toggle ON) so the webhook responds. Scripts that create/update via API should set `active: true`.

---

## 8) Vercel

- **Env:** Prefer project sync script over manual “add in dashboard”. Script reads `.env.local` and updates only the keys it knows; no secrets in logs.
- **Build/deploy:** After push, Vercel deploys by integration. Cursor can run `vercel --prod` or `vercel env pull` when the task requires it, without asking “do you want me to deploy?”.

---

## 9) GitHub

- **Push:** After fixes or “finish this”, run `git add`, `git commit`, `git push` to the target branch. On Windows, if push fails with `protocol error: bad line length character: Micr`, use:
  - `$env:GIT_SSH_COMMAND = 'ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new'; git push origin main`
- **Don’t ask** “Do you want a push?” when the work is clearly done.

---

## 10) One prompt = full chain

- When the user describes a multi-step goal (e.g. “configure Facebook publishing end-to-end”), **execute the full chain**: env check → sync to Vercel/Railway/n8n → import/activate workflow → verify → commit + push. Report only results and any **real** blockers (e.g. “Facebook token rejected by Meta”), not “would you like me to do step 2?”.

---

## 11) Exceptions

- **Explicit “no push” / “local commit only”** → commit only, no push.
- **Explicit “don’t sync env”** → skip env sync.
- **Real blocker** (e.g. 401 from n8n API, Meta token invalid) → report clearly and suggest the **one** fix (e.g. “enable n8n API and set N8N_API_KEY in .env.local”), not a long list of “you could also…”.

---

*Use this runbook in any project. Copy or link it into `docs/runbooks/` or `.cursor/rules` as needed. When starting: “Read Runbook_universal and let’s start.”*
