import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = 'cloudfunctions/plan-confirm';
const files = [
  'service.ts',
  'repository.ts',
  'handler.ts',
  'index.ts',
  'index.js',
  'package.json',
  'tsconfig.json',
];

describe('plan.confirm cloud function structure', () => {
  it.each(files)('includes %s', async (file) => {
    await expect(access(resolve(root, file))).resolves.toBeUndefined();
  });

  it('points to the compiled CommonJS entry', async () => {
    const packageJson = JSON.parse(
      await readFile(resolve(root, 'package.json'), 'utf8'),
    ) as { main?: string };
    expect(packageJson.main).toBe('dist/plan-confirm/index.js');

    const entry = await readFile(resolve(root, 'index.js'), 'utf8');
    expect(entry.trim()).toBe(
      "module.exports = require('./dist/plan-confirm/index.js');",
    );
  });

  it('uses trusted identity and owner-scoped plan and goal queries', async () => {
    const [source, repository] = await Promise.all([
      readFile(resolve(root, 'index.ts'), 'utf8'),
      readFile(resolve(root, 'repository.ts'), 'utf8'),
    ]);

    expect(source).toContain('WX_OPENID');
    expect(source).not.toMatch(/(?<!WX_)OPENID/);
    expect(repository).toContain('_openid: openid');
    expect(repository).toContain("status: 'active'");
    expect(repository).toContain('database.command.in(goalIds)');
    expect(repository).toContain('database.runTransaction');
    expect(repository).toContain('.doc(documentId)');
    expect(repository).toContain('await document.get()');
    expect(repository).toContain('await document.set(plan)');
  });
});
