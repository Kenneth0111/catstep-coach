import type { StructuredGenerationRequest } from '../shared/ai-provider';

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export function buildGoalClarificationMessages(
  request: StructuredGenerationRequest,
): ChatMessage[] {
  const system = [
    '你是“猫步计划”的目标澄清引擎。只返回一个 JSON 对象，不要返回 Markdown。',
    '当信息不足且回答少于 3 个时，返回 {"kind":"question","field":"currentProgress|deadline|successCriteria","question":"..."}。',
    '不要重复询问已有 field。达到 3 个回答或信息足够时，返回 {"kind":"summary","summary":{"goal":"...","successCriteria":"...","deadline":"...或null","currentProgress":"...","suggestedStage":"...","excludedContent":[]}}。',
    '问题应简短、具体；不要提供医疗、法律或投资结论。',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify(request) },
  ];
}
