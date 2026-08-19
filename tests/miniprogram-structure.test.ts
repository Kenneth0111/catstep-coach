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
  'miniprogram/pages/history/index.ts',
  'miniprogram/pages/history/index.json',
  'miniprogram/pages/history/index.wxml',
  'miniprogram/pages/history/index.wxss',
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
      'pages/profile/index',
      'pages/history/index',
    ]);
  });

  it('keeps a history entry outside every Today page state', async () => {
    const markup = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/today/index.wxml'),
      'utf8',
    );
    const styles = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/today/index.wxss'),
      'utf8',
    );

    const historyEntry = markup.indexOf('url="/pages/history/index"');
    expect(historyEntry).toBeGreaterThan(-1);
    expect(historyEntry).toBeLessThan(markup.indexOf("flow.stage === 'loading'"));
    expect(styles).toMatch(/\.history-link\s*\{[^}]*min-height:\s*88rpx/s);
  });

  it('provides complete read-only history calendar interactions', async () => {
    const source = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/history/index.ts'),
      'utf8',
    );
    const markup = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/history/index.wxml'),
      'utf8',
    );

    expect(source).toContain('getPlanHistory');
    expect(source).toContain('onPreviousMonth');
    expect(source).toContain('onNextMonth');
    expect(source).toContain('onSelectDate');
    expect(source).toContain('onRetry');
    expect(source).toContain('CloudApiError');
    expect(markup).toContain('bindtap="onPreviousMonth"');
    expect(markup).toContain('bindtap="onNextMonth"');
    expect(markup).toContain('bindtap="onSelectDate"');
    expect(markup).toContain('bindtap="onRetry"');
    expect(markup).toContain('paw-icon');
    expect(markup).toContain('正在翻找过去的脚印…');
    expect(markup).toContain('这一天还没有留下计划');
    expect(markup).toContain('这一天还没有复盘');
    expect(markup).toContain('goal-group');
    expect(markup).not.toContain('task-card');
    for (const forbiddenBinding of [
      'onStartTask',
      'onCompleteTask',
      'onResizeTask',
      'onMoveTaskToEnd',
      'onSubscribeReminders',
      'onGenerateReview',
      'onConfirmReview',
    ]) {
      expect(markup).not.toContain(forbiddenBinding);
    }
  });

  it('keeps history dates accessible and long read-only text naturally wrapping', async () => {
    const markup = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/history/index.wxml'),
      'utf8',
    );
    const styles = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/history/index.wxss'),
      'utf8',
    );

    expect(markup).toContain('aria-label="{{item.ariaLabel}}"');
    expect(markup).toContain('paw-toe paw-toe-1');
    expect(markup).toContain('paw-toe paw-toe-2');
    expect(markup).toContain('paw-toe paw-toe-3');
    expect(markup).toContain('paw-toe paw-toe-4');
    expect(markup).toContain('paw-pad');
    expect(styles).toMatch(/\.calendar-day\s*\{[^}]*min-height:\s*88rpx/s);
    expect(styles).toContain('env(safe-area-inset-bottom)');
    expect(styles).toMatch(/\.paw-toe\s*\{[^}]*border-radius:\s*50%/s);
    expect(styles).toMatch(/\.paw-pad\s*\{[^}]*border-radius:/s);
    expect(styles).not.toMatch(/(?:text-overflow|line-clamp|max-height|overflow:\s*hidden)/);
  });

  it('disables current-month future dates and rejects forged future selections', async () => {
    const source = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/history/index.ts'),
      'utf8',
    );
    const markup = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/history/index.wxml'),
      'utf8',
    );

    expect(source).toContain('future: boolean');
    expect(source).toContain('cell.date > currentDate');
    expect(source).toContain('selectedDate > this.currentDate');
    expect(source).toContain('未来日期，不可选择');
    expect(markup).toContain('disabled="{{item.future}}"');
  });

  it('shows excluded content before goal confirmation only when it exists', async () => {
    const markup = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/goal/index.wxml'),
      'utf8',
    );

    expect(markup).toContain('flow.summary.excludedContent');
    expect(markup).toContain('暂不安排');
    expect(markup).toContain('<view class="summary-row" wx:if="{{flow.summary.excludedContent.length}}">');
    expect(markup).not.toContain('没有特别排除的内容');
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

  it('keeps completed Today tasks visible with their persisted status', async () => {
    const markup = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/today/index.wxml'),
      'utf8',
    );

    expect(markup).toContain("flow.completedTasks.length");
    expect(markup).toContain('已完成');
    expect(markup).toContain('task="{{item}}"');
  });

  it('offers explicit subscription-message authorization from the ready Today plan', async () => {
    const pageSource = await readFile(resolve(process.cwd(), 'miniprogram', 'pages', 'today', 'index.ts'), 'utf8');
    const template = await readFile(resolve(process.cwd(), 'miniprogram', 'pages', 'today', 'index.wxml'), 'utf8');

    expect(pageSource).toContain('requestReminderAuthorization');
    expect(pageSource).toContain('subscribeToTodayReminders');
    expect(template).toContain('bindtap="onSubscribeReminders"');
    expect(template).toContain('15 分钟后提醒开始，今晚 21:00 提醒复盘');
  });

  it('lets users open the registered privacy and account page from Today', async () => {
    const template = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/today/index.wxml'),
      'utf8',
    );

    expect(template).toContain('url="/pages/profile/index"');
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
