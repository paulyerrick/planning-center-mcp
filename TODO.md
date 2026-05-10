# TODO

## Goal
- [ ] Ship a reliable read-only Planning Center MCP for weekly church ops intelligence.

## Milestone 1 — Foundation
- [x] Migrate package management to pnpm only
- [x] Add `PCO_BASE_URL` for mocked tests
- [x] Add typecheck/build/test scripts
- [x] Ensure startup/errors/debug logs use stderr, not stdout
- [x] Add Playwright MCP stdio smoke tests

## Milestone 2 — Core Loop
- [x] Fix Services endpoint shapes requiring `serviceTypeId`
- [x] Add robust 429/transient HTTP backoff
- [x] Add `pco_weekend_readiness`
- [x] Add `pco_guest_followup`
- [x] Add `pco_ministry_health_summary`
- [x] Add `pco_connection_status` for onboarding/module diagnostics

## Milestone 3 — QA + Release
- [x] Add Playwright coverage target: 90% where MCP/browser-visible behavior exists
- [x] Implement first 3 core-loop Playwright tests
- [x] Run validation commands
- [ ] Expand mocked PCO fixture coverage across Services, Check-Ins, Giving, Groups
- [x] Add easy user install guide
- [x] Prepare npm package bin metadata for `npx` / `pnpm dlx`
- [x] Document release notes

## Open Risks
- [ ] PCO endpoint/API permission variance — mitigate with fixtures and clear errors
- [ ] Generic wrapper positioning — mitigate with workflow-first tools
- [ ] Rate limits — mitigate with backoff and metadata
- [ ] No UI/browser surface yet — Playwright currently validates MCP stdio protocol, not browser flows
