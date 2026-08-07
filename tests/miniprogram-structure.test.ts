import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const requiredFiles = [
  'project.config.json',
  'miniprogram/sitemap.json',
  'miniprogram/app.ts',
  'miniprogram/app.json',
  'miniprogram/app.wxss',
  'miniprogram/shared/cloud-api.ts',
  'miniprogram/shared/goal-flow.ts',
  'miniprogram/pages/goal/index.ts',
  'miniprogram/pages/goal/index.json',
  'miniprogram/pages/goal/index.wxml',
  'miniprogram/pages/goal/index.wxss',
  'miniprogram/pages/today/index.ts',
  'miniprogram/pages/today/index.json',
  'miniprogram/pages/today/index.wxml',
  'miniprogram/pages/today/index.wxss',
  'miniprogram/components/task-card/index.ts',
  'miniprogram/components/task-card/index.json',
  'miniprogram/components/task-card/index.wxml',
  'miniprogram/components/task-card/index.wxss',
];

describe('native Mini Program structure', () => {
  it.each(requiredFiles)('includes %s', async (file) => {
    await expect(access(resolve(process.cwd(), file))).resolves.toBeUndefined();
  });

  it('enables the TypeScript compiler plugin', async () => {
    const projectConfig = JSON.parse(
      await readFile(resolve(process.cwd(), 'project.config.json'), 'utf8'),
    ) as { setting?: { useCompilerPlugins?: unknown } };

    expect(projectConfig.setting?.useCompilerPlugins).toEqual(['typescript']);
  });

  it('uses the product name as the Today navigation title', async () => {
    const pageConfig = JSON.parse(
      await readFile(
        resolve(process.cwd(), 'miniprogram/pages/today/index.json'),
        'utf8',
      ),
    ) as { navigationBarTitleText?: unknown };

    expect(pageConfig.navigationBarTitleText).toBe('猫步计划');
  });

  it('starts with goal onboarding and keeps Today registered', async () => {
    const appConfig = JSON.parse(
      await readFile(resolve(process.cwd(), 'miniprogram/app.json'), 'utf8'),
    ) as { pages?: unknown };

    expect(appConfig.pages).toEqual([
      'pages/goal/index',
      'pages/today/index',
    ]);
  });

  it('shows excluded content before goal confirmation', async () => {
    const markup = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/goal/index.wxml'),
      'utf8',
    );

    expect(markup).toContain('flow.summary.excludedContent');
    expect(markup).toContain('暂不安排');
  });

  it('does not imply an unpersisted plan is available on Today', async () => {
    const markup = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/goal/index.wxml'),
      'utf8',
    );

    expect(markup).not.toContain('url="/pages/today/index"');
  });

  it('uses no infinite motion on the calm onboarding page', async () => {
    const styles = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/goal/index.wxss'),
      'utf8',
    );

    expect(styles).not.toContain('infinite');
    expect(styles).not.toContain('@keyframes breathe');
  });
});
