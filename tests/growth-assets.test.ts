import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getGrowthCharacter, growthCharacterKeys } from '../miniprogram/shared/growth-profile';

describe('growth character assets', () => {
  it.each(growthCharacterKeys)('includes a local transparent PNG for %s', async (key) => {
    const character = getGrowthCharacter(key);
    expect(character.src).toBe(`/assets/growth/${key}.png`);
    const path = resolve(
      process.cwd(),
      'miniprogram',
      character.src.slice(1),
    );
    await expect(access(path)).resolves.toBeUndefined();

    const image = await readFile(path);
    expect(image.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(image.readUInt32BE(16)).toBe(320);
    expect(image.readUInt32BE(20)).toBe(320);
    expect(image[25]).toBe(6);
  });
});
