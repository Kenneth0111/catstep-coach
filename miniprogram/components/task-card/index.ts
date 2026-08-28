import type { TodayTask } from '../../shared/today-plan';
import { playSoundEffect } from '../../shared/sound-effects';

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
    canStart: {
      type: Boolean,
      value: true,
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
      if (this.properties.updating || !this.properties.canStart) {
        return;
      }
      const task = this.properties.task as TodayTask;
      playSoundEffect('action');
      this.triggerEvent('starttask', { taskId: task.id });
    },
    onResize() {
      if (!this.properties.updating) {
        playSoundEffect('action');
        this.triggerEvent('resizetask', { taskId: (this.properties.task as TodayTask).id });
      }
    },
    onMoveToEnd() {
      if (!this.properties.updating) {
        playSoundEffect('action');
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
      playSoundEffect('tap');
      this.setData({ selectedDifficulty: event.currentTarget.dataset.difficulty });
    },
    onComplete() {
      if (this.properties.updating) {
        return;
      }
      const task = this.properties.task as TodayTask;
      const difficulty = this.data.selectedDifficulty;
      if (difficulty === 'easy' || difficulty === 'just_right' || difficulty === 'hard') {
        playSoundEffect('action');
        this.triggerEvent('completetask', { taskId: task.id, difficulty });
      }
    },
  },
});
