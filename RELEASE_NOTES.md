# Release Notes — Planning Center MCP 1.0.0 Alpha

## Positioning

Planning Center MCP is now moving from a raw API wrapper toward a read-only church ops copilot for Planning Center Online.

Best first use cases:

1. Weekend readiness
2. First-time guest follow-up
3. Ministry health summaries
4. Connection/module diagnostics

## New Workflow Tools

### `pco_weekend_readiness`

Answers:

```text
What might break this Sunday?
```

Returns upcoming plans, volunteer status counts, urgent gaps, API warnings, and recommended actions.

### `pco_guest_followup`

Answers:

```text
Who visited recently and has not returned yet?
```

Returns first-time visitors, return-visit detection, follow-up priority, and recommended actions.

### `pco_ministry_health_summary`

Answers:

```text
Give me a ministry health summary for this month.
```

Returns People, Check-Ins, Giving, and Groups summary data with module warnings and recommended actions.

### `pco_connection_status`

Answers:

```text
Is my Planning Center connection working?
```

Checks credentials and module access for Account, Services, People, Groups, Registrations, Check-Ins, and Giving.

## Reliability Improvements

- Migrated package management to pnpm.
- Added package `bin` metadata for future `npx` / `pnpm dlx` usage.
- Added `PCO_BASE_URL` override for deterministic tests and mocks.
- Added retry/backoff for HTTP `429`, `502`, `503`, and `504`.
- Fixed Services plan endpoints to use `serviceTypeId + planId`.
- Added Playwright MCP stdio e2e test harness.

## User Docs

- Added `INSTALL.md` for user-friendly Claude Desktop setup.
- README now points to install guide and uses pnpm commands.
- Added first prompts and troubleshooting notes.

## Validation

Current validation commands:

```bash
pnpm run typecheck
pnpm test
pnpm pack --dry-run
```

Latest result:

```text
7 Playwright tests passed
package dry-run succeeded
```

## Known Alpha Risks

- Planning Center module permissions vary by user/token.
- Some PCO APIs expose UI concepts incompletely or inconsistently.
- Giving and cross-module summaries may require elevated permissions.
- Workflows are read-only by design; write/actions should remain out of scope until read-only usage is proven.
- Package metadata is ready, but npm publish has not been performed.

## Suggested Alpha Ask

Ask each tester:

```text
What are 3 questions you wish Planning Center could answer instantly?
```

Then watch whether their questions map to:

- weekend readiness
- guest follow-up
- ministry health
- people/search/reporting
- volunteer scheduling
