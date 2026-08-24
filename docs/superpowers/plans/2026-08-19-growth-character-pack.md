# 成长角色素材包与成长页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以真实累计成长值与最近复盘奖励驱动三级小橘成长页。

**Architecture:** 新增 `growth-summary` 云函数，以可信 `WX_OPENID` 查询 `users.growth` 和最近三条 `reviews` 的安全字段；客户端严格校验响应；纯函数选择 12 张本地角色资源。

**Tech Stack:** TypeScript、CloudBase Node SDK 3.18.3、Vitest、透明 PNG。

## Global Constraints

- 不返回 OpenID、复盘正文、文档 ID 或请求 ID。
- 等级固定为 0–99、100–249、250+；不显示连续天数或累计完成数。
- 素材为同一小橘的 12 张透明 PNG；动画只在点击时短暂播放。
- 不修改成长写入、每日上限或删除语义；不提交、不推送。

---

### Task 1: 等级与角色映射

**Files:** Create `miniprogram/shared/growth-profile.ts`; Create `tests/growth-profile.test.ts`.

- [x] **Step 1: 写失败测试**

```ts
expect(getGrowthLevel(99)).toMatchObject({ number: 1, nextThreshold: 100 });
expect(getGrowthLevel(100)).toMatchObject({ number: 2, nextThreshold: 250 });
expect(getGrowthLevel(250)).toMatchObject({ number: 3, nextThreshold: null });
expect(selectGrowthCharacter({ growth: 100, firstVisit: false, taskStatus: 'completed', justConfirmedReview: true, justReachedLevel: false }).key).toBe('celebrate');
```

- [x] **Step 2: 运行失败测试**

Run: `npm.cmd test -- tests/growth-profile.test.ts`

Expected: FAIL，模块不存在。

- [x] **Step 3: 实现并验证**

定义 `level-1`、`level-2`、`level-3`、`welcome`、`focus`、`complete`、`continue`、`return`、`celebrate`、`blink`、`wave`、`hop` 十二键；返回 `/assets/growth/<key>.png`、替代文字和静态默认值。优先级：庆祝、专注、完成、欢迎、基础姿态。

Run: `npm.cmd test -- tests/growth-profile.test.ts`

Expected: PASS。

### Task 2: 安全成长摘要云函数

**Files:** Create `cloudfunctions/growth-summary/{service.ts,handler.ts,index.ts,index.js,package.json,tsconfig.json}`; Create `tests/growth-summary-{service,handler,structure}.test.ts`.

- [x] **Step 1: 写失败测试**

```ts
await expect(getGrowthSummary('owner-a', repository)).resolves.toEqual({ growth: 115, recentAwards: [{ date: '2026-08-19', growthAwarded: 10 }] });
await expect(handleGrowthSummary({}, {}, { getOpenid: () => undefined, createRepository })).resolves.toEqual({ ok: false, code: 'UNAUTHENTICATED' });
```

覆盖最多三条、负数/非整数归零或丢弃、未知错误为 `INTERNAL_ERROR`。

- [x] **Step 2: 运行失败测试**

Run: `npm.cmd test -- tests/growth-summary-service.test.ts tests/growth-summary-handler.test.ts tests/growth-summary-structure.test.ts`

Expected: FAIL，模块不存在。

- [x] **Step 3: 实现与构建**

`index.ts` 使用 `cloudbase.SYMBOL_CURRENT_ENV` 和 `getCloudbaseContext(context).WX_OPENID`。仓储只执行 `users.where({ _openid: openid }).limit(1).get()` 与 `reviews.where({ _openid: openid }).orderBy('createdAt', 'desc').limit(3).get()`，映射仅 `growth`、`date`、`growthAwarded`。

Run: `npm.cmd test -- tests/growth-summary-service.test.ts tests/growth-summary-handler.test.ts tests/growth-summary-structure.test.ts; npm.cmd run build --prefix cloudfunctions/growth-summary`

Expected: PASS，构建成功。

### Task 3: 客户端边界与素材

**Files:** Modify `miniprogram/shared/cloud-api.ts`, `tests/cloud-api.test.ts`; Create `miniprogram/assets/growth/{level-1,level-2,level-3,welcome,focus,complete,continue,return,celebrate,blink,wave,hop}.png`; Create `tests/growth-assets.test.ts`.

- [x] **Step 1: 写失败测试**

```ts
await expect(getGrowthSummary(caller)).resolves.toEqual({ growth: 115, recentAwards: [{ date: '2026-08-19', growthAwarded: 10 }] });
expect(caller).toHaveBeenCalledWith({ name: 'growth-summary', data: {} });
```

拒绝格式错误日期、负数、浮点数、超过三条和额外敏感字段；素材测试逐一断言十二个文件存在。

- [x] **Step 2: 实现、生成素材并验证**

实现严格响应验证器。以已确认的小橘角色稿为参考，生成独立、透明背景、无文字/水印/拼贴的十二张同画风 PNG。

Run: `npm.cmd test -- tests/cloud-api.test.ts tests/growth-assets.test.ts tests/growth-profile.test.ts`

Expected: PASS。

### Task 4: 重建成长个人页与发布门禁

**Files:** Modify `miniprogram/pages/profile/{index.ts,index.wxml,index.wxss,index.json}`, `tests/miniprogram-structure.test.ts`, `README.md`, `docs/development.md`; Create `tests/profile-page.test.ts`.

- [x] **Step 1: 写失败测试**

断言页面调用 `getGrowthSummary`、`getTodayPlan`、`selectGrowthCharacter`，模板有替代文字、进度、`recentAwards`、重试、原 `onDeleteAccount`，样式不含 `infinite` 且 `prefers-reduced-motion: reduce` 禁用动画。

- [x] **Step 2: 实现与完整验证**

页面并发读取摘要与 Today，按真实状态选择角色；渲染累计成长、等级进度和最多三条“完成晚间复盘，获得 N 点成长值”；加载错误仅显示固定中文；删除后显示欢迎姿态。文档加入构建、云端安装依赖、`reviews(_openid,createdAt)` 索引与减少动态效果验收。

Run: `npm.cmd test; npm.cmd run typecheck; npm.cmd run build --prefix cloudfunctions/growth-summary; npm.cmd run build --prefix cloudfunctions/profile-get-or-create; git diff --check`

Expected: 全部 PASS，差异无空白错误。
