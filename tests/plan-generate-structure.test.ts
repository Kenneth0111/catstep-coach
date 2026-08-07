import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = 'cloudfunctions/plan-generate';
const files = [
  'service.ts',
  'handler.ts',
  'index.ts',
  'package.json',
  'prompt.ts',
  'tsconfig.json',
];

describe('plan.generate cloud function structure', () => {
  it.each(files)('includes %s', async (file) => {
    await expect(access(resolve(root, file))).resolves.toBeUndefined();
  });

  it('points to the compiled CommonJS entry', async () => {
    const packageJson = JSON.parse(
      await readFile(resolve(root, 'package.json'), 'utf8'),
    ) as { main?: string };
    expect(packageJson.main).toBe('dist/plan-generate/index.js');
  });
});
