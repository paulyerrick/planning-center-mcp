# Planning Center MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![MCP Compatible](https://img.shields.io/badge/MCP-compatible-blue)
![Version](https://img.shields.io/badge/version-1.0.0-green)
![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-brightgreen)

The first Model Context Protocol (MCP) server for Planning Center Online. It lets Claude (or any MCP-compatible AI) work directly with your church's PCO data — searching people, reviewing service schedules, checking volunteer gaps, tracking attendance, and more.

## Quick Start

**Recommended: Use the hosted server**

The easiest way to use this MCP is via the hosted server — no installation, no credentials to manage locally.

https://pco-mcp.cokistudio.com/connect/planning-center

**Or self-host**

If you'd prefer to run your own instance, see the [Self-Hosting](#self-hosting) section below.

## Self-Hosting

### Prerequisites

- **Node.js 22.13+**
- **pnpm 11+**
- An active **Planning Center Online** account
- A **Personal Access Token** (Application ID + Secret)

### Getting a Planning Center Personal Access Token

1. Log in at [api.planningcenteronline.com/oauth/applications](https://api.planningcenteronline.com/oauth/applications)
2. Click **New Personal Access Token**
3. Name it (e.g., "Claude AI Assistant")
4. Select the apps: **Services, People, Groups, Registrations, Check-Ins**
5. Copy the **Application ID** and **Secret** — store them safely

### Installation

For non-developer setup, start with [INSTALL.md](./INSTALL.md).

```bash
git clone https://github.com/your-org/planning-center-mcp.git
cd planning-center-mcp
pnpm install
cp .env.example .env
# Edit .env with your PCO_APP_ID and PCO_SECRET
pnpm run build
```

If you already have MCPs installed, add this server block to your Claude Desktop config:

```json
"planning-center": {
  "command": "node",
  "args": ["/absolute/path/to/planning-center-mcp/dist/index.js"],
  "env": {
    "PCO_APP_ID": "your_app_id_here",
    "PCO_SECRET": "your_secret_here"
  }
}
```

### Test the Connection

Then, in the terminal, run this from the project directory:

```bash
pnpm run test:connection
```

This verifies your credentials and checks access to each PCO module.

### Add to Claude Desktop

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

### Add to Claude Code

```bash
claude mcp add planning-center -- node /absolute/path/to/planning-center-mcp/dist/index.js
```

Set environment variables in your shell or `.env` file before launching.

## Available Tools

| Tool | Module | Description |
|---|---|---|
| `pco_get_service_types` | Services | List all service types |
| `pco_get_upcoming_services` | Services | Upcoming plans for a service type |
| `pco_get_plan_teams` | Services | Team scheduling status for a plan |
| `pco_get_unfilled_positions` | Services | Unfilled volunteer slots in upcoming services |
| `pco_get_service_attendance` | Services | Headcount for a past service |
| `pco_search_songs` | Services | Search the song library |
| `pco_search_people` | People | Search for people by name or email |
| `pco_get_person` | People | Full profile for a specific person |
| `pco_list_saved_lists` | People | All saved people lists |
| `pco_get_people_by_list` | People | Everyone in a saved list |
| `pco_get_new_people` | People | People added in the last N days |
| `pco_get_group_types` | Groups | All group types |
| `pco_list_groups` | Groups | Active groups with member counts |
| `pco_get_group_members` | Groups | Members of a specific group |
| `pco_get_groups_without_leader` | Groups | Groups with no leader assigned |
| `pco_get_upcoming_group_events` | Groups | Upcoming group events |
| `pco_list_events` | Registrations | Upcoming registration events |
| `pco_get_event_registrations` | Registrations | All registrants for an event |
| `pco_get_registration_summary` | Registrations | Counts and capacity for an event |
| `pco_get_checkin_events` | Check-Ins | All check-in events |
| `pco_get_attendance_summary` | Check-Ins | Headcount for a date range |
| `pco_get_first_time_visitors` | Check-Ins | First-time check-ins in a date range |
| `pco_get_check_in_trend` | Check-Ins | Week-by-week headcount trend |
| `pco_get_giving_summary` | Giving | Giving totals and payment method breakdown |
| `pco_get_donations` | Giving | Donations with optional date filters |
| `pco_get_funds` | Giving | Giving funds |
| `pco_get_giving_trends` | Giving | Week-by-week giving trends |
| `pco_correlate_giving_attendance` | Analytics | Cross-module giving and attendance overlap |
| `pco_correlate_groups_attendance` | Analytics | Cross-module groups and attendance overlap |
| `pco_weekend_readiness` | Workflows | One-shot readiness report for upcoming services and volunteer gaps |
| `pco_guest_followup` | Workflows | First-time guest follow-up and return-visit detection |
| `pco_ministry_health_summary` | Workflows | Executive health summary across People, Check-Ins, Giving, and Groups |
| `pco_connection_status` | Workflows | Verifies PCO credentials and module access after install |
| `pco_dashboard_snapshot` | Workflows | Chart-ready dashboard data for Claude artifacts |
| `pco_service_review_packet` | Workflows | Post-weekend service review packet with remembered feedback |
| `pco_record_service_feedback` | Workflows | Stores service wins/issues/recommendations for future planning memory |
| `pco_capabilities_guide` | Onboarding | Explains what the connector can do and best prompts to try |

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
pnpm run dev          # Watch mode with tsx
pnpm run typecheck    # Type check without building
pnpm run build        # Build to dist/
pnpm test             # Build and run Playwright MCP stdio tests
pnpm start            # Run the built server
```

## About

Built and maintained by Paul Yerrick / COKI Studio LLC.

This is an independent, community-built MCP server for Planning Center Online — not officially affiliated with or endorsed by Planning Center.

- Website: cokistudio.com
- Author: Paul Yerrick

## License

Released under the MIT License. See [LICENSE](LICENSE) for details.
