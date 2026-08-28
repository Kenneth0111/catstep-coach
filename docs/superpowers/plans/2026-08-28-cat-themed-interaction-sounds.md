# CatstepCoach User-Provided Interaction Sounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install the five user-provided MP3 files as the four semantic interaction-sound categories, alternating the two cat-click variants.

**Architecture:** Copy the five source MP3 files from `sound_effects/` into the mini program's local asset directory. Keep the existing shared sound API and all trigger locations, but map each semantic category to a resource list and deterministically advance the `cat` source only after successful playback.

**Tech Stack:** WeChat Mini Program `InnerAudioContext`, local MPEG-1 Layer III assets, TypeScript, Vitest, Node.js file inspection.

## Global Constraints

- Preserve the semantic names `tap`, `action`, `success`, and `cat`.
- Use `tap.mp3`, `action.mp3`, `success.mp3`, `cat1.mp3`, and `cat2.mp3` exactly as supplied by the user.
- Alternate `cat1.mp3` and `cat2.mp3` deterministically on accepted cat clicks.
- Keep mute, cooldown, audio-failure isolation, and all existing trigger locations.
- Preserve the root `sound_effects/` source directory.
- Do not modify or revert the existing Today UI, AI runtime configuration, or unrelated user changes.
- Do not install dependencies or system software.
- Do not commit, push, or deploy.

---

### Task 1: Specify MP3 assets and cat alternation with failing tests

**Files:**
- Modify: `tests/sound-effects-assets.test.ts`
- Modify: `tests/sound-effects.test.ts`

**Interfaces:**
- Consumes: Final asset paths under `miniprogram/assets/sounds/` and `createSoundEffects()`.
- Produces: Tests that require five valid local MP3 files and observable `cat1`/`cat2` alternation.

- [ ] **Step 1: Replace the WAV asset contract with an MP3 contract**

Read the five exact final paths. Skip any ID3v2 tag, find the first MPEG frame, verify MPEG-1 Layer III at 48 kHz and 192 kbps, estimate duration from audio bytes, require a duration from 0.1 through 2.2 seconds, and require combined size below 180 KiB.

- [ ] **Step 2: Change the semantic mapping test**

Play `tap`, `action`, `success`, and `cat` twice with 500 ms between calls. Require created audio contexts to receive these exact sources in order:

```typescript
[
  '/assets/sounds/tap.mp3',
  '/assets/sounds/action.mp3',
  '/assets/sounds/success.mp3',
  '/assets/sounds/cat1.mp3',
  '/assets/sounds/cat2.mp3',
]
```

- [ ] **Step 3: Run focused tests and verify RED**

```powershell
npx vitest run tests/sound-effects-assets.test.ts tests/sound-effects.test.ts
```

Expected: FAIL because final MP3 paths do not exist and the shared module still maps one WAV per category.

---

### Task 2: Install assets and implement deterministic cat variants

**Files:**
- Modify: `miniprogram/shared/sound-effects.ts`
- Create: `miniprogram/assets/sounds/tap.mp3`
- Create: `miniprogram/assets/sounds/action.mp3`
- Create: `miniprogram/assets/sounds/success.mp3`
- Create: `miniprogram/assets/sounds/cat1.mp3`
- Create: `miniprogram/assets/sounds/cat2.mp3`
- Delete: `miniprogram/assets/sounds/tap.wav`
- Delete: `miniprogram/assets/sounds/action.wav`
- Delete: `miniprogram/assets/sounds/success.wav`
- Delete: `miniprogram/assets/sounds/cat.wav`
- Delete: `scripts/generate-cat-sound-candidates.mjs`

**Interfaces:**
- Consumes: The five exact files in root `sound_effects/`.
- Produces: `createSoundEffects(): (effect: SoundEffect) => void` with unchanged call sites and deterministic per-effect source indices.

- [ ] **Step 1: Copy the five binaries to the local asset directory**

Use literal source and destination paths. Verify SHA-256 hashes match source and destination after copying.

- [ ] **Step 2: Change the shared mapping to resource lists**

```typescript
const soundSources: Record<SoundEffect, readonly string[]> = {
  tap: ['/assets/sounds/tap.mp3'],
  action: ['/assets/sounds/action.mp3'],
  success: ['/assets/sounds/success.mp3'],
  cat: ['/assets/sounds/cat1.mp3', '/assets/sounds/cat2.mp3'],
};
```

Cache contexts by source path. For each accepted play, select `sources[index % sources.length]`; after `context.play()` returns successfully, advance that effect's index. Do not advance during mute, cooldown, context creation failure, or play failure.

- [ ] **Step 3: Remove only obsolete artifacts created by the abandoned approach**

Delete the four unused WAV assets and the unused candidate generator. Preserve `sound_effects/` and all unrelated files.

- [ ] **Step 4: Run focused tests and verify GREEN**

```powershell
npx vitest run tests/sound-effects-assets.test.ts tests/sound-effects.test.ts tests/sound-effects-wiring.test.ts tests/profile-page.test.ts
```

Expected: all focused tests pass.

---

### Task 3: Update documentation and complete verification

**Files:**
- Modify: `docs/development.md`

**Interfaces:**
- Consumes: The final asset mapping and behavior.
- Produces: Accurate provenance, format, semantic mapping, alternation, mute/cooldown/failure guidance, and verification evidence.

- [ ] **Step 1: Update interaction-sound documentation**

Document the five user-provided local MP3 files, four semantic categories, two alternating cat variants, offline runtime behavior, shared module, mute setting, cooldowns, and failure isolation.

- [ ] **Step 2: Run the full test suite and type checking**

```powershell
npm test
npm run typecheck
```

Expected: both commands exit 0.

- [ ] **Step 3: Run every relevant cloud-function build**

Run the `build` script in every cloud-function package that declares one, without installing packages or changing lockfiles. Expected: all builds exit 0.

- [ ] **Step 4: Run repository checks**

```powershell
git diff --check
git status --short
git diff --stat
```

Expected: `git diff --check` exits 0; all pre-existing user changes remain, `sound_effects/` remains untouched, and only scoped interaction-sound files are added, changed, or removed.
