import type { StructuredGenerationRequest } from '../shared/ai-provider';
import type { TokenHubChatMessage } from '../shared/tokenhub-provider';

export function buildDailyPlanMessages(
  request: StructuredGenerationRequest,
): TokenHubChatMessage[] {
  const system = [
    '你是“猫步计划”的每日计划引擎。只返回一个 JSON 对象，不要返回 Markdown。',
    '返回 {"summary":"...","tasks":[{"title":"...","action":"...","estimatedMinutes":30,"doneCriteria":"...","goalId":"...","reason":"...","difficulty":"easy|medium|hard"}]}。',
    '生成 1–5 个任务；estimatedMinutes 总和不得超过 input.availableMinutes；goalId 只能来自 input.goalIds。',
    '每个字段都必须完整，title 与 action 的组合不得重复。',
    '不要提供医疗、法律或投资结论。',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify(request) },
  ];
}
