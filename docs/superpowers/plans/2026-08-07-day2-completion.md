# CatstepCoach Day 2 Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the authenticated goal-clarification-to-first-plan MVP flow with isolated goal persistence, deployable plan generation, a native Mini Program page, and a safe live TokenHub smoke path.

**Architecture:** Keep domain behavior in pure TypeScript modules, CloudBase identity/database work in thin handlers and repositories, and WeChat calls behind a typed client boundary. Reuse one shared TokenHub transport with separate goal and plan prompts; never trust client ownership fields.

**Tech Stack:** Native WeChat Mini Program, TypeScript 7, Vitest 4, CloudBase Node.js 20, `@cloudbase/node-sdk` 3.18.3, native `fetch`, TokenHub Chat Completions.

## Global Constraints

- Work directly in `D:\AllCode\Project\CatstepCoach`; do not create a Git worktree.
- Preserve unrelated user changes and modify only files named by a task.
- Follow red-green-refactor for every behavioral change.
- Do not hardcode or commit AppID, CloudBase environment ID, API key, or real user data.
- Do not deploy or push GitHub without explicit user authorization.
- Use `TOKENHUB_API_KEY`, `TOKENHUB_MODEL`, and optional `TOKENHUB_BASE_URL` for model configuration.
- Target CloudBase `Nodejs20.19`; configure AI functions with at least 20 seconds timeout.
- Keep generated `dist/`, `node_modules/`, private configuration, and smoke output out of Git.

---

### Task 0: Checkpoint the Completed Day 2 AI Core

**Files:**
- Commit: `cloudfunctions/shared/ai-provider.ts`
- Commit: `cloudfunctions/shared/daily-plan.ts`
- Commit: `cloudfunctions/shared/generate-daily-plan.ts`
- Commit: `cloudfunctions/shared/goal-next-step.ts`
- Commit: `cloudfunctions/shared/package.json`
- Commit: `cloudfunctions/goal-next-step/*.{ts,json}`
- Commit: `tests/daily-plan-generation.test.ts`
- Commit: `tests/daily-plan-validation.test.ts`
- Commit: `tests/goal-next-step.test.ts`
- Commit: `tests/goal-next-step-handler.test.ts`
- Commit: `tests/goal-cloudfunction-structure.test.ts`
- Commit: `tests/tokenhub-provider.test.ts`
- Commit: `README.md`
- Commit: `docs/development.md`

**Interfaces:**
- Produces: `AIProvider.generateStructured()`, `getNextGoalStep()`, `generateDailyPlan()`, and the deployable `goal-next-step` function used by later tasks.

- [ ] **Step 1: Verify the existing core before staging**

Run:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build --prefix cloudfunctions/profile-get-or-create
npm.cmd run build --prefix cloudfunctions/goal-next-step
```

Expected: 11 test files and 96 tests pass; both builds and typecheck exit zero.

- [ ] **Step 2: Stage only the listed Day 2 core files and check the patch**

Run `git add --` with the exact files above, followed by:

```powershell
git diff --cached --check
git diff --cached --stat
git status --short
```

Expected: the design commit remains separate and no private or generated file is staged.

- [ ] **Step 3: Commit the verified checkpoint**

```powershell
git commit -m "feat: add Day 2 AI workflow core"
```

Expected: one commit containing only the already verified AI core, tests, and documentation.

---

### Task 1: Share the TokenHub Transport and Add the Plan Prompt

**Files:**
- Create: `cloudfunctions/shared/tokenhub-provider.ts`
- Create: `cloudfunctions/plan-generate/prompt.ts`
- Delete: `cloudfunctions/goal-next-step/tokenhub-provider.ts`
- Modify: `cloudfunctions/goal-next-step/prompt.ts`
- Modify: `cloudfunctions/goal-next-step/index.ts`
- Modify: `cloudfunctions/goal-next-step/tsconfig.json`
- Modify: `tests/tokenhub-provider.test.ts`
- Create: `tests/daily-plan-prompt.test.ts`

**Interfaces:**
- Produces: `TokenHubChatMessage`, `TokenHubProviderOptions`, `TokenHubProviderError`, `createTokenHubProvider(options)`.
- Produces: `buildDailyPlanMessages(request): TokenHubChatMessage[]`.
- Consumes: `StructuredGenerationRequest` from `cloudfunctions/shared/ai-provider.ts`.

- [ ] **Step 1: Point the provider contract test at the shared module**

Change the test import to:

```ts
import { createTokenHubProvider } from '../cloudfunctions/shared/tokenhub-provider';
```

Run:

```powershell
npm.cmd test -- --run tests/tokenhub-provider.test.ts
```

Expected: FAIL because `cloudfunctions/shared/tokenhub-provider.ts` does not exist.

- [ ] **Step 2: Move the provider without changing behavior**

Move the existing implementation into `cloudfunctions/shared/tokenhub-provider.ts`. Define its message type locally:

```ts
export interface TokenHubChatMessage {
  role: 'system' | 'user';
  content: string;
}
```

Update `TokenHubProviderOptions.buildMessages` to return `TokenHubChatMessage[]`. Update the goal prompt and entry imports, and include `../shared/tokenhub-provider.ts` in the goal function build.

Run:

```powershell
npm.cmd test -- --run tests/tokenhub-provider.test.ts tests/goal-next-step-handler.test.ts
npm.cmd run build --prefix cloudfunctions/goal-next-step
```

Expected: both test files and the CloudBase build pass with the same request/error behavior.

- [ ] **Step 3: Write the failing daily-plan prompt test**

Add a test that calls `buildDailyPlanMessages()` with `workflow: 'generateDailyPlan'`, `promptVersion: 'daily-plan-v1'`, two allowed goal IDs, and 45 available minutes. Assert that:

```ts
expect(messages[0]?.content).toContain('1–5');
expect(messages[0]?.content).toContain('estimatedMinutes');
expect(messages[0]?.content).toContain('goalId');
expect(messages[1]?.content).toContain('daily-plan-v1');
```

Also pass a repair request and assert the user message contains `validationCode` and the malformed candidate.

Run:

```powershell
npm.cmd test -- --run tests/daily-plan-prompt.test.ts
```

Expected: FAIL because the plan prompt module does not exist.

- [ ] **Step 4: Implement the workflow-specific plan prompt**

Return two messages. The system message must require JSON only and this exact shape:

```json
{"summary":"...","tasks":[{"title":"...","action":"...","estimatedMinutes":30,"doneCriteria":"...","goalId":"...","reason":"...","difficulty":"easy|medium|hard"}]}
```

It must state: 1–5 tasks, total duration within `availableMinutes`, only listed goal IDs, no duplicate title/action pair, and no medical/legal/investment conclusions. Serialize the complete structured request into the user message so repair metadata reaches the model.

Run the prompt and provider tests again. Expected: PASS.

- [ ] **Step 5: Commit the shared transport and prompt**

```powershell
git add -- cloudfunctions/shared/tokenhub-provider.ts cloudfunctions/plan-generate/prompt.ts cloudfunctions/goal-next-step/prompt.ts cloudfunctions/goal-next-step/index.ts cloudfunctions/goal-next-step/tsconfig.json tests/tokenhub-provider.test.ts tests/daily-plan-prompt.test.ts
git add -u -- cloudfunctions/goal-next-step/tokenhub-provider.ts
git diff --cached --check
git commit -m "refactor: share TokenHub transport"
```

---

### Task 2: Persist Confirmed Goals Idempotently

**Files:**
- Create: `cloudfunctions/goal-confirm/service.ts`
- Create: `cloudfunctions/goal-confirm/handler.ts`
- Create: `cloudfunctions/goal-confirm/index.ts`
- Create: `cloudfunctions/goal-confirm/package.json`
- Create: `cloudfunctions/goal-confirm/tsconfig.json`
- Create: `tests/goal-confirm-service.test.ts`
- Create: `tests/goal-confirm-handler.test.ts`
- Create: `tests/goal-confirm-structure.test.ts`

**Interfaces:**
- Produces: `confirmGoal(openid, input, repository, now): Promise<ConfirmedGoal>`.
- Produces: `handleGoalConfirm(event, context, dependencies)`.
- Repository: `findByRequestId(openid, requestId)` and `save(goalWithoutId)`.
- Input: `{ requestId, type, summary }`, where `summary` matches the validated goal summary contract.

- [ ] **Step 1: Write failing service tests**

Cover these observable cases:

```ts
it('saves trusted ownership and server fields for a new request');
it('returns an existing goal for the same openid and requestId');
it('does not deduplicate the same requestId across different openids');
it.each([null, {}, { requestId: ' ', type: 'study', summary: validSummary }])(
  'rejects invalid confirmation input: %j',
);
```

For the new save, assert the repository receives `_openid` and `owner` from the function argument, `status: 'active'`, and the injected ISO timestamp. Run the test and verify the missing-module failure.

- [ ] **Step 2: Implement the smallest goal confirmation service**

Define:

```ts
export interface GoalConfirmationInput {
  requestId: string;
  type: 'study' | 'work';
  summary: GoalSummary;
}

export interface ConfirmedGoal extends GoalSummary {
  id: string;
  owner: string;
  type: 'study' | 'work';
  title: string;
  stage: string;
  status: 'active';
  requestId: string;
  createdAt: string;
}
```

Validate all strings and dense `excludedContent`; check the repository before saving. Map `summary.goal` to `title` and `summary.suggestedStage` to `stage`. Throw `GoalConfirmationError('INVALID_CONTEXT')` for invalid runtime data. Run the service tests; expected: PASS.

- [ ] **Step 3: Write failing handler tests**

Assert unauthenticated requests return `{ ok: false, code: 'UNAUTHENTICATED' }` before repository creation, valid requests return `{ ok: true, goal }`, validation errors return `INVALID_CONTEXT`, and unexpected repository failures return `INTERNAL_ERROR` without the original message.

- [ ] **Step 4: Implement handler, CloudBase repository, and deployment files**

Use `getCloudbaseContext(context).OPENID`. Query `goals` with both `_openid` and `requestId`, limited to one. Save only server-built fields and return the CloudBase add result ID. Configure CommonJS output with package main `dist/goal-confirm/index.js` and include the service source.

- [ ] **Step 5: Add and pass structure/build tests**

The structure test must check all five function files and the package main. Run:

```powershell
npm.cmd test -- --run tests/goal-confirm-service.test.ts tests/goal-confirm-handler.test.ts tests/goal-confirm-structure.test.ts
npm.cmd run typecheck
npm.cmd run build --prefix cloudfunctions/goal-confirm
```

Expected: all checks pass.

- [ ] **Step 6: Commit goal persistence**

```powershell
git add -- cloudfunctions/goal-confirm tests/goal-confirm-service.test.ts tests/goal-confirm-handler.test.ts tests/goal-confirm-structure.test.ts
git diff --cached --check
git commit -m "feat: persist confirmed goals"
```

---

### Task 3: Add the Authenticated `plan.generate` Cloud Function

**Files:**
- Create: `cloudfunctions/plan-generate/service.ts`
- Create: `cloudfunctions/plan-generate/handler.ts`
- Create: `cloudfunctions/plan-generate/index.ts`
- Create: `cloudfunctions/plan-generate/package.json`
- Create: `cloudfunctions/plan-generate/tsconfig.json`
- Create: `tests/plan-generate-service.test.ts`
- Create: `tests/plan-generate-handler.test.ts`
- Create: `tests/plan-generate-structure.test.ts`

**Interfaces:**
- Produces: `generateOwnedDailyPlan(openid, input, repository, provider)`.
- Input: `{ availableMinutes: number; goalIds: string[] }`.
- Repository: `findActiveByIds(openid, goalIds): Promise<Array<{ id: string }>>`.
- Consumes: `generateDailyPlan()`, shared TokenHub provider, and daily-plan prompt.

- [ ] **Step 1: Write failing ownership service tests**

Cover valid owned goals, a missing/foreign goal, duplicate goal IDs, blank IDs, invalid duration, and deterministic fallback. For a foreign goal assert the provider call count remains zero and the service rejects with `PlanGenerationServiceError('INVALID_CONTEXT')`.

Run the service test. Expected: missing-module failure.

- [ ] **Step 2: Implement owner verification before generation**

Validate a dense, unique list of 1–5 non-empty goal IDs and a positive integer duration. Query the repository with the trusted openid. Compare returned IDs as sets and call `generateDailyPlan()` only when every requested goal is owned and active.

Run the service test. Expected: PASS.

- [ ] **Step 3: Write failing handler tests**

Cover `UNAUTHENTICATED`, `MISCONFIGURED`, successful AI output, fallback output, `INVALID_CONTEXT`, and `INTERNAL_ERROR`. Assert the provider is not created for auth, configuration, or ownership failures.

- [ ] **Step 4: Implement the handler and CloudBase entry**

The repository query must include `_openid`, `status: 'active'`, and an `in` query over requested document IDs. The handler creates the shared provider with `buildDailyPlanMessages`, maps only known errors publicly, and never returns upstream exception text.

Package main must be `dist/plan-generate/index.js`. The TypeScript build includes only the plan function plus required shared modules.

- [ ] **Step 5: Verify tests and clean build**

```powershell
npm.cmd test -- --run tests/plan-generate-service.test.ts tests/plan-generate-handler.test.ts tests/plan-generate-structure.test.ts tests/daily-plan-generation.test.ts tests/daily-plan-prompt.test.ts
npm.cmd run typecheck
npm.cmd run build --prefix cloudfunctions/plan-generate
```

Expected: tests pass and the package main file exists.

- [ ] **Step 6: Commit plan generation**

```powershell
git add -- cloudfunctions/plan-generate tests/plan-generate-service.test.ts tests/plan-generate-handler.test.ts tests/plan-generate-structure.test.ts tests/daily-plan-prompt.test.ts
git diff --cached --check
git commit -m "feat: generate plans for owned goals"
```

---

### Task 4: Implement the Pure Goal Flow State Machine

**Files:**
- Create: `miniprogram/shared/goal-flow.ts`
- Create: `tests/goal-flow.test.ts`

**Interfaces:**
- Produces: `createGoalFlowState()`, `startClarification()`, `submitGoalAnswer()`, `receiveGoalStep()`, `markGoalConfirmed()`, `selectAvailableMinutes()`, `receivePlan()` and `setGoalFlowError()`.
- State stages: `draft`, `clarifying`, `summary`, `choosingTime`, `generatingPlan`, `plan`, `error`.

- [ ] **Step 1: Write failing state-transition tests**

Test the complete sequence with real state values:

```ts
const draft = createGoalFlowState();
const loading = startClarification(draft, 'study', '学会 TypeScript');
const asking = receiveGoalStep(loading, {
  kind: 'question',
  field: 'currentProgress',
  question: '你已经学到哪里了？',
});
const answered = submitGoalAnswer(asking, '刚学完基础类型');
```

Assert exact stage changes, retained answer metadata, rejection of a fourth answer, duplicate-submit prevention while loading, summary retention, only 15/30/60 minute choices, and plan/source retention.

Run the test. Expected: missing-module failure.

- [ ] **Step 2: Implement immutable serializable transitions**

Use discriminated state types; each function returns a new state and throws `GoalFlowError('INVALID_TRANSITION')` or `GoalFlowError('INVALID_INPUT')` for invalid actions. Do not import `wx` or perform I/O.

Run:

```powershell
npm.cmd test -- --run tests/goal-flow.test.ts
npm.cmd run typecheck
```

Expected: all flow tests and typecheck pass.

- [ ] **Step 3: Commit the pure client domain**

```powershell
git add -- miniprogram/shared/goal-flow.ts tests/goal-flow.test.ts
git diff --cached --check
git commit -m "feat: add goal onboarding state machine"
```

---

### Task 5: Build the Native Goal Clarification Page

**Files:**
- Create: `miniprogram/shared/cloud-api.ts`
- Create: `miniprogram/pages/goal/index.ts`
- Create: `miniprogram/pages/goal/index.json`
- Create: `miniprogram/pages/goal/index.wxml`
- Create: `miniprogram/pages/goal/index.wxss`
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/app.ts`
- Modify: `tests/miniprogram-structure.test.ts`
- Create: `tests/cloud-api.test.ts`

**Interfaces:**
- Produces: `requestGoalNextStep(input)`, `confirmGoal(input)`, and `requestDailyPlan(input)`.
- Consumes CloudBase function names: `goal-next-step`, `goal-confirm`, `plan-generate`.
- Consumes the pure goal-flow transitions from Task 4.

- [ ] **Step 1: Write failing transport tests**

Inject a `callFunction` implementation and assert each exported function uses the exact CloudBase function name and event payload. Assert `{ result: { ok: false, code: 'UNAUTHENTICATED' } }` becomes a typed client error and malformed platform responses become `INTERNAL_ERROR`.

Run the test. Expected: missing-module failure.

- [ ] **Step 2: Implement the narrow CloudBase transport**

Define one internal generic caller that accepts the injected platform function for tests and defaults to `wx.cloud.callFunction` in production. Return domain results only; never return the CloudBase response wrapper.

Run the cloud API test. Expected: PASS.

- [ ] **Step 3: Extend structure tests before creating the page**

Add every goal page file and `miniprogram/shared/cloud-api.ts` to the required file list. Read `app.json` and assert `pages/goal/index` is the first page and `pages/today/index` remains registered.

Run:

```powershell
npm.cmd test -- --run tests/miniprogram-structure.test.ts
```

Expected: FAIL because the page files and registration do not exist.

- [ ] **Step 4: Implement page registration and initialization**

Register `pages/goal/index` first. Initialize CloudBase once in `app.ts` with the current environment and no hardcoded environment ID.

- [ ] **Step 5: Implement the guided page behavior**

The page must bind handlers for goal type, title, start, answer input, answer submit, summary confirmation, duration selection, and plan generation. Disable the active submit button while a request is running. Generate the confirmation request ID once from timestamp plus a random suffix and retain it across retries.

Map public errors to these user messages:

```ts
const errorMessages = {
  UNAUTHENTICATED: '请先使用已关联云环境的小程序账号。',
  INVALID_CONTEXT: '这一步的信息不完整，请检查后再试。',
  MISCONFIGURED: 'AI 服务还没有配置好，请稍后再试。',
  INTERNAL_ERROR: '刚才没有走稳，再试一次就好。',
} as const;
```

- [ ] **Step 6: Implement the paper-and-ink interface**

WXML must render the three-mark cat-step trail, goal type buttons, title field, one question card, summary review card, 15/30/60 minute choices, loading/error states, and plan task cards with action, duration, completion criteria, and reason.

WXSS must reuse `#f7f0df`, `#356f63`, `#d5a63f`, and `#3f3a31`; keep a 44px minimum touch target, visible focus/disabled states, rounded paper cards, and a single short fade animation. Do not add external fonts, images, or packages.

- [ ] **Step 7: Verify page behavior and structure**

```powershell
npm.cmd test -- --run tests/goal-flow.test.ts tests/cloud-api.test.ts tests/miniprogram-structure.test.ts
npm.cmd run typecheck
```

Expected: all tests pass with no TypeScript errors.

- [ ] **Step 8: Commit the client flow**

```powershell
git add -- miniprogram/app.json miniprogram/app.ts miniprogram/shared/cloud-api.ts miniprogram/pages/goal tests/cloud-api.test.ts tests/miniprogram-structure.test.ts
git diff --cached --check
git commit -m "feat: add guided goal onboarding"
```

---

### Task 6: Add Safe TokenHub Smoke Verification and Final Documentation

**Files:**
- Create: `cloudfunctions/plan-generate/smoke.ts`
- Create: `tests/tokenhub-smoke.test.ts`
- Modify: `package.json`
- Modify: `docs/development.md`
- Modify: `README.md`

**Interfaces:**
- Produces: `runTokenHubSmoke(env, fetch): Promise<SmokeResult>`.
- Command: `npm.cmd run smoke:tokenhub`.
- Output: `{ ok, model, latencyMs, structurallyValid }` without prompts, response bodies, or credentials.

- [ ] **Step 1: Write failing smoke-runner tests**

Test missing API key, missing model, successful synthetic structured output, HTTP failure, invalid structure, and sanitized output. Assert missing configuration rejects before `fetch` and no returned/thrown string contains the supplied API key.

Run the test. Expected: missing-module failure.

- [ ] **Step 2: Implement the injectable smoke runner**

Use the shared TokenHub provider and daily-plan prompt with only this synthetic input:

```ts
{
  availableMinutes: 15,
  goalIds: ['smoke-goal'],
}
```

Validate the returned plan with `validateDailyPlanStructure()`. When invoked as a script, read process environment, measure elapsed milliseconds, print only the `SmokeResult` JSON, and set a non-zero exit code on failure.

- [ ] **Step 3: Add the command and documentation**

Add this root package script:

```json
"smoke:tokenhub": "npm run build --prefix cloudfunctions/plan-generate && node cloudfunctions/plan-generate/dist/plan-generate/smoke.js"
```

Include `smoke.ts` in the existing plan-function TypeScript build so the command uses compiled JavaScript and adds no runtime dependency. Document PowerShell environment setup without real values, the 20-second CloudBase timeout, three function build commands, and the fact that smoke consumes one model request.

- [ ] **Step 4: Run automated verification without credentials**

```powershell
npm.cmd test -- --run tests/tokenhub-smoke.test.ts
npm.cmd run typecheck
```

Expected: tests pass without network access or credentials.

- [ ] **Step 5: Run live smoke only when configuration exists**

Check `TOKENHUB_API_KEY` and `TOKENHUB_MODEL` without printing their values. If both exist, run:

```powershell
npm.cmd run smoke:tokenhub
```

Expected: JSON reports `ok: true` and `structurallyValid: true`. If either variable is absent, do not call the network; record live verification as blocked by missing external configuration.

- [ ] **Step 6: Run the complete completion gate**

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build --prefix cloudfunctions/profile-get-or-create
npm.cmd run build --prefix cloudfunctions/goal-next-step
npm.cmd run build --prefix cloudfunctions/goal-confirm
npm.cmd run build --prefix cloudfunctions/plan-generate
git diff --check
git status --short --branch
```

Expected: every test and build passes, whitespace is clean, no secret/private/generated file is tracked, and the branch remains unpushed.

- [ ] **Step 7: Commit smoke tooling and docs**

```powershell
git add -- cloudfunctions/plan-generate/smoke.ts tests/tokenhub-smoke.test.ts package.json README.md docs/development.md
git diff --cached --check
git commit -m "test: add TokenHub smoke verification"
```

---

## Plan Self-Review

- Every success criterion in the approved design maps to Tasks 2–6.
- Ownership is verified before provider creation in `plan.generate`.
- Goal confirmation idempotency is scoped by trusted openid.
- The client never receives or stores TokenHub credentials.
- The plan preview is intentionally not persisted, avoiding Day 3 scope.
- Every behavioral module has an explicit failing-test step before implementation.
- Every commit stages exact paths and no step pushes or deploys.
