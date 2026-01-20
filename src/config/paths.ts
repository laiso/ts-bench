import { join } from 'path';
import type { DatasetType } from './types';

export function getAgentScriptPath(useDocker: boolean, datasetType: DatasetType = 'v1'): string {
    if (useDocker) {
        if (datasetType === 'v2') {
            return '/ts-bench-host/scripts/run-agent.sh';
        }
        return '/app/scripts/run-agent.sh';
    }

    return join(process.cwd(), 'scripts', 'run-agent.sh');
}
