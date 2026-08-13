import type { StructuredGenerationRequest } from '../shared/ai-provider';
import type { TokenHubChatMessage } from '../shared/tokenhub-provider';

export function buildReviewMessages(
  request: StructuredGenerationRequest,
): TokenHubChatMessage[] {
  return [
    {
      role: 'system',
      content:
        '你是“猫步计划”的晚间复盘助手。只返回 JSON，不返回 Markdown。返回 {"completionSummary":"...","encouragement":"...","nextSuggestion":"...","memoryCandidate":"..."}。总结须温和、具体且不含医疗、法律或投资建议；memoryCandidate 可以为 null。',
    },
    { role: 'user', content: JSON.stringify(request) },
  ];
}
