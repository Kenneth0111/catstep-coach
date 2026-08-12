import type { TodayTask } from '../../shared/today-plan';

Component({
  properties: {
    task: {
      type: Object,
      value: {},
    },
    primary: {
      type: Boolean,
      value: false,
    },
    updating: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    selectedDifficulty: '',
  },

  observers: {
    'task.id, task.status'() {
      this.setData({ selectedDifficulty: '' });
    },
  },

  methods: {
    onStart() {
      if (this.properties.updating) {
        return;
      }
      const task = this.properties.task as TodayTask;
      this.triggerEvent('starttask', { taskId: task.id });
    },
    onResize() {
      if (!this.properties.updating) {
        this.triggerEvent('resizetask', { taskId: (this.properties.task as TodayTask).id });
      }
    },
    onMoveToEnd() {
      if (!this.properties.updating) {
        this.triggerEvent('movetasktoend', { taskId: (this.properties.task as TodayTask).id });
      }
    },
    onSelectDifficulty(
      event: WechatMiniprogram.CustomEvent<{
        difficulty: 'easy' | 'just_right' | 'hard';
      }>,
    ) {
      if (this.properties.updating) {
        return;
      }
      this.setData({ selectedDifficulty: event.currentTarget.dataset.difficulty });
    },
    onComplete() {
      if (this.properties.updating) {
        return;
      }
      const task = this.properties.task as TodayTask;
      const difficulty = this.data.selectedDifficulty;
      if (difficulty === 'easy' || difficulty === 'just_right' || difficulty === 'hard') {
        this.triggerEvent('completetask', { taskId: task.id, difficulty });
      }
    },
  },
});
