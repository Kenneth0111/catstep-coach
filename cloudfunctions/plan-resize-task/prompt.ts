import type { StructuredGenerationRequest } from '../shared/ai-provider';
import type { TokenHubChatMessage } from '../shared/tokenhub-provider';

export function buildResizeTaskMessages(request: StructuredGenerationRequest): TokenHubChatMessage[] {
  return [
    {
      role: 'system',
      content: '你是“猫步计划”的任务缩小助手。只返回 JSON，不返回 Markdown。返回 {"title":"...","action":"...","estimatedMinutes":整数,"doneCriteria":"...","reason":"...","difficulty":"easy|medium|hard"}。任务必须比 input.task.estimatedMinutes 更短，保持同一目标，使用温和、具体且安全的措辞。',
    },
    { role: 'user', content: JSON.stringify(request) },
  ];
}
