# 原生底部导航与独立设置页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用微信原生四项 tabBar 取代顶部文字入口，把说明与账户删除迁移到独立设置页，并统一中文系统字体。

**Architecture:** `app.json` 注册 Today、历史、我的、设置四个 tabBar 页面；目标制定仍为普通页面，确认计划后通过 `wx.switchTab` 返回 Today。设置页独立持有 `deleteAccount()` 交互，成长页只负责认证成长摘要与角色展示。

**Tech Stack:** 原生微信小程序、TypeScript、WXML、WXSS、Vitest。

## Global Constraints

- tabBar 顺序固定为“今日 / 历史 / 我的 / 设置”。
- 使用原生 tabBar，不创建自定义底栏组件，不引入网络图标、字体文件或第三方依赖。
- 全局字体栈为 `"PingFang SC", "Microsoft YaHei", sans-serif`；标题字重 600–700，正文 400–500。
- 不改变计划、历史、成长与账户删除的数据语义，不新增云函数、集合或索引。
- 不输出 OpenID、用户正文或密钥。
- 不提交、不推送、不创建或合并 PR。

---

### Task 1: 注册原生 tabBar 并修正 Today 路由

**Files:**
- Modify: `tests/miniprogram-structure.test.ts`
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/pages/goal/index.ts`

**Interfaces:**
- Consumes: 微信原生 `tabBar` 配置与 `wx.switchTab({ url })`。
- Produces: 四项底部导航；目标确认后安全回到 tabBar Today 页。

- [x] **Step 1: 写失败测试**

把原“页面注册”和 `wx.redirectTo` 断言调整为：

```ts
expect(appConfig.pages).toEqual([
  'pages/today/index',
  'pages/goal/index',
  'pages/history/index',
  'pages/profile/index',
  'pages/settings/index',
]);
expect(appConfig.tabBar?.list).toEqual([
  { pagePath: 'pages/today/index', text: '今日' },
  { pagePath: 'pages/history/index', text: '历史' },
  { pagePath: 'pages/profile/index', text: '我的' },
  { pagePath: 'pages/settings/index', text: '设置' },
]);
expect(source).toContain('wx.switchTab');
expect(source).not.toContain('wx.redirectTo');
expect(todayMarkup).toContain('open-type="navigate"');
```

- [x] **Step 2: 运行失败测试**

Run: `npm test -- --run tests/miniprogram-structure.test.ts`

Expected: FAIL，设置页未注册、`tabBar` 不存在、启动页仍为目标页且目标确认仍使用 `wx.redirectTo`。

- [x] **Step 3: 最小实现路由配置**

在 `app.json` 增加：

```json
"tabBar": {
  "color": "#71695D",
  "selectedColor": "#356F63",
  "backgroundColor": "#FFFAF0",
  "borderStyle": "black",
  "list": [
    { "pagePath": "pages/today/index", "text": "今日" },
    { "pagePath": "pages/history/index", "text": "历史" },
    { "pagePath": "pages/profile/index", "text": "我的" },
    { "pagePath": "pages/settings/index", "text": "设置" }
  ]
}
```

并把目标确认成功后的跳转改为：

```ts
await wx.switchTab({ url: '/pages/today/index' });
```

同时把 Today 设为 `pages` 第一项，并把无计划状态的目标入口设为可返回的普通导航：

```xml
<navigator class="state-action" url="/pages/goal/index" open-type="navigate">去制定计划</navigator>
```

- [x] **Step 4: 运行定向测试**

Run: `npm test -- --run tests/miniprogram-structure.test.ts`

Expected: 设置页文件尚未创建时只剩结构存在性相关失败，tabBar 与 `switchTab` 断言通过。

---

### Task 2: 以 TDD 创建独立设置页并迁移删除行为

**Files:**
- Modify: `tests/account-delete-structure.test.ts`
- Modify: `tests/profile-page.test.ts`
- Create: `miniprogram/pages/settings/index.ts`
- Create: `miniprogram/pages/settings/index.json`
- Create: `miniprogram/pages/settings/index.wxml`
- Create: `miniprogram/pages/settings/index.wxss`
- Modify: `miniprogram/pages/profile/index.ts`
- Modify: `miniprogram/pages/profile/index.wxml`
- Modify: `miniprogram/pages/profile/index.wxss`

**Interfaces:**
- Consumes: `deleteAccount(): Promise<void>` from `miniprogram/shared/cloud-api.ts`。
- Produces: `settings` 页面方法 `onDeleteAccount()`；不再由 `profile` 页面拥有删除状态。

- [x] **Step 1: 写失败测试**

```ts
const settings = resolve(process.cwd(), 'miniprogram/pages/settings');
expect(await readFile(resolve(settings, 'index.wxml'), 'utf8')).toContain('AI 生成内容');
expect(await readFile(resolve(settings, 'index.wxml'), 'utf8')).toContain('隐私与数据');
expect(await readFile(resolve(settings, 'index.wxml'), 'utf8')).toContain('删除全部数据');
expect(await readFile(resolve(settings, 'index.ts'), 'utf8')).toContain('deleteAccount');
expect(await readFile(resolve(settings, 'index.ts'), 'utf8')).toContain('onDeleteAccount');

expect(profileMarkup).not.toContain('设置与说明');
expect(profileMarkup).not.toContain('AI 生成内容');
expect(profileMarkup).not.toContain('删除全部数据');
expect(profileSource).not.toContain('onDeleteAccount');
```

- [x] **Step 2: 运行失败测试**

Run: `npm test -- --run tests/account-delete-structure.test.ts tests/profile-page.test.ts`

Expected: FAIL，设置页不存在且成长页仍包含设置和删除行为。

- [x] **Step 3: 创建设置页最小实现**

`settings/index.ts` 使用既有确认和固定错误文案：

```ts
import { deleteAccount } from '../../shared/cloud-api';

Page({
  data: { deleting: false, message: '' },
  async onDeleteAccount() {
    const confirmation = await wx.showModal({
      title: '删除全部数据',
      content: '此操作会删除你的目标、计划、复盘、记忆和提醒，且无法恢复。',
      confirmText: '确认删除',
      confirmColor: '#A33A2B',
    });
    if (!confirmation.confirm) return;
    this.setData({ deleting: true, message: '' });
    try {
      await deleteAccount();
      this.setData({ message: '你的数据已删除。' });
    } catch {
      this.setData({ message: '删除没有完成，请稍后重试。' });
    } finally {
      this.setData({ deleting: false });
    }
  },
});
```

WXML 分成三个可读卡片，删除按钮保持至少 88rpx 触控高度；WXSS 使用现有米白、青绿与危险红色，不添加业务入口。

- [x] **Step 4: 从成长页精准移除设置职责**

删除 `deleteAccount` 导入、`deleting/message` 数据、`onDeleteAccount` 方法和 `settings-card` 模板；保留 `getGrowthSummary`、`getTodayPlan`、角色互动和所有加载/错误状态。

- [x] **Step 5: 运行定向测试与类型检查**

Run: `npm test -- --run tests/account-delete-structure.test.ts tests/profile-page.test.ts tests/miniprogram-structure.test.ts; npm run typecheck`

Expected: PASS。

---

### Task 3: 删除顶部入口并统一中文字体层级

**Files:**
- Modify: `tests/miniprogram-structure.test.ts`
- Modify: `miniprogram/pages/today/index.wxml`
- Modify: `miniprogram/pages/today/index.wxss`
- Modify: `miniprogram/pages/history/index.wxml`
- Modify: `miniprogram/pages/history/index.wxss`
- Modify: `miniprogram/pages/history/index.json`
- Modify: `miniprogram/pages/profile/index.wxss`
- Modify: `miniprogram/pages/profile/index.json`
- Modify: `miniprogram/app.wxss`

**Interfaces:**
- Consumes: Task 1 的原生 tabBar。
- Produces: 无重复顶部导航、跨平台一致的中文系统字体。

- [x] **Step 1: 写失败测试**

```ts
expect(todayMarkup).not.toContain('intro-links');
expect(todayMarkup).not.toContain('url="/pages/history/index"');
expect(todayMarkup).not.toContain('url="/pages/profile/index"');
expect(historyMarkup).not.toContain('返回 Today');
expect(appStyles).toContain('"PingFang SC"');
expect(appStyles).toContain('"Microsoft YaHei"');
expect(`${historyStyles}\n${profileStyles}`).not.toMatch(/font-weight:\s*(?:750|800)/);
```

- [x] **Step 2: 运行失败测试**

Run: `npm test -- --run tests/miniprogram-structure.test.ts tests/profile-page.test.ts`

Expected: FAIL，旧顶部入口和旧字体权重仍存在。

- [x] **Step 3: 实现最小视觉修改**

- 从 Today 删除 `intro-links`，并把 `.intro` 的顶部间距收紧。
- 从历史页删除 `today-link`。
- 将历史页标题设为“历史”，成长页标题设为“我的”，设置页标题设为“设置”。
- `app.wxss` 的 `page` 字体改为 `"PingFang SC", "Microsoft YaHei", sans-serif`。
- 将历史页和成长页的 750/800 字重降为 700；正文维持默认 400，不改变字号和数据布局。

- [x] **Step 4: 运行定向测试**

Run: `npm test -- --run tests/miniprogram-structure.test.ts tests/profile-page.test.ts tests/account-delete-structure.test.ts`

Expected: PASS。

---

### Task 4: 完整回归与开发者工具交接

**Files:**
- Modify: `docs/development.md`
- Modify: `docs/superpowers/plans/2026-08-20-bottom-tabbar-settings.md`

**Interfaces:**
- Consumes: Tasks 1–3 的最终页面结构。
- Produces: 可执行的编译与手工验收清单。

- [x] **Step 1: 更新手工验收说明**

在 `docs/development.md` 增加：重新编译后依次点击四项 tabBar；确认 Today 无顶部重复入口、设置页可删除、删除后切换到“我的”显示空档案、历史滚动到底不被 tabBar 遮挡。结果只记录“通过 / 未通过 / 未验证”。

- [x] **Step 2: 运行完整自动验证**

Run: `npm test; npm run typecheck; git diff --check`

Expected: 所有测试文件和测试项通过；TypeScript 无错误；差异无空白错误。

- [x] **Step 3: 审计工作区与权限边界**

Run: `git status --short --branch`

Expected: 当前分支仍为 `codex/day7-release-acceptance`；只包含本轮及此前已确认改动；没有提交、推送或 PR 操作。

- [x] **Step 4: 标记计划完成**

把本文件所有实施步骤由 `[ ]` 更新为 `[x]`，并再次执行 `git diff --check`。
