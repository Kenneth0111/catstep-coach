import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = 'cloudfunctions/plan-resize-task';
const files = ['service.ts', 'handler.ts', 'repository.ts', 'prompt.ts', 'index.ts', 'package.json', 'tsconfig.json'];

describe('plan.resizeTask cloud function structure', () => {
  it.each(files)('includes %s', async (file) => {
    await expect(access(resolve(root, file))).resolves.toBeUndefined();
  });

  it('points to the compiled CommonJS entry', async () => {
    const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')) as { main?: string };
    expect(packageJson.main).toBe('dist/plan-resize-task/index.js');
  });
});
