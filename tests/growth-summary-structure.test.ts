import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('growth summary deployment structure', () => {
  it('has a deployable authenticated CloudBase boundary', async () => {
    const root = resolve(process.cwd(), 'cloudfunctions', 'growth-summary');
    for (const file of ['service.ts', 'handler.ts', 'index.ts', 'index.js', 'package.json', 'tsconfig.json']) {
      await expect(access(resolve(root, file))).resolves.toBeUndefined();
    }
    const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')) as { main?: unknown };
    expect(manifest.main).toBe('dist/growth-summary/index.js');
    expect(await readFile(resolve(root, 'index.js'), 'utf8')).toBe("module.exports = require('./dist/growth-summary/index.js');\n");
    const source = await readFile(resolve(root, 'index.ts'), 'utf8');
    expect(source).toContain('WX_OPENID');
    expect(source.match(/_openid:\s*openid/g)).toHaveLength(2);
    expect(source).toContain("orderBy('createdAt', 'desc')");
    expect(source).toContain('limit(3)');
    for (const privateField of ['completionSummary', 'encouragement', 'nextSuggestion', 'requestId']) {
      expect(source).not.toContain(privateField);
    }
  });
});
