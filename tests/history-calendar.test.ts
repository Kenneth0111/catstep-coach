import { describe, expect, it } from 'vitest';
import {
  beginHistoryPageLoad,
  buildCalendarCells,
  createHistoryPageState,
  receiveHistoryResult,
  retryHistoryPage,
  setHistoryPageError,
  shanghaiDate,
  shiftMonth,
  type ClientPlanHistoryResult,
} from '../miniprogram/shared/history-calendar';

const result: ClientPlanHistoryResult = {
  month: '2026-08',
  selectedDate: '2026-08-17',
  planDates: ['2026-08-17'],
  selectedDay: null,
};

describe('history calendar calculations', () => {
  it('converts an instant to the Shanghai calendar date and month', () => {
    expect(shanghaiDate(new Date('2026-08-17T16:30:00.000Z'))).toEqual({
      date: '2026-08-18',
      month: '2026-08',
    });
  });

  it('starts weeks on Monday and represents leading days as empty cells', () => {
    const cells = buildCalendarCells('2026-08', [], '2026-08-01');

    expect(cells.slice(0, 5).every((cell) => cell.empty)).toBe(true);
    expect(cells[5]).toMatchObject({
      empty: false,
      day: 1,
      date: '2026-08-01',
      hasPlan: false,
      selected: true,
    });
    expect(cells.length % 7).toBe(0);
  });

  it('builds leap-year dates and marks planned and selected days', () => {
    const cells = buildCalendarCells(
      '2028-02',
      ['2028-02-01', '2028-02-29'],
      '2028-02-29',
    );

    expect(cells.filter((cell) => !cell.empty)).toHaveLength(29);
    expect(cells.find((cell) => cell.date === '2028-02-29')).toMatchObject({
      hasPlan: true,
      selected: true,
    });
  });

  it('rejects invalid months and prevents moving past the current month', () => {
    expect(() => buildCalendarCells('2026-8', [], '2026-08-01')).toThrow(
      'INVALID_MONTH',
    );
    expect(() => shiftMonth('0000-01', -1, '0000-01')).toThrow('INVALID_MONTH');
    expect(() => shiftMonth('2026-13', -1, '2026-08')).toThrow('INVALID_MONTH');
    expect(shiftMonth('2026-08', 1, '2026-08')).toBeNull();
    expect(shiftMonth('2026-08', -1, '2026-08')).toBe('2026-07');
  });
});

describe('history page state', () => {
  it('moves through loading, success, error, and retry states', () => {
    const loading = createHistoryPageState('2026-08', '2026-08-17');
    expect(loading).toMatchObject({
      stage: 'loading',
      month: '2026-08',
      selectedDate: '2026-08-17',
      result: null,
      errorCode: null,
    });

    const ready = receiveHistoryResult(loading, result);
    expect(ready).toMatchObject({ stage: 'ready', result, errorCode: null });

    const failed = setHistoryPageError(
      beginHistoryPageLoad(ready, '2026-08-18'),
      'INTERNAL_ERROR',
    );
    expect(failed).toMatchObject({
      stage: 'error',
      month: '2026-08',
      selectedDate: '2026-08-18',
      result,
      errorCode: 'INTERNAL_ERROR',
    });

    expect(retryHistoryPage(failed)).toMatchObject({
      stage: 'loading',
      result,
      errorCode: null,
    });
  });

  it('keeps the existing month result while loading another date detail', () => {
    const ready = receiveHistoryResult(
      createHistoryPageState('2026-08', '2026-08-17'),
      result,
    );
    const loadingDetails = beginHistoryPageLoad(ready, '2026-08-20');

    expect(loadingDetails).toEqual({
      stage: 'loading',
      month: '2026-08',
      selectedDate: '2026-08-20',
      result,
      errorCode: null,
    });
  });
});
