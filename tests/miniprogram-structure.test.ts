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
  'miniprogram/shared/today-flow.ts',
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

  it('edits and explicitly confirms the generated plan before Today', async () => {
    const markup = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/goal/index.wxml'),
      'utf8',
    );
    const source = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/goal/index.ts'),
      'utf8',
    );

    expect(markup).not.toContain('url="/pages/today/index"');
    expect(markup).toContain('wx:key="clientKey"');
    expect(markup).not.toContain('wx:key="title"');
    expect(markup).toContain('bindblur="onPlanTaskEdit"');
    expect(markup).toContain('bindtap="onRemovePlanTask"');
    expect(markup).toContain('bindtap="onConfirmDailyPlan"');
    expect(source).toContain('confirmDailyPlan');
    expect(source).toContain('restorePlanTaskInput');
    expect(source).toContain('wx.redirectTo');
  });

  it('loads Today from CloudBase with explicit page states and no sample tasks', async () => {
    const markup = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/today/index.wxml'),
      'utf8',
    );
    const source = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/today/index.ts'),
      'utf8',
    );

    expect(markup).toContain("flow.stage === 'loading'");
    expect(markup).toContain("flow.stage === 'empty'");
    expect(markup).toContain("flow.stage === 'error'");
    expect(markup).toContain("flow.stage === 'ready'");
    expect(source).toContain('getTodayPlan');
    expect(source).not.toContain('initialTasks');
    expect(source).toContain('onStartTask');
    expect(source).toContain('onCompleteTask');
    expect(source).toContain('onRetryTaskUpdate');
    expect(source).not.toContain('整理今天要完成的三个步骤');
  });

  it('retries failed review generation instead of only returning to its idle state', async () => {
    const source = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/today/index.ts'),
      'utf8',
    );

    expect(source).toContain('async onRetryReview()');
    expect(source).toContain('await this.onGenerateReview();');
    expect(source).toContain('const reviewErrorMessages');
    expect(source).toContain('复盘暂时无法生成');
  });

  it('keeps a failed review confirmation distinct from a failed review generation', async () => {
    const source = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/today/index.ts'),
      'utf8',
    );

    expect(source).toContain('const reviewConfirmationErrorMessages');
    expect(source).toContain('复盘确认没有保存成功');
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
