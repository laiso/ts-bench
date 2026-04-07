import { describe, expect, it } from 'bun:test';
import { generateDiffMarkdown, generatePrTitle } from '../update-leaderboard.ts';

const baseResult = {
  metadata: {
    agent: 'opencode',
    model: 'qwen3.6-plus:free',
    provider: 'openrouter',
    timestamp: '2026-01-01T00:00:00.000Z',
    runUrl: 'https://github.com/org/repo/actions/runs/12345',
  },
  summary: {
    successRate: 0,
    totalDuration: 6000000,
    avgDuration: 1200000,
    successCount: 0,
    totalCount: 5,
    agentSuccessCount: 0,
    testSuccessCount: 0,
    testFailedCount: 5,
  },
  tier: {
    tier: 'F',
    label: '0/5',
    solved: 0,
    total: 5,
  },
  results: [
    { exercise: '14958', agentSuccess: true, testSuccess: false, overallSuccess: false, totalDuration: 1209000 },
    { exercise: '14959', agentSuccess: false, testSuccess: false, overallSuccess: false, totalDuration: 800000 },
  ],
};

describe('generateDiffMarkdown', () => {
  it('includes new entry header when oldResult is null', () => {
    const md = generateDiffMarkdown(null, baseResult, 'opencode-qwen3.6-plus:free');
    expect(md).toContain('🚀 New Entry');
    expect(md).toContain('`opencode-qwen3.6-plus:free`');
  });

  it('includes meta info section', () => {
    const md = generateDiffMarkdown(null, baseResult, 'opencode-qwen3.6-plus:free');
    expect(md).toContain('**Agent**: opencode');
    expect(md).toContain('**Model**: qwen3.6-plus:free');
    expect(md).toContain('**Provider**: openrouter');
  });

  it('includes run URL link when runUrl is present', () => {
    const md = generateDiffMarkdown(null, baseResult, 'opencode-qwen3.6-plus:free');
    expect(md).toContain('[View GitHub Actions Run](https://github.com/org/repo/actions/runs/12345)');
  });

  it('omits run URL when not present', () => {
    const result = { ...baseResult, metadata: { ...baseResult.metadata, runUrl: undefined } };
    const md = generateDiffMarkdown(null, result, 'opencode-qwen3.6-plus:free');
    expect(md).not.toContain('View GitHub Actions Run');
  });

  it('includes tier info when tier is present', () => {
    const md = generateDiffMarkdown(null, baseResult, 'opencode-qwen3.6-plus:free');
    expect(md).toContain('**Tier**: F (0/5)');
  });

  it('omits tier section when tier is absent', () => {
    const result = { ...baseResult, tier: undefined };
    const md = generateDiffMarkdown(null, result, 'opencode-qwen3.6-plus:free');
    expect(md).not.toContain('**Tier**');
  });

  it('includes task results table', () => {
    const md = generateDiffMarkdown(null, baseResult, 'opencode-qwen3.6-plus:free');
    expect(md).toContain('| Task | Agent | Test | Overall | Duration |');
    expect(md).toContain('| 14958 | ✅ | ❌ | ❌ | 1209.0s |');
    expect(md).toContain('| 14959 | ❌ | ❌ | ❌ | 800.0s |');
  });

  it('shows N/A duration when totalDuration is absent', () => {
    const result = {
      ...baseResult,
      results: [{ exercise: 'abc', agentSuccess: true, testSuccess: true, overallSuccess: true }],
    };
    const md = generateDiffMarkdown(null, result, 'opencode-qwen3.6-plus:free');
    expect(md).toContain('| abc | ✅ | ✅ | ✅ | N/A |');
  });

  it('shows improved indicator when success rate increases', () => {
    const oldResult = { ...baseResult, summary: { ...baseResult.summary, successRate: 20 } };
    const newResult = { ...baseResult, summary: { ...baseResult.summary, successRate: 60 } };
    const md = generateDiffMarkdown(oldResult, newResult, 'key');
    expect(md).toContain('🔼 Improved');
  });

  it('shows declined indicator when success rate decreases', () => {
    const oldResult = { ...baseResult, summary: { ...baseResult.summary, successRate: 60 } };
    const newResult = { ...baseResult, summary: { ...baseResult.summary, successRate: 20 } };
    const md = generateDiffMarkdown(oldResult, newResult, 'key');
    expect(md).toContain('🔽 Declined');
  });

  it('shows updated indicator when success rate is unchanged', () => {
    const oldResult = { ...baseResult, summary: { ...baseResult.summary, successRate: 20 } };
    const newResult = { ...baseResult, summary: { ...baseResult.summary, successRate: 20 } };
    const md = generateDiffMarkdown(oldResult, newResult, 'key');
    expect(md).toContain('🔄 Updated');
  });

  it('shows previous stats as N/A when oldResult is null', () => {
    const md = generateDiffMarkdown(null, baseResult, 'key');
    expect(md).toContain('(was N/A)');
  });

  it('shows previous stats from old result', () => {
    const oldResult = { ...baseResult, summary: { ...baseResult.summary, successRate: 40, avgDuration: 500000 } };
    const md = generateDiffMarkdown(oldResult, baseResult, 'key');
    expect(md).toContain('was 40.0%');
    expect(md).toContain('was 500.0s');
  });
});

describe('generatePrTitle', () => {
  it('generates title with tier info and run ID', () => {
    const title = generatePrTitle(baseResult, '24030741438');
    expect(title).toBe('feat(leaderboard): opencode / qwen3.6-plus:free — 0/5 F tier [run 24030741438]');
  });

  it('omits run part when runId is undefined', () => {
    const title = generatePrTitle(baseResult, undefined);
    expect(title).toBe('feat(leaderboard): opencode / qwen3.6-plus:free — 0/5 F tier');
  });

  it('falls back to successCount/totalCount when tier is absent', () => {
    const result = { ...baseResult, tier: undefined };
    const title = generatePrTitle(result, '999');
    expect(title).toBe('feat(leaderboard): opencode / qwen3.6-plus:free — 0/5 [run 999]');
  });
});
