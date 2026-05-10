# Planning Center MCP — User Install Guide

This guide connects Planning Center Online to Claude Desktop or another MCP-compatible AI client.

## What You Need

- A Planning Center account
- Permission to create a Planning Center Personal Access Token
- Node.js 20 or newer
- pnpm 11 or newer
- This project downloaded on your computer

## 1. Create Planning Center API Credentials

1. Open: https://api.planningcenteronline.com/oauth/applications
2. Sign in to Planning Center.
3. Choose **New Personal Access Token**.
4. Name it something clear, for example: `Claude Planning Center MCP`.
5. Copy both values:
   - **Application ID**
   - **Secret**

Keep these private. They allow read access according to your Planning Center permissions.

## 2. Install and Build the MCP Server

### Option A — From this project folder

Open Terminal:

```bash
cd /path/to/planning-center-mcp
pnpm install
pnpm run build
```

### Option B — After this package is published

Once published to npm, you will not need to clone the repo. Your Claude config can run it directly with `npx` or `pnpm dlx`.

```bash
pnpm dlx planning-center-mcp
```

For now, use Option A.

Optional connection check:

```bash
PCO_APP_ID="your_application_id" \
PCO_SECRET="your_secret" \
pnpm run test:connection
```

If this works, the MCP server can reach Planning Center.

## 3. Add It to Claude Desktop

Find Claude Desktop's config file.

Common macOS path:

```text
~/Library/Application Support/Claude/claude_desktop_config.json
```

Add this block. Replace the path and credentials:

```json
{
  "mcpServers": {
    "planning-center": {
      "command": "node",
      "args": ["/absolute/path/to/planning-center-mcp/dist/index.js"],
      "env": {
        "PCO_APP_ID": "your_application_id",
        "PCO_SECRET": "your_secret"
      }
    }
  }
}
```

Important: `args` must use the full absolute path to `dist/index.js`.

Restart Claude Desktop after saving.

## 4. Try These First Prompts

Start simple:

```text
Check my Planning Center connection status.
```

```text
What Planning Center tools do you have available?
```

```text
List our Planning Center service types.
```

Then use one of the returned service type IDs:

```text
Using service type ID 12345, run a weekend readiness report for the next 7 days.
```

```text
Who visited for the first time this month and has not returned yet?
```

```text
Give me a ministry health summary for this month across people, attendance, giving, and groups.
```

Other useful prompts:

```text
Search Planning Center People for Jane Smith.
```

```text
Show me upcoming services for this service type.
```

```text
Find unfilled volunteer positions for this Sunday.
```

```text
What might break this Sunday?
```

## 5. Troubleshooting

### Claude does not show Planning Center tools

- Restart Claude Desktop.
- Confirm `dist/index.js` exists by running `pnpm run build`.
- Confirm the config uses an absolute path.
- Confirm the JSON config is valid.

### Authentication failed

- Re-copy the Application ID and Secret from Planning Center.
- Confirm there are no extra spaces.
- Confirm your Planning Center user has access to the modules you are asking about.

### A module says access denied

Your token only has the permissions your Planning Center user has. For example, Giving, Groups, Check-Ins, or Services may require additional Planning Center permissions.

### The AI gives too much raw data

Ask for an operational summary:

```text
Summarize this for a church operations meeting. Give me only risks, recommended actions, and names/IDs I need to follow up on.
```

## Security Notes

- This MCP runs locally on your computer.
- Do not paste your PCO secret into chat messages.
- Put credentials only in the Claude MCP config `env` block or your local shell environment.
- Start with read-only questions. Do not add write tools until you trust the setup.
