# History Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增按月查看本人历史计划的只读日历，让用户按日期回看目标、任务状态和已确认复盘。

**Architecture:** 新增 `plan-history` 云函数，以可信 `WX_OPENID` 按月查询已确认计划，并只为选中日期组合目标名称和复盘。小程序新增独立历史页面，使用纯函数生成月历和猫咪脚印状态，所有历史详情保持只读。

**Tech Stack:** 微信原生小程序、TypeScript 7、CloudBase Node SDK 3.18.3、Vitest 4。

## Global Constraints

- 直接在 `D:\AllCode\Project\CatstepCoach` 和现有 `codex/day6-quality-release` 分支工作，不创建 worktree。
- 遵循红—绿 TDD：每个行为先运行失败测试，再做最小实现。
- 不接受客户端传入的 OpenID 或 owner；不在日志、测试输出或聊天中打印身份和正文。
- 历史页面只读；不修改 Today 执行、提醒、复盘确认、AI 配额或“一天一份计划”规则。
- 不迁移现有数据库，不添加统计、连续打卡、未来计划或历史编辑。
- 猫咪脚印使用本地 WXML/WXSS 单色图形，不依赖平台 Emoji 样式。
- 不提交、不推送、不创建或合并 PR。

---

## File Map

- `cloudfunctions/plan-history/service.ts`：输入校验、月份边界、账号内历史聚合和安全响应类型。
- `cloudfunctions/plan-history/handler.ts`：认证和稳定公共错误映射。
- `cloudfunctions/plan-history/index.ts`：CloudBase 查询适配；计划和复盘按 `_openid` 查询，按 ID 读取的目标再次校验 `_openid`。
- `cloudfunctions/plan-history/index.js`、`package.json`、`tsconfig.json`：云函数部署入口与构建配置。
- `miniprogram/shared/history-calendar.ts`：上海日期、月份切换、月历格子和页面状态纯函数。
- `miniprogram/shared/cloud-api.ts`：`plan-history` 客户端调用及响应验证。
- `miniprogram/pages/history/*`：只读历史页面。
- `miniprogram/pages/today/index.wxml`、`index.wxss`：始终可见的历史入口。
- `miniprogram/app.json`：注册历史页面。
- `tests/plan-history-service.test.ts`：历史聚合和隔离测试。
- `tests/plan-history-handler.test.ts`：认证及错误脱敏测试。
- `tests/plan-history-structure.test.ts`：部署结构和可信查询边界测试。
- `tests/history-calendar.test.ts`：月历、闰年、月份切换和页面状态测试。
- `tests/cloud-api.test.ts`、`tests/miniprogram-structure.test.ts`：客户端边界与页面只读结构测试。
- `docs/development.md`、`docs/day6-quality-release.md`、`README.md`：部署与真实验收说明。

---

### Task 1: 历史服务领域边界

**Files:**
- Create: `cloudfunctions/plan-history/service.ts`
- Test: `tests/plan-history-service.test.ts`

**Interfaces:**
- Consumes: 只读计划、目标名称和复盘仓储。
- Produces: `getPlanHistory(openid, input, repository, now): Promise<PlanHistoryResult>`。

- [ ] **Step 1: 写服务失败测试**

测试固定使用匿名 ID 和合成正文，定义仓储夹具并覆盖：

```ts
const repository: PlanHistoryRepository = {
  async findConfirmedPlans(openid, startDate, endDate) {
    expect({ openid, startDate, endDate }).toEqual({
      openid: 'user-a', startDate: '2026-08-01', endDate: '2026-09-01',
    });
    return [plan('2026-08-17', 'goal-a')];
  },
  async findGoalTitles() { return { 'goal-a': '匿名测试目标' }; },
  async findConfirmedReview() {
    return {
      completionSummary: '完成一项', encouragement: '继续前进', nextSuggestion: '明天复习',
    };
  },
};

await expect(getPlanHistory(
  'user-a',
  { month: '2026-08', selectedDate: '2026-08-17' },
  repository,
  () => new Date('2026-08-18T04:00:00.000Z'),
)).resolves.toMatchObject({
  month: '2026-08',
  selectedDate: '2026-08-17',
  planDates: ['2026-08-17'],
  selectedDay: {
    date: '2026-08-17',
    groups: [{ goalId: 'goal-a', goalTitle: '匿名测试目标' }],
  },
});
```

同一文件增加表格测试：空身份、`2026-8`、不存在日期、选中日期不属于月份、未来月份都抛出 `PlanHistoryError('INVALID_CONTEXT')`；无计划返回 `selectedDay: null`；目标缺失回退为“历史目标”；任务顺序和状态保持不变；只为选中计划查询目标与复盘。

- [ ] **Step 2: 运行测试并确认按预期失败**

Run: `npm.cmd test -- tests/plan-history-service.test.ts`

Expected: FAIL，原因是 `cloudfunctions/plan-history/service.ts` 尚不存在。

- [ ] **Step 3: 写最小服务实现**

在 `service.ts` 定义以下稳定接口：

```ts
export type HistoryTaskStatus = 'pending' | 'in_progress' | 'completed';

export interface StoredHistoryTask {
  id: string;
  title: string;
  estimatedMinutes: number;
  doneCriteria: string;
  goalId: string;
  priority: number;
  status: HistoryTaskStatus;
  difficultyFeedback?: 'easy' | 'just_right' | 'hard';
}

export interface StoredHistoryPlan {
  id: string;
  date: string;
  availableMinutes: number;
  summary: string;
  tasks: StoredHistoryTask[];
}

export interface HistoryReview {
  completionSummary: string;
  encouragement: string;
  nextSuggestion: string;
}

export interface PlanHistoryRepository {
  findConfirmedPlans(openid: string, startDate: string, endDate: string): Promise<StoredHistoryPlan[]>;
  findGoalTitles(openid: string, goalIds: readonly string[]): Promise<Record<string, string>>;
  findConfirmedReview(openid: string, planId: string): Promise<HistoryReview | null>;
}

export interface PlanHistoryResult {
  month: string;
  selectedDate: string;
  planDates: string[];
  selectedDay: null | {
    date: string;
    availableMinutes: number;
    summary: string;
    groups: Array<{ goalId: string; goalTitle: string; tasks: StoredHistoryTask[] }>;
    review: HistoryReview | null;
  };
}

export class PlanHistoryError extends Error {
  constructor(readonly code: 'INVALID_CONTEXT') {
    super(code);
    this.name = 'PlanHistoryError';
  }
}

export async function getPlanHistory(
  openid: string,
  input: unknown,
  repository: PlanHistoryRepository,
  now: () => Date,
): Promise<PlanHistoryResult>;
```

使用严格 `YYYY-MM`、`YYYY-MM-DD` 校验和 UTC 日历往返验证日期；用上海月份判断未来月份。查询范围固定为月初（含）到下月月初（不含）。对 `planDates` 去重并排序；按任务首次出现的 `goalId` 保持分组顺序。

- [ ] **Step 4: 运行服务测试并确认通过**

Run: `npm.cmd test -- tests/plan-history-service.test.ts`

Expected: PASS，且测试输出不含 OpenID 或完整历史正文。

---

### Task 2: 云函数认证、CloudBase 仓储与部署结构

**Files:**
- Create: `cloudfunctions/plan-history/handler.ts`
- Create: `cloudfunctions/plan-history/index.ts`
- Create: `cloudfunctions/plan-history/index.js`
- Create: `cloudfunctions/plan-history/package.json`
- Create: `cloudfunctions/plan-history/tsconfig.json`
- Test: `tests/plan-history-handler.test.ts`
- Test: `tests/plan-history-structure.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `getPlanHistory` 和 `PlanHistoryRepository`。
- Produces: 云函数响应 `{ ok: true, result } | { ok: false, code }`，函数名 `plan-history`。

- [ ] **Step 1: 写 Handler 和部署结构失败测试**

Handler 测试必须断言：未认证时不创建仓储；合法输入返回服务结果；`PlanHistoryError` 映射为 `INVALID_CONTEXT`；其他身份或数据库错误只返回 `INTERNAL_ERROR`。

结构测试必须断言：六个部署文件存在；`package.json.main` 为 `dist/plan-history/index.js`；CommonJS 转发文件内容精确；源码只使用 `WX_OPENID`；计划和复盘查询包含 `_openid: openid`；按 ID 读取的目标在映射前验证 `goal._openid === openid`；客户端事件中的身份字段不参与仓储调用。

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm.cmd test -- tests/plan-history-handler.test.ts tests/plan-history-structure.test.ts`

Expected: FAIL，原因是 Handler 和部署文件尚不存在。

- [ ] **Step 3: 实现 Handler**

```ts
export interface PlanHistoryDependencies {
  getOpenid(context: unknown): string | undefined;
  createRepository(): PlanHistoryRepository;
  now(): Date;
}

export async function handlePlanHistory(
  event: unknown,
  context: unknown,
  dependencies: PlanHistoryDependencies,
) {
  try {
    const openid = dependencies.getOpenid(context);
    if (!openid?.trim()) return { ok: false as const, code: 'UNAUTHENTICATED' as const };
    const result = await getPlanHistory(openid, event, dependencies.createRepository(), dependencies.now);
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      code: error instanceof PlanHistoryError ? 'INVALID_CONTEXT' as const : 'INTERNAL_ERROR' as const,
    };
  }
}
```

不要记录异常对象、输入正文或身份。

- [ ] **Step 4: 核对 CloudBase 官方查询文档**

仅使用腾讯 CloudBase 官方文档确认 Node SDK 3.18.3 的 `command.gte(...).and(command.lt(...))`、`where(...).limit(...).get()` 和文档读取返回结构。把最终确定的索引要求写入 Task 6 文档；不得根据记忆猜测。

- [ ] **Step 5: 实现 CloudBase 仓储与部署文件**

`index.ts` 使用当前环境和可信上下文：

```ts
const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const database = app.database();
const command = database.command;

exports.main = (event: unknown, context: unknown) =>
  handlePlanHistory(event, context, {
    getOpenid: (cloudContext) => cloudbase.getCloudbaseContext(cloudContext).WX_OPENID,
    createRepository,
    now: () => new Date(),
  });
```

仓储规则：

- `plans` 按 `_openid`、`status: 'confirmed'` 和日期半开区间查询，显式 `limit(31)`。
- 只读取选中计划关联的最多五个目标文档，并再次验证 `_openid`，不得返回别人的目标名称。
- `reviews` 按 `_openid` 和 `planId` 查询，显式 `limit(1)`。
- 映射响应时删除 `_id`、`_openid`、owner、requestId 和其他非展示字段。

`package.json` 固定依赖 `@cloudbase/node-sdk: 3.18.3`；`tsconfig.json` 继承根配置，输出到 `dist`；`index.js` 只转发编译入口。

- [ ] **Step 6: 运行测试与构建**

Run:

```powershell
npm.cmd test -- tests/plan-history-handler.test.ts tests/plan-history-structure.test.ts tests/plan-history-service.test.ts
npm.cmd run build --prefix cloudfunctions/plan-history
```

Expected: 三个测试文件全部 PASS，云函数 TypeScript 构建成功。

---

### Task 3: 月历和页面状态纯函数

**Files:**
- Create: `miniprogram/shared/history-calendar.ts`
- Test: `tests/history-calendar.test.ts`

**Interfaces:**
- Consumes: `PlanHistoryResult` 的客户端同形数据。
- Produces: `shanghaiDate`、`shiftMonth`、`buildCalendarCells`、`createHistoryPageState`、`receiveHistoryResult`、`setHistoryPageError`。

- [ ] **Step 1: 写日历失败测试**

覆盖以下精确行为：

```ts
expect(shanghaiDate(new Date('2026-08-17T16:30:00.000Z'))).toEqual({
  date: '2026-08-18', month: '2026-08',
});

const cells = buildCalendarCells('2028-02', ['2028-02-01', '2028-02-29'], '2028-02-29');
expect(cells.filter((cell) => !cell.empty)).toHaveLength(29);
expect(cells.find((cell) => cell.date === '2028-02-29')).toMatchObject({
  hasPlan: true, selected: true,
});
expect(shiftMonth('2026-08', 1, '2026-08')).toBeNull();
expect(shiftMonth('2026-08', -1, '2026-08')).toBe('2026-07');
```

同时验证周一为第一列、空格单元、非法月份拒绝、加载/成功/错误/重试状态以及已有月历在日期详情加载时仍保留。

- [ ] **Step 2: 运行并确认失败**

Run: `npm.cmd test -- tests/history-calendar.test.ts`

Expected: FAIL，原因是共享模块尚不存在。

- [ ] **Step 3: 实现纯函数和页面状态**

稳定类型（客户端视图类型与 Task 1 的安全响应字段逐项同形，但不从云函数目录导入运行时代码）：

```ts
export interface ClientHistoryTask {
  id: string;
  title: string;
  estimatedMinutes: number;
  doneCriteria: string;
  goalId: string;
  priority: number;
  status: 'pending' | 'in_progress' | 'completed';
  difficultyFeedback?: 'easy' | 'just_right' | 'hard';
}

export interface ClientPlanHistoryResult {
  month: string;
  selectedDate: string;
  planDates: string[];
  selectedDay: null | {
    date: string;
    availableMinutes: number;
    summary: string;
    groups: Array<{
      goalId: string;
      goalTitle: string;
      tasks: ClientHistoryTask[];
    }>;
    review: null | {
      completionSummary: string;
      encouragement: string;
      nextSuggestion: string;
    };
  };
}

export interface CalendarCell {
  key: string;
  empty: boolean;
  day: number | null;
  date: string | null;
  hasPlan: boolean;
  selected: boolean;
}

export interface HistoryPageState {
  stage: 'loading' | 'ready' | 'error';
  month: string;
  selectedDate: string;
  result: ClientPlanHistoryResult | null;
  errorCode: PublicErrorCode | null;
}
```

用 `Date.UTC` 计算闰年、每月天数和星期偏移，避免本机时区改变日期。`shanghaiDate` 使用 UTC 时间加八小时后截取 ISO 日期。`shiftMonth` 只允许格式正确的月份，且不得超过当前上海月份。

- [ ] **Step 4: 运行并确认通过**

Run: `npm.cmd test -- tests/history-calendar.test.ts`

Expected: PASS。

---

### Task 4: 客户端云函数边界

**Files:**
- Modify: `miniprogram/shared/cloud-api.ts`
- Modify: `tests/cloud-api.test.ts`

**Interfaces:**
- Consumes: Task 1 响应的客户端同形类型。
- Produces: `getPlanHistory(input, caller?): Promise<ClientPlanHistoryResult>`。

- [ ] **Step 1: 写客户端失败测试**

增加合法请求测试：

```ts
const input = { month: '2026-08', selectedDate: '2026-08-17' };
await expect(getPlanHistory(input, caller)).resolves.toMatchObject({
  month: '2026-08', selectedDate: '2026-08-17', planDates: ['2026-08-17'],
});
expect(caller).toHaveBeenCalledWith({ name: 'plan-history', data: input });
```

增加表格测试拒绝：非数组 `planDates`、越界日期、未知任务状态、缺失任务完成标准、非法难度反馈、缺失目标标题和格式错误复盘。期望统一抛出 `CloudApiError('INTERNAL_ERROR')`。

- [ ] **Step 2: 运行并确认失败**

Run: `npm.cmd test -- tests/cloud-api.test.ts`

Expected: FAIL，原因是 `getPlanHistory` 尚未导出。

- [ ] **Step 3: 实现严格响应验证器与调用函数**

```ts
export async function getPlanHistory(
  input: { month: string; selectedDate: string },
  caller: CloudFunctionCaller = platformCaller,
): Promise<ClientPlanHistoryResult> {
  const response = await callCloudFunction('plan-history', input, caller);
  if (!isPlanHistoryResult(response.result)) {
    throw new CloudApiError('INTERNAL_ERROR');
  }
  return response.result;
}
```

验证器必须逐层验证月份、日期、任务数量与字段、状态、可选难度反馈、目标分组和可空复盘，不能只做类型断言。

- [ ] **Step 4: 运行并确认通过**

Run: `npm.cmd test -- tests/cloud-api.test.ts tests/history-calendar.test.ts`

Expected: PASS。

---

### Task 5: 只读历史页面与猫咪脚印

**Files:**
- Create: `miniprogram/pages/history/index.ts`
- Create: `miniprogram/pages/history/index.wxml`
- Create: `miniprogram/pages/history/index.wxss`
- Create: `miniprogram/pages/history/index.json`
- Modify: `miniprogram/pages/today/index.wxml`
- Modify: `miniprogram/pages/today/index.wxss`
- Modify: `miniprogram/app.json`
- Modify: `tests/miniprogram-structure.test.ts`

**Interfaces:**
- Consumes: Task 3 页面状态和 Task 4 `getPlanHistory`。
- Produces: `/pages/history/index` 只读页面和 Today 的“历史”入口。

- [ ] **Step 1: 写页面结构失败测试**

测试必须读取真实文件并断言：

- `app.json` 注册 `pages/history/index`。
- Today 在所有页面状态之外包含指向历史页的 navigator。
- 历史页调用 `getPlanHistory`，包含上月、下月、日期选择和重试事件。
- 模板包含 `paw-icon`、加载、无计划、无复盘、错误和目标分组区域。
- 模板不包含 `onStartTask`、`onCompleteTask`、`onResizeTask`、提醒或生成复盘绑定。
- WXSS 中日期单元最小高度为 `88rpx`，页面包含底部安全区 padding，脚印由单色圆形和掌垫组成；目标、任务与复盘没有固定文本高度或隐藏溢出，文字放大后可以自然换行。

- [ ] **Step 2: 运行并确认失败**

Run: `npm.cmd test -- tests/miniprogram-structure.test.ts`

Expected: FAIL，原因是历史页面尚未注册或文件不存在。

- [ ] **Step 3: 实现页面逻辑**

页面启动时用 `shanghaiDate(new Date())` 得到当前月份和今天；调用：

```ts
await getPlanHistory({ month: state.month, selectedDate: state.selectedDate });
```

上月切换默认选中该月 1 日；返回当前月时选中今天。点击日期只更新选中日期并重新请求详情，保留已加载月历直到响应返回。使用请求序号忽略过期响应，避免快速切月后旧请求覆盖新月份。错误消息只依据 `CloudApiError.code` 映射为固定中文，不拼接异常正文。

- [ ] **Step 4: 实现只读模板与样式**

模板结构保持单列：顶部返回 Today 和月份标题；月份导航；七列完整月历；当日计划详情；按目标分组的任务；可选复盘卡片。

猫咪脚印用 WXML/WXSS 组合元素：

```xml
<view class="paw-icon" wx:if="{{item.hasPlan}}" aria-label="这一天有计划">
  <view class="paw-toe paw-toe-1"></view>
  <view class="paw-toe paw-toe-2"></view>
  <view class="paw-toe paw-toe-3"></view>
  <view class="paw-toe paw-toe-4"></view>
  <view class="paw-pad"></view>
</view>
```

选中日期使用绿色背景；未选中脚印用金色，选中脚印用浅金色。日期按钮同时带有可读日期和是否有计划的辅助文字。任务只渲染文字与状态，不使用可修改的 `task-card` 组件。

- [ ] **Step 5: 运行页面测试、类型检查**

Run:

```powershell
npm.cmd test -- tests/miniprogram-structure.test.ts tests/history-calendar.test.ts tests/cloud-api.test.ts
npm.cmd run typecheck
```

Expected: 全部 PASS，TypeScript 无错误。

---

### Task 6: 文档、全量验证与真实环境交接

**Files:**
- Modify: `README.md`
- Modify: `docs/development.md`
- Modify: `docs/day6-quality-release.md`

**Interfaces:**
- Consumes: 完成的 `plan-history` 云函数和历史页面。
- Produces: 初学者可执行的部署、索引确认和双账号验收步骤。

- [ ] **Step 1: 在云函数结构测试中增加文档断言**

修改 `tests/plan-history-structure.test.ts`，读取 `docs/development.md` 和 `docs/day6-quality-release.md`，断言包含 `plan-history` 构建命令、云端安装依赖、历史页验收和双账号删除隔离步骤。不新增仅检查文字的独立测试文件。

- [ ] **Step 2: 运行并确认文档测试失败**

Run: `npm.cmd test -- tests/plan-history-structure.test.ts`

Expected: FAIL，原因是部署和验收说明尚未更新。

- [ ] **Step 3: 更新文档**

文档必须明确：

1. `npm.cmd run build --prefix cloudfunctions/plan-history`。
2. 在微信开发者工具中以“云端安装依赖”上传 `plan-history`。
3. 根据 Task 2 查到的官方要求配置或确认所需索引；不得写未经真实验证的索引名称。
4. 两个测试账号分别创建匿名历史计划，验证彼此不可见。
5. 删除账号 A 后，A 历史清空且 B 的历史记录数量不变。
6. 不截图或记录 OpenID、目标正文、任务正文、复盘正文和密钥。
7. 在真机开启系统文字放大，确认月历日期仍可选择，目标、任务与复盘不截断，最后一项不被底部安全区遮挡。

- [ ] **Step 4: 运行完整自动验证**

Run:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build --prefix cloudfunctions/plan-history
git diff --check
```

Expected: 全量测试和类型检查通过；新云函数构建通过；差异无空白错误。

- [ ] **Step 5: 给出真实 CloudBase 验收清单**

交接时报告自动测试文件数与测试数，并指导用户：上传新云函数和小程序体验版；用 A/B 两个测试身份检查历史隔离；在 A 删除前后记录八个业务集合的本地数量；确认 B 数量不变；检查 `deletion_audits` 只有 `_id`、`event`、`deletedAt` 等安全字段。不得代替用户宣称真机或真实 CloudBase 已通过。
