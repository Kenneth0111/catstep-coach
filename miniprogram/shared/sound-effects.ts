export type SoundEffect = 'tap' | 'action' | 'success' | 'cat';

type AudioContext = Pick<WechatMiniprogram.InnerAudioContext, 'src' | 'play' | 'stop'>;

export type SoundEffectsDependencies = {
  createInnerAudioContext(): AudioContext;
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: boolean): void;
  now(): number;
};

const soundSources: Record<SoundEffect, readonly string[]> = {
  tap: ['/assets/sounds/tap.mp3'],
  action: ['/assets/sounds/action.mp3'],
  success: ['/assets/sounds/success.mp3'],
  cat: ['/assets/sounds/cat1.mp3', '/assets/sounds/cat2.mp3'],
};
const storageKey = 'catstep:sound-effects-enabled';
const effectCooldownMs = 400;
const globalCooldownMs = 120;

const defaultDependencies: SoundEffectsDependencies = {
  createInnerAudioContext: () => {
    if (typeof wx === 'undefined') {
      throw new Error('Audio is unavailable');
    }
    return wx.createInnerAudioContext();
  },
  getStorageSync: (key) => (
    typeof wx === 'undefined' || typeof wx.getStorageSync !== 'function'
      ? undefined
      : wx.getStorageSync(key)
  ),
  setStorageSync: (key, value) => {
    if (typeof wx !== 'undefined' && typeof wx.setStorageSync === 'function') {
      wx.setStorageSync(key, value);
    }
  },
  now: () => Date.now(),
};

export function getSoundEffectsEnabled(
  dependencies: Pick<SoundEffectsDependencies, 'getStorageSync'> = defaultDependencies,
): boolean {
  try {
    return dependencies.getStorageSync(storageKey) !== false;
  } catch {
    return true;
  }
}

export function setSoundEffectsEnabled(
  enabled: boolean,
  dependencies: Pick<SoundEffectsDependencies, 'setStorageSync'> = defaultDependencies,
): void {
  try {
    dependencies.setStorageSync(storageKey, enabled);
  } catch {
    // Sound preferences are optional and must never interrupt the interaction.
  }
}

export function createSoundEffects(dependencies: SoundEffectsDependencies = defaultDependencies) {
  const contexts = new Map<string, AudioContext>();
  const playedAt = new Map<SoundEffect, number>();
  const sourceIndices = new Map<SoundEffect, number>();
  let lastPlayedAt = Number.NEGATIVE_INFINITY;

  return (effect: SoundEffect): void => {
    if (!getSoundEffectsEnabled(dependencies)) {
      return;
    }
    const now = dependencies.now();
    if (
      now - lastPlayedAt < globalCooldownMs ||
      now - (playedAt.get(effect) ?? Number.NEGATIVE_INFINITY) < effectCooldownMs
    ) {
      return;
    }
    try {
      const sources = soundSources[effect];
      const sourceIndex = sourceIndices.get(effect) ?? 0;
      const source = sources[sourceIndex % sources.length]!;
      let context = contexts.get(source);
      if (!context) {
        context = dependencies.createInnerAudioContext();
        context.src = source;
        contexts.set(source, context);
      }
      context.stop();
      context.play();
      sourceIndices.set(effect, sourceIndex + 1);
      playedAt.set(effect, now);
      lastPlayedAt = now;
    } catch {
      // Sound feedback is optional and must never interrupt the interaction.
    }
  };
}

export const playSoundEffect = createSoundEffects();
