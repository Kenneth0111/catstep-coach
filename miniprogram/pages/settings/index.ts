import { deleteAccount } from '../../shared/cloud-api';
import {
  getSoundEffectsEnabled,
  playSoundEffect,
  setSoundEffectsEnabled,
} from '../../shared/sound-effects';

Page({
  data: {
    deleting: false,
    message: '',
    soundEffectsEnabled: true,
  },

  onLoad() {
    this.setData({ soundEffectsEnabled: getSoundEffectsEnabled() });
  },

  onSoundEffectsChange(event: WechatMiniprogram.CustomEvent<{ value: boolean }>) {
    const enabled = event.detail.value;
    setSoundEffectsEnabled(enabled);
    this.setData({ soundEffectsEnabled: enabled });
    if (enabled) {
      playSoundEffect('tap');
    }
  },

  async onDeleteAccount() {
    const confirmation = await wx.showModal({
      title: '删除全部数据',
      content: '此操作会删除你的目标、计划、复盘、记忆和提醒，且无法恢复。',
      confirmText: '确认删除',
      confirmColor: '#A33A2B',
    });
    if (!confirmation.confirm) {
      return;
    }
    playSoundEffect('action');
    this.setData({ deleting: true, message: '' });
    try {
      await deleteAccount();
      this.setData({ message: '你的数据已删除。' });
    } catch {
      this.setData({ message: '删除没有完成，请稍后重试。' });
    } finally {
      this.setData({ deleting: false });
    }
  },
});
