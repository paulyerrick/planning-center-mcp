# Planning Center MCP Server

The first Model Context Protocol (MCP) server for Planning Center Online. It lets Claude (or any MCP-compatible AI) work directly with your church's PCO data — searching people, reviewing service schedules, checking volunteer gaps, tracking attendance, and more. Deploy it by setting two environment variables.

## Prerequisites

- **Node.js 20+**
- An active **Planning Center Online** account
- A **Personal Access Token** (Application ID + Secret)

## Getting a Planning Center Personal Access Token

1. Log in at [api.planningcenteronline.com/oauth/applications](https://api.planningcenteronline.com/oauth/applications)
2. Click **New Personal Access Token**
3. Name it (e.g., "Claude AI Assistant")
4. Select the apps: **Services, People, Groups, Registrations, Check-Ins**
5. Copy the **Application ID** and **Secret** — store them safely

## Installation

```bash
git clone https://github.com/your-org/planning-center-mcp.git
cd planning-center-mcp
npm install
cp .env.example .env
# Edit .env with your PCO_APP_ID and PCO_SECRET
npm run build
```

If you already have mcps installed, copy paste this

```bash
 },
    "planning-center": {
      "command": "node",
      "args": [
        "/Users/paulyerrick/planning-center-mcp/dist/index.js"
      ],
      "env": {
        "PCO_APP_ID": "your_app_id_here",
        "PCO_SECRET": "your_secret_here"
      }
```bash

## Test the Connection

```bash
npm run test:connection
```

This verifies your credentials and checks access to each PCO module.

## Add to Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "planning-center": {
      "command": "node",
      "args": ["/absolute/path/to/planning-center-mcp/dist/index.js"],
      "env": {
        "PCO_APP_ID": "your_app_id_here",
        "PCO_SECRET": "your_secret_here"
      }
    }
  }
}
```

## Add to Claude Code

```bash
claude mcp add planning-center -- node /absolute/path/to/planning-center-mcp/dist/index.js
```

Set environment variables in your shell or `.env` file before launching.

## Available Tools

| Tool | Module | Description |
|---|---|---|
| `get_service_types` | Services | List all service types |
| `get_upcoming_services` | Services | Upcoming plans for a service type |
| `get_plan_teams` | Services | Team scheduling status for a plan |
| `get_unfilled_positions` | Services | Unfilled volunteer slots in upcoming services |
| `get_service_attendance` | Services | Headcount for a past service |
| `search_songs` | Services | Search the song library |
| `search_people` | People | Search for people by name or email |
| `get_person` | People | Full profile for a specific person |
| `list_saved_lists` | People | All saved people lists |
| `get_people_by_list` | People | Everyone in a saved list |
| `get_new_people` | People | People added in the last N days |
| `get_group_types` | Groups | All group types |
| `list_groups` | Groups | Active groups with member counts |
| `get_group_members` | Groups | Members of a specific group |
| `get_groups_without_leader` | Groups | Groups with no leader assigned |
| `get_upcoming_group_events` | Groups | Upcoming group events |
| `list_events` | Registrations | Upcoming registration events |
| `get_event_registrations` | Registrations | All registrants for an event |
| `get_registration_summary` | Registrations | Counts and capacity for an event |
| `get_checkin_events` | Check-Ins | All check-in events |
| `get_attendance_summary` | Check-Ins | Headcount for a date range |
| `get_first_time_visitors` | Check-Ins | First-time check-ins in a date range |
| `get_check_in_trend` | Check-Ins | Week-by-week headcount trend |

## Module Access Required

Each tool group requires the corresponding Planning Center module to be enabled on your account:

- **Services tools** — Planning Center Services
- **People tools** — Planning Center People
- **Groups tools** — Planning Center Groups
- **Registrations tools** — Planning Center Registrations
- **Check-Ins tools** — Planning Center Check-Ins

If a module isn't enabled, the tool will return a clear error message.

## Development

```bash
npm run dev          # Watch mode with tsx
npm run typecheck    # Type check without building
npm run build        # Build to dist/
npm start            # Run the built server
```

## License

MIT
