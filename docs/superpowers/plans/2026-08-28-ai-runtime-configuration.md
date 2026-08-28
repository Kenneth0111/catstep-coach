# AI Runtime Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize runtime TokenHub configuration for all AI cloud functions without exposing credentials to clients.

**Architecture:** A shared module reads `runtime_settings/ai_provider` on every provider construction and returns a validated all-or-nothing configuration, falling back to the existing environment variables. Each of the four function entries passes its server database and environment to that module.

**Tech Stack:** TypeScript, CloudBase Node SDK, Vitest.

## Global Constraints

- Keep existing uncommitted Today UI files unchanged.
- Never place a real API Key in source, tests, docs, output, or logs.
- Do not cache provider configuration; the next AI request observes a saved configuration update.
- Preserve environment-variable fallback for migration; do not deploy or commit.

---

### Task 1: Shared runtime configuration module

**Files:**
- Create: `cloudfunctions/shared/ai-runtime-config.ts`
- Test: `tests/ai-runtime-config.test.ts`

**Interface:** `loadAiRuntimeConfiguration(database, env): Promise<{ apiKey: string; model: string; baseUrl?: string } | null>`.

- [ ] Write tests for document precedence, next-read update visibility, invalid-document fallback, and no mixed sources.
- [ ] Run the focused test and confirm it fails because the module is absent.
- [ ] Implement the minimal database reader and whole-document validation.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Route all AI entry points through the shared module

**Files:**
- Modify: `cloudfunctions/goal-next-step/index.ts`
- Modify: `cloudfunctions/plan-generate/index.ts`
- Modify: `cloudfunctions/plan-resize-task/index.ts`
- Modify: `cloudfunctions/review-generate/index.ts`
- Test: `tests/ai-runtime-config.test.ts`

- [ ] Add a failing structural regression test requiring all four entries to use the module and prohibiting direct `TOKENHUB_*` reads.
- [ ] Run it and confirm it fails.
- [ ] Make the minimal entry-point changes; retain existing provider-specific behavior.
- [ ] Re-run focused tests.

### Task 3: Document secure migration and operation

**Files:**
- Modify: `docs/development.md`
- Modify: `README.md`

- [ ] Replace four-function environment-variable configuration instructions with the one-document operational procedure, migration fallback, no-cache semantics, and `runtime_settings` client-deny requirement.
- [ ] Run the complete test suite, root typecheck, all four cloud-function builds, and `git diff --check`.
