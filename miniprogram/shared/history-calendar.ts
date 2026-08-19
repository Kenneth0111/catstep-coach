import type { PublicErrorCode } from './goal-flow';

export interface ClientHistoryTask {
  id: string;
  title: string;
  estimatedMinutes: number;
  doneCriteria: string;
  goalId: string;
  priority: number;
  status: 'pending' | 'in_progress' | 'completed';
  difficultyFeedback?: 'easy' | 'just_right' | 'hard';
}

export interface ClientPlanHistoryResult {
  month: string;
  selectedDate: string;
  planDates: string[];
  selectedDay: null | {
    date: string;
    availableMinutes: number;
    summary: string;
    groups: Array<{
      goalId: string;
      goalTitle: string;
      tasks: ClientHistoryTask[];
    }>;
    review: null | {
      completionSummary: string;
      encouragement: string;
      nextSuggestion: string;
    };
  };
}

export interface CalendarCell {
  key: string;
  empty: boolean;
  day: number | null;
  date: string | null;
  hasPlan: boolean;
  selected: boolean;
}

export interface HistoryPageState {
  stage: 'loading' | 'ready' | 'error';
  month: string;
  selectedDate: string;
  result: ClientPlanHistoryResult | null;
  errorCode: PublicErrorCode | null;
}

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

interface ParsedMonth {
  year: number;
  month: number;
}

function parseMonth(month: string): ParsedMonth {
  const match = MONTH_PATTERN.exec(month);
  if (!match) {
    throw new Error('INVALID_MONTH');
  }
  const year = Number(match[1]);
  if (year === 0) {
    throw new Error('INVALID_MONTH');
  }
  return { year, month: Number(match[2]) };
}

function monthIndex(month: ParsedMonth): number {
  return month.year * 12 + month.month - 1;
}

function formatMonth(index: number): string {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

function daysInMonth({ year, month }: ParsedMonth): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function invalidTransition(): never {
  throw new Error('INVALID_TRANSITION');
}

export function shanghaiDate(value: Date): { date: string; month: string } {
  if (Number.isNaN(value.getTime())) {
    throw new Error('INVALID_DATE');
  }
  const shifted = new Date(value.getTime() + 8 * 60 * 60 * 1000);
  const date = shifted.toISOString().slice(0, 10);
  return { date, month: date.slice(0, 7) };
}

export function shiftMonth(
  month: string,
  offset: number,
  currentMonth: string,
): string | null {
  const parsedMonth = parseMonth(month);
  const parsedCurrentMonth = parseMonth(currentMonth);
  if (!Number.isInteger(offset)) {
    throw new Error('INVALID_MONTH');
  }

  const currentIndex = monthIndex(parsedCurrentMonth);
  const targetIndex = monthIndex(parsedMonth) + offset;
  if (monthIndex(parsedMonth) > currentIndex || targetIndex > currentIndex) {
    return null;
  }
  return formatMonth(targetIndex);
}

export function buildCalendarCells(
  month: string,
  planDates: readonly string[],
  selectedDate: string,
): CalendarCell[] {
  const parsed = parseMonth(month);
  const firstDay = new Date(Date.UTC(parsed.year, parsed.month - 1, 1)).getUTCDay();
  const leadingEmptyCells = (firstDay + 6) % 7;
  const totalDays = daysInMonth(parsed);
  const plannedDates = new Set(planDates);
  const cells: CalendarCell[] = [];

  for (let index = 0; index < leadingEmptyCells; index += 1) {
    cells.push({
      key: `${month}-empty-${index}`,
      empty: true,
      day: null,
      date: null,
      hasPlan: false,
      selected: false,
    });
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    cells.push({
      key: date,
      empty: false,
      day,
      date,
      hasPlan: plannedDates.has(date),
      selected: selectedDate === date,
    });
  }

  while (cells.length % 7 !== 0) {
    const index = cells.length;
    cells.push({
      key: `${month}-empty-${index}`,
      empty: true,
      day: null,
      date: null,
      hasPlan: false,
      selected: false,
    });
  }
  return cells;
}

export function createHistoryPageState(
  month: string,
  selectedDate: string,
  result: ClientPlanHistoryResult | null = null,
): HistoryPageState {
  parseMonth(month);
  return {
    stage: 'loading',
    month,
    selectedDate,
    result,
    errorCode: null,
  };
}

export function receiveHistoryResult(
  state: HistoryPageState,
  result: ClientPlanHistoryResult,
): HistoryPageState {
  if (state.stage !== 'loading') {
    return invalidTransition();
  }
  return {
    ...state,
    stage: 'ready',
    month: result.month,
    selectedDate: result.selectedDate,
    result,
    errorCode: null,
  };
}

export function beginHistoryPageLoad(
  state: HistoryPageState,
  selectedDate = state.selectedDate,
): HistoryPageState {
  if (state.stage !== 'ready') {
    return invalidTransition();
  }
  return { ...state, stage: 'loading', selectedDate, errorCode: null };
}

export function setHistoryPageError(
  state: HistoryPageState,
  errorCode: PublicErrorCode,
): HistoryPageState {
  if (state.stage !== 'loading') {
    return invalidTransition();
  }
  return { ...state, stage: 'error', errorCode };
}

export function retryHistoryPage(state: HistoryPageState): HistoryPageState {
  if (state.stage !== 'error') {
    return invalidTransition();
  }
  return { ...state, stage: 'loading', errorCode: null };
}
