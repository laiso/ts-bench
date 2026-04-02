import type { DatasetType } from './types';

export function buildTestCommand(dataset: DatasetType | undefined, useDocker: boolean): string {
    if (dataset === 'v2') {
        if (useDocker) {
            const setupWaitSec = parseInt(process.env.TS_BENCH_V2_SETUP_WAIT_SEC || '600', 10) || 600;
            return `export CI=true && unset RUNTIME_SETUP && /app/tests/run.sh & for i in $(seq 1 ${setupWaitSec}); do [ -f /setup_done.txt ] && break; sleep 1; done; if [ ! -f /setup_done.txt ]; then echo "setup did not complete"; exit 1; fi; ansible-playbook -i "localhost," --connection=local /app/tests/run_tests.yml`;
        }

        return 'npm rebuild canvas && npm test -- -o';
    }

    return 'corepack yarn && corepack yarn test';
}

export function getExerciseTimeout(dataset: DatasetType | undefined, requestedTimeout: number | undefined): number {
    const timeout = requestedTimeout ?? 300;
    return dataset === 'v2' ? Math.max(timeout, 3600) : timeout;
}
