import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = 'cloudfunctions/review-confirm';
const files = [
  'service.ts',
  'handler.ts',
  'repository.ts',
  'index.ts',
  'package.json',
  'tsconfig.json',
];

describe('review.confirm cloud function structure', () => {
  it.each(files)('includes %s', async (file) => {
    await expect(access(resolve(root, file))).resolves.toBeUndefined();
  });

  it('points to the compiled CommonJS entry', async () => {
    const packageJson = JSON.parse(
      await readFile(resolve(root, 'package.json'), 'utf8'),
    ) as { main?: string };
    expect(packageJson.main).toBe('dist/review-confirm/index.js');
  });

  it('adapts CloudBase collection access for the confirmation repository', async () => {
    const source = await readFile(resolve(root, 'index.ts'), 'utf8');

    expect(source).toContain("collection('plans')");
    expect(source).toContain("collection('reviews')");
    expect(source).toContain("collection('memories')");
    expect(source).toContain("collection('users')");
  });

  it('invokes the CloudBase transaction through its owning database instance', async () => {
    const source = await readFile(resolve(root, 'index.ts'), 'utf8');

    expect(source).toContain('const app = cloudbase.init');
    expect(source).toContain('const rawDatabase = app.database();');
    expect(source).toContain(
      'runTransaction: (updateFunction) => rawDatabase.runTransaction(updateFunction)',
    );
  });
});
