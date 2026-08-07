# CatstepCoach Day 2 Completion Design

## Goal

Complete the Day 2 MVP vertical slice so a signed-in user can clarify a study or work goal, confirm and save the structured goal, choose today's available time, and receive a validated AI-generated or deterministic fallback plan.

## Scope

This slice contains four deliverables:

1. A deployable `plan.generate` CloudBase function.
2. A single-page goal clarification and first-plan flow in the Mini Program.
3. A deployable, idempotent `goal.confirm` CloudBase function that isolates data by WeChat identity.
4. A safe TokenHub smoke-test path and deployment checklist for real-environment verification.

The slice does not implement task execution persistence, plan editing, reminders, reviews, growth, quotas, AI-call accounting, or production deployment. Those remain later-day work.

## User Flow

The Mini Program adds one guided goal page with explicit stages:

1. Select `study` or `work` and enter a non-empty goal title.
2. Call `goal-next-step` and show at most one clarification question at a time.
3. Append each answer with its `field`, original question, and answer, then request the next step.
4. When a structured summary is returned, show every summary field for review.
5. On confirmation, call `goal-confirm` with a client-generated request ID.
6. After the goal is saved, choose 15, 30, or 60 available minutes.
7. Call `plan-generate` with the saved goal ID and selected duration.
8. Show the returned plan, including whether it came from AI, repair, or deterministic fallback.

The page keeps only transient draft state. Confirmed goals are stored server-side. Generated plans remain previews in this slice; plan persistence and editing belong to the following delivery stage.

## Visual Direction

The page extends the existing warm paper-and-ink aesthetic rather than introducing a new component system. It uses the existing cream background, forest-green primary actions, ochre hand-drawn accents, rounded paper cards, and generous vertical spacing.

The memorable element is a visible "cat-step trail": three small paw-like stage marks connect goal, clarification, and first plan. The current stage is filled in ochre, completed stages use forest green, and future stages remain outlined. Motion is limited to native pressed states and a short content fade so the flow stays calm and accessible.

## Client Architecture

`miniprogram/shared/goal-flow.ts` owns a pure state machine and input validation. It receives domain events and returns the next serializable page state. This keeps WeChat platform calls out of business logic and allows Vitest coverage without emulating the Mini Program runtime.

`miniprogram/shared/cloud-api.ts` is the narrow transport boundary around `wx.cloud.callFunction`. It maps function results into typed success or stable error results without exposing platform response shapes to the page.

`miniprogram/pages/goal/index.ts` orchestrates the state machine and transport. WXML renders the current stage; WXSS implements the existing hand-drawn visual language. The page does not access TokenHub or database collections directly.

The goal page becomes the first page in `app.json` for the incomplete-onboarding MVP. A successful first-plan result stays on the page as a preview; navigation to the existing Today page is not added until plan persistence exists.

## Backend Architecture

### `goal-confirm`

The function obtains `OPENID` from `getCloudbaseContext`. Its service validates the summary, checks whether `(openid, requestId)` already exists, and returns the existing goal for a repeated request. Otherwise it writes one document to `goals` containing:

- `_openid`
- `owner`
- `type`
- `title`
- `successCriteria`
- `deadline`
- `currentProgress`
- `stage`
- `excludedContent`
- `status: "active"`
- `requestId`
- `createdAt`

The server derives a deterministic document ID from the authenticated owner and `requestId`, then returns it as `goal.id`. This makes concurrent retries converge on one document. Clients cannot provide `owner`, `_openid`, status, timestamps, or document IDs.

### `plan-generate`

The function authenticates first, then accepts only `availableMinutes` and a list of goal IDs. A repository loads active goals using both `_openid` and the requested IDs. Generation proceeds only when every requested ID belongs to the current user.

The handler calls the existing `generateDailyPlan()` module with server-verified constraints. It uses the TokenHub `AIProvider`, a workflow-specific prompt, the existing one-retry/one-repair behavior, and the deterministic fallback. It does not persist the preview plan.

### Shared TokenHub boundary

The TokenHub transport remains OpenAI Chat Completions compatible and uses `TOKENHUB_API_KEY`, `TOKENHUB_MODEL`, and optional `TOKENHUB_BASE_URL`. Goal and plan prompts remain separate. The concrete transport is shared by both deployable functions without adding an SDK dependency beyond native Node.js `fetch`.

## Public Results and Errors

All functions return discriminated objects and never expose caught errors, API keys, upstream bodies, or database details.

- `UNAUTHENTICATED`: no trusted WeChat identity.
- `INVALID_CONTEXT`: malformed client data, invalid goal summary, unavailable duration, or a goal not owned by the caller.
- `MISCONFIGURED`: required server-only TokenHub configuration is absent.
- `INTERNAL_ERROR`: unexpected server failure.

Model transport failure is not a public error when deterministic fallback succeeds. The plan UI labels fallback output plainly and remains usable.

## Idempotency and Security

- `goal.confirm` requires a non-empty request ID and deduplicates within the authenticated user.
- All goal reads and writes include the trusted `_openid`; client ownership fields are ignored because none are accepted.
- `plan.generate` derives valid goal constraints from the database instead of trusting client-supplied ownership.
- TokenHub credentials exist only in CloudBase runtime configuration or local environment variables used for an explicit smoke test.
- The smoke test sends a synthetic, non-personal goal and prints only status, model, latency, and structural success. It never prints the API key or full upstream response.

## Testing Strategy

Every behavioral addition follows red-green-refactor.

- Goal confirmation service tests cover new save, idempotent replay, invalid summary, and blank request ID.
- Goal confirmation handler tests cover authentication and stable public errors.
- Plan handler tests cover owner isolation, valid generation, fallback, invalid duration, authentication, and configuration.
- Prompt/TokenHub contract tests verify the plan workflow request and repair payload.
- Goal-flow state tests cover each stage, the three-question limit, answer retention, confirmation, duration selection, plan preview, retryable errors, and duplicate-submit prevention.
- Structure tests verify every Mini Program and CloudBase deployment file.
- Full Vitest, root typecheck, and all CloudBase builds must pass.

## Real-Environment Verification

Automated tests use injected fakes and do not spend TokenHub quota. A smoke command reads `TOKENHUB_API_KEY`, `TOKENHUB_MODEL`, and optional `TOKENHUB_BASE_URL` from the process environment, sends one synthetic structured request, validates the response, and exits non-zero on transport or structure failure.

The code task is complete when the smoke command is present, tested without network access, and documented. Real connectivity is complete only after the user configures a CloudBase development environment and TokenHub credentials. If those external values are unavailable, the handoff must report the live check as blocked rather than passed.

## Success Criteria

1. An authenticated user can complete the guided flow from goal title to a first plan preview.
2. No more than three clarification questions can be submitted.
3. Confirmed goals are idempotently stored and isolated by `_openid`.
4. `plan.generate` rejects missing or foreign goals before contacting TokenHub.
5. Valid model output, repaired output, timeout retry, and deterministic fallback all satisfy the existing plan contract.
6. No credential or environment ID is committed.
7. All automated tests, TypeScript checks, CloudBase builds, and whitespace checks pass.
8. Live TokenHub verification is either evidenced with a successful smoke result or explicitly reported as blocked by missing external configuration.
