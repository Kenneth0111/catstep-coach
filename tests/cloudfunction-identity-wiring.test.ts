import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const functions = [
  'profile-get-or-create',
  'goal-next-step',
  'goal-confirm',
  'plan-generate',
];

describe('CloudBase caller identity wiring', () => {
  for (const functionName of functions) {
    it(`${functionName} reads the SDK WX_OPENID field`, async () => {
      const source = await readFile(
        `cloudfunctions/${functionName}/index.ts`,
        'utf8',
      );

      expect(source).toContain('WX_OPENID');
      expect(source).not.toMatch(/(?<!WX_)OPENID/);
    });
  }
});
