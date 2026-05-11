# Remote MCP Deployment — CokiStudio Alpha

This guide gets the hosted Claude Custom Connector running at:

```text
https://pco-mcp.cokistudio.com
```

Claude connector URL format:

```text
https://pco-mcp.cokistudio.com/mcp/YOUR_CONNECTOR_TOKEN
```

## 1. Supabase Setup

1. Open Supabase.
2. Choose your project or create a new one.
3. Go to **SQL Editor**.
4. Run the SQL in:

```text
supabase/schema.sql
```

5. Go to **Project Settings → API**.
6. Copy:
   - Project URL → `SUPABASE_URL`
   - Service role key → `SUPABASE_SERVICE_ROLE_KEY`

Security note: never put the service role key in frontend code or Claude chat.

## 2. Planning Center OAuth App

Use the Planning Center account `paul@cokistudio.com`.

1. Open:

```text
https://api.planningcenteronline.com/oauth/applications
```

2. Create a new OAuth application.
3. Name:

```text
CokiStudio Planning Center MCP
```

4. Redirect URI:

```text
https://pco-mcp.cokistudio.com/oauth/planning-center/callback
```

5. Save and copy:
   - Client ID → `PCO_CLIENT_ID`
   - Client Secret → `PCO_CLIENT_SECRET`

## 3. Render Setup

1. Go to Render.
2. Click **New → Web Service**.
3. Connect the GitHub repo:

```text
paulyerrick/planning-center-mcp
```

4. Use these settings:

```text
Name: pco-mcp
Environment: Node
Region: closest to you
Branch: main
Build Command: corepack enable && pnpm install --frozen-lockfile && pnpm run build
Start Command: pnpm run start:remote
```

5. Add environment variables:

```env
NODE_VERSION=20
PUBLIC_BASE_URL=https://pco-mcp.cokistudio.com
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
TOKEN_ENCRYPTION_KEY=generate_a_long_random_secret
OAUTH_STATE_SECRET=generate_a_long_random_secret
PCO_CLIENT_ID=your_planning_center_oauth_client_id
PCO_CLIENT_SECRET=your_planning_center_oauth_client_secret
PCO_REDIRECT_URI=https://pco-mcp.cokistudio.com/oauth/planning-center/callback
PCO_SCOPES=people services groups check_ins registrations giving calendar
```

Generate secrets locally with:

```bash
openssl rand -base64 48
```

Use a different value for `TOKEN_ENCRYPTION_KEY` and `OAUTH_STATE_SECRET`.

6. Deploy.
7. Render will give you a URL like:

```text
https://pco-mcp.onrender.com
```

Open:

```text
https://pco-mcp.onrender.com/health
```

Expected response:

```json
{"ok":true,"name":"planning-center-mcp-remote"}
```

## 4. GoDaddy DNS Setup

In GoDaddy:

1. Open **My Products → Domains → cokistudio.com → DNS**.
2. Add a DNS record:

```text
Type: CNAME
Name: pco-mcp
Value: your-render-hostname.onrender.com
TTL: 1 hour or default
```

Important: use the Render hostname only, without `https://`.

Example:

```text
pco-mcp  CNAME  pco-mcp.onrender.com
```

3. In Render, go to your service → **Settings → Custom Domains**.
4. Add:

```text
pco-mcp.cokistudio.com
```

5. Wait for DNS/SSL verification.
6. Test:

```text
https://pco-mcp.cokistudio.com/health
```

## 5. First Hosted Connection Test

Open:

```text
https://pco-mcp.cokistudio.com/connect/planning-center
```

You should be redirected to Planning Center.

After approving, you should see a page with a Remote MCP server URL like:

```text
https://pco-mcp.cokistudio.com/mcp/pco_xxxxx
```

Copy that URL.

## 6. Add to Claude Custom Connector

In Claude:

1. Open **Settings**.
2. Go to **Connectors**.
3. Choose **Add custom connector**.
4. Name:

```text
Planning Center
```

5. Remote MCP server URL:

```text
https://pco-mcp.cokistudio.com/mcp/pco_xxxxx
```

6. Save.

## 7. Test in Claude

Ask:

```text
Check my Planning Center connection status.
```

Then:

```text
List our Planning Center service types.
```

Then:

```text
What might break this Sunday?
```

## Alpha Security Notes

- The MCP URL contains a secret connector token. Treat it like a password.
- Revoke a connector by setting `revoked_at = now()` for its row in `connector_tokens`.
- Tokens are encrypted before being stored in Supabase.
- Raw connector tokens are not stored; only SHA-256 hashes are stored.
- This is a private alpha flow, not a full multi-tenant SaaS account system yet.
