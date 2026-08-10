import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const entries = {
  'profile-get-or-create': './dist/index.js',
  'goal-next-step': './dist/goal-next-step/index.js',
  'goal-confirm': './dist/goal-confirm/index.js',
  'plan-generate': './dist/plan-generate/index.js',
};

describe('CloudBase deployment entries', () => {
  for (const [functionName, compiledEntry] of Object.entries(entries)) {
    it(`${functionName} exposes the default CloudBase index.js entry`, async () => {
      const source = await readFile(
        `cloudfunctions/${functionName}/index.js`,
        'utf8',
      );

      expect(source.trim()).toBe(`module.exports = require('${compiledEntry}');`);
    });
  }
});
