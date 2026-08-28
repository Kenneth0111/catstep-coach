import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSoundEffects,
  getSoundEffectsEnabled,
  setSoundEffectsEnabled,
  type SoundEffectsDependencies,
} from '../miniprogram/shared/sound-effects';

type AudioContext = {
  src: string;
  play: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

function audioContext(): AudioContext {
  return {
    src: '',
    play: vi.fn(),
    stop: vi.fn(),
  };
}

describe('shared interaction sound effects', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('maps the four semantic effects to local MP3 files and alternates cat variants', () => {
    const contexts = [
      audioContext(),
      audioContext(),
      audioContext(),
      audioContext(),
      audioContext(),
    ];
    const created = [...contexts];
    let now = 500;
    const play = createSoundEffects({
      createInnerAudioContext: vi.fn(() => contexts.shift()!) as unknown as SoundEffectsDependencies['createInnerAudioContext'],
      getStorageSync: vi.fn(() => true),
      setStorageSync: vi.fn(),
      now: () => (now += 500),
    });

    play('tap');
    play('action');
    play('success');
    play('cat');
    play('cat');

    expect(created.map((context) => context.src)).toEqual([
      '/assets/sounds/tap.mp3',
      '/assets/sounds/action.mp3',
      '/assets/sounds/success.mp3',
      '/assets/sounds/cat1.mp3',
      '/assets/sounds/cat2.mp3',
    ]);
  });

  it('does not replay an effect inside its cooldown window', () => {
    const context = audioContext();
    let now = 1_000;
    const play = createSoundEffects({
      createInnerAudioContext: vi.fn(() => context) as unknown as SoundEffectsDependencies['createInnerAudioContext'],
      getStorageSync: vi.fn(() => true),
      setStorageSync: vi.fn(),
      now: () => now,
    });

    play('tap');
    now += 200;
    play('tap');
    now += 250;
    play('tap');

    expect(context.play).toHaveBeenCalledTimes(2);
  });

  it('keeps the main interaction silent when sound is disabled or audio playback fails', () => {
    const context = audioContext();
    context.play.mockImplementation(() => { throw new Error('audio unavailable'); });
    const storage = new Map<string, boolean>();
    const dependencies: SoundEffectsDependencies = {
      createInnerAudioContext: vi.fn(() => context) as unknown as SoundEffectsDependencies['createInnerAudioContext'],
      getStorageSync: vi.fn((key: string) => storage.get(key)),
      setStorageSync: vi.fn((key: string, value: boolean) => { storage.set(key, value); }),
      now: () => 1_000,
    };
    const play = createSoundEffects(dependencies);

    setSoundEffectsEnabled(false, dependencies);
    expect(getSoundEffectsEnabled(dependencies)).toBe(false);
    expect(() => play('cat')).not.toThrow();
    expect(context.play).not.toHaveBeenCalled();

    setSoundEffectsEnabled(true, dependencies);
    expect(() => play('cat')).not.toThrow();
    expect(context.play).toHaveBeenCalledTimes(1);
  });

  it('does not interrupt interactions when sound preference storage is unavailable', () => {
    const context = audioContext();
    const dependencies: SoundEffectsDependencies = {
      createInnerAudioContext: vi.fn(() => context) as unknown as SoundEffectsDependencies['createInnerAudioContext'],
      getStorageSync: vi.fn(() => { throw new Error('storage unavailable'); }),
      setStorageSync: vi.fn(() => { throw new Error('storage unavailable'); }),
      now: () => 1_000,
    };
    const play = createSoundEffects(dependencies);

    expect(() => setSoundEffectsEnabled(false, dependencies)).not.toThrow();
    expect(getSoundEffectsEnabled(dependencies)).toBe(true);
    expect(() => play('tap')).not.toThrow();
    expect(context.play).toHaveBeenCalledTimes(1);
  });

  it('retries the same cat variant after a playback failure', () => {
    const contexts = [audioContext(), audioContext()];
    const created = [...contexts];
    contexts[0]!.play.mockImplementationOnce(() => { throw new Error('audio unavailable'); });
    let now = 1_000;
    const play = createSoundEffects({
      createInnerAudioContext: vi.fn(() => contexts.shift()!) as unknown as SoundEffectsDependencies['createInnerAudioContext'],
      getStorageSync: vi.fn(() => true),
      setStorageSync: vi.fn(),
      now: () => now,
    });

    play('cat');
    play('cat');
    now += 500;
    play('cat');

    expect(created.map((context) => context.src)).toEqual([
      '/assets/sounds/cat1.mp3',
      '/assets/sounds/cat2.mp3',
    ]);
    expect(created[0]!.play).toHaveBeenCalledTimes(2);
  });
});
