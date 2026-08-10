import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = 'cloudfunctions/plan-get-today';
const files = [
  'service.ts',
  'handler.ts',
  'index.ts',
  'index.js',
  'package.json',
  'tsconfig.json',
];

describe('plan.getToday cloud function structure', () => {
  it.each(files)('includes %s', async (file) => {
    await expect(access(resolve(root, file))).resolves.toBeUndefined();
  });

  it('points to the compiled CommonJS entry', async () => {
    const packageJson = JSON.parse(
      await readFile(resolve(root, 'package.json'), 'utf8'),
    ) as { main?: string };
    expect(packageJson.main).toBe('dist/plan-get-today/index.js');

    const entry = await readFile(resolve(root, 'index.js'), 'utf8');
    expect(entry.trim()).toBe(
      "module.exports = require('./dist/plan-get-today/index.js');",
    );
  });

  it('uses trusted identity and an owner-scoped confirmed-date query', async () => {
    const source = await readFile(resolve(root, 'index.ts'), 'utf8');

    expect(source).toContain('WX_OPENID');
    expect(source).not.toMatch(/(?<!WX_)OPENID/);
    expect(source).toContain('_openid: openid');
    expect(source).toContain("status: 'confirmed'");
    expect(source).toContain('date');
    expect(source).toContain('.limit(1)');
  });
});
