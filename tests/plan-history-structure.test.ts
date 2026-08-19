import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), 'cloudfunctions/plan-history');
const developmentGuide = resolve(process.cwd(), 'docs/development.md');
const releaseGuide = resolve(process.cwd(), 'docs/day6-quality-release.md');
const deploymentFiles = ['service.ts', 'handler.ts', 'index.ts', 'index.js', 'package.json', 'tsconfig.json'];

function extractMarkdownSection(source: string, heading: string): string {
  const lines = source.split(/\r?\n/);
  const start = lines.indexOf(heading);
  if (start === -1) return '';
  const level = heading.match(/^#+/)?.[0].length ?? 0;
  const relativeEnd = lines.slice(start + 1).findIndex((line) => {
    const nextLevel = line.match(/^(#+)\s/)?.[1].length;
    return nextLevel !== undefined && nextLevel <= level;
  });
  const end = relativeEnd === -1 ? lines.length : start + 1 + relativeEnd;
  return lines.slice(start, end).join('\n');
}

describe('plan-history deployment structure', () => {
  it('contains the deployable cloud function files and forwards CommonJS exactly', async () => {
    for (const file of deploymentFiles) {
      await expect(access(resolve(root, file))).resolves.toBeUndefined();
    }

    await expect(readFile(resolve(root, 'package.json'), 'utf8')).resolves.toContain(
      '"main": "dist/plan-history/index.js"',
    );
    await expect(readFile(resolve(root, 'index.js'), 'utf8')).resolves.toBe(
      "module.exports = require('./dist/plan-history/index.js');\n",
    );
  });

  it('uses only trusted WX_OPENID identity and constrains every history query by owner', async () => {
    const source = await readFile(resolve(root, 'index.ts'), 'utf8');

    expect(source).toContain('.WX_OPENID');
    expect(source).not.toMatch(/\b(event|input)\s*(?:\.|\[)\s*['\"]?(?:openid|_openid|userId)['\"]?/i);
    expect(source).toContain("collection('plans')");
    expect(source).toContain("collection('reviews')");
    expect(source).toContain("collection('goals')");
    expect(source).toContain('_openid: openid');
    expect(source).toMatch(/status:\s*'confirmed'/);
    expect(source).toMatch(/command\.gte\(startDate\)\.and\(command\.lt\(endDate\)\)/);
    expect(source).toMatch(/\.limit\(31\)\.get\(\)/);
    expect(source).toMatch(/planId,?\s*\}\)\.limit\(1\)\.get\(\)/);
    expect(source).toMatch(/goals\.doc\(goalId\)\.get\(\)/);
    expect(source).toMatch(/goal\._openid\s*!==\s*openid/);
  });

  it('documents plan-history deployment, history acceptance, and isolated account deletion', async () => {
    const development = await readFile(developmentGuide, 'utf8');
    const release = await readFile(releaseGuide, 'utf8');
    const developmentHistory = extractMarkdownSection(development, '## 部署并验收历史日历');
    const releaseHistory = extractMarkdownSection(release, '### 历史页双账号交接');
    const uploadStep = developmentHistory.match(/^3\. .*$/m)?.[0] ?? '';

    expect(developmentHistory).toContain('npm.cmd run build --prefix cloudfunctions/plan-history');
    expect(uploadStep).toContain('`cloudfunctions/plan-history`');
    expect(uploadStep).toContain('“上传并部署：云端安装依赖”');
    expect(developmentHistory).toContain(
      '确认能看到 A 的目标、任务状态与复盘，且看不到 B 的记录。B 重复同样步骤，确认只能看到 B 的记录。',
    );
    expect(developmentHistory).toContain(
      '确认 A 的八项均为 0，B 的每一项数量与删除前完全相同。',
    );
    expect(releaseHistory).toContain(
      '确认各自只能看到本人的目标、任务状态与复盘，彼此不可见。',
    );
    expect(releaseHistory).toContain(
      'A 的八个业务集合计数均应变为 0；账号 B 的历史记录及八项计数必须与删除前一致。',
    );
  });

  it('documents the shared Shanghai-day AI quota and safe live verification procedure', async () => {
    const development = await readFile(developmentGuide, 'utf8');
    const release = await readFile(releaseGuide, 'utf8');
    const quotaGuide = extractMarkdownSection(development, '## Day 5：额度、提醒与删除');
    const liveAcceptance = extractMarkdownSection(release, '## 真实 CloudBase 与真机验收');
    const evaluationGuide = extractMarkdownSection(release, '## 真实模型的 30 例人工评测');

    expect(quotaGuide).toContain('同一微信身份的 `openid` 与上海自然日共同计数');
    expect(quotaGuide).toContain('四个 AI 工作流共享同一份每日额度');
    expect(quotaGuide).not.toMatch(/前\s*6\s*次|第\s*7\s*次/);
    expect(liveAcceptance).toContain('当日 `ai_quotas.count` 为 0 的专用测试账号');
    expect(liveAcceptance).toContain('前 2 次允许，第 3 次返回 `QUOTA_EXCEEDED`');
    expect(liveAcceptance).toContain('把值改为 3 后，无需重启或重新部署，再调用 1 次应立即允许');
    expect(evaluationGuide).toContain('每例最多 4 次目标澄清和 1 次计划生成');
    expect(evaluationGuide).toContain('不低于该测试账号当日现有计数加 165');
    expect(evaluationGuide).toContain('150 次工作流调用上限和 15 次重试余量');
    expect(evaluationGuide).toContain('评测完成后恢复原配置');
    expect(evaluationGuide).toContain('不得修改 `ai_quotas.count`');
  });
});
