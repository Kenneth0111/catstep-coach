import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('personal growth page', () => {
  const page = resolve(process.cwd(), 'miniprogram', 'pages', 'profile');

  it('loads authenticated growth data and selects a contextual cat pose', async () => {
    const source = await readFile(resolve(page, 'index.ts'), 'utf8');

    expect(source).toContain('getGrowthSummary');
    expect(source).toContain('getTodayPlan');
    expect(source).toContain('selectGrowthCharacter');
    expect(source).toContain('onRetry');
    expect(source).toContain('onTapCharacter');
    expect(source).not.toContain('onDeleteAccount');
  });

  it('shows honest loading, error, growth and recent-review states', async () => {
    const markup = await readFile(resolve(page, 'index.wxml'), 'utf8');

    expect(markup).toContain('stage === \'loading\'');
    expect(markup).toContain('stage === \'error\'');
    expect(markup).toContain('onRetry');
    expect(markup).toContain('recentAwards');
    expect(markup).toContain('growthPercent');
    expect(markup).toContain('character.alt');
    expect(markup).toContain('onTapCharacter');
    expect(markup).not.toContain('AI 生成内容');
    expect(markup).not.toContain('删除全部数据');
  });

  it('does not present invented streak or completion totals and avoids looping animation', async () => {
    const markup = await readFile(resolve(page, 'index.wxml'), 'utf8');
    const style = await readFile(resolve(page, 'index.wxss'), 'utf8');

    expect(markup).not.toContain('连续行动');
    expect(markup).not.toContain('已完成任务');
    expect(style).not.toContain('infinite');
    expect(style).toContain('safe-area-inset-bottom');
  });
});
