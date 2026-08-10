# CatstepCoach Day 3 任务执行实施计划

> **供执行代理使用：**直接在当前工作区内执行，每次只完成一个红—绿—重构循环。未经用户明确授权，不创建 worktree，不提交、不推送、不部署、不创建 PR、不合并，也不删除分支。

**目标：**持久化用户确认的今日计划，在 Today 页面展示该计划，并保存任务完成情况和难度反馈。

**架构：**确定性校验和状态迁移保留在纯 TypeScript 模块中。可信微信身份与 CloudBase 仓库放在轻量云函数入口中，再通过现有的强类型 `cloud-api.ts` 边界提供给小程序。

**技术栈：**原生微信小程序、TypeScript 7、Vitest 4、CloudBase Node.js 20、`@cloudbase/node-sdk` 3.18.3。

## 全局约束

- 直接使用 `D:\AllCode\Project\CatstepCoach`，不创建 Git worktree。
- 保留用户的无关改动，只修改当前任务列出的文件。
- 每项生产行为都必须先编写测试并观察到预期失败。
- 绝不硬编码或提交 AppID、CloudBase 环境 ID、API Key、私有配置或真实用户数据。
- 未经明确授权，不提交、不推送、不部署、不创建 PR、不合并，也不删除分支。

---

### Task 1：确认并持久化今日计划

**文件：**

- 创建：`cloudfunctions/plan-confirm/service.ts`
- 创建：`cloudfunctions/plan-confirm/handler.ts`
- 创建：`cloudfunctions/plan-confirm/index.ts`
- 创建：`cloudfunctions/plan-confirm/index.js`
- 创建：`cloudfunctions/plan-confirm/package.json`
- 创建：`cloudfunctions/plan-confirm/tsconfig.json`
- 创建：`tests/plan-confirm-service.test.ts`
- 创建：`tests/plan-confirm-handler.test.ts`
- 创建：`tests/plan-confirm-structure.test.ts`

**接口：**

- 输入：`{ requestId: string; availableMinutes: number; plan: DailyPlan }`。
- 服务：`confirmDailyPlan(openid, input, repository, now): Promise<ConfirmedDailyPlan>`。
- 仓库：`findActiveGoalIds(openid, goalIds)` 和原子操作 `saveIfAbsent(documentId, plan)`。
- 日期：使用 `Intl.DateTimeFormat` 和 `timeZone: "Asia/Shanghai"` 生成 `YYYY-MM-DD`。

- [x] 为有效保存、同日重放、错误输入、总时长超限和外部目标编写服务测试；验证仓库只接收服务端生成的归属、日期、任务 ID、优先级、状态、版本和时间戳。
- [x] 运行 `npm.cmd test -- --run tests/plan-confirm-service.test.ts`，观察到缺少模块的预期失败。
- [x] 使用 `validateDailyPlanStructure()`、目标归属校验和原子 `saveIfAbsent()` 实现最小服务。
- [x] 重新运行服务测试，确认通过。
- [x] 为未认证、成功、`INVALID_CONTEXT` 和经过净化的 `INTERNAL_ERROR` 响应编写 Handler 测试。
- [x] 运行 `npm.cmd test -- --run tests/plan-confirm-handler.test.ts`，观察到缺少模块的预期失败。
- [x] 实现 Handler 与 CloudBase 仓库；对确定性的“用户/日期”计划文档使用事务，并使用 `_openid`、`status: "active"` 和 `_id in goalIds` 查询活动目标。
- [x] 添加部署入口与结构测试；构建入口为 `dist/plan-confirm/index.js`，由根目录 `index.js` 暴露。
- [x] 运行三个聚焦测试、`npm.cmd run typecheck` 和 `npm.cmd run build --prefix cloudfunctions/plan-confirm`，全部通过。

### Task 2：确认计划预览并让 Today 从 CloudBase 加载计划

**文件：**

- 创建：`cloudfunctions/plan-get-today/service.ts`
- 创建：`cloudfunctions/plan-get-today/handler.ts`
- 创建：`cloudfunctions/plan-get-today/index.ts`
- 创建：`cloudfunctions/plan-get-today/index.js`
- 创建：`cloudfunctions/plan-get-today/package.json`
- 创建：`cloudfunctions/plan-get-today/tsconfig.json`
- 修改：`miniprogram/shared/cloud-api.ts`
- 修改：`miniprogram/shared/goal-flow.ts`
- 创建：`miniprogram/shared/today-flow.ts`
- 修改：`miniprogram/pages/goal/index.ts`
- 修改：`miniprogram/pages/goal/index.wxml`
- 修改：`miniprogram/pages/goal/index.wxss`
- 修改：`miniprogram/pages/today/index.ts`
- 修改：`miniprogram/pages/today/index.wxml`
- 修改：`miniprogram/pages/today/index.wxss`
- 修改：`tests/cloud-api.test.ts`
- 修改：`tests/goal-flow.test.ts`
- 创建：`tests/plan-get-today-service.test.ts`
- 创建：`tests/plan-get-today-handler.test.ts`
- 创建：`tests/plan-get-today-structure.test.ts`
- 创建：`tests/today-flow.test.ts`
- 修改：`tests/miniprogram-structure.test.ts`

**接口：**

- 在客户端边界中增加 `confirmDailyPlan()` 和 `getTodayPlan()`。
- `plan-get-today` 使用可信 `WX_OPENID` 和服务端生成的上海日期读取一份已确认计划；没有计划时返回 `plan: null`。
- 计划预览的编辑操作保留在本地，最终确认时只发送一次完整的编辑后计划。
- Today 页面展示加载中、无计划、错误和已确认计划四种状态，不再依赖本地示例任务。

- [x] 编写失败的 `plan-get-today` 服务、Handler 和部署结构测试。
- [x] 实现最小的已认证今日计划读取云函数，并运行聚焦测试、类型检查和构建。
- [x] 编写失败的传输层测试和纯状态测试。
- [x] 实现最小客户端边界和 Today 状态流。
- [x] 为目标页增加编辑、删除和一个明确的确认操作。
- [x] 用已认证用户的持久化计划替换 Today 示例数据。
- [x] 运行客户端聚焦测试和类型检查，确认通过。

### Task 3：开始和完成任务，并记录难度反馈

**文件：**

- 创建：`cloudfunctions/plan-update-task/service.ts`
- 创建：`cloudfunctions/plan-update-task/handler.ts`
- 创建：`cloudfunctions/plan-update-task/index.ts`
- 创建：`cloudfunctions/plan-update-task/index.js`
- 创建：`cloudfunctions/plan-update-task/package.json`
- 创建：`cloudfunctions/plan-update-task/tsconfig.json`
- 创建：`tests/plan-update-task-service.test.ts`
- 创建：`tests/plan-update-task-handler.test.ts`
- 创建：`tests/plan-update-task-client.test.ts`
- 创建：`tests/task-card.test.ts`
- 修改：`miniprogram/shared/cloud-api.ts`
- 修改：`miniprogram/shared/today-flow.ts`
- 修改：`miniprogram/shared/today-plan.ts`
- 修改：`miniprogram/pages/today/index.ts`
- 修改：`miniprogram/pages/today/index.wxml`
- 修改：`miniprogram/components/task-card/index.ts`
- 修改：`miniprogram/components/task-card/index.wxml`
- 修改：`tests/cloud-api.test.ts`
- 修改：`tests/today-flow.test.ts`
- 修改：`tests/today-plan.test.ts`

**接口：**

- 输入：`{ requestId, planId, taskId, action: "start" | "complete", difficulty? }`。
- 只有完成任务时必须提供难度，值为 `easy`、`just_right` 或 `hard`。
- 服务端使用 `_openid` 和计划 ID 加载计划，执行合法且幂等的状态迁移，并写回更新后的内嵌任务。

- [x] 为合法迁移、非法迁移、难度校验、归属和请求重放编写失败的服务测试。
- [x] 实现纯任务更新服务和已认证仓库。
- [x] 编写失败的客户端测试和 Today 状态测试。
- [x] 实现开始、完成、难度选择、重试和刷新后的汇总界面。
- [x] 运行聚焦测试、类型检查和新云函数构建，确认通过。

### Task 4：完成门禁与文档收尾

- [x] 只根据实际完成的行为更新 `README.md` 和 `docs/development.md`。
- [x] 运行 `npm.cmd test` 和 `npm.cmd run typecheck`。
- [x] 构建全部 CloudBase 云函数，包括 Day 3 新增云函数。
- [x] 运行 `git diff --check`、`git status --short --branch`，并确认没有跟踪私密文件或生成文件。
- [x] 在微信开发者工具连接真实 CloudBase 开发环境，验证确认计划、加载 Today、开始、稳定重试、完成和难度反馈；真实 TokenHub、物理真机与发布部署仍明确标为待验证，且不输出凭证。

## 计划自检

- 计划覆盖已批准 MVP 设计中的 Day 3 范围，不包含 Day 4 行为。
- 计划确认发生在用户审阅之后，而不是生成计划时。
- 每次写操作都经过身份认证、按用户隔离，并且保持幂等。
- Task 1 至 Task 3 的实现切片均已完成独立测试，Task 4 已完成全量门禁与文档收尾。
