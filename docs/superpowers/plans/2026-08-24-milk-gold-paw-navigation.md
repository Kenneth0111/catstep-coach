# Milk Gold Paw Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Center task-card secondary button text and replace the persistent top paw icons with the approved D2 milk-gold paw that encloses only the active navigation label.

**Architecture:** Keep navigation routing and component inputs unchanged. Render a single local transparent paw asset only for the active item and overlay the existing label text on its main pad; render inactive labels as plain text. Fix task-card alignment only in the shared button style.

**Tech Stack:** WeChat Mini Program WXML/WXSS, local PNG asset, TypeScript, Vitest.

## Global Constraints

- Work directly in `D:\AllCode\Project\CatstepCoach`; do not create a worktree.
- Preserve all existing uncommitted changes; do not reset or overwrite unrelated work.
- Do not commit, push, deploy, or create a pull request.
- Every production change must follow RED then GREEN.
- Keep the existing `今日 / 历史 / 我的` routes, safe-area behavior, and Goal draft interception.

---

### Task 1: Center task-card secondary button text

**Files:**
- Modify: `tests/task-card.test.ts`
- Modify: `miniprogram/components/task-card/index.wxss`

**Interfaces:**
- Consumes: existing `.task-card__choice` and `.task-card__secondary` classes.
- Produces: centered button content without changing events, disabled state, or dimensions.

- [ ] **Step 1: Write the failing test**

Add assertions that the shared rule contains `display: flex`, `box-sizing: border-box`, `align-items: center`, and `justify-content: center`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/task-card.test.ts`

Expected: FAIL because the shared rule does not contain the centering declarations.

- [ ] **Step 3: Write minimal implementation**

Add only the four centering declarations and a horizontal padding value to the existing `.task-card__choice, .task-card__secondary` rule.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/task-card.test.ts`

Expected: PASS.

### Task 2: Render the approved D2 paw only for the active navigation item

**Files:**
- Modify: `tests/miniprogram-structure.test.ts`
- Create: `miniprogram/assets/navigation/paw-active.png`
- Modify: `miniprogram/components/bottom-navigation/index.wxml`
- Modify: `miniprogram/components/bottom-navigation/index.wxss`

**Interfaces:**
- Consumes: `activePath`, `item.url`, and `item.label` from the existing component.
- Produces: `.nav-paw`, `.nav-paw__art`, `.nav-label--active`, and the local `/assets/navigation/paw-active.png` resource.

- [ ] **Step 1: Write the failing test**

Require the paw asset, assert that active-only WXML references it and overlays the label, assert inactive labels remain plain, and reject the old `active-mark`, `paw-icon`, `paw-toe`, and `paw-pad` markup and styles.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/miniprogram-structure.test.ts`

Expected: FAIL because the approved asset and active-only structure do not yet exist.

- [ ] **Step 3: Create the exact D2 asset**

Render the approved continuous paw outline, four toe pads, and main pad as a transparent PNG. Keep text out of the bitmap so all three labels share one asset.

- [ ] **Step 4: Write minimal WXML and WXSS implementation**

Use `wx:if` for the active paw wrapper and `wx:else` for a plain inactive label. Position the active label over the main pad and keep active/pressed styling scoped to the tapped item.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/miniprogram-structure.test.ts`

Expected: PASS.

### Task 3: Regression verification

**Files:**
- Verify all modified and pre-existing Day 7 files without additional edits unless a reproducible failure requires a separate RED/GREEN cycle.

**Interfaces:**
- Consumes: repository scripts and affected cloud-function build scripts.
- Produces: recorded test, type-check, build, and whitespace evidence.

- [ ] **Step 1: Run both focused tests together**

Run: `npm test -- tests/task-card.test.ts tests/miniprogram-structure.test.ts`

Expected: PASS.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 3: Run TypeScript checking**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 4: Build affected cloud functions**

Run each changed cloud function's `npm run build` command and record the result.

Expected: PASS for every affected function.

- [ ] **Step 5: Check patch whitespace**

Run: `git diff --check`

Expected: no output and exit code 0.

- [ ] **Step 6: Perform available visual regression**

Inspect the compiled Mini Program in WeChat DevTools if controllable. Otherwise provide an exact manual checklist covering current-page paw state, inactive labels, large text, narrow screens, safe area, and task-card button centering.
