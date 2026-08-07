import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const requiredFiles = [
  'cloudfunctions/profile-get-or-create/service.ts',
  'cloudfunctions/profile-get-or-create/index.ts',
  'cloudfunctions/profile-get-or-create/package.json',
  'cloudfunctions/profile-get-or-create/tsconfig.json',
];

describe('profile cloud function structure', () => {
  it.each(requiredFiles)('includes %s', async (file) => {
    await expect(access(resolve(process.cwd(), file))).resolves.toBeUndefined();
  });
});
