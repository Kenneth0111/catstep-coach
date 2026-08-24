export const growthCharacterKeys = [
  'level-1',
  'level-2',
  'level-3',
  'welcome',
  'focus',
  'complete',
  'continue',
  'return',
  'celebrate',
  'blink',
  'wave',
  'hop',
] as const;

export type GrowthCharacterKey = (typeof growthCharacterKeys)[number];
export type GrowthTaskStatus = 'none' | 'in_progress' | 'completed';

export interface GrowthLevel {
  number: 1 | 2 | 3;
  name: '起步伙伴' | '灵感观察员' | '稳定行动家';
  nextThreshold: 100 | 250 | null;
  progress: number;
}

export interface GrowthCharacter {
  key: GrowthCharacterKey;
  src: string;
  alt: string;
  animated: false;
}

export interface GrowthCharacterInput {
  growth: number;
  firstVisit: boolean;
  taskStatus: GrowthTaskStatus;
  justConfirmedReview: boolean;
  justReachedLevel: boolean;
}

const characterAlt: Record<GrowthCharacterKey, string> = {
  'level-1': '小橘作为起步伙伴，准备陪你迈出第一步',
  'level-2': '小橘作为灵感观察员，背着小书包陪你前进',
  'level-3': '小橘作为稳定行动家，自信地站在新的起点',
  welcome: '小橘探头欢迎你回来',
  focus: '小橘认真专注地陪你完成当前任务',
  complete: '小橘开心地为完成任务鼓掌',
  continue: '小橘背着小书包继续向前走',
  return: '小橘安静等待并欢迎你再次回来',
  celebrate: '小橘举起爪子庆祝你的成长',
  blink: '小橘轻轻眨眼',
  wave: '小橘挥爪向你问好',
  hop: '小橘开心地轻轻跳起',
};

function normalizedGrowth(growth: number): number {
  return Number.isFinite(growth) && growth > 0 ? Math.floor(growth) : 0;
}

export function getGrowthLevel(growth: number): GrowthLevel {
  const normalized = normalizedGrowth(growth);
  if (normalized >= 250) {
    return { number: 3, name: '稳定行动家', nextThreshold: null, progress: 1 };
  }
  if (normalized >= 100) {
    return {
      number: 2,
      name: '灵感观察员',
      nextThreshold: 250,
      progress: (normalized - 100) / 150,
    };
  }
  return {
    number: 1,
    name: '起步伙伴',
    nextThreshold: 100,
    progress: normalized / 100,
  };
}

export function getGrowthCharacter(key: GrowthCharacterKey): GrowthCharacter {
  return {
    key,
    src: `/assets/growth/${key}.png`,
    alt: characterAlt[key],
    animated: false,
  };
}

export function selectGrowthCharacter(input: GrowthCharacterInput): GrowthCharacter {
  if (input.justConfirmedReview || input.justReachedLevel) {
    return getGrowthCharacter('celebrate');
  }
  if (input.taskStatus === 'in_progress') {
    return getGrowthCharacter('focus');
  }
  if (input.taskStatus === 'completed') {
    return getGrowthCharacter('complete');
  }
  if (input.firstVisit) {
    return getGrowthCharacter('welcome');
  }
  return getGrowthCharacter(`level-${getGrowthLevel(input.growth).number}`);
}
