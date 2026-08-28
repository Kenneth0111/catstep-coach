const tabItems = [
  { url: '/pages/today/index', label: '今日' },
  { url: '/pages/history/index', label: '历史' },
  { url: '/pages/profile/index', label: '我的' },
];
import { playSoundEffect } from '../../shared/sound-effects';

Component({
  properties: {
    fixed: { type: Boolean, value: false },
    intercept: { type: Boolean, value: false },
    activePath: { type: String, value: '' },
  },

  data: {
    items: tabItems,
  },

  methods: {
    onTap(event: WechatMiniprogram.TouchEvent) {
      const url = String(event.currentTarget.dataset.url);
      playSoundEffect('tap');
      if (this.data.intercept) {
        this.triggerEvent('navigate', { url });
        return;
      }
      void wx.switchTab({ url });
    },
  },
});
