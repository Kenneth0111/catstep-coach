# 本地开发指南

这份指南用于在 Windows 上安装依赖、运行自动检查，并把猫步计划导入微信开发者工具。当前 Day 1 基础包含 Today 页面、确定性的任务选择规则和 Profile 初始化云函数边界；Today 页面暂时使用本地示例数据，尚未接入 CloudBase 持久化。

## 前置条件

- Node.js 22
- npm
- 已登录的微信开发者工具
- 一个微信小程序 AppID
- 一个可用的 CloudBase 账号

不要把真实 AppID、CloudBase 环境 ID、密钥或个人配置提交到 Git。

## 安装与自动验证

在仓库根目录执行：

```powershell
npm.cmd install
npm.cmd test
npm.cmd run typecheck
```

预期结果：Vitest 全部通过，TypeScript 不报告错误。

需要持续运行测试时，使用：

```powershell
npm.cmd run test:watch
```

Profile 云函数有独立的 CommonJS 构建配置。部署前执行：

```powershell
npm.cmd run build --prefix cloudfunctions/profile-get-or-create
```

编译产物位于 `cloudfunctions/profile-get-or-create/dist/`，不会提交到 Git。

## 导入微信开发者工具

1. 打开微信开发者工具，选择“导入项目”。
2. 项目目录选择仓库根目录，不要只选择 `miniprogram/`。
3. 确认工具识别到 `miniprogramRoot` 为 `miniprogram/`，`cloudfunctionRoot` 为 `cloudfunctions/`。
4. 首次导入时，公共配置中的 `touristappid` 可用于游客模式预览。

要使用自己的小程序身份，在仓库根目录创建 `project.private.config.json`：

```json
{
  "description": "Local WeChat DevTools settings; do not commit.",
  "appid": "wxYOUR_LOCAL_APPID"
}
```

也可以在开发者工具的“详情 → 基本信息”中选择真实 AppID，并确认改动写入 `project.private.config.json`，而不是覆盖公共的 `project.config.json`。该私有文件已在 `.gitignore` 中排除。

用下面的命令确认它不会被提交：

```powershell
git check-ignore project.private.config.json
```

命令应输出 `project.private.config.json`。

## 创建 CloudBase 开发环境

1. 使用真实 AppID 打开项目并登录微信开发者工具。
2. 点击顶部“云开发”，首次进入时按提示开通服务并创建开发环境。
3. 等待环境初始化完成，确认开发者工具能看到该环境。
4. 不要把环境 ID 写进 `project.config.json`、源码或提交记录。

Profile 云函数通过 `@cloudbase/node-sdk` 的当前环境标识初始化，不需要在仓库中硬编码环境 ID。部署前先运行云函数构建命令，然后在 `cloudfunctions/profile-get-or-create/` 上右键，选择云端安装依赖的上传部署方式。

当前小程序入口尚未调用 Profile 云函数。创建环境和部署函数只是在准备后端边界；页面持久化集成属于后续任务。

## 手工检查 Today 页面

1. 在开发者工具中编译项目。
2. 确认首页显示“猫步计划”、当前任务和“接下来”列表。
3. 点击“开始这一小步”。
4. 确认当前任务状态从“待开始”变为“进行中”。

## 常见问题

### 导入后找不到页面

确认导入的是仓库根目录，并检查 `project.config.json` 中的 `miniprogramRoot` 是否为 `miniprogram/`。

### TypeScript 配置没有生效

确认 `project.config.json` 的 `setting.useCompilerPlugins` 包含 `typescript`，然后重新编译。

### CloudBase 环境不可用

确认开发者工具使用的 AppID 已关联目标环境，并确认环境仍处于可用状态。环境 ID 只保存在本地或云端配置中。

### 云函数部署后找不到入口

重新执行云函数构建：

```powershell
npm.cmd run build --prefix cloudfunctions/profile-get-or-create
```

确认 `cloudfunctions/profile-get-or-create/dist/index.js` 存在，再选择云端安装依赖并重新部署。

## 相关文档

- [项目概览](../README.md)
- [MVP 产品需求与技术设计](superpowers/specs/2026-08-06-catstep-mini-program-design.md)
- [Day 1 Foundation 实施计划](superpowers/plans/2026-08-06-day1-foundation.md)
