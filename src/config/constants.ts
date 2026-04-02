export const TS_BENCH_CONTAINER = "ts-bench-container";
export const EXERCISM_PRACTICE_PATH = "repos/exercism-typescript";
export const HEADER_INSTRUCTION = "Solve this TypeScript exercise. Read the test file to understand requirements and implement the solution. Do not run lint/type checks or repeated test loops; run only the exercise tests once.";
export const TOP_25_EXERCISES = 'acronym,anagram,bank-account,binary-search,binary-search-tree,bowling,complex-numbers,connect,crypto-square,diamond,dnd-character,flatten-array,food-chain,house,pascals-triangle,rational-numbers,react,rectangles,relative-distance,robot-name,spiral-matrix,transpose,two-bucket,variable-length-quantity,wordy';

/**
 * Default v2 benchmark set — 5 verified tasks ordered by reward (descending).
 * All tasks share commit 2b791c9f3053 so grouped execution uses a single container.
 * Each task is verified to PASS when the correct patch is applied.
 *
 * | Task     | Reward  | Difficulty |
 * |----------|---------|------------|
 * | 14958    | $8,000  | Hard       |
 * | 15815_1  | $4,000  | Medium     |
 * | 15193    | $4,000  | Medium     |
 * | 14268    | $2,000  | Easy–Med   |
 * | 20079    | $2,000  | Easy–Med   |
 *
 * Total max reward: $20,000
 * Estimated run time (gpt-5.4-mini): ~53 min
 * Estimated API cost (gpt-5.4-mini): ~$1
 */
export const V2_DEFAULT_TASKS = '14958,15815_1,15193,14268,20079';

/** Tier thresholds for the default v2 benchmark set (5 tasks). */
export const V2_TIER_THRESHOLDS: ReadonlyArray<{ tier: string; minCorrect: number; label: string }> = [
    { tier: 'S', minCorrect: 5, label: '5/5 — all tasks solved' },
    { tier: 'A', minCorrect: 4, label: '4/5' },
    { tier: 'B', minCorrect: 3, label: '3/5' },
    { tier: 'C', minCorrect: 2, label: '2/5' },
    { tier: 'D', minCorrect: 1, label: '1/5' },
    { tier: 'F', minCorrect: 0, label: '0/5 — no tasks solved' },
];

export const SWELANCER_DATA_PATH = "repos/frontier-evals/project/swelancer/all_swelancer_tasks.csv";
export const SWELANCER_ISSUES_PATH = "repos/frontier-evals/project/swelancer/issues";
/** Patched run_tests.yml (npm + nvm); mounted over /app/tests/run_tests.yml in v2 Docker */
export const SWELANCER_RUN_TESTS_HOST = "scripts/swelancer/run_tests.yml";
/** Patched setup_mitmproxy.yml; mounted over /app/tests/setup_mitmproxy.yml in v2 Docker */
export const SWELANCER_SETUP_MITMPROXY_HOST = "scripts/swelancer/setup_mitmproxy.yml";
export const SWELANCER_IMAGE = "swelancer/swelancer_x86_monolith:releasev1";
export const SWELANCER_REPO_PATH = "repos/expensify-app";
/** Host dir mounted to /app/tests/logs in v2 Docker so pytest/npm/mitm logs survive --rm */
export const SWELANCER_HOST_LOGS_DIR = ".v2-swelancer-logs";
