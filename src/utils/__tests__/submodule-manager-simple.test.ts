import { describe, it, expect } from 'bun:test';
import { SubmoduleManager, type SubmoduleConfig } from '../submodule-manager';

describe('SubmoduleManager - Basic Tests', () => {
  it('should create instance with config', () => {
    const config: SubmoduleConfig = {
      submodulePath: './exercism-typescript',
      remoteUrl: 'https://github.com/laiso/exercism-typescript.git',
      githubToken: 'test-token',
      runId: '123456789',
      agent: 'claude',
      model: 'gpt-4'
    };

    const manager = new SubmoduleManager(config);
    expect(manager).toBeDefined();
  });

  it('should generate correct branch name', () => {
    const config: SubmoduleConfig = {
      submodulePath: './exercism-typescript',
      remoteUrl: 'https://github.com/laiso/exercism-typescript.git',
      githubToken: 'test-token',
      runId: '123456789',
      agent: 'claude',
      model: 'gpt-4'
    };

    const manager = new SubmoduleManager(config);
    const branchName = (manager as any).generateBranchName();
    expect(branchName).toBe('results/claude-gpt-4/123456789');
  });

  it('should generate correct compare URL', () => {
    const config: SubmoduleConfig = {
      submodulePath: './exercism-typescript',
      remoteUrl: 'https://github.com/laiso/exercism-typescript.git',
      githubToken: 'test-token',
      runId: '123456789',
      agent: 'claude',
      model: 'gpt-4'
    };

    const manager = new SubmoduleManager(config);
    const branchName = 'results/claude-gpt-4/123456789';
    const compareUrl = (manager as any).generateCompareUrl(branchName);
    expect(compareUrl).toBe('https://github.com/laiso/exercism-typescript/compare/main...results/claude-gpt-4/123456789');
  });
});
