import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface PackageManifest {
  type?: string;
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const requiredDependencies = {
  typescript: '7.0.2',
  vitest: '4.1.10',
  '@types/node': '26.1.2',
  'miniprogram-api-typings': '5.2.2',
};

describe('toolchain contract', () => {
  it('defines the required scripts and pinned development dependencies', async () => {
    const manifest = JSON.parse(
      await readFile(resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as PackageManifest;

    expect(manifest.type).toBe('module');
    expect(manifest.scripts).toEqual(
      expect.objectContaining({
        test: expect.any(String),
        'test:watch': expect.any(String),
        typecheck: expect.any(String),
      }),
    );
    expect(manifest.devDependencies).toMatchObject(requiredDependencies);
  });
});
