import type {
  ConfirmedReview,
  ReviewConfirmationRepository,
  StoredReview as PersistedReview,
} from './service';
import { awardReviewConfirmationGrowth } from './growth';
import { createHash } from 'node:crypto';

interface StoredPlan {
  _id: string;
  _openid: string;
  date: string;
  status: 'confirmed';
}

interface StoredReview extends PersistedReview {
  _id: string;
}

interface StoredUser {
  _id: string;
  _openid: string;
  growth: number;
  growthDate?: string;
  dailyGrowth?: number;
  createdAt: string;
}

type StoredUserFields = Omit<StoredUser, '_id'>;

type StoredReviewFields = PersistedReview;

interface ReviewDocument {
  get(): Promise<{ data: StoredReview | null }>;
  set(review: StoredReviewFields): Promise<unknown>;
}

interface MemoryDocument {
  set(memory: {
    _openid: string;
    owner: string;
    summary: string;
    sourceDates: string[];
    confirmedAt: string;
    version: 1;
  }): Promise<unknown>;
}

interface UserDocument {
  get(): Promise<{ data: StoredUser | null }>;
  set(user: StoredUserFields): Promise<unknown>;
}

interface Transaction {
  collection(name: 'reviews'): { doc(id: string): ReviewDocument };
  collection(name: 'memories'): { doc(id: string): MemoryDocument };
  collection(name: 'users'): { doc(id: string): UserDocument };
}

export interface ReviewConfirmationDatabase {
  plans: {
    doc(id: string): { get(): Promise<{ data: StoredPlan[] }> };
  };
  reviews: {
    doc(id: string): ReviewDocument;
  };
  memories: {
    doc(id: string): MemoryDocument;
  };
  users: {
    where(query: { _openid: string }): {
      limit(count: number): { get(): Promise<{ data: StoredUser[] }> };
    };
  };
  runTransaction<T>(
    updateFunction: (transaction: Transaction) => Promise<T>,
  ): Promise<T | { result: T }>;
}

function toConfirmedReview(review: StoredReview): ConfirmedReview {
  const { _id, ...fields } = review;
  return { id: _id, ...fields };
}

function isConfirmedReview(value: unknown): value is ConfirmedReview {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'planId' in value &&
    typeof value.planId === 'string' &&
    'growthAwarded' in value &&
    Number.isInteger(value.growthAwarded)
  );
}

function getTransactionResult<T>(value: T | { result: T }): T {
  return (
    typeof value === 'object' &&
    value !== null &&
    'result' in value
      ? value.result
      : value
  ) as T;
}

function createUserDocumentId(openid: string): string {
  return createHash('sha256').update(openid).digest('hex').slice(0, 32);
}

function initialUser(openid: string, createdAt: string): StoredUser {
  return {
    _id: createUserDocumentId(openid),
    _openid: openid,
    growth: 0,
    createdAt,
  };
}

type ReviewConfirmationFailureStage =
  | 'save_review'
  | 'save_memory'
  | 'save_user'
  | 'transaction';

function getErrorCode(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }

  return 'UNKNOWN_ERROR';
}

function logFailure(stage: ReviewConfirmationFailureStage, error: unknown): void {
  console.error('review_confirm_failure', { stage, code: getErrorCode(error) });
}

export function createReviewConfirmationRepository(
  database: ReviewConfirmationDatabase,
  today?: () => string,
): ReviewConfirmationRepository {
  return {
    async findOwnedPlan(openid, planId) {
      const result = await database.plans.doc(planId).get();
      const plan = result.data[0];
      if (
        !plan ||
        plan._openid !== openid ||
        plan.status !== 'confirmed' ||
        (today && plan.date !== today())
      ) {
        return null;
      }
      return { id: plan._id, date: plan.date };
    },
    async saveIfAbsent(documentId, review, memory) {
      const userResult = await database.users
        .where({ _openid: review._openid })
        .limit(1)
        .get();
      const user = userResult.data[0] ?? initialUser(review._openid, review.createdAt);
      let stage: ReviewConfirmationFailureStage = 'transaction';
      try {
        const transactionResult = await database.runTransaction(
          async (transaction) => {
          const reviewDocument = transaction.collection('reviews').doc(documentId);
          const existing = await reviewDocument.get();
          if (existing.data) {
            return toConfirmedReview(existing.data);
          }
          const userDocument = transaction.collection('users').doc(user._id);
          const currentUser = (await userDocument.get()).data ?? user;
          const currentDailyGrowth =
            currentUser.growthDate === review.date
              ? currentUser.dailyGrowth ?? 0
              : 0;
          const growth = awardReviewConfirmationGrowth(currentDailyGrowth);
          const storedReview = { ...review, growthAwarded: growth.awarded };
          stage = 'save_review';
          await reviewDocument.set(storedReview);
          if (memory) {
            stage = 'save_memory';
            await transaction.collection('memories').doc(documentId).set({
              _openid: review._openid,
              owner: review.owner,
              summary: memory,
              sourceDates: [review.date],
              confirmedAt: review.createdAt,
              version: 1,
            });
          }
          const { _id: _userId, ...userFields } = currentUser;
          stage = 'save_user';
          await userDocument.set({
            ...userFields,
            _openid: review._openid,
            growth: Math.max(0, currentUser.growth) + growth.awarded,
            growthDate: review.date,
            dailyGrowth: growth.dailyGrowth,
          });
          return { id: documentId, ...storedReview };
          },
        );
        const confirmedReview = getTransactionResult(transactionResult);
        if (!isConfirmedReview(confirmedReview)) {
          throw new Error('invalid transaction result');
        }
        return confirmedReview;
      } catch (error) {
        logFailure(stage, error);
        throw error;
      }
    },
  };
}
