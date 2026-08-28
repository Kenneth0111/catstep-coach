# AI Runtime Configuration Design

## Goal

让四个调用 TokenHub 的 CloudBase 云函数从一个可在运行时修改、仅服务端可读取的配置文档取得 API Key、Base URL 和模型；客户端、日志和函数响应均不得得到 API Key。

## Design

在 `runtime_settings` 集合中使用固定文档 `_id: "ai_provider"`：

```json
{
  "_id": "ai_provider",
  "apiKey": "TokenHub API Key",
  "baseUrl": "https://tokenhub.tencentmaas.com/v1",
  "model": "model-id"
}
```

新增共享 module `cloudfunctions/shared/ai-runtime-config.ts`。其小 interface 接受 CloudBase 数据库与旧运行时环境变量，按每一次 AI 请求读取该文档；完整且合法的文档优先，否则整体回退到现有 `TOKENHUB_API_KEY`、`TOKENHUB_BASE_URL` 和 `TOKENHUB_MODEL`。不会混合两个来源，避免轮换 API Key 时取到不一致的配置。无缓存，因此控制台保存后下一次调用会读取新值；数据库读取异常也安全回退到旧变量。

四个云函数入口只通过该 module 创建 provider；工作流、消息构建和现有规则降级保持不变。`plan-generate` 继续仅对 DeepSeek Base URL 施加现有的请求覆盖。

## Security and Migration

`runtime_settings` 必须在 CloudBase 控制台配置为客户端 `read: false`、`write: false`，只允许云函数的管理员身份读取。小程序不添加读取路径。首次部署代码后，旧环境变量继续生效，直到创建并验证该文档；之后日常只修改该文档。部署不是本次任务的一部分。
