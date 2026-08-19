import { CloudApiError, getPlanHistory } from '../../shared/cloud-api';
import {
  buildCalendarCells,
  createHistoryPageState,
  receiveHistoryResult,
  retryHistoryPage,
  setHistoryPageError,
  shanghaiDate,
  shiftMonth,
  type CalendarCell,
  type HistoryPageState,
} from '../../shared/history-calendar';

const errorMessages = {
  UNAUTHENTICATED: '请先使用已关联云环境的小程序账号。',
  INVALID_CONTEXT: '历史日期信息不完整，请返回后再试。',
  MISCONFIGURED: '历史服务还没有配置好，请稍后再试。',
  QUOTA_EXCEEDED: '历史记录暂时无法加载，请稍后再试。',
  INTERNAL_ERROR: '历史记录没有加载成功，再试一次就好。',
} as const;

interface AccessibleCalendarCell extends CalendarCell {
  ariaLabel: string;
  future: boolean;
}

function monthTitle(month: string): string {
  const [year, monthNumber] = month.split('-');
  return `${year} 年 ${Number(monthNumber)} 月`;
}

function calendarCells(
  flow: HistoryPageState,
  currentDate: string,
): AccessibleCalendarCell[] {
  return buildCalendarCells(
    flow.month,
    flow.result?.planDates ?? [],
    flow.selectedDate,
  ).map((cell) => {
    const future = cell.date !== null && cell.date > currentDate;
    return {
      ...cell,
      future,
      ariaLabel: cell.date
        ? `${Number(cell.date.slice(0, 4))}年${Number(cell.date.slice(5, 7))}月${Number(cell.date.slice(8, 10))}日，${cell.hasPlan ? '有计划' : '无计划'}${future ? '，未来日期，不可选择' : ''}`
        : '空白日期',
    };
  });
}

const initialToday = shanghaiDate(new Date());
const initialFlow = createHistoryPageState(
  initialToday.month,
  initialToday.date,
);

Page({
  currentDate: initialToday.date,
  currentMonth: initialToday.month,
  requestSequence: 0,

  data: {
    flow: initialFlow,
    calendarCells: calendarCells(initialFlow, initialToday.date),
    monthTitle: monthTitle(initialFlow.month),
    canGoNext: false,
    errorMessage: '',
  },

  onLoad() {
    const today = shanghaiDate(new Date());
    this.currentDate = today.date;
    this.currentMonth = today.month;
    const flow = createHistoryPageState(today.month, today.date);
    this.showLoading(flow);
    void this.loadHistory(flow);
  },

  onPreviousMonth() {
    const month = shiftMonth(this.data.flow.month, -1, this.currentMonth);
    if (month === null) {
      return;
    }
    const flow = createHistoryPageState(month, `${month}-01`);
    this.showLoading(flow);
    void this.loadHistory(flow);
  },

  onNextMonth() {
    const month = shiftMonth(this.data.flow.month, 1, this.currentMonth);
    if (month === null) {
      return;
    }
    const selectedDate = month === this.currentMonth
      ? this.currentDate
      : `${month}-01`;
    const flow = createHistoryPageState(month, selectedDate);
    this.showLoading(flow);
    void this.loadHistory(flow);
  },

  onSelectDate(event: WechatMiniprogram.TouchEvent) {
    const selectedDate = String(event.currentTarget.dataset.date ?? '');
    const isCalendarDate = this.data.calendarCells.some(
      (cell) => cell.date === selectedDate,
    );
    if (
      !isCalendarDate ||
      selectedDate > this.currentDate ||
      selectedDate === this.data.flow.selectedDate
    ) {
      return;
    }
    const flow = createHistoryPageState(
      this.data.flow.month,
      selectedDate,
      this.data.flow.result,
    );
    this.showLoading(flow);
    void this.loadHistory(flow);
  },

  onRetry() {
    const flow = retryHistoryPage(this.data.flow);
    this.showLoading(flow);
    void this.loadHistory(flow);
  },

  showLoading(flow: HistoryPageState) {
    this.setData({
      flow,
      calendarCells: calendarCells(flow, this.currentDate),
      monthTitle: monthTitle(flow.month),
      canGoNext: shiftMonth(flow.month, 1, this.currentMonth) !== null,
      errorMessage: '',
    });
  },

  async loadHistory(flow: HistoryPageState) {
    const requestId = ++this.requestSequence;
    try {
      const result = await getPlanHistory({
        month: flow.month,
        selectedDate: flow.selectedDate,
      });
      if (requestId !== this.requestSequence) {
        return;
      }
      const readyFlow = receiveHistoryResult(flow, result);
      this.setData({
        flow: readyFlow,
        calendarCells: calendarCells(readyFlow, this.currentDate),
        monthTitle: monthTitle(readyFlow.month),
        canGoNext: shiftMonth(readyFlow.month, 1, this.currentMonth) !== null,
        errorMessage: '',
      });
    } catch (error) {
      if (requestId !== this.requestSequence) {
        return;
      }
      const code = error instanceof CloudApiError
        ? error.code
        : ('INTERNAL_ERROR' as const);
      this.setData({
        flow: setHistoryPageError(flow, code),
        errorMessage: errorMessages[code],
      });
    }
  },
});
