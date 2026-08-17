import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('account deletion deployment and privacy page', () => {
  it('has an authenticated deployable function', async () => {
    const root = resolve(process.cwd(), 'cloudfunctions', 'account-delete');
    await expect(access(resolve(root, 'index.ts'))).resolves.toBeUndefined();
    expect(await readFile(resolve(root, 'index.ts'), 'utf8')).toContain('WX_OPENID');
    const source = await readFile(resolve(root, 'service.ts'), 'utf8');
    for (const collection of ['goals', 'plans', 'reviews', 'memories', 'reminders', 'ai_calls', 'ai_quotas', 'users']) {
      expect(source).toContain(collection);
    }
    const entry = await readFile(resolve(root, 'index.ts'), 'utf8');
    expect(entry).toContain('deletion_audits');
  });
  it('offers AI and deletion disclosure in the profile page', async () => {
    const page = resolve(process.cwd(), 'miniprogram', 'pages', 'profile');
    expect(await readFile(resolve(page, 'index.wxml'), 'utf8')).toContain('AI 生成内容');
    expect(await readFile(resolve(page, 'index.wxml'), 'utf8')).toContain('删除全部数据');
  });
});
