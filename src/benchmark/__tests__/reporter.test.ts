import { describe, expect, it, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { BenchmarkReporter } from '../reporter';
import type { BenchmarkConfig, TestResult } from '../../config/types';
import { V2_DEFAULT_TASKS } from '../../config/constants';

describe('BenchmarkReporter', () => {
    let reporter: BenchmarkReporter;
    let mockConfig: BenchmarkConfig;
    let mockResults: TestResult[];

    beforeEach(() => {
        reporter = new BenchmarkReporter();
        
        mockConfig = {
            agent: 'claude',
            model: 'sonnet-3.5',
            provider: 'anthropic',
            testCommand: 'bun test',
            verbose: false
        };

        mockResults = [
            {
                exercise: 'hello-world',
                agentSuccess: true,
                testSuccess: true,
                overallSuccess: true,
                agentDuration: 5000,
                testDuration: 2000,
                totalDuration: 7000,
                agentError: undefined,
                testError: undefined,
                tokenUsage: {
                    inputTokens: 1000,
                    outputTokens: 500,
                    totalTokens: 1500,
                    cost: 0.001,
                }
            },
            {
                exercise: 'two-fer',
                agentSuccess: false,
                testSuccess: false,
                overallSuccess: false,
                agentDuration: 3000,
                testDuration: 1000,
                totalDuration: 4000,
                agentError: 'Syntax error in generated code',
                testError: 'Tests failed with compilation error',
                tokenUsage: {
                    inputTokens: 800,
                    outputTokens: 300,
                    totalTokens: 1100,
                    cost: 0.0008,
                }
            }
        ];
    });

    afterEach(() => {
        mock.restore();
    });

    describe('printResults', () => {
        it('calculates correct statistics', () => {
            const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
            
            reporter.printResults(mockResults);
            
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Success Rate: 50.0% (1/2)'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Total Duration: 11.0s'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Average Duration: 5.5s'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Agent Success: 1'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Test Success: 1'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Test Failed: 1'));
            
            consoleSpy.mockRestore();
        });

        it('displays detailed results', () => {
            const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
            
            reporter.printResults(mockResults);
            
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('hello-world'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('two-fer'));
            
            consoleSpy.mockRestore();
        });

        it('displays errors for failed tests', () => {
            const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
            
            reporter.printResults(mockResults);
            
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Syntax error in generated code'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Tests failed with compilation error'));
            
            consoleSpy.mockRestore();
        });

        it('displays token totals when tokenUsage is present', () => {
            const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});

            reporter.printResults(mockResults);

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Total Tokens:'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('2,600'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Estimated Cost:'));

            consoleSpy.mockRestore();
        });

        it('does not display token totals when tokenUsage is absent', () => {
            const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
            const resultsWithoutTokens = mockResults.map(r => ({ ...r, tokenUsage: undefined }));

            reporter.printResults(resultsWithoutTokens);

            const tokenCalls = consoleSpy.mock.calls.filter(
                (args: unknown[]) => typeof args[0] === 'string' && (args[0] as string).includes('Total Tokens:')
            );
            expect(tokenCalls).toHaveLength(0);

            consoleSpy.mockRestore();
        });
    });

    describe('token usage in generateBasicJSONData', () => {
        it('includes token totals in summary when tokenUsage is present', async () => {
            const privateReporter = reporter as any;
            const jsonData = await privateReporter.generateBasicJSONData(mockResults, mockConfig);

            expect(jsonData.summary.totalInputTokens).toBe(1800);
            expect(jsonData.summary.totalOutputTokens).toBe(800);
            expect(jsonData.summary.totalTokens).toBe(2600);
            expect(jsonData.summary.totalCost).toBeCloseTo(0.0018, 6);
        });

        it('omits token totals in summary when tokenUsage is absent', async () => {
            const privateReporter = reporter as any;
            const resultsWithoutTokens = mockResults.map(r => ({ ...r, tokenUsage: undefined }));
            const jsonData = await privateReporter.generateBasicJSONData(resultsWithoutTokens, mockConfig);

            expect(jsonData.summary.totalInputTokens).toBeUndefined();
            expect(jsonData.summary.totalTokens).toBeUndefined();
            expect(jsonData.summary.totalCost).toBeUndefined();
        });
    });

    describe('exportToJSON', () => {
        it('generates basic JSON data structure', async () => {
            const privateReporter = reporter as any;
            const jsonData = await privateReporter.generateBasicJSONData(mockResults, mockConfig);
            
            expect(jsonData.metadata.agent).toBe('claude');
            expect(jsonData.metadata.model).toBe('sonnet-3.5');
            expect(jsonData.summary.successRate).toBe(50.0);
            expect(jsonData.summary.totalCount).toBe(2);
            expect(jsonData.summary.totalDuration).toBe(11000);
            expect(jsonData.summary.avgDuration).toBe(5500);
            expect(jsonData.summary.agentSuccessCount).toBe(1);
            expect(jsonData.summary.testSuccessCount).toBe(1);
            expect(jsonData.summary.testFailedCount).toBe(1);
            expect(jsonData.results).toHaveLength(2);
        });
    });

    describe('printLeaderboard', () => {
        it('displays leaderboard format', () => {
            const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
            
            reporter.printLeaderboard(mockResults, mockConfig);
            
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('LEADERBOARD'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('claude'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('sonnet-3.5'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('anthropic'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('50.0%'));
            
            consoleSpy.mockRestore();
        });
    });

    describe('tier rating', () => {
        function makeDefaultResults(passCount: number): TestResult[] {
            const taskIds = V2_DEFAULT_TASKS.split(',').map(t => t.trim());
            return taskIds.map((id, i) => ({
                exercise: id,
                agentSuccess: i < passCount,
                testSuccess: i < passCount,
                overallSuccess: i < passCount,
                agentDuration: 5000,
                testDuration: 2000,
                totalDuration: 7000,
            }));
        }

        it('prints tier S when all 5 default tasks pass', () => {
            const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
            reporter.printResults(makeDefaultResults(5));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Tier S'));
            consoleSpy.mockRestore();
        });

        it('prints tier C when 2 default tasks pass', () => {
            const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
            reporter.printResults(makeDefaultResults(2));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Tier C'));
            consoleSpy.mockRestore();
        });

        it('prints tier F when 0 default tasks pass', () => {
            const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
            reporter.printResults(makeDefaultResults(0));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Tier F'));
            consoleSpy.mockRestore();
        });

        it('does not print tier for non-default task sets', () => {
            const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
            reporter.printResults(mockResults);  // hello-world, two-fer
            const tierCalls = consoleSpy.mock.calls.filter(
                (args: unknown[]) => typeof args[0] === 'string' && (args[0] as string).includes('Tier ')
            );
            expect(tierCalls).toHaveLength(0);
            consoleSpy.mockRestore();
        });

        it('computeTier returns correct tier object', () => {
            const privateReporter = reporter as any;
            const result = privateReporter.computeTier(makeDefaultResults(4));
            expect(result).toEqual({ tier: 'A', label: '4/5', solved: 4, total: 5 });
        });

        it('computeTier returns undefined for non-default results', () => {
            const privateReporter = reporter as any;
            const result = privateReporter.computeTier(mockResults);
            expect(result).toBeUndefined();
        });

        it('computeTier returns undefined when results are a superset of default tasks', () => {
            const privateReporter = reporter as any;
            const defaultPlusExtra = [
                ...makeDefaultResults(5),
                {
                    exercise: 'extra_task',
                    agentSuccess: true,
                    testSuccess: true,
                    overallSuccess: true,
                    agentDuration: 5000,
                    testDuration: 2000,
                    totalDuration: 7000,
                },
            ];
            const result = privateReporter.computeTier(defaultPlusExtra);
            expect(result).toBeUndefined();
        });
    });

});
