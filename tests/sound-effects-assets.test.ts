import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const soundFiles = [
  'tap.mp3',
  'action.mp3',
  'success.mp3',
  'cat1.mp3',
  'cat2.mp3',
] as const;

const mpeg1Layer3Bitrates = [
  0, 32, 40, 48, 56, 64, 80, 96,
  112, 128, 160, 192, 224, 256, 320, 0,
] as const;
const mpeg1SampleRates = [44_100, 48_000, 32_000, 0] as const;

function readSynchsafeInteger(file: Buffer, offset: number): number {
  return (
    ((file[offset] ?? 0) & 0x7f) * 0x20_0000
    + ((file[offset + 1] ?? 0) & 0x7f) * 0x4000
    + ((file[offset + 2] ?? 0) & 0x7f) * 0x80
    + ((file[offset + 3] ?? 0) & 0x7f)
  );
}

function inspectMp3(file: Buffer) {
  const hasId3 = file.toString('ascii', 0, 3) === 'ID3';
  const id3FooterBytes = hasId3 && ((file[5] ?? 0) & 0x10) !== 0 ? 10 : 0;
  let frameOffset = hasId3 ? 10 + readSynchsafeInteger(file, 6) + id3FooterBytes : 0;

  while (
    frameOffset + 4 <= file.length
    && !(
      file[frameOffset] === 0xff
      && ((file[frameOffset + 1] ?? 0) & 0xe0) === 0xe0
    )
  ) {
    frameOffset += 1;
  }

  expect(frameOffset + 4).toBeLessThanOrEqual(file.length);
  const versionBits = ((file[frameOffset + 1] ?? 0) >> 3) & 0x03;
  const layerBits = ((file[frameOffset + 1] ?? 0) >> 1) & 0x03;
  const bitrateIndex = ((file[frameOffset + 2] ?? 0) >> 4) & 0x0f;
  const sampleRateIndex = ((file[frameOffset + 2] ?? 0) >> 2) & 0x03;
  const bitrateKbps = mpeg1Layer3Bitrates[bitrateIndex] ?? 0;
  const sampleRate = mpeg1SampleRates[sampleRateIndex] ?? 0;

  return {
    bitrateKbps,
    durationSeconds: ((file.length - frameOffset) * 8) / (bitrateKbps * 1000),
    layerBits,
    sampleRate,
    versionBits,
  };
}

describe('interaction sound assets', () => {
  it.each(soundFiles)('ships %s as a compact 48 kHz MP3', (name) => {
    const path = resolve(`miniprogram/assets/sounds/${name}`);
    const exists = existsSync(path);
    expect(exists).toBe(true);
    if (!exists) {
      return;
    }

    const file = readFileSync(path);
    const info = inspectMp3(file);
    expect(info.versionBits).toBe(3);
    expect(info.layerBits).toBe(1);
    expect(info.bitrateKbps).toBe(192);
    expect(info.sampleRate).toBe(48_000);
    expect(info.durationSeconds).toBeGreaterThan(0.1);
    expect(info.durationSeconds).toBeLessThanOrEqual(2.2);
  });

  it('keeps all five local sounds below 180 KiB', () => {
    const paths = soundFiles.map((name) => resolve(`miniprogram/assets/sounds/${name}`));
    const allExist = paths.every((path) => existsSync(path));
    expect(allExist).toBe(true);
    if (!allExist) {
      return;
    }

    const totalBytes = paths
      .map((path) => readFileSync(path).length)
      .reduce((sum, size) => sum + size, 0);
    expect(totalBytes).toBeLessThan(180 * 1024);
  });
});
