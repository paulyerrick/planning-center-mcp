/** PCO domain knowledge prompt for MCP */

export const PCO_CONTEXT_PROMPT = {
  name: 'pco-context',
  description: 'Planning Center domain knowledge — data model, API quirks, and analytical defaults for working with church management data.',
  arguments: [],
};

export const PCO_ONBOARDING_PROMPT = {
  name: 'pco-onboarding',
  description: 'Planning Center MCP onboarding — start here to discover capabilities, best prompts, and first workflow recommendations.',
  arguments: [],
};

export const PCO_CONTEXT_CONTENT = `# Planning Center Online — Domain Knowledge

## Data Model

**Services:** ServiceType → Plan → PlanTime. Plans have Teams and TeamMembers (with scheduling status: C=Confirmed, U=Unscheduled, D=Declined, P=Pending). Plans also have Items (songs/headers/media). Songs live in a global library and get referenced by plan items.

**People:** Person → Emails, PhoneNumbers, Addresses, Households. People are the central record across all PCO modules. Lists are pre-built filters/segments created by staff.

**Groups:** GroupType → Group → Memberships. Groups have Events. Membership roles are either "leader" or "member".

**Registrations:** Event → Attendee. Events have capacity limits. Attendees may have custom field answers and payment status.

**Check-Ins:** Event → EventPeriod → CheckIn. Headcounts are stored on EventPeriod records (regular_count, guest_count, volunteer_count), not on individual check-in records. First-time guests have kind === "first_time".

## API Conventions

- All responses are JSON:API format — always extract data.attributes before using fields
- IDs are strings, not integers — never cast to Number
- Pagination is mandatory — never assume a single page has all records — always check meta.total_count
- Filter syntax is where[field]=value — NOT OData, NOT SQL
- Included related records land in a top-level "included" array — match by type + id
- Rate limit is 100 requests per 10 seconds — if you get a 429, wait 10 seconds and retry
- Some modules (like Giving) require special access — a 403 may mean the module isn't enabled

## Analytical Defaults

- When asked about attendance trends, compare the current window vs the prior equivalent window
- When volunteer gaps come up, lead with the most urgent (this week's unfilled positions) before longer-horizon issues
- When asked about groups, distinguish between group types (small groups vs serving teams behave differently)
- Flag data quality issues (lists that haven't updated, events with no registrations but capacity set, groups with no leader) rather than hiding them
- Disambiguate: "service" can mean a Sunday worship service (Services module) or a check-in event (Check-Ins module) — ask if unclear
`;

export const PCO_ONBOARDING_CONTENT = `# Planning Center MCP — Onboarding

You are connected to Planning Center through an MCP connector. Start by calling pco_capabilities_guide and pco_connection_status.

Then explain the highest-value things this connector can do:

1. Weekend readiness: volunteer gaps, pending confirmations, declined positions, service risks.
2. Guest follow-up: first-time guests, return visits, who needs follow-up.
3. Visual dashboards: chart-ready data for attendance, giving, groups, volunteers, and ministry health.
4. Post-service reviews: pull a review packet, record wins/issues, and recall feedback for future planning.
5. Cleanup: duplicate/inactive service types, empty groups, module permission gaps.

Ask the user which workflow they want to try first. If they are unsure, recommend:

- "Check my Planning Center connection status."
- "List our active weekend service types."
- "What might break this Sunday?"
- "Create a dashboard snapshot for this month."
- "Pull a service review packet for our most recent weekend service."
`;

