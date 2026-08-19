import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createHistoryPageState,
  type ClientPlanHistoryResult,
  type HistoryPageState,
} from '../miniprogram/shared/history-calendar';

const cloudApi = vi.hoisted(() => ({
  getPlanHistory: vi.fn(),
}));

vi.mock('../miniprogram/shared/cloud-api', () => ({
  getPlanHistory: cloudApi.getPlanHistory,
  CloudApiError: class CloudApiError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  },
}));

type PageDefinition = Record<string, any> & {
  data: Record<string, any>;
};

type PageContext = PageDefinition & {
  currentDate: string;
  currentMonth: string;
  requestSequence: number;
  setData(update: Record<string, unknown>): void;
};

let definition: PageDefinition;

beforeEach(async () => {
  vi.resetModules();
  cloudApi.getPlanHistory.mockReset();
  vi.stubGlobal('Page', (candidate: PageDefinition) => {
    definition = candidate;
  });
  await import('../miniprogram/pages/history/index');
});

function pageContext(): PageContext {
  return {
    ...definition,
    data: structuredClone(definition.data),
    currentDate: '2026-08-18',
    currentMonth: '2026-08',
    requestSequence: 0,
    setData(update) {
      Object.assign(this.data, update);
    },
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

function emptyResult(selectedDate: string): ClientPlanHistoryResult {
  return {
    month: selectedDate.slice(0, 7),
    selectedDate,
    planDates: [],
    selectedDay: null,
  };
}

describe('history page request behavior', () => {
  it('keeps the newer result when an older request resolves last', async () => {
    const page = pageContext();
    const older = deferred<ClientPlanHistoryResult>();
    const newer = deferred<ClientPlanHistoryResult>();
    cloudApi.getPlanHistory
      .mockImplementationOnce(() => older.promise)
      .mockImplementationOnce(() => newer.promise);
    const olderFlow = createHistoryPageState('2026-08', '2026-08-01');
    const newerFlow = createHistoryPageState('2026-08', '2026-08-02');

    const olderLoad = page.loadHistory(olderFlow);
    const newerLoad = page.loadHistory(newerFlow);
    newer.resolve(emptyResult('2026-08-02'));
    await newerLoad;
    expect((page.data.flow as HistoryPageState).selectedDate).toBe('2026-08-02');

    older.resolve(emptyResult('2026-08-01'));
    await olderLoad;
    expect((page.data.flow as HistoryPageState).selectedDate).toBe('2026-08-02');
  });

  it('ignores a forged selection for a future calendar date', () => {
    const page = pageContext();
    page.data.flow = createHistoryPageState('2026-08', '2026-08-18');
    page.data.calendarCells = [{ date: '2026-08-19' }];

    page.onSelectDate({ currentTarget: { dataset: { date: '2026-08-19' } } });

    expect(cloudApi.getPlanHistory).not.toHaveBeenCalled();
    expect((page.data.flow as HistoryPageState).selectedDate).toBe('2026-08-18');
  });
});
