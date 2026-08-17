# Day 5 Reliability and Privacy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver server-owned reminder state, AI daily quota protection, privacy disclosure, account deletion, and safe diagnostics.

**Architecture:** Add focused CloudBase functions for reminders and account deletion. Keep quota as a shared server-side repository invoked before AI providers. The client receives only stable public errors and can open the privacy page without holding sensitive configuration.

**Tech Stack:** Native WeChat Mini Program, TypeScript, CloudBase Node.js functions, Vitest.

## Global Constraints

- Work in the current repository and branch; do not create a worktree, commit, push, or open a PR.
- Obtain identity only from `WX_OPENID`; never trust client owner, date, quota or delete scope.
- Do not log secrets, OpenID, user text, upstream responses, prompts, or review bodies.
- Follow one red-green-refactor cycle per behavior and verify the red failure before production code.
- Do not attempt real subscription-message delivery without a configured template, explicit user authorization, and documented CloudBase scheduling configuration.

---

### Task 1: Shared public contracts and quota service

**Files:** `cloudfunctions/shared/ai-quota.ts`, AI workflow handlers, `tests/ai-quota.test.ts`, handler tests.

- [ ] Write failing quota tests for six allowed claims, seventh rejected claim, date rollover, and safe quota log.
- [ ] Run `npm.cmd test -- tests/ai-quota.test.ts` and confirm failure because the module is absent.
- [ ] Implement the smallest repository-backed quota claim interface and map rejection to `QUOTA_EXCEEDED` before creating a provider.
- [ ] Re-run the focused tests and confirm pass.

### Task 2: Reminder state machine

**Files:** `cloudfunctions/reminder-schedule/*`, `cloudfunctions/reminder-dispatch/*`, `tests/reminder-*.test.ts`.

- [ ] Write failing service and handler tests for identity, two allowed reminder kinds, idempotent scheduling, due dispatch, and sanitized failure.
- [ ] Run focused tests and confirm failures because the functions are absent.
- [ ] Implement minimal repositories and handlers using `_openid`, server Shanghai date, request IDs, and `pending`/`sent`/`failed` states.
- [ ] Re-run focused tests and confirm pass.

### Task 3: Account deletion and privacy client

**Files:** `cloudfunctions/account-delete/*`, `miniprogram/pages/profile/*`, `miniprogram/app.json`, `miniprogram/shared/cloud-api.ts`, tests.

- [ ] Write failing tests for current-user-only deletion, complete collection deletion requests, sanitized audit events, and privacy page/client call structure.
- [ ] Run focused tests and confirm failures because the function/page are absent.
- [ ] Implement deletion handler and minimal privacy page; require explicit UI confirmation and display stable errors.
- [ ] Re-run focused tests and confirm pass.

### Task 4: Verification and deploy guide

**Files:** `docs/development.md`, relevant structure tests.

- [ ] Add the new functions to build and deployment guidance, including external configuration and real CloudBase acceptance limits.
- [ ] Run `npm.cmd test`, `npm.cmd run typecheck`, and builds for every affected function.
- [ ] Inspect `git diff --check` and `git status --short`; do not commit.
