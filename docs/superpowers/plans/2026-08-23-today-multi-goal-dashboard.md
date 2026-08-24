# 今日多目标看板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将“今日”升级为一天最多三个目标、合计最多十个任务的折叠执行看板，并让后续目标安全追加到当天唯一计划。

**Architecture:** 继续保持“可信微信身份 + 上海自然日 = 一份计划文档”。`plan-confirm` 在事务中创建或追加目标任务；Today 读取服务补充目标标题并返回分组；客户端纯状态层按目标计算进度和当前任务，页面只负责折叠展示与复用现有任务操作。

**Tech Stack:** 微信原生小程序 TypeScript/WXML/WXSS、CloudBase Node.js 云函数、Vitest、npm TypeScript 检查。

**Spec:** `docs/superpowers/specs/2026-08-23-today-multi-goal-dashboard-design.md`

## Global Constraints

- 直接在 `D:\AllCode\Project\CatstepCoach` 当前工作区工作，不创建 worktree。
- 保留全部既有未提交改动；只修改本计划列出的文件，不做无关重构。
- 不提交、不推送、不创建或合并 PR。
- 每个上海自然日只有一份计划；最多 3 个不同目标，合计最多 10 个任务，单次目标生成最多 5 个任务。
- 每个目标最多一个 `in_progress` 任务；不同目标可以并行。
- 所有生产代码必须先有按预期失败的测试并记录 RED，再以最小实现转 GREEN。
- 日志、测试和报告不得打印 API Key、OpenID、目标正文、任务正文或完整上游响应。
- 目标卡片使用现有猫爪、深青、暖金视觉；不引入依赖、网络素材、emoji 或第三方图标。
- 底部主导航保持“今日 / 历史 / 我的”，设置继续位于“我的”。
- 完成后运行聚焦测试、全量测试、`npm run typecheck`、受影响云函数构建和 `git diff --check`。

---

## File Map

- `cloudfunctions/plan-confirm/service.ts`：纯输入验证、首次计划构造、同日追加规则和 3/10 上限。
- `cloudfunctions/plan-confirm/repository.ts`：CloudBase 事务内创建或更新当天确定性计划。
- `cloudfunctions/plan-generate/service.ts`、`index.ts`：生成前读取当天容量并限制本次候选任务数。
- `cloudfunctions/shared/daily-plan.ts`、`generate-daily-plan.ts`、`plan-generate/prompt.ts`：支持显式 `maxTasks`，单次仍不超过 5。
- `cloudfunctions/plan-update-task/service.ts`：同目标最多一个进行中任务。
- `cloudfunctions/plan-resize-task/service.ts`：移动到队尾只计算同目标优先级。
- `cloudfunctions/plan-get-today/service.ts`、`index.ts`：查询目标标题并返回安全分组。
- `miniprogram/shared/cloud-api.ts`：区分扁平计划响应和 Today 分组响应，校验最多 10 个任务和最多 3 个目标分组。
- `miniprogram/shared/goal-flow.ts`：公开稳定的 `LIMIT_REACHED` 错误码，供目标拆解页显示容量提示。
- `miniprogram/shared/today-plan.ts`、`today-flow.ts`：按 `goalId` 生成目标卡片、进度和各组当前任务。
- `miniprogram/components/task-card/index.ts|wxml|wxss`：允许展开卡片内的所有未完成任务执行操作，并分别控制能否开始。
- `miniprogram/pages/today/index.ts|wxml|wxss`：目标折叠交互、三类任务操作、新目标入口和容量文案。
- `miniprogram/pages/goal/index.ts|wxml|wxss`：移除 Home 含义，确认后返回 Today 并保持草稿保护。
- `tests/*.test.ts`：各切片 RED/GREEN 行为与结构回归。

### Task 1: 同日计划原子追加与 3/10 上限

**Files:**
- Modify: `cloudfunctions/plan-confirm/service.ts`
- Modify: `cloudfunctions/plan-confirm/repository.ts`
- Modify: `cloudfunctions/plan-confirm/index.ts`
- Modify: `cloudfunctions/plan-confirm/handler.ts`
- Test: `tests/plan-confirm-service.test.ts`
- Test: `tests/plan-confirm-repository.test.ts`
- Test: `tests/plan-confirm-handler.test.ts`

**Interfaces:**
- Consumes: 现有 `PlanConfirmationInput`、`DailyPlan`、可信 `WX_OPENID` 和确定性 `createPlanDocumentId()`。
- Produces: `DailyPlanRepository.createOrAppend(documentId, incoming, merge)`；合并后的 `ConfirmedDailyPlan` 最多 3 个目标、10 个任务，并保存 `processedRequestIds: string[]`。

- [ ] **Step 1: 写服务层 RED 测试**

在 `tests/plan-confirm-service.test.ts` 增加独立测试，构造已有 `goal-1` 任务为 `in_progress`，再确认 `goal-2`：

```ts
it('appends a second goal without changing existing task progress', async () => {
  const existing = createConfirmedPlan({
    tasks: [{ ...task('goal-1', 1), status: 'in_progress', startedAt: '2026-08-23T01:00:00.000Z' }],
  });
  const repository = createRepository(existing);

  const result = await confirmDailyPlan(
    'user-1',
    confirmation('append-2', [task('goal-2', 1)]),
    repository,
    now,
  );

  expect(result.tasks).toHaveLength(2);
  expect(result.tasks[0]).toMatchObject({ goalId: 'goal-1', status: 'in_progress', startedAt: '2026-08-23T01:00:00.000Z' });
  expect(result.tasks[1]).toMatchObject({ goalId: 'goal-2', status: 'pending' });
});
```

再增加表格测试：相同 `requestId` 重放不重复；同一 `goalId` 不重复追加；第四个不同目标抛 `PlanConfirmationError('LIMIT_REACHED')`；合并后第 11 个任务抛相同错误；既有一目标旧计划没有 `processedRequestIds` 时仍可追加。

- [ ] **Step 2: 运行服务测试验证 RED**

Run: `npm test -- --run tests/plan-confirm-service.test.ts`

Expected: 新测试因仓储仍使用 `saveIfAbsent`、错误码缺少 `LIMIT_REACHED` 或结果仍只有旧任务而失败；原测试继续通过。

- [ ] **Step 3: 写仓储事务 RED 测试**

在 `tests/plan-confirm-repository.test.ts` 断言同一事务读取已有文档、调用 merge 回调并 `update` 完整合并计划；不存在时 `set`；merge 抛错时不产生写入。

```ts
const result = await repository.createOrAppend('plan-1', incoming, (current) => ({
  ...current,
  tasks: [...current.tasks, ...incoming.tasks],
}));
expect(transactionDocument.update).toHaveBeenCalledWith(expect.objectContaining({ tasks: expect.any(Array) }));
expect(result.tasks).toHaveLength(2);
```

- [ ] **Step 4: 运行仓储测试验证 RED**

Run: `npm test -- --run tests/plan-confirm-repository.test.ts`

Expected: FAIL，因为 `createOrAppend` 和事务更新接口尚不存在。

- [ ] **Step 5: 实现最小合并模型**

在 `service.ts` 扩展公开错误码并增加纯函数。字段必须保持兼容：

```ts
export type PlanConfirmationCode = 'INVALID_CONTEXT' | 'LIMIT_REACHED';

export interface PersistedDailyPlan {
  // 保留现有字段
  processedRequestIds?: string[];
}

function mergeConfirmedPlan(
  current: PersistedDailyPlan,
  incoming: PersistedDailyPlan,
): PersistedDailyPlan {
  const processed = new Set(current.processedRequestIds ?? [current.requestId]);
  if (processed.has(incoming.requestId)) return current;

  const currentGoalIds = new Set(current.tasks.map((task) => task.goalId));
  const incomingGoalIds = new Set(incoming.tasks.map((task) => task.goalId));
  if ([...incomingGoalIds].every((goalId) => currentGoalIds.has(goalId))) return current;
  if (new Set([...currentGoalIds, ...incomingGoalIds]).size > 3 ||
      current.tasks.length + incoming.tasks.length > 10) {
    throw new PlanConfirmationError('LIMIT_REACHED');
  }

  const offset = current.tasks.length;
  return {
    ...current,
    availableMinutes: current.availableMinutes + incoming.availableMinutes,
    summary: `今天有 ${new Set([...currentGoalIds, ...incomingGoalIds]).size} 个目标，安排了 ${offset + incoming.tasks.length} 个小步。`,
    tasks: [...current.tasks, ...incoming.tasks.map((task, index) => ({
      ...task,
      id: `${current.id ?? createPlanDocumentId(current.owner, current.date)}-${offset + index + 1}`,
      priority: offset + index + 1,
    }))],
    processedRequestIds: [...processed, incoming.requestId],
  };
}
```

同时把持久化任务状态类型如实放宽为 `'pending' | 'in_progress' | 'completed'`，并保留可选的 `startRequestId/startedAt/completeRequestId/completedAt/difficultyFeedback/resizeRequestId/resizedAt`。首次构造的新任务仍精确写入 `status: 'pending'`；这样合并函数可以在类型层面保证旧任务执行元数据不会被丢弃。现有更新服务的派生类型可暂时保留，不在本任务顺手重构。

实际类型中不要依赖 `PersistedDailyPlan.id`；把 `documentId` 作为 `mergeConfirmedPlan(documentId, current, incoming)` 的显式参数。首次创建时写入 `processedRequestIds: [requestId]`。目标归属验证继续在事务前完成。

仓储接口实现：

```ts
createOrAppend(
  documentId: string,
  incoming: PersistedDailyPlan,
  merge: (current: PersistedDailyPlan) => PersistedDailyPlan,
): Promise<ConfirmedDailyPlan>;
```

事务中不存在则 `set(incoming)`；存在则计算 `merged = merge(current.data)`，只有值发生变化时 `update(merged)`，最后返回 `{ id: documentId, ...merged }`。不得在失败后把任意旧计划当作追加成功返回。

- [ ] **Step 6: 让 handler 暴露稳定容量错误**

`plan-confirm/handler.ts` 对 `PlanConfirmationError` 继续返回其公开 code，并把返回联合类型扩展为 `LIMIT_REACHED`。不得输出内部异常或正文。

- [ ] **Step 7: 验证 GREEN**

Run: `npm test -- --run tests/plan-confirm-service.test.ts tests/plan-confirm-repository.test.ts tests/plan-confirm-handler.test.ts`

Expected: PASS；新增追加、幂等、3/10 上限和旧计划兼容测试全部通过。

- [ ] **Step 8: 记录任务证据而不提交**

保存 RED 命令/失败原因、GREEN 命令/通过数量、修改文件和自检结论到本计划 SDD report；运行 `git diff --check`，不执行 `git add` 或 `git commit`。

### Task 2: 生成阶段遵守当天剩余容量

**Files:**
- Modify: `cloudfunctions/shared/daily-plan.ts`
- Modify: `cloudfunctions/shared/generate-daily-plan.ts`
- Modify: `cloudfunctions/plan-generate/service.ts`
- Modify: `cloudfunctions/plan-generate/handler.ts`
- Modify: `cloudfunctions/plan-generate/index.ts`
- Modify: `cloudfunctions/plan-generate/prompt.ts`
- Test: `tests/daily-plan-validation.test.ts`
- Test: `tests/daily-plan-generation.test.ts`
- Test: `tests/daily-plan-prompt.test.ts`
- Test: `tests/plan-generate-service.test.ts`
- Test: `tests/plan-generate-handler.test.ts`

**Interfaces:**
- Consumes: Task 1 的每日 3 目标/10 任务规则和当天单计划文档。
- Produces: `DailyPlanConstraints.maxTasks: number`；`OwnedGoalRepository.getTodayCapacity(openid, date)` 返回 `{ goalIds: string[]; taskCount: number } | null`；公开错误 `LIMIT_REACHED`。

- [ ] **Step 1: 写 maxTasks RED 测试**

在 validation/generation/prompt 测试中断言 `maxTasks: 2` 时三任务候选被拒绝为 `TASK_COUNT`、规则降级仍只生成一项、prompt 明确使用 `input.maxTasks` 而不是固定“1–5”。

Run: `npm test -- --run tests/daily-plan-validation.test.ts tests/daily-plan-generation.test.ts tests/daily-plan-prompt.test.ts`

Expected: FAIL，因为约束没有 `maxTasks` 且 prompt 固定 1–5。

- [ ] **Step 2: 实现显式单次上限**

```ts
export interface DailyPlanConstraints {
  availableMinutes: number;
  goalIds: readonly string[];
  goals?: readonly DailyPlanGoalContext[];
  maxTasks?: number;
}

const maxTasks = constraints.maxTasks ?? 5;
if (!Number.isInteger(maxTasks) || maxTasks < 1 || maxTasks > 5 ||
    candidate.tasks.length < 1 || candidate.tasks.length > maxTasks) {
  throw new DailyPlanValidationError('TASK_COUNT');
}
```

prompt 文案改为“生成 1–input.maxTasks 个任务”，请求的可信 constraints 必须包含服务端计算值。

- [ ] **Step 3: 写当天容量 RED 测试**

`tests/plan-generate-service.test.ts` 覆盖：空计划得到 `maxTasks: 5`；已有 7 项得到 `maxTasks: 3`；已有 3 个目标或 10 项时在 claimQuota/provider 前抛 `LIMIT_REACHED`；目标已在今日时也拒绝重复追加；上海日期边界正确。

Run: `npm test -- --run tests/plan-generate-service.test.ts tests/plan-generate-handler.test.ts`

Expected: FAIL，因为 repository 和错误码尚无容量语义。

- [ ] **Step 4: 实现服务端容量读取**

```ts
export interface TodayCapacity {
  goalIds: string[];
  taskCount: number;
}

export interface OwnedGoalRepository {
  findActiveByIds(openid: string, goalIds: readonly string[]): Promise<OwnedGoal[]>;
  getTodayCapacity(openid: string, date: string): Promise<TodayCapacity | null>;
}
```

`generateOwnedDailyPlan` 接收 `now: () => Date`，先验证目标归属，再读取上海日期容量。若已有三个不同目标、十个任务或请求目标已在今日，抛 `PlanGenerationServiceError('LIMIT_REACHED')`；否则调用 `generateDailyPlan({ ...input, goals, maxTasks: Math.min(5, 10 - taskCount) }, provider)`。容量错误发生在 claimQuota 前。

`index.ts` 从 `plans` 集合只读取当前 `_openid/date/status: confirmed` 的首份计划，映射不同 `goalId` 和任务数，不返回正文或身份。

- [ ] **Step 5: 验证 GREEN**

Run: `npm test -- --run tests/daily-plan-validation.test.ts tests/daily-plan-generation.test.ts tests/daily-plan-prompt.test.ts tests/plan-generate-service.test.ts tests/plan-generate-handler.test.ts`

Expected: PASS。

- [ ] **Step 6: 记录 RED/GREEN 与差异检查**

运行 `git diff --check`；更新 task report，不提交。

### Task 3: 每目标任务执行约束与分组内排序

**Files:**
- Modify: `cloudfunctions/plan-update-task/service.ts`
- Modify: `cloudfunctions/plan-resize-task/service.ts`
- Test: `tests/plan-update-task-service.test.ts`
- Test: `tests/plan-resize-task-service.test.ts`

**Interfaces:**
- Consumes: 每个任务的 `goalId`、`status` 和 `priority`。
- Produces: 同目标最多一个进行中任务；跨目标允许并行；`move_to_end` 只使用同目标最大 priority。

- [ ] **Step 1: 写进行中规则 RED 测试**

新增两个测试：同一 `goalId` 已有 `in_progress` 时开始另一项抛 `INVALID_CONTEXT`；不同 `goalId` 各开始一项成功。

Run: `npm test -- --run tests/plan-update-task-service.test.ts`

Expected: 同目标拒绝测试 FAIL，因为当前只检查目标任务本身为 pending。

- [ ] **Step 2: 最小实现同目标互斥**

在 `start` 分支进入状态变更前加入：

```ts
const hasRunningSibling = plan.tasks.some((candidate) =>
  candidate.id !== task.id &&
  candidate.goalId === task.goalId &&
  candidate.status === 'in_progress'
);
if (input.action === 'start' && hasRunningSibling) {
  throw new PlanTaskUpdateError('INVALID_CONTEXT');
}
```

- [ ] **Step 3: 写分组队尾 RED 测试**

构造两个目标交错 priority，移动 `goal-1` 任务后断言其 priority 等于 `goal-1` 最大值加一，而不是整份计划最大值加一；`goal-2` 顺序不变。另加一项测试：`resize` 允许缩小 `in_progress` 任务并保留其 `status/startRequestId/startedAt`，但 `move_to_end` 仍只允许 pending 任务。

Run: `npm test -- --run tests/plan-resize-task-service.test.ts`

Expected: FAIL，因为当前使用全计划最大 priority。

- [ ] **Step 4: 实现分组内队尾并验证 GREEN**

```ts
const sameGoalTasks = storedPlan.tasks.filter((item) => item.goalId === original.goalId);
const nextPriority = Math.max(...sameGoalTasks.map((item) => item.priority)) + 1;
```

把 `resize` 的状态前置条件放宽为 pending 或 in_progress；`move_to_end` 的分支继续严格要求 pending。替换候选不得覆盖原状态和开始元数据。

Run: `npm test -- --run tests/plan-update-task-service.test.ts tests/plan-resize-task-service.test.ts`

Expected: PASS，同目标互斥、跨目标并行和分组排序均通过。

- [ ] **Step 5: 记录 RED/GREEN 与差异检查**

运行 `git diff --check`；更新 task report，不提交。

### Task 4: Today 安全返回目标分组并放宽客户端至十项

**Files:**
- Modify: `cloudfunctions/plan-get-today/service.ts`
- Modify: `cloudfunctions/plan-get-today/index.ts`
- Modify: `miniprogram/shared/cloud-api.ts`
- Modify: `miniprogram/shared/goal-flow.ts`
- Modify: `miniprogram/shared/today-flow.ts` (types only in this task)
- Test: `tests/plan-get-today-service.test.ts`
- Test: `tests/plan-get-today-handler.test.ts`
- Test: `tests/cloud-api.test.ts`
- Test: `tests/plan-history-service.test.ts`

**Interfaces:**
- Consumes: Task 1 合并后的单份计划，任务 `goalId`。
- Produces: `TodayDashboardPlan extends TodayPlan`，增加 `groups: TodayGoalGroup[]`，每组 `{ goalId, goalTitle, tasks }`；现有任务更新接口继续返回扁平 `TodayPlan`。

- [ ] **Step 1: 写分组读取 RED 测试**

`plan-get-today-service.test.ts` 断言两个 goalId 只查询当前用户目标标题、保持首次出现顺序、缺失目标回退“今日目标”，并返回两组正确任务。

```ts
expect(result?.groups).toEqual([
  { goalId: 'goal-1', goalTitle: '目标一', tasks: [expect.objectContaining({ goalId: 'goal-1' })] },
  { goalId: 'goal-2', goalTitle: '今日目标', tasks: [expect.objectContaining({ goalId: 'goal-2' })] },
]);
```

Run: `npm test -- --run tests/plan-get-today-service.test.ts`

Expected: FAIL，因为返回值没有 groups，仓储不会查询目标。

- [ ] **Step 2: 实现安全目标标题查询**

扩展 repository：

```ts
findOwnedGoalTitles(openid: string, goalIds: readonly string[]): Promise<Record<string, string>>;
```

`index.ts` 查询 `goals.where({ _openid: openid, _id: command.in(goalIds) })`，并在映射前再次确认返回记录的 `_openid` 与调用者相同。service 按任务中 goalId 的首次出现顺序生成 groups；标题缺失使用“今日目标”。

- [ ] **Step 3: 写客户端 10 项/3 组 RED 测试**

`cloud-api.test.ts` 构造三个 groups、合计十项应通过；十一项、第四组、组内 task.goalId 不一致、缺失标题应抛 `CloudApiError('INTERNAL_ERROR')`。同时把历史响应的总任务上限测试更新为十项。

Run: `npm test -- --run tests/cloud-api.test.ts tests/plan-history-service.test.ts`

Expected: 十项合法响应 FAIL，因为客户端和历史验证仍限制五项。

- [ ] **Step 4: 实现响应验证**

保留现有扁平 `TodayPlan`，新增：

```ts
export interface TodayGoalGroup {
  goalId: string;
  goalTitle: string;
  tasks: TodayPlanTask[];
}

export interface TodayDashboardPlan extends TodayPlan {
  groups: TodayGoalGroup[];
}
```

`isTodayPlan` 校验 1–10 个扁平任务；新增 `isTodayDashboardPlan` 校验 1–3 个唯一 group、所有 group tasks 与扁平 tasks ID/goalId 一致且无重复。只有 `getTodayPlan` 要求分组响应，`updatePlanTask` 和 `resizeTodayTask` 继续验证扁平响应。`isPlanHistoryResult` 的整日 taskCount 上限改为十，组数上限为三；单个历史目标组不再错误限制整日总数为五。`PublicErrorCode` 和 `isPublicErrorCode` 同时加入 `LIMIT_REACHED`，未知服务端 code 仍回退 `INTERNAL_ERROR`。

- [ ] **Step 5: 验证 GREEN**

Run: `npm test -- --run tests/plan-get-today-service.test.ts tests/plan-get-today-handler.test.ts tests/cloud-api.test.ts tests/plan-history-service.test.ts`

Expected: PASS。

- [ ] **Step 6: 记录 RED/GREEN 与差异检查**

运行 `git diff --check`；更新 task report，不提交。

### Task 5: Today 目标卡片状态与折叠页面

**Files:**
- Modify: `miniprogram/shared/today-plan.ts`
- Modify: `miniprogram/shared/today-flow.ts`
- Modify: `miniprogram/pages/today/index.ts`
- Modify: `miniprogram/pages/today/index.wxml`
- Modify: `miniprogram/pages/today/index.wxss`
- Modify: `miniprogram/components/task-card/index.ts`
- Modify: `miniprogram/components/task-card/index.wxml`
- Modify: `miniprogram/components/task-card/index.wxss`
- Modify: `miniprogram/pages/goal/index.ts`
- Modify: `miniprogram/pages/goal/index.wxml`
- Modify: `miniprogram/pages/goal/index.wxss`
- Test: `tests/today-plan.test.ts`
- Test: `tests/today-flow.test.ts`
- Test: `tests/miniprogram-structure.test.ts`
- Test: `tests/task-card.test.ts`

**Interfaces:**
- Consumes: Task 4 的 `TodayDashboardPlan.groups`，现有 task-card start/complete/resize 事件。
- Produces: `TodayGoalView[]`、`expandedGoalId`、总体 `completedCount/totalCount`，以及 Today 页面折叠卡片和“拆解新目标”。

- [ ] **Step 1: 写纯分组视图 RED 测试**

定义期望接口：

```ts
export interface TodayGoalView {
  goalId: string;
  goalTitle: string;
  status: 'not_started' | 'in_progress' | 'completed';
  completedCount: number;
  totalCount: number;
  progressPercent: number;
  currentTask: TodayPlanTask | null;
  pendingTasks: TodayPlanTask[];
  completedTasks: TodayPlanTask[];
}
```

测试三个目标各自选 currentTask、计算进度、保持分组顺序；一个目标完成不影响另外两个。`receiveTodayPlan` 默认展开第一张含进行中任务的卡，否则第一张未完成卡。

Run: `npm test -- --run tests/today-plan.test.ts tests/today-flow.test.ts`

Expected: FAIL，因为状态仍只有全局 currentTask/nextTasks/completedTasks。

- [ ] **Step 2: 实现纯目标视图**

在 `today-plan.ts` 增加 `createGoalViews(groups)`，组内排序优先 `in_progress`、再 `pending`、最后 `completed`，同状态按 priority。进度为 `Math.round(completedCount / totalCount * 100)`；空组不得由服务端产生。

`TodayFlowState.plan` 使用 `TodayDashboardPlan` 并改为：

```ts
goalViews: TodayGoalView[];
expandedGoalId: string | null;
summary: { completedCount: number; totalCount: number; remainingCount: number; remainingMinutes: number };
```

增加 `toggleTodayGoal(state, goalId)`；计划更新后保留仍存在的 expandedGoalId，否则重新选择默认项。

任务更新和缩小接口返回扁平 `TodayPlan`。增加 `mergeTodayDashboardPlan(current, updated)`：按当前 `groups` 中的 goalTitle 重新用 updated.tasks 分组，再返回新的 `TodayDashboardPlan`；`receiveTodayTaskUpdate` 和缩小成功路径必须使用该函数，不能因为一次任务操作丢失目标标题或 groups。

- [ ] **Step 3: 写页面结构 RED 测试**

断言 Today WXML 包含“今日目标 {{flow.goalViews.length}}/3”、目标卡片 toggle、进度文字、展开任务 start/complete/resize 绑定、“＋拆解新目标”、三个目标和十个任务容量提示。断言 Goal WXML 不新增 Home/首页按钮，仍包含底部导航和草稿离开 hook。

Run: `npm test -- --run tests/miniprogram-structure.test.ts tests/task-card.test.ts`

Expected: FAIL，因为旧页面是全局任务分区。

- [ ] **Step 4: 实现 Today 页面交互**

`today/index.ts` 增加：

```ts
onToggleGoal(event: WechatMiniprogram.TouchEvent) {
  this.setData({ flow: toggleTodayGoal(this.data.flow, String(event.currentTarget.dataset.goalId)) });
}

onAddGoal() {
  if (this.data.flow.goalViews.length >= 3 || (this.data.flow.plan?.tasks.length ?? 0) >= 10) return;
  void wx.navigateTo({ url: '/pages/goal/index' });
}
```

`goal/index.ts` 的 errorMessages 增加 `LIMIT_REACHED`，精确提示当天目标或任务容量已满，并保留 plan preview 供用户安全返回或重试。

WXML 只遍历 `flow.goalViews`。收起态始终显示标题、状态、进度条和“已完成 X/Y 项”；展开态为该组 current/pending/completed task-card 绑定现有四类事件。所有未完成任务传入 `primary="{{true}}"`。task-card 新增 `canStart` Boolean 属性：同组没有 currentTask 时 pending 卡可开始；已有 currentTask 时其他 pending 卡仍可缩小但开始按钮禁用，并显示“先完成这个目标正在进行的一步”。进行中卡在难度反馈区同时显示“缩小任务”，允许用户把已经开始但过大的任务继续缩小。其他目标不受影响。

空态主按钮文案为“拆解第一个目标”。目标数未满且任务数未满显示“＋拆解新目标”；达到 3 或 10 显示规格中的精确提示。全部任务完成时继续提供整份计划复盘。

WXSS 保留底部 `bottom-nav` 安全区；卡片触控区域至少 88rpx，文字不固定高度、不截断，选中/展开状态同时使用边框、背景、文字和图形。

- [ ] **Step 5: 调整 Goal 返回语义**

仓库当前没有自定义 Home 按钮；截图中的 Home 是微信在目标页被直接设为启动页时管理的原生控件，不改成自定义导航栏隐藏它。正常路径必须由 Today `navigateTo` 进入；确认计划成功后通过 `getCurrentPages().length > 1` 判断页面栈，有上一页则 `wx.navigateBack({ delta: 1 })`，否则回退 `wx.switchTab({ url: '/pages/today/index' })`。底部导航离开未确认草稿的现有确认逻辑必须保留。

- [ ] **Step 6: 验证 GREEN**

Run: `npm test -- --run tests/today-plan.test.ts tests/today-flow.test.ts tests/miniprogram-structure.test.ts tests/task-card.test.ts`

Expected: PASS。

- [ ] **Step 7: 运行客户端关联回归**

Run: `npm test -- --run tests/cloud-api.test.ts tests/plan-update-task-client.test.ts tests/history-page.test.ts`

Expected: PASS；更新/缩小返回的扁平计划能保留已加载目标标题并重建 goalViews，历史仍只读。

- [ ] **Step 8: 记录 RED/GREEN 与差异检查**

运行 `git diff --check`；更新 task report，不提交。

### Task 6: 集成、构建与人工验收清单

**Files:**
- Modify only if tests prove necessary: `README.md`
- Modify only if deployment notes need exact new behavior: `docs/development.md`
- Test: all affected `tests/*.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5 的完整多目标流程。
- Produces: 可部署构建、全量自动检查结果和微信开发者工具人工验收清单。

- [ ] **Step 1: 跑受影响云函数结构和构建测试**

Run: `npm test -- --run tests/plan-confirm-structure.test.ts tests/plan-generate-structure.test.ts tests/plan-get-today-structure.test.ts tests/plan-update-task-repository.test.ts tests/plan-resize-task-structure.test.ts tests/cloudfunction-deployment-entry.test.ts`

Expected: PASS；若因接口/类型变化失败，先增加能描述正确新契约的测试，再做最小修复。

- [ ] **Step 2: 构建所有受影响云函数**

Run:

```powershell
npm.cmd run build --prefix cloudfunctions/plan-confirm
npm.cmd run build --prefix cloudfunctions/plan-generate
npm.cmd run build --prefix cloudfunctions/plan-get-today
npm.cmd run build --prefix cloudfunctions/plan-update-task
npm.cmd run build --prefix cloudfunctions/plan-resize-task
```

Expected: PASS，`plan-confirm`、`plan-generate`、`plan-get-today`、`plan-update-task`、`plan-resize-task` 可生成 CommonJS 部署产物。

- [ ] **Step 3: 全量测试和类型检查**

Run: `npm test -- --run`

Expected: 全部 PASS，无未处理 promise、警告或敏感正文输出。

Run: `npm run typecheck`

Expected: PASS。

- [ ] **Step 4: 差异与范围检查**

Run: `git diff --check`

Expected: 无尾随空格或冲突标记。

Run: `git status --short`

Expected: 只新增本计划/规格和修改计划列出的产品/测试文件；既有未提交改动仍被保留。不得提交或推送。

- [ ] **Step 5: 微信开发者工具人工验收**

重新编译后使用脱敏测试内容验证：

1. 空 Today 显示“拆解第一个目标”。
2. 第一个目标确认后返回 Today 并自动展开。
3. 第二、第三目标追加，旧任务状态不变；第四目标入口不可用。
4. 三个目标合计十项可加载，第十一项被明确拒绝。
5. 三张卡片收起态均显示正确进度；切换展开不跳动。
6. 三个目标各开始一个任务均成功；同目标第二个任务不能同时开始。
7. 完成和缩小操作只更新所属目标；移动队尾不改变其他目标顺序。
8. 全部完成后复盘可用，历史页显示三个目标分组。
9. 正常从 Today 进入目标拆解页时使用微信原生返回能力，不依赖 Home；直接编译目标页时允许微信显示系统 Home；底部导航与草稿离开确认仍可用。
10. iPhone 12/13 尺寸、底部安全区和系统大字下无遮挡、无关键文字截断。

- [ ] **Step 6: 最终独立代码审查**

让独立 reviewer 对照设计规格审查完整 diff，必须同时给出 Spec Compliance 与 Code Quality 结论。所有 Critical/Important 问题修复并进行覆盖测试后，重新审查一次；Minor 记录在 ledger 并在最终交付中披露。
