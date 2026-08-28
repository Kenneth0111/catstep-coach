import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('interaction sound wiring', () => {
  it('routes major button categories through the shared sound module', async () => {
    const pages = await Promise.all([
      'miniprogram/pages/today/index.ts',
      'miniprogram/pages/goal/index.ts',
      'miniprogram/pages/history/index.ts',
      'miniprogram/pages/profile/index.ts',
      'miniprogram/pages/settings/index.ts',
      'miniprogram/components/task-card/index.ts',
      'miniprogram/components/bottom-navigation/index.ts',
    ].map((path) => readFile(resolve(process.cwd(), path), 'utf8')));

    for (const source of pages) {
      expect(source).toContain("from '../../shared/sound-effects'");
    }
  });

  it('keeps sound feedback under an explicit local settings control', async () => {
    const markup = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/settings/index.wxml'),
      'utf8',
    );

    expect(markup).toContain('交互音效');
    expect(markup).toContain('bindchange="onSoundEffectsChange"');
  });
});
