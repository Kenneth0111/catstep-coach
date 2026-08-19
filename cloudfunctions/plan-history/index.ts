import type {
  HistoryReview,
  PlanHistoryRepository,
  StoredHistoryPlan,
  StoredHistoryTask,
} from './service';

interface RangeCommand {
  and(other: unknown): unknown;
}

interface Collection {
  where(query: Record<string, unknown>): {
    limit(count: number): {
      get(): Promise<{ data: unknown[] }>;
    };
  };
  doc(id: string): {
    get(): Promise<{ data: unknown[] }>;
  };
}

interface Database {
  command: {
    gte(value: string): RangeCommand;
    lt(value: string): unknown;
  };
  collection(name: 'plans' | 'goals' | 'reviews'): Collection;
}

interface StoredTaskDocument extends StoredHistoryTask {}

interface StoredPlanDocument {
  _id: string;
  _openid: string;
  date: string;
  availableMinutes: number;
  summary: string;
  tasks: StoredTaskDocument[];
}

interface StoredGoalDocument {
  _id: string;
  _openid: string;
  title: string;
}

interface StoredReviewDocument extends HistoryReview {}

const cloudbase = require('@cloudbase/node-sdk') as {
  SYMBOL_CURRENT_ENV: string;
  getCloudbaseContext(context: unknown): { WX_OPENID?: string };
  init(options: { env: string }): { database(): Database };
};

const { handlePlanHistory } = require('./handler') as typeof import('./handler');

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const database = app.database();
const command = database.command;
const plans = database.collection('plans');
const goals = database.collection('goals');
const reviews = database.collection('reviews');

function mapTask(task: StoredTaskDocument): StoredHistoryTask {
  return {
    id: task.id,
    title: task.title,
    estimatedMinutes: task.estimatedMinutes,
    doneCriteria: task.doneCriteria,
    goalId: task.goalId,
    priority: task.priority,
    status: task.status,
    ...(task.difficultyFeedback === undefined ? {} : { difficultyFeedback: task.difficultyFeedback }),
  };
}

function mapPlan(plan: StoredPlanDocument): StoredHistoryPlan {
  return {
    id: plan._id,
    date: plan.date,
    availableMinutes: plan.availableMinutes,
    summary: plan.summary,
    tasks: plan.tasks.map(mapTask),
  };
}

function createRepository(): PlanHistoryRepository {
  return {
    async findConfirmedPlans(openid, startDate, endDate) {
      const result = await plans.where({
        _openid: openid,
        status: 'confirmed',
        date: command.gte(startDate).and(command.lt(endDate)),
      }).limit(31).get();
      return (result.data as StoredPlanDocument[]).map(mapPlan);
    },

    async findGoalTitles(openid, goalIds) {
      const entries = await Promise.all(goalIds.slice(0, 5).map(async (goalId) => {
        const result = await goals.doc(goalId).get();
        const goal = result.data[0] as StoredGoalDocument | undefined;
        if (!goal || goal._openid !== openid) {
          return null;
        }
        return [goalId, goal.title] as const;
      }));
      return Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => entry !== null));
    },

    async findConfirmedReview(openid, planId) {
      const result = await reviews.where({ _openid: openid, planId }).limit(1).get();
      const review = result.data[0] as StoredReviewDocument | undefined;
      if (!review) {
        return null;
      }
      return {
        completionSummary: review.completionSummary,
        encouragement: review.encouragement,
        nextSuggestion: review.nextSuggestion,
      };
    },
  };
}

exports.main = (event: unknown, context: unknown) =>
  handlePlanHistory(event, context, {
    getOpenid: (cloudContext) =>
      cloudbase.getCloudbaseContext(cloudContext).WX_OPENID,
    createRepository,
    now: () => new Date(),
  });
