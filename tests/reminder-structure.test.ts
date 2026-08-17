import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), 'cloudfunctions');

describe('reminder cloud function structure', () => {
  for (const name of ['reminder-schedule', 'reminder-dispatch']) {
    it(`${name} has a deployable entry`, async () => {
      await expect(access(resolve(root, name, 'index.ts'))).resolves.toBeUndefined();
      const packageJson = JSON.parse(await readFile(resolve(root, name, 'package.json'), 'utf8')) as { main?: string };
      expect(packageJson.main).toBe(`dist/${name}/index.js`);
    });
  }

  it('obtains scheduling identity from WX_OPENID', async () => {
    const source = await readFile(resolve(root, 'reminder-schedule', 'index.ts'), 'utf8');
    expect(source).toContain('WX_OPENID');
    expect(source).toContain("collection('reminders')");
  });

  it('loads due reminders and persists dispatch status', async () => {
    const source = await readFile(resolve(root, 'reminder-dispatch', 'index.ts'), 'utf8');
    const packageJson = JSON.parse(
      await readFile(resolve(root, 'reminder-dispatch', 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> };
    expect(source).toContain("collection('reminders')");
    expect(source).toContain("status: 'pending'");
    expect(source).toContain('markDispatched');
    expect(source).toContain('createSubscriptionMessageSender');
    expect(source).toContain('openapi.subscribeMessage.send');
    expect(packageJson.dependencies?.['wx-server-sdk']).toBe('4.0.2');
  });

  it('declares the WeChat cloud-call permission required for subscription delivery', async () => {
    const config = JSON.parse(
      await readFile(resolve(root, 'reminder-dispatch', 'config.json'), 'utf8'),
    ) as {
      permissions?: { openapi?: string[] };
      triggers?: Array<{ name: string; type: string; config: string }>;
    };

    expect(config.permissions?.openapi).toEqual(['subscribeMessage.send']);
    expect(config.triggers).toEqual([{
      name: 'dispatch-reminders-every-5-minutes',
      type: 'timer',
      config: '0 */5 * * * * *',
    }]);
  });
});
