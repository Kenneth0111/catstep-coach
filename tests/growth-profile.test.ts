import { describe, expect, it } from 'vitest';
import {
  getGrowthLevel,
  getGrowthCharacter,
  growthCharacterKeys,
  selectGrowthCharacter,
} from '../miniprogram/shared/growth-profile';

describe('growth profile presentation', () => {
  it.each([
    [0, 1, '起步伙伴', 100, 0],
    [99, 1, '起步伙伴', 100, 0.99],
    [100, 2, '灵感观察员', 250, 0],
    [249, 2, '灵感观察员', 250, 149 / 150],
    [250, 3, '稳定行动家', null, 1],
  ] as const)('maps %i growth to the expected level', (growth, number, name, nextThreshold, progress) => {
    expect(getGrowthLevel(growth)).toEqual({
      number,
      name,
      nextThreshold,
      progress,
    });
  });

  it('normalizes invalid growth without inventing progress', () => {
    expect(getGrowthLevel(-4)).toEqual(getGrowthLevel(0));
    expect(getGrowthLevel(Number.NaN)).toEqual(getGrowthLevel(0));
  });

  it('chooses the highest-priority real state', () => {
    expect(selectGrowthCharacter({
      growth: 100,
      firstVisit: false,
      taskStatus: 'completed',
      justConfirmedReview: true,
      justReachedLevel: false,
    }).key).toBe('celebrate');
    expect(selectGrowthCharacter({
      growth: 100,
      firstVisit: false,
      taskStatus: 'in_progress',
      justConfirmedReview: false,
      justReachedLevel: false,
    }).key).toBe('focus');
    expect(selectGrowthCharacter({
      growth: 0,
      firstVisit: true,
      taskStatus: 'none',
      justConfirmedReview: false,
      justReachedLevel: false,
    }).key).toBe('welcome');
  });

  it('registers all twelve local character assets', () => {
    expect(growthCharacterKeys).toHaveLength(12);
    for (const key of growthCharacterKeys) {
      const character = getGrowthCharacter(key);
      expect(character).toMatchObject({
        key,
        src: `/assets/growth/${key}.png`,
        animated: false,
      });
      expect(character.alt.length).toBeGreaterThan(0);
    }
  });
});
