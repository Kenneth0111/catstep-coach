import {
  DailyPlanValidationError,
  type DailyPlan,
  type DailyPlanConstraints,
  type DailyPlanValidationCode,
  validateDailyPlanStructure,
} from './daily-plan';

export type DailyPlanEvaluationScenario =
  | 'student'
  | 'job_search'
  | 'work_project'
  | 'low_energy'
  | 'time_conflict'
  | 'large_goal';

export interface DailyPlanEvaluationCase {
  id: string;
  scenario: DailyPlanEvaluationScenario;
  context: DailyPlanConstraints;
  candidate: DailyPlan;
}

export type DailyPlanCandidateEvaluation =
  | { caseId: string; structurallyValid: true }
  | {
    caseId: string;
    structurallyValid: false;
    validationCode: DailyPlanValidationCode;
  };

const cases: ReadonlyArray<{
  scenario: DailyPlanEvaluationScenario;
  availableMinutes: number;
  goal: string;
  title: string;
  action: string;
  doneCriteria: string;
}> = [
  { scenario: 'student', availableMinutes: 15, goal: '完成英语复习', title: '复习十个单词', action: '复习十个高频单词', doneCriteria: '能写出十个单词释义' },
  { scenario: 'student', availableMinutes: 30, goal: '掌握数据结构', title: '完成链表练习', action: '完成一道链表练习', doneCriteria: '测试样例通过' },
  { scenario: 'student', availableMinutes: 45, goal: '准备考试', title: '整理错题', action: '整理三道错题的原因', doneCriteria: '每道错题有改正步骤' },
  { scenario: 'student', availableMinutes: 60, goal: '学习前端基础', title: '练习组件状态', action: '完成一个组件状态练习', doneCriteria: '页面可切换两种状态' },
  { scenario: 'student', availableMinutes: 20, goal: '阅读技术书', title: '阅读一个小节', action: '阅读一个小节并记两条笔记', doneCriteria: '写下两条要点' },
  { scenario: 'job_search', availableMinutes: 15, goal: '准备求职材料', title: '修改简历摘要', action: '改写简历顶部摘要', doneCriteria: '摘要包含目标岗位和一项能力' },
  { scenario: 'job_search', availableMinutes: 30, goal: '准备面试', title: '练习自我介绍', action: '录一遍一分钟自我介绍', doneCriteria: '录音时长在五十到七十秒' },
  { scenario: 'job_search', availableMinutes: 45, goal: '投递岗位', title: '完成一次投递', action: '根据岗位说明调整一段经历并投递', doneCriteria: '保存投递记录' },
  { scenario: 'job_search', availableMinutes: 60, goal: '准备作品集', title: '补充项目说明', action: '补充一个项目的职责和结果', doneCriteria: '项目页有职责和结果两段' },
  { scenario: 'job_search', availableMinutes: 20, goal: '练习算法面试', title: '复盘一道题', action: '复盘一道已完成算法题', doneCriteria: '写出解题思路和复杂度' },
  { scenario: 'work_project', availableMinutes: 15, goal: '推进项目沟通', title: '明确下一步', action: '给协作方写一条下一步说明', doneCriteria: '消息含负责人和截止时间' },
  { scenario: 'work_project', availableMinutes: 30, goal: '完成需求分析', title: '列出验收点', action: '列出三个需求验收点', doneCriteria: '每个验收点可判断通过或失败' },
  { scenario: 'work_project', availableMinutes: 45, goal: '修复项目问题', title: '复现一个问题', action: '记录一个问题的复现步骤', doneCriteria: '步骤可让同事复现' },
  { scenario: 'work_project', availableMinutes: 60, goal: '准备项目汇报', title: '整理进度', action: '整理本周三个进度事实', doneCriteria: '形成一页进度提纲' },
  { scenario: 'work_project', availableMinutes: 25, goal: '改进代码质量', title: '补充一个测试', action: '为现有函数补充一个边界测试', doneCriteria: '新测试通过' },
  { scenario: 'low_energy', availableMinutes: 5, goal: '保持学习习惯', title: '打开学习材料', action: '打开材料并读第一段', doneCriteria: '读完第一段并标记重点' },
  { scenario: 'low_energy', availableMinutes: 10, goal: '整理工作入口', title: '清理一个待办', action: '把一个模糊待办改成下一步动作', doneCriteria: '待办以动词开头' },
  { scenario: 'low_energy', availableMinutes: 15, goal: '恢复项目节奏', title: '查看上次记录', action: '阅读上次工作记录并写下一步', doneCriteria: '写下一条不超过十五分钟的动作' },
  { scenario: 'low_energy', availableMinutes: 20, goal: '复习知识点', title: '做两张卡片', action: '复习两张知识卡片', doneCriteria: '两张卡片均完成回忆' },
  { scenario: 'low_energy', availableMinutes: 30, goal: '推进文档', title: '补一段说明', action: '补充文档中的一段背景说明', doneCriteria: '背景说明包含问题和目标' },
  { scenario: 'time_conflict', availableMinutes: 15, goal: '完成课程任务', title: '确定优先题', action: '从作业中选出最重要的一题', doneCriteria: '题目和选择理由已记录' },
  { scenario: 'time_conflict', availableMinutes: 20, goal: '推进客户沟通', title: '准备问题清单', action: '准备三条会议问题', doneCriteria: '问题按优先级排序' },
  { scenario: 'time_conflict', availableMinutes: 30, goal: '完成阅读计划', title: '精读两页', action: '精读两页并标注疑问', doneCriteria: '标注至少一个疑问' },
  { scenario: 'time_conflict', availableMinutes: 45, goal: '更新项目任务', title: '拆分一个任务', action: '把一个大任务拆成三步', doneCriteria: '每步不超过四十五分钟' },
  { scenario: 'time_conflict', availableMinutes: 60, goal: '准备演示', title: '走读演示流程', action: '走读一次演示流程', doneCriteria: '记录两个需要补充的位置' },
  { scenario: 'large_goal', availableMinutes: 15, goal: '完成毕业设计', title: '定义最小模块', action: '写下最小模块的输入和输出', doneCriteria: '输入和输出各一条' },
  { scenario: 'large_goal', availableMinutes: 30, goal: '学习一门新语言', title: '完成第一课', action: '完成课程的第一个小节', doneCriteria: '完成小节练习' },
  { scenario: 'large_goal', availableMinutes: 45, goal: '转岗准备', title: '列出能力差距', action: '列出三个需要补足的能力', doneCriteria: '每项能力有一个学习来源' },
  { scenario: 'large_goal', availableMinutes: 60, goal: '完成个人项目', title: '实现一个页面', action: '实现页面的静态结构', doneCriteria: '页面包含标题、内容和主按钮' },
  { scenario: 'large_goal', availableMinutes: 25, goal: '建立长期习惯', title: '安排明天入口', action: '为明天写下一个开始动作', doneCriteria: '动作可在二十五分钟内完成' },
];

export const dailyPlanEvaluationCases: readonly DailyPlanEvaluationCase[] = cases.map(
  (evaluationCase, index) => {
    const goalId = `evaluation-goal-${index + 1}`;
    return {
      id: `daily-plan-${String(index + 1).padStart(2, '0')}`,
      scenario: evaluationCase.scenario,
      context: {
        availableMinutes: evaluationCase.availableMinutes,
        goalIds: [goalId],
        goals: [{
          id: goalId,
          title: evaluationCase.goal,
          successCriteria: evaluationCase.doneCriteria,
          currentProgress: '已确认一个可开始的小步骤',
          stage: '今天先完成一个小动作',
        }],
      },
      candidate: {
        summary: '先完成一个清晰的小步骤。',
        tasks: [{
          title: evaluationCase.title,
          action: evaluationCase.action,
          estimatedMinutes: evaluationCase.availableMinutes,
          doneCriteria: evaluationCase.doneCriteria,
          goalId,
          reason: '让长期目标转化为今天可完成的行动。',
          difficulty: 'easy',
        }],
      },
    };
  },
);

/** Returns only a case ID and contract result; never keeps candidate text. */
export function evaluateDailyPlanCandidate(
  evaluationCase: DailyPlanEvaluationCase,
  candidate: unknown,
): DailyPlanCandidateEvaluation {
  try {
    validateDailyPlanStructure(candidate, evaluationCase.context);
    return { caseId: evaluationCase.id, structurallyValid: true };
  } catch (error) {
    if (error instanceof DailyPlanValidationError) {
      return {
        caseId: evaluationCase.id,
        structurallyValid: false,
        validationCode: error.code,
      };
    }
    throw error;
  }
}
