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
  },

  methods: {
    onStart() {
      const task = this.properties.task as TodayTask;
      this.triggerEvent('starttask', { taskId: task.id });
    },
  },
});
