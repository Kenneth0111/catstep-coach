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
  it('offers AI, privacy and deletion disclosure in the settings page', async () => {
    const page = resolve(process.cwd(), 'miniprogram', 'pages', 'settings');
    const source = await readFile(resolve(page, 'index.ts'), 'utf8');
    const markup = await readFile(resolve(page, 'index.wxml'), 'utf8');

    expect(source).toContain('deleteAccount');
    expect(source).toContain('onDeleteAccount');
    expect(markup).toContain('AI 生成内容');
    expect(markup).toContain('隐私与数据');
    expect(markup).toContain('删除全部数据');
  });

  it('keeps compliance and deletion controls out of the growth page', async () => {
    const page = resolve(process.cwd(), 'miniprogram', 'pages', 'profile');
    const source = await readFile(resolve(page, 'index.ts'), 'utf8');
    const markup = await readFile(resolve(page, 'index.wxml'), 'utf8');

    expect(source).not.toContain('deleteAccount');
    expect(source).not.toContain('onDeleteAccount');
    expect(markup).toContain('设置与说明');
    expect(markup).not.toContain('AI 生成内容');
    expect(markup).not.toContain('隐私与数据');
    expect(markup).not.toContain('删除全部数据');
  });
});
