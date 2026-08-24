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
  'miniprogram/pages/settings/index.ts',
  'miniprogram/pages/settings/index.json',
  'miniprogram/pages/settings/index.wxml',
  'miniprogram/pages/settings/index.wxss',
  'miniprogram/components/task-card/index.ts',
  'miniprogram/components/task-card/index.json',
  'miniprogram/components/task-card/index.wxml',
  'miniprogram/components/task-card/index.wxss',
  'miniprogram/assets/navigation/paw-active.png',
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

  it('launches into Today and keeps goal onboarding as a returnable subflow', async () => {
    const appConfig = JSON.parse(
      await readFile(resolve(process.cwd(), 'miniprogram/app.json'), 'utf8'),
    ) as {
      pages?: unknown;
      tabBar?: {
        color?: unknown;
        selectedColor?: unknown;
        backgroundColor?: unknown;
        list?: unknown;
      };
    };
    const todayMarkup = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/today/index.wxml'),
      'utf8',
    );

    expect(appConfig.pages).toEqual([
      'pages/today/index',
      'pages/goal/index',
      'pages/history/index',
      'pages/profile/index',
      'pages/settings/index',
    ]);
    expect(appConfig.tabBar).toMatchObject({
      color: '#71695D',
      selectedColor: '#356F63',
      backgroundColor: '#FFFAF0',
      custom: true,
    });
    expect(appConfig.tabBar?.list).toEqual([
      { pagePath: 'pages/today/index', text: '今日' },
      { pagePath: 'pages/history/index', text: '历史' },
      { pagePath: 'pages/profile/index', text: '我的' },
    ]);
    expect(todayMarkup).toContain('url="/pages/goal/index"');
    expect(todayMarkup).toContain('open-type="navigate"');
    expect(todayMarkup).not.toContain('open-type="redirect"');
  });

  it('uses the native tab bar without duplicate Today header links', async () => {
    const markup = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/today/index.wxml'),
      'utf8',
    );
    const styles = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/today/index.wxss'),
      'utf8',
    );

    expect(markup).not.toContain('intro-links');
    expect(markup).not.toContain('url="/pages/history/index"');
    expect(markup).not.toContain('url="/pages/profile/index"');
    expect(styles).not.toContain('.history-link');
    expect(styles).not.toContain('.profile-link');
  });

  it('uses clear Chinese system fonts and restrained title weights', async () => {
    const appStyles = await readFile(
      resolve(process.cwd(), 'miniprogram/app.wxss'),
      'utf8',
    );
    const historyStyles = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/history/index.wxss'),
      'utf8',
    );
    const profileStyles = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/profile/index.wxss'),
      'utf8',
    );
    const historyMarkup = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/history/index.wxml'),
      'utf8',
    );
    const historyConfig = JSON.parse(await readFile(
      resolve(process.cwd(), 'miniprogram/pages/history/index.json'),
      'utf8',
    )) as { navigationBarTitleText?: unknown };
    const profileConfig = JSON.parse(await readFile(
      resolve(process.cwd(), 'miniprogram/pages/profile/index.json'),
      'utf8',
    )) as { navigationBarTitleText?: unknown };

    expect(appStyles).toContain('"PingFang SC"');
    expect(appStyles).toContain('"Microsoft YaHei"');
    expect(`${historyStyles}\n${profileStyles}`).not.toMatch(/font-weight:\s*(?:750|800)/);
    expect(historyMarkup).not.toContain('返回 Today');
    expect(historyConfig.navigationBarTitleText).toBe('历史');
    expect(profileConfig.navigationBarTitleText).toBe('我的');
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
    expect(source).toContain('wx.switchTab');
    expect(source).not.toContain('wx.redirectTo');
  });

  it('keeps goal onboarding primary navigation guarded by draft confirmation', async () => {
    const markup = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/goal/index.wxml'),
      'utf8',
    );
    const styles = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/goal/index.wxss'),
      'utf8',
    );
    const source = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/goal/index.ts'),
      'utf8',
    );

    expect(markup).toContain('正在制定：目标拆解');
    expect(markup).toContain('<bottom-navigation');
    expect(markup).toContain('intercept="{{true}}"');
    expect(markup).toContain('bind:navigate="onNavigateTab"');
    expect(styles).toContain('.goal-nav-status');
    expect(styles).toContain('env(safe-area-inset-bottom)');
    expect(source).toContain('async onNavigateTab');
    expect(source).toContain('const hasUnsavedDraft');
    expect(source).toContain('wx.showModal');
    expect(source).toContain('if (!confirmation.confirm)');
    expect(source).toContain('return;');
    expect(source).toContain('wx.switchTab');

    expect(source.indexOf('if (!confirmation.confirm)')).toBeLessThan(
      source.indexOf('await wx.switchTab({ url });'),
    );
  });

  it('keeps a plan-confirm failure next to the editable plan instead of only in a toast', async () => {
    const markup = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/goal/index.wxml'),
      'utf8',
    );
    const source = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/goal/index.ts'),
      'utf8',
    );

    expect(markup).toContain('class="plan-confirm-error error-state"');
    expect(markup).toContain('bindtap="onConfirmDailyPlan"');
    expect(markup).toContain('确认计划没有保存成功');
    expect(source).not.toContain('确认计划没有保存成功：');
    expect(source).not.toMatch(/onConfirmDailyPlan[\s\S]*?wx\.showToast/);
  });

  it('uses one custom bottom navigation whose active label sits inside a milk-gold paw', async () => {
    const markup = await readFile(
      resolve(process.cwd(), 'miniprogram/components/bottom-navigation/index.wxml'),
      'utf8',
    );
    const styles = await readFile(
      resolve(process.cwd(), 'miniprogram/components/bottom-navigation/index.wxss'),
      'utf8',
    );
    const source = await readFile(
      resolve(process.cwd(), 'miniprogram/components/bottom-navigation/index.ts'),
      'utf8',
    );
    const tabBarSource = await readFile(
      resolve(process.cwd(), 'miniprogram/custom-tab-bar/index.ts'),
      'utf8',
    );
    const profileMarkup = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/profile/index.wxml'),
      'utf8',
    );

    expect(source).toContain("label: '今日'");
    expect(source).toContain("label: '历史'");
    expect(source).toContain("label: '我的'");
    expect(source).toContain('const tabItems = [');
    expect(source.match(/\{ url: '[^']+', label: '[^']+' \}/g)).toHaveLength(3);
    expect(source).not.toContain("{ url: '/pages/settings/index', label: '设置' }");
    expect(markup).toContain('is-active');
    expect(markup).toContain('wx:if="{{activePath === item.url}}"');
    expect(markup).toContain('class="nav-paw"');
    expect(markup).toContain('class="nav-paw__art"');
    expect(markup).toContain('src="/assets/navigation/paw-active.png"');
    expect(markup).toContain('class="nav-label nav-label--active"');
    expect(markup).toContain('wx:else class="nav-label"');
    expect(markup).not.toContain('active-mark');
    expect(markup).not.toContain('paw-icon');
    expect(markup).not.toContain('paw-toe');
    expect(markup).not.toContain('paw-pad');
    expect(styles).toContain('.nav-item.is-active');
    expect(styles).toContain('.nav-paw');
    expect(styles).toContain('.nav-paw__art');
    expect(styles).toContain('.nav-label--active');
    expect(styles).not.toContain('.active-mark');
    expect(styles).not.toContain('.paw-icon');
    expect(styles).not.toContain('.paw-toe');
    expect(styles).not.toContain('.paw-pad');
    expect(styles).toContain('env(safe-area-inset-bottom)');
    expect(styles).toMatch(/\.nav-item\s*\{[^}]*min-height:\s*(?:88|9\d|1\d{2,})rpx/s);
    expect(styles).toMatch(/\.nav-label--active\s*\{(?=[^}]*position:\s*absolute)(?=[^}]*color:\s*#5f481e)[^}]*\}/s);
    expect(styles).toMatch(/\.nav-item\s*\{[^}]*transition:\s*opacity\s+(?:1?\d\d|200)ms\s+ease,\s*background-color\s+(?:1?\d\d|200)ms\s+ease/s);
    expect(styles).toMatch(/\.nav-item:active\s*\{(?=[^}]*opacity:)(?=[^}]*background-color:)[^}]*\}/s);
    expect(styles).not.toMatch(/\.nav-item\s*\{[^}]*transition:[^}]*transform/s);
    expect(tabBarSource).toContain('getCurrentPages');
    expect(tabBarSource).toContain('activePath');
    expect(source).toContain('wx.switchTab');
    expect(profileMarkup).toContain('url="/pages/settings/index"');
    expect(profileMarkup).toContain('<navigator class="settings-entry" url="/pages/settings/index" open-type="navigate">');
    expect(profileMarkup).toContain('设置与说明');
    expect(profileMarkup).toContain('隐私、AI 说明与账户数据');
    expect(profileMarkup).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(profileMarkup.indexOf('<navigator class="settings-entry"')).toBeGreaterThan(
      profileMarkup.indexOf('</block>'),
    );

    const profileStyles = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/profile/index.wxss'),
      'utf8',
    );
    expect(profileStyles).toContain('.settings-entry');
    expect(profileStyles).toMatch(/\.settings-entry[\s\S]*min-height:\s*88rpx/);
  });

  it('synchronizes the active custom tab from every tab page onShow', async () => {
    const tabPages = [
      ['today', '/pages/today/index'],
      ['history', '/pages/history/index'],
      ['profile', '/pages/profile/index'],
    ] as const;

    for (const [page, activePath] of tabPages) {
      const source = await readFile(
        resolve(process.cwd(), `miniprogram/pages/${page}/index.ts`),
        'utf8',
      );
      expect(source).toContain('onShow()');
      expect(source).toContain('this.getTabBar()');
      expect(source).toContain(`activePath: '${activePath}'`);
    }
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

    expect(markup).toContain("item.completedTasks.length");
    expect(markup).toContain('已完成');
    expect(markup).toContain('task="{{item}}"');
  });

  it('renders Today as collapsible multi-goal cards with whole-day capacity', async () => {
    const markup = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/today/index.wxml'),
      'utf8',
    );
    const source = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/today/index.ts'),
      'utf8',
    );
    const styles = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/today/index.wxss'),
      'utf8',
    );

    expect(markup).toContain('今日目标 {{flow.goalViews.length}}/3');
    expect(markup).toContain('wx:for="{{flow.goalViews}}"');
    expect(markup).toContain('bindtap="onToggleGoal"');
    expect(markup).toContain('data-goal-id="{{item.goalId}}"');
    expect(markup).toContain('width: {{item.progressPercent}}%');
    expect(markup).toContain('已完成 {{item.completedCount}}/{{item.totalCount}} 项');
    expect(markup).toContain('item.currentTask');
    expect(markup).toContain('item.pendingTasks');
    expect(markup).toContain('item.completedTasks');
    expect(markup).toContain('can-start="{{!item.currentTask}}"');
    expect(markup).toContain(
      'flow.taskUpdatesByGoalId[item.goalId].taskId === item.currentTask.id',
    );
    expect(markup).toContain(
      'flow.taskUpdatesByGoalId[item.goalId].taskId === task.id',
    );
    expect(markup).not.toContain(
      'updating="{{flow.taskUpdatesByGoalId[item.goalId] && !flow.taskUpdateErrorsByGoalId[item.goalId]}}"',
    );
    expect(markup).toContain('＋拆解新目标');
    expect(markup).toContain('今天已经有 3 个目标啦，先陪它们走完吧。');
    expect(markup).toContain('今天已经安排了 10 个小步，先完成一些再继续吧。');
    expect(source).toContain('onShow()');
    expect(source).toContain('onAddGoal()');
    expect(source).toContain("wx.navigateTo({ url: '/pages/goal/index' })");
    expect(styles).toMatch(/\.goal-card__toggle\s*\{[^}]*min-height:\s*88rpx/s);
    expect(styles).toContain('env(safe-area-inset-bottom)');
  });

  it('returns from Goal confirmation through the native page stack without a custom Home button', async () => {
    const markup = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/goal/index.wxml'),
      'utf8',
    );
    const source = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/goal/index.ts'),
      'utf8',
    );

    expect(source).toContain('getCurrentPages().length > 1');
    expect(source).toContain('wx.navigateBack({ delta: 1 })');
    expect(source).toContain("wx.switchTab({ url: '/pages/today/index' })");
    expect(source).toContain('LIMIT_REACHED');
    expect(source).toContain('今天的目标或任务名额已经满了');
    expect(markup).not.toContain('Home');
    expect(markup).not.toContain('首页');
    expect(markup).toContain('<bottom-navigation');
  });

  it('offers explicit subscription-message authorization from the ready Today plan', async () => {
    const pageSource = await readFile(resolve(process.cwd(), 'miniprogram', 'pages', 'today', 'index.ts'), 'utf8');
    const template = await readFile(resolve(process.cwd(), 'miniprogram', 'pages', 'today', 'index.wxml'), 'utf8');

    expect(pageSource).toContain('requestReminderAuthorization');
    expect(pageSource).toContain('subscribeToTodayReminders');
    expect(template).toContain('bindtap="onSubscribeReminders"');
    expect(template).toContain('15 分钟后提醒开始，今晚 21:00 提醒复盘');
  });

  it('keeps privacy and account controls out of Today content', async () => {
    const template = await readFile(
      resolve(process.cwd(), 'miniprogram/pages/today/index.wxml'),
      'utf8',
    );

    expect(template).not.toContain('url="/pages/profile/index"');
    expect(template).not.toContain('删除全部数据');
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
