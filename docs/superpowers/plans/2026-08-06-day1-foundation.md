# Day 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable, testable native WeChat Mini Program foundation with the Today screen shell, deterministic task selection, and a CloudBase profile initialization boundary.

**Architecture:** Keep deterministic product rules in framework-free TypeScript modules that both Vitest and Mini Program pages can consume. Keep WeChat-specific page/component registration at the UI edge, and place CloudBase profile persistence behind an injected repository so identity behavior is testable without a live cloud environment.

**Tech Stack:** Node.js 22, TypeScript 7.0.2, Vitest 4.1.10, miniprogram-api-typings 5.2.2, native WeChat Mini Program, CloudBase Node.js cloud functions.

## Global Constraints

- MVP client is a native WeChat Mini Program written in TypeScript.
- The visual direction is 70% clear utility and 30% hand-drawn warmth.
- Background uses warm ivory, primary color uses muted teal, and accent uses mustard yellow.
- Every screen has one primary action; touch targets are at least 44×44 CSS pixels.
- AI is not called for deterministic task ordering, state changes, or growth calculation.
- No model credential, AppID, environment ID, personal configuration, or private key is committed.
- This slice implements only the Day 1 foundation; AI generation, reminders, review, and production deployment are outside this plan.

---

### Task 1: Toolchain and Project Contract

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `tests/toolchain.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: Node.js 22 and npm.
- Produces: `npm test`, `npm run typecheck`, and a self-check for the pinned toolchain contract.

- [x] **Step 1: Add the package and TypeScript configuration**

`package.json` defines private scripts `test`, `test:watch`, and `typecheck`, with exact dev dependencies `typescript@7.0.2`, `vitest@4.1.10`, `@types/node@26.1.2`, and `miniprogram-api-typings@5.2.2`.

`tsconfig.json` uses `strict: true`, `noEmit: true`, `module: ESNext`, `moduleResolution: Bundler`, `target: ES2022`, `types: ["miniprogram-api-typings", "node", "vitest/globals"]`, and includes `miniprogram/**/*.ts`, `cloudfunctions/**/*.ts`, `tests/**/*.ts`, and `vitest.config.ts`.

`vitest.config.ts` sets the environment to `node`, enables globals, and includes `tests/**/*.test.ts`.

Add `project.private.config.json` and `.npm-cache/` to `.gitignore`.

- [x] **Step 2: Install dependencies**

Run: `npm.cmd install --registry https://registry.npmjs.org --cache "$env:TEMP\catstep-npm-cache"`

- [x] **Step 3: Write the toolchain contract test**

`tests/toolchain.test.ts` reads `package.json` and asserts that the three scripts exist and the four development dependency versions exactly match the Global Constraints. Configuration scaffolding is the user-approved TDD exception; all product behavior in later tasks follows RED-GREEN.

- [x] **Step 4: Run the toolchain test and typecheck**

Run: `npm.cmd test -- tests/toolchain.test.ts`

Run: `npm.cmd run typecheck`

Expected: the toolchain contract passes and TypeScript reports no errors.

- [x] **Step 5: Commit the toolchain contract**

```text
git add -- .gitignore package.json package-lock.json tsconfig.json vitest.config.ts tests/toolchain.test.ts docs/superpowers/plans/2026-08-06-day1-foundation.md
git commit -m "build: add mini program test toolchain"
```

### Task 2: Deterministic Today Domain Model

**Files:**
- Create: `tests/today-plan.test.ts`
- Create: `miniprogram/shared/today-plan.ts`

**Interfaces:**
- Consumes: `TodayTask[]` values with `id`, `title`, `estimatedMinutes`, `status`, and `priority`.
- Produces: `selectCurrentTask(tasks: readonly TodayTask[]): TodayTask | null` and `summarizePlan(tasks: readonly TodayTask[]): PlanSummary`.

- [ ] **Step 1: Write failing behavior tests**

```ts
import { describe, expect, it } from 'vitest';
import { selectCurrentTask, summarizePlan, type TodayTask } from '../miniprogram/shared/today-plan';

const tasks: TodayTask[] = [
  { id: 'done', title: '整理资料', estimatedMinutes: 20, status: 'completed', priority: 3 },
  { id: 'later', title: '复习事件循环', estimatedMinutes: 30, status: 'pending', priority: 2 },
  { id: 'now', title: '实现任务调度器', estimatedMinutes: 40, status: 'pending', priority: 1 },
];

describe('selectCurrentTask', () => {
  it('returns the lowest-priority-number pending task', () => {
    expect(selectCurrentTask(tasks)?.id).toBe('now');
  });

  it('returns null when every task is completed', () => {
    expect(selectCurrentTask(tasks.map((task) => ({ ...task, status: 'completed' })))).toBeNull();
  });
});

describe('summarizePlan', () => {
  it('counts remaining tasks and minutes', () => {
    expect(summarizePlan(tasks)).toEqual({ remainingCount: 2, remainingMinutes: 70 });
  });
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm.cmd test -- tests/today-plan.test.ts`

Expected: FAIL because `miniprogram/shared/today-plan.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure functions**

```ts
export type TaskStatus = 'pending' | 'in_progress' | 'completed';

export interface TodayTask {
  id: string;
  title: string;
  estimatedMinutes: number;
  status: TaskStatus;
  priority: number;
}

export interface PlanSummary {
  remainingCount: number;
  remainingMinutes: number;
}

export function selectCurrentTask(tasks: readonly TodayTask[]): TodayTask | null {
  return [...tasks]
    .filter((task) => task.status !== 'completed')
    .sort((left, right) => left.priority - right.priority)[0] ?? null;
}

export function summarizePlan(tasks: readonly TodayTask[]): PlanSummary {
  const remaining = tasks.filter((task) => task.status !== 'completed');
  return {
    remainingCount: remaining.length,
    remainingMinutes: remaining.reduce((total, task) => total + task.estimatedMinutes, 0),
  };
}
```

- [ ] **Step 4: Run tests and typecheck to verify GREEN**

Run: `npm.cmd test -- tests/today-plan.test.ts`

Run: `npm.cmd run typecheck`

Expected: all Today domain tests pass and TypeScript reports no errors.

- [ ] **Step 5: Commit the domain model**

```text
git add -- tests/today-plan.test.ts miniprogram/shared/today-plan.ts
git commit -m "feat: add deterministic today plan model"
```

### Task 3: Native Mini Program Today Screen

**Files:**
- Create: `project.config.json`
- Create: `miniprogram/sitemap.json`
- Create: `miniprogram/app.ts`
- Create: `miniprogram/app.json`
- Create: `miniprogram/app.wxss`
- Create: `miniprogram/pages/today/index.ts`
- Create: `miniprogram/pages/today/index.json`
- Create: `miniprogram/pages/today/index.wxml`
- Create: `miniprogram/pages/today/index.wxss`
- Create: `miniprogram/components/task-card/index.ts`
- Create: `miniprogram/components/task-card/index.json`
- Create: `miniprogram/components/task-card/index.wxml`
- Create: `miniprogram/components/task-card/index.wxss`

**Interfaces:**
- Consumes: `selectCurrentTask()` and `summarizePlan()` from Task 2.
- Produces: a native Today page and `task-card` component that emits `starttask` with a task ID.

- [ ] **Step 1: Write a failing Mini Program structure test**

Create `tests/miniprogram-structure.test.ts` using `node:fs/promises.access`. Assert only the Mini Program files listed in this task and `project.config.json`. Run `npm.cmd test -- tests/miniprogram-structure.test.ts` and verify RED because those files do not exist.

- [ ] **Step 2: Add a failing page-model assertion**

Extend `tests/today-plan.test.ts` with a test that confirms an `in_progress` task wins a tie over a pending task by giving it the lower numeric priority. Run the test and verify it fails until selection explicitly ranks `in_progress` before `pending` when priorities are equal.

- [ ] **Step 3: Implement the tie-breaking rule and verify GREEN**

Update `selectCurrentTask()` to sort first by `priority`, then by status rank `{ in_progress: 0, pending: 1 }`. Run `npm.cmd test -- tests/today-plan.test.ts` and confirm all tests pass.

- [ ] **Step 4: Create the application shell and Today page**

Use `touristappid` in `project.config.json`, set `miniprogramRoot` to `miniprogram/`, and set `cloudfunctionRoot` to `cloudfunctions/`. Configure a single initial route `pages/today/index` and navigation title `猫步计划`.

The Today page uses three local sample tasks only as a first-run presentation model, derives the current task and summary through Task 2, and handles `starttask` by changing the selected task to `in_progress`. The page contains one primary button labeled `开始这一小步` and a secondary list headed `接下来`.

- [ ] **Step 5: Create the task-card component and warm visual tokens**

The component displays title, duration, status text, and a button with a 44px minimum height. Global WXSS defines warm ivory `#F7F0DF`, muted teal `#356F63`, mustard `#D5A63F`, warm ink `#3F3A31`, 4/8-based spacing, visible focus/pressed states, and no gradient or glass effect.

- [ ] **Step 6: Verify structure, behavior, and types**

Run: `npm.cmd test`

Run: `npm.cmd run typecheck`

Expected: the structure contract and Today domain tests pass; TypeScript reports no errors.

- [ ] **Step 7: Commit the Mini Program shell**

```text
git add -- project.config.json miniprogram tests/miniprogram-structure.test.ts tests/today-plan.test.ts
git commit -m "feat: add native mini program today shell"
```

### Task 4: CloudBase Profile Initialization Boundary

**Files:**
- Create: `tests/profile-service.test.ts`
- Create: `cloudfunctions/profile-get-or-create/service.ts`
- Create: `cloudfunctions/profile-get-or-create/index.ts`
- Create: `cloudfunctions/profile-get-or-create/package.json`
- Create: `cloudfunctions/profile-get-or-create/tsconfig.json`

**Interfaces:**
- Consumes: an injected `ProfileRepository` and the authenticated `openid` supplied by the cloud function runtime.
- Produces: `getOrCreateProfile(openid: string, repository: ProfileRepository, now: () => Date): Promise<UserProfile>`.

- [ ] **Step 1: Write a failing cloud function structure test**

Create `tests/cloudfunction-structure.test.ts` using `node:fs/promises.access`. Assert only the four `cloudfunctions/profile-get-or-create` files listed in this task. Run `npm.cmd test -- tests/cloudfunction-structure.test.ts` and verify RED because those files do not exist.

- [ ] **Step 2: Write failing profile service tests**

```ts
import { describe, expect, it } from 'vitest';
import { getOrCreateProfile, type ProfileRepository } from '../cloudfunctions/profile-get-or-create/service';

describe('getOrCreateProfile', () => {
  it('returns an existing profile without creating another one', async () => {
    const existing = { openid: 'user-1', growth: 0, createdAt: '2026-08-06T00:00:00.000Z' };
    let saved = false;
    const repository: ProfileRepository = {
      findByOpenid: async () => existing,
      save: async (profile) => { saved = true; return profile; },
    };

    await expect(getOrCreateProfile('user-1', repository, () => new Date('2026-08-06T00:00:00Z'))).resolves.toEqual(existing);
    expect(saved).toBe(false);
  });

  it('creates a zero-growth profile for a new openid', async () => {
    const repository: ProfileRepository = {
      findByOpenid: async () => null,
      save: async (profile) => profile,
    };

    await expect(getOrCreateProfile('user-2', repository, () => new Date('2026-08-06T00:00:00Z'))).resolves.toEqual({
      openid: 'user-2',
      growth: 0,
      createdAt: '2026-08-06T00:00:00.000Z',
    });
  });

  it('rejects an empty authenticated identity', async () => {
    const repository: ProfileRepository = {
      findByOpenid: async () => null,
      save: async (profile) => profile,
    };

    await expect(getOrCreateProfile('', repository, () => new Date())).rejects.toThrow('openid is required');
  });
});
```

- [ ] **Step 3: Run the profile tests and verify RED**

Run: `npm.cmd test -- tests/profile-service.test.ts`

Expected: FAIL because the profile service module does not exist.

- [ ] **Step 4: Implement the repository boundary and service**

Define `UserProfile`, `ProfileRepository`, and the exact `getOrCreateProfile()` signature above. Reject a blank `openid`, return the existing row if found, otherwise save `{ openid, growth: 0, createdAt: now().toISOString() }`.

- [ ] **Step 5: Add the deployable function entry**

Use `@cloudbase/node-sdk@3.18.3` in the cloud function package. The entry initializes the SDK from the current environment, obtains authenticated user context, adapts the `users` collection to `ProfileRepository`, and returns `{ ok: true, profile }`. It returns `{ ok: false, code: 'UNAUTHENTICATED' }` when no OpenID is present, without accepting an OpenID from client input.

- [ ] **Step 6: Verify profile behavior, structure, and types**

Run: `npm.cmd test -- tests/profile-service.test.ts`

Run: `npm.cmd test`

Run: `npm.cmd run typecheck`

Expected: all tests pass and TypeScript reports no errors.

- [ ] **Step 7: Commit the profile boundary**

```text
git add -- cloudfunctions/profile-get-or-create tests/cloudfunction-structure.test.ts tests/profile-service.test.ts package-lock.json
git commit -m "feat: add profile initialization boundary"
```

### Task 5: Developer Handoff and Full Verification

**Files:**
- Create: `docs/development.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: the completed Day 1 repository structure and commands.
- Produces: reproducible local setup and WeChat DevTools import instructions.

- [ ] **Step 1: Document exact setup and verification commands**

Document Node.js 22, `npm.cmd install`, `npm.cmd test`, `npm.cmd run typecheck`, importing the repository root in WeChat DevTools, replacing `touristappid` through local private configuration, and creating a CloudBase environment without committing its ID.

- [ ] **Step 2: Update README progress truthfully**

Mark the project skeleton, Today shell, deterministic domain rules, and profile boundary complete. Keep AI planning, persistence integration, full UI, and deployment unchecked.

- [ ] **Step 3: Run full verification**

Run: `npm.cmd test -- --run`

Run: `npm.cmd run typecheck`

Run: `git diff --check`

Run: `git status --short`

Expected: all tests pass, typecheck exits 0, diff check exits 0, and only the intended documentation files are uncommitted.

- [ ] **Step 4: Commit documentation**

```text
git add -- README.md docs/development.md
git commit -m "docs: add local development guide"
```

- [ ] **Step 5: Re-run final verification**

Run: `npm.cmd test -- --run && npm.cmd run typecheck`

Expected: all tests pass, typecheck exits 0, and `git status --short --branch` shows a clean `feature/day1-foundation` branch.
