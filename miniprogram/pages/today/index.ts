import {
  selectCurrentTask,
  summarizePlan,
  type TodayTask,
} from '../../shared/today-plan';

const initialTasks: TodayTask[] = [
  {
    id: 'task-1',
    title: '整理今天要完成的三个步骤',
    estimatedMinutes: 20,
    status: 'pending',
    priority: 1,
  },
  {
    id: 'task-2',
    title: '专注完成第一轮实现',
    estimatedMinutes: 40,
    status: 'pending',
    priority: 2,
  },
  {
    id: 'task-3',
    title: '记录结果和下一步',
    estimatedMinutes: 15,
    status: 'pending',
    priority: 3,
  },
];

const initialCurrentTask = selectCurrentTask(initialTasks);

Page({
  data: {
    tasks: initialTasks,
    currentTask: initialCurrentTask,
    nextTasks: initialTasks.filter((task) => task.id !== initialCurrentTask?.id),
    summary: summarizePlan(initialTasks),
  },

  onStartTask(event: WechatMiniprogram.CustomEvent<{ taskId: string }>) {
    const tasks = this.data.tasks.map((task) => ({
      ...task,
      status:
        task.id === event.detail.taskId ? ('in_progress' as const) : task.status,
    }));
    const currentTask = selectCurrentTask(tasks);

    this.setData({
      tasks,
      currentTask,
      nextTasks: tasks.filter((task) => task.id !== currentTask?.id),
      summary: summarizePlan(tasks),
    });
  },
});
