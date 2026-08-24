import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beginTodayTaskUpdate,
  createTodayFlowState,
  receiveTodayPlan,
  receiveTodayTaskUpdate,
  setTodayTaskUpdateError,
  type TodayDashboardPlan,
} from '../miniprogram/shared/today-flow';

type PageDefinition = Record<string, any> & { data: Record<string, unknown> };
type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
};

const mocks = vi.hoisted(() => ({
  getTodayPlan: vi.fn(),
  updatePlanTask: vi.fn(),
}));

vi.mock('../miniprogram/shared/cloud-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../miniprogram/shared/cloud-api')>();
  return {
    ...actual,
    getTodayPlan: mocks.getTodayPlan,
    updatePlanTask: mocks.updatePlanTask,
  };
});

let definition: PageDefinition;

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function plan(id: string): TodayDashboardPlan {
  const task = {
    id: `${id}-task`,
    title: '完成练习',
    action: '完成五道练习',
    estimatedMinutes: 30,
    doneCriteria: '五道练习通过',
    goalId: 'goal-1',
    reason: '巩固基础',
    difficulty: 'medium' as const,
    priority: 1,
    status: 'pending' as const,
  };
  return {
    id,
    date: '2026-08-23',
    availableMinutes: 30,
    summary: '先走一步',
    tasks: [task],
    groups: [{ goalId: 'goal-1', goalTitle: '目标一', tasks: [task] }],
  };
}

function multiGoalPlan(): TodayDashboardPlan {
  const first = {
    ...plan('multi').tasks[0],
    id: 'goal-1-task',
    goalId: 'goal-1',
  };
  const second = {
    ...plan('multi').tasks[0],
    id: 'goal-2-task',
    goalId: 'goal-2',
  };
  return {
    ...plan('multi'),
    tasks: [first, second],
    groups: [
      { goalId: 'goal-1', goalTitle: '目标一', tasks: [first] },
      { goalId: 'goal-2', goalTitle: '目标二', tasks: [second] },
    ],
  };
}

function pageContext(): PageDefinition & {
  tabBarUpdates: Array<Record<string, unknown>>;
  getTabBar(): { setData(update: Record<string, unknown>): void };
  setData(update: Record<string, unknown>): void;
} {
  const tabBarUpdates: Array<Record<string, unknown>> = [];
  return {
    ...definition,
    data: structuredClone(definition.data),
    tabBarUpdates,
    getTabBar() {
      return {
        setData(update) {
          tabBarUpdates.push(update);
        },
      };
    },
    setData(update) {
      Object.assign(this.data, update);
    },
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(async () => {
  vi.resetModules();
  mocks.getTodayPlan.mockReset();
  mocks.updatePlanTask.mockReset();
  vi.stubGlobal('Page', (candidate: PageDefinition) => {
    definition = candidate;
  });
  vi.stubGlobal('wx', {
    navigateTo: vi.fn(),
  });
  await import('../miniprogram/pages/today/index');
});

describe('Today page async loading', () => {
  it('marks Today as the active custom tab whenever the page shows', () => {
    mocks.getTodayPlan.mockResolvedValueOnce(null);
    const page = pageContext();

    definition.onShow.call(page);

    expect(page.tabBarUpdates).toEqual([
      { activePath: '/pages/today/index' },
    ]);
  });

  it('lets only the newest onShow load update the page', async () => {
    const first = deferred<TodayDashboardPlan | null>();
    const second = deferred<TodayDashboardPlan | null>();
    mocks.getTodayPlan
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const page = pageContext();

    definition.onShow.call(page);
    definition.onShow.call(page);
    second.resolve(plan('new-plan'));
    await flushPromises();

    expect(page.data.flow).toMatchObject({
      stage: 'ready',
      plan: { id: 'new-plan' },
    });

    first.resolve(plan('old-plan'));
    await flushPromises();

    expect(page.data.flow).toMatchObject({
      stage: 'ready',
      plan: { id: 'new-plan' },
    });
  });

  it('defers an onShow refresh while a task mutation is in flight', async () => {
    const mutation = deferred<TodayDashboardPlan>();
    const refresh = deferred<TodayDashboardPlan | null>();
    mocks.getTodayPlan
      .mockResolvedValueOnce(plan('base-plan'))
      .mockReturnValueOnce(refresh.promise);
    mocks.updatePlanTask.mockReturnValueOnce(mutation.promise);
    const page = pageContext();

    definition.onShow.call(page);
    await flushPromises();
    const mutationPromise = definition.onStartTask.call(page, {
      detail: { taskId: 'base-plan-task' },
    });
    await flushPromises();

    expect(page.data.flow).toMatchObject({
      stage: 'ready',
      plan: { id: 'base-plan' },
      taskUpdatesByGoalId: { 'goal-1': { taskId: 'base-plan-task' } },
    });

    definition.onShow.call(page);
    await flushPromises();

    expect(mocks.getTodayPlan).toHaveBeenCalledTimes(1);
    expect(page.data.flow).toMatchObject({
      stage: 'ready',
      plan: { id: 'base-plan' },
      taskUpdatesByGoalId: { 'goal-1': { taskId: 'base-plan-task' } },
    });

    const updated = plan('base-plan');
    updated.tasks = updated.tasks.map((task) => ({
      ...task,
      status: 'in_progress' as const,
    }));
    updated.groups = [
      { goalId: 'goal-1', goalTitle: '目标一', tasks: updated.tasks },
    ];
    mutation.resolve(updated);
    await mutationPromise;
    await flushPromises();

    expect(mocks.getTodayPlan).toHaveBeenCalledTimes(2);
    refresh.resolve(plan('refreshed-plan'));
    await flushPromises();

    expect(page.data.flow).toMatchObject({
      stage: 'ready',
      plan: { id: 'refreshed-plan' },
      taskUpdatesByGoalId: {},
    });
  });

  it('runs a deferred refresh when an in-flight task mutation fails after onShow', async () => {
    const mutation = deferred<TodayDashboardPlan>();
    const refresh = deferred<TodayDashboardPlan | null>();
    mocks.getTodayPlan
      .mockResolvedValueOnce(plan('base-plan'))
      .mockReturnValueOnce(refresh.promise);
    mocks.updatePlanTask.mockReturnValueOnce(mutation.promise);
    const page = pageContext();

    definition.onShow.call(page);
    await flushPromises();
    const mutationPromise = definition.onStartTask.call(page, {
      detail: { taskId: 'base-plan-task' },
    });
    await flushPromises();

    definition.onShow.call(page);
    await flushPromises();
    mutation.reject(new Error('network'));
    await mutationPromise;
    await flushPromises();

    expect(mocks.getTodayPlan).toHaveBeenCalledTimes(2);
    expect(page.data.flow).toMatchObject({ stage: 'loading' });

    refresh.resolve(plan('refreshed-plan'));
    await flushPromises();

    expect(page.data.flow).toMatchObject({
      stage: 'ready',
      plan: { id: 'refreshed-plan' },
    });
  });

  it('starts an onShow load when remaining task requests are failed and retryable', async () => {
    const refresh = deferred<TodayDashboardPlan | null>();
    mocks.getTodayPlan.mockReturnValueOnce(refresh.promise);
    const page = pageContext();
    const updating = beginTodayTaskUpdate(
      receiveTodayPlan(createTodayFlowState(), plan('base-plan')),
      {
        requestId: 'start-goal-1',
        planId: 'base-plan',
        taskId: 'base-plan-task',
        action: 'start',
      },
    );
    page.data.flow = setTodayTaskUpdateError(
      updating,
      'INTERNAL_ERROR',
      'start-goal-1',
    );

    definition.onShow.call(page);
    await flushPromises();

    expect(mocks.getTodayPlan).toHaveBeenCalledTimes(1);
    expect(page.data.flow).toMatchObject({ stage: 'loading' });
  });

  it('runs a deferred refresh after the last pending request settles even if a failed retry remains', async () => {
    const refresh = deferred<TodayDashboardPlan | null>();
    mocks.getTodayPlan.mockReturnValueOnce(refresh.promise);
    const page = pageContext();
    const ready = receiveTodayPlan(createTodayFlowState(), multiGoalPlan());
    const failed = setTodayTaskUpdateError(
      beginTodayTaskUpdate(ready, {
        requestId: 'start-goal-1',
        planId: 'multi',
        taskId: 'goal-1-task',
        action: 'start',
      }),
      'INTERNAL_ERROR',
      'start-goal-1',
    );
    const mixed = beginTodayTaskUpdate(failed, {
      requestId: 'start-goal-2',
      planId: 'multi',
      taskId: 'goal-2-task',
      action: 'start',
    });
    const updated = multiGoalPlan();
    updated.tasks = updated.tasks.map((task) =>
      task.id === 'goal-2-task'
        ? { ...task, status: 'in_progress' as const }
        : task,
    );
    updated.groups = [
      { goalId: 'goal-1', goalTitle: '目标一', tasks: [updated.tasks[0]] },
      { goalId: 'goal-2', goalTitle: '目标二', tasks: [updated.tasks[1]] },
    ];
    page.deferredTodayRefreshRequested = true;
    page.data.flow = receiveTodayTaskUpdate(mixed, 'start-goal-2', updated);

    definition.refreshAfterDeferredTaskUpdates.call(page, page.data.flow);
    await flushPromises();

    expect(mocks.getTodayPlan).toHaveBeenCalledTimes(1);
    expect(page.data.flow).toMatchObject({ stage: 'loading' });
  });
});
