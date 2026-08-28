import {
  getGrowthSummary,
  getTodayPlan,
  type GrowthSummaryResult,
} from '../../shared/cloud-api';
import {
  getGrowthCharacter,
  getGrowthLevel,
  selectGrowthCharacter,
  type GrowthCharacter,
  type GrowthTaskStatus,
} from '../../shared/growth-profile';
import { playSoundEffect } from '../../shared/sound-effects';

function taskStatusOf(plan: Awaited<ReturnType<typeof getTodayPlan>>): GrowthTaskStatus {
  if (!plan) {
    return 'none';
  }
  if (plan.tasks.some((task) => task.status === 'in_progress')) {
    return 'in_progress';
  }
  if (plan.tasks.some((task) => task.status === 'completed')) {
    return 'completed';
  }
  return 'none';
}

function growthView(summary: GrowthSummaryResult, taskStatus: GrowthTaskStatus) {
  const level = getGrowthLevel(summary.growth);
  const character = selectGrowthCharacter({
    growth: summary.growth,
    firstVisit: summary.growth === 0 && summary.recentAwards.length === 0,
    taskStatus,
    justConfirmedReview: false,
    justReachedLevel: false,
  });
  return {
    growth: summary.growth,
    recentAwards: summary.recentAwards,
    level,
    growthPercent: Math.round(level.progress * 100),
    progressText: level.nextThreshold === null
      ? '你已经到达当前最高阶段'
      : `距离下一阶段还差 ${level.nextThreshold - summary.growth} 点`,
    character,
    restingCharacter: character,
  };
}

const emptySummary: GrowthSummaryResult = { growth: 0, recentAwards: [] };
const initialView = growthView(emptySummary, 'none');

Page({
  requestSequence: 0,

  data: {
    stage: 'loading' as 'loading' | 'ready' | 'error',
    ...initialView,
    characterMotion: false,
    interactionIndex: 0,
  },

  onShow() {
    const tabBar = this.getTabBar();
    if (tabBar) {
      tabBar.setData({ activePath: '/pages/profile/index' });
    }
    void this.loadGrowth();
  },

  onRetry() {
    playSoundEffect('action');
    void this.loadGrowth();
  },

  onOpenSettings() {
    playSoundEffect('tap');
  },

  async loadGrowth() {
    const requestId = ++this.requestSequence;
    this.setData({ stage: 'loading' });
    try {
      const [summary, plan] = await Promise.all([
        getGrowthSummary(),
        getTodayPlan(),
      ]);
      if (requestId !== this.requestSequence) {
        return;
      }
      this.setData({
        stage: 'ready',
        ...growthView(summary, taskStatusOf(plan)),
      });
    } catch {
      if (requestId !== this.requestSequence) {
        return;
      }
      this.setData({ stage: 'error' });
    }
  },

  onTapCharacter() {
    if (this.data.stage !== 'ready') {
      return;
    }
    playSoundEffect('cat');
    const interactions = ['blink', 'wave', 'hop'] as const;
    const interactionIndex = this.data.interactionIndex % interactions.length;
    const character: GrowthCharacter = getGrowthCharacter(interactions[interactionIndex]);
    this.setData({
      character,
      characterMotion: true,
      interactionIndex: interactionIndex + 1,
    });
    setTimeout(() => {
      this.setData({
        character: this.data.restingCharacter,
        characterMotion: false,
      });
    }, 600);
  },
});
