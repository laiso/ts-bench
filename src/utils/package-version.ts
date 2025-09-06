import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Get the version from package.json
 */
export async function getPackageVersion(): Promise<string> {
    try {
        // Get the path to the project root from the current module
        const currentDir = dirname(fileURLToPath(import.meta.url));
        // Navigate up to find package.json, checking multiple possible locations
        const possiblePaths = [
            join(currentDir, '../../package.json'),  // From dist/utils/
            join(currentDir, '../../../package.json'), // From src/utils/
            join(process.cwd(), 'package.json')       // From project root
        ];
        
        for (const packageJsonPath of possiblePaths) {
            try {
                const packageJsonContent = await readFile(packageJsonPath, 'utf-8');
                const packageJson = JSON.parse(packageJsonContent);
                
                if (packageJson.version) {
                    return packageJson.version;
                }
            } catch {
                // Try next path
                continue;
            }
        }
        
        // If no package.json found, return fallback
        return '1.0.0';
    } catch (error) {
        console.warn('Failed to read package.json version, using fallback 1.0.0:', error);
        return '1.0.0';
    }
}