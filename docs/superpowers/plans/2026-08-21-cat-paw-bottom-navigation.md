# 猫爪底部导航 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将四项文字底栏重设计为三项、可明确识别当前页面的猫爪主导航，并将设置移入“我的”。

**Architecture:** 保留 `custom-tab-bar` 与共享 `bottom-navigation` 组件。组件集中管理今日、历史、我的三个路由，使用线条猫爪和活动胶囊绘制状态；goal 页复用它并保留离开未保存草稿的确认。设置页保持独立，由我的页普通导航进入。

**Tech Stack:** 微信小程序 WXML、WXSS、TypeScript、Vitest。

## Global Constraints

- 底部主导航仅包含“今日 / 历史 / 我的”，设置不在底栏中。
- 不新增第三方依赖、网络资源、字体文件、云函数或数据模型变更。
- 图标使用组件内一致的线条猫爪；状态不得只依赖颜色。
- 每个主导航触控区域至少 88rpx，保留安全区。
- goal 页离开未确认内容前必须沿用确认提示。
- 不提交、不推送、不创建 PR。

---

### Task 1: 以测试固定三项导航与设置层级

**Files:**
- Modify: `tests/miniprogram-structure.test.ts`

**Interfaces:**
- Consumes: `app.json` 的 tabBar 路由与 `bottom-navigation`。
- Produces: 对三项标签、活动胶囊、猫爪图标、我的页设置入口的结构约束。

- [ ] **Step 1: 写失败测试**

```ts
expect(appConfig.tabBar?.list).toEqual([
  { pagePath: 'pages/today/index', text: '今日' },
  { pagePath: 'pages/history/index', text: '历史' },
  { pagePath: 'pages/profile/index', text: '我的' },
]);
expect(navMarkup).toContain('paw-icon');
expect(navStyles).toContain('.nav-item.is-active');
expect(navStyles).toContain('.nav-item.is-active .nav-label');
expect(profileMarkup).toContain('url="/pages/settings/index"');
```

- [ ] **Step 2: 验证 RED**

Run: `npm test -- --run tests/miniprogram-structure.test.ts`

Expected: FAIL，因为旧组件仍包含“设置”，且没有猫爪图标与我的页设置入口。

### Task 2: 实现三项猫爪底栏和活动胶囊

**Files:**
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/components/bottom-navigation/index.ts`
- Modify: `miniprogram/components/bottom-navigation/index.wxml`
- Modify: `miniprogram/components/bottom-navigation/index.wxss`

**Interfaces:**
- Consumes: `activePath: string`、`fixed: boolean`、`intercept: boolean` 和 `navigate` 自定义事件。
- Produces: 三项导航；每项触发 `wx.switchTab({ url })`，被拦截时发出 `{ url }`。

- [ ] **Step 1: 最小实现**

```ts
const tabItems = [
  { url: '/pages/today/index', label: '今日' },
  { url: '/pages/history/index', label: '历史' },
  { url: '/pages/profile/index', label: '我的' },
];
```

每个按钮加入五部分线条猫爪，并保留 `nav-label`：

```xml
<view class="paw-icon" aria-hidden="true">
  <view class="paw-toe paw-toe--left"></view>
  <view class="paw-toe paw-toe--middle-left"></view>
  <view class="paw-toe paw-toe--middle-right"></view>
  <view class="paw-toe paw-toe--right"></view>
  <view class="paw-pad"></view>
</view>
<text class="nav-label">{{item.label}}</text>
```

`.nav-item.is-active` 使用深青圆角胶囊、金色猫爪和浅色文字；未选中项使用暖灰线条。保留已有 `onTap`、`intercept` 与安全区逻辑。

- [ ] **Step 2: 验证 GREEN**

Run: `npm test -- --run tests/miniprogram-structure.test.ts`

Expected: PASS，三项路由、猫爪、活动胶囊和安全区断言均通过。

### Task 3: 在“我的”内提供设置入口

**Files:**
- Modify: `miniprogram/pages/profile/index.wxml`
- Modify: `miniprogram/pages/profile/index.wxss`
- Test: `tests/miniprogram-structure.test.ts`

**Interfaces:**
- Consumes: `/pages/settings/index`。
- Produces: “设置与说明”普通入口；设置页仍独立持有删除账户逻辑。

- [ ] **Step 1: 最小实现**

```xml
<navigator class="settings-entry" url="/pages/settings/index" open-type="navigate">
  <view>
    <text class="settings-entry-title">设置与说明</text>
    <text class="settings-entry-copy">隐私、AI 说明与账户数据</text>
  </view>
  <text class="settings-entry-arrow" aria-hidden="true">›</text>
</navigator>
```

样式保持暖米白卡片语言，触控高度不低于 88rpx。运行 `npm test -- --run tests/miniprogram-structure.test.ts tests/profile-page.test.ts tests/account-delete-structure.test.ts`，预期通过。

### Task 4: goal 路径标签和全量验证

**Files:**
- Modify: `miniprogram/pages/goal/index.wxml`
- Modify: `tests/miniprogram-structure.test.ts`

**Interfaces:**
- Consumes: 三项 `bottom-navigation` 与既有 `onNavigateTab` 草稿保护。
- Produces: “正在制定：目标拆解”路径标签和不变的离开确认。

- [ ] **Step 1: 写失败测试并验证 RED**

断言 goal 模板包含“正在制定：目标拆解”以及 `intercept="{{true}}"`。运行 `npm test -- --run tests/miniprogram-structure.test.ts`，预期因旧标签为“当前：目标拆解”而失败。

- [ ] **Step 2: 最小实现与最终验证**

替换路径标签文案，保留固定定位、安全区计算和 `bind:navigate="onNavigateTab"`。运行全量测试、TypeScript 类型检查、差异检查和状态检查；预期均通过、分支保持 `codex/day7-release-acceptance`，且没有提交、推送或 PR。

- [ ] **Step 3: 人工核验**

在微信开发者工具重新编译后，分别打开今日、历史、我的、设置和目标拆解：确认仅当前主页面显示深青胶囊、金色猫爪和浅色文字；设置仅从我的进入；goal 页显示路径标签且未保存内容离开前弹出确认。
