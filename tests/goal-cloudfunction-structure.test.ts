import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const functionRoot = 'cloudfunctions/goal-next-step';
const requiredFiles = [
  'handler.ts',
  'index.ts',
  'package.json',
  'prompt.ts',
  '../shared/tokenhub-provider.ts',
  'tsconfig.json',
];

describe('goal.nextStep cloud function structure', () => {
  it.each(requiredFiles)('includes %s', async (file) => {
    await expect(
      access(resolve(process.cwd(), functionRoot, file)),
    ).resolves.toBeUndefined();
  });

  it('points the package entry at the compiled handler', async () => {
    const packageJson = JSON.parse(
      await readFile(
        resolve(process.cwd(), functionRoot, 'package.json'),
        'utf8',
      ),
    ) as { main?: string };

    expect(packageJson.main).toBe('dist/goal-next-step/index.js');
  });
});
