import { spawn } from "bun";
import { join } from 'path';


export class ExerciseResetter {
    async reset(exercisePath: string, verbose: boolean = false): Promise<void> {
        try {
            if (verbose) {
                console.log(`🔄 Resetting exercise: ${exercisePath}`);
            }

            const fullExercisePath = join(process.cwd(), exercisePath);
            const resetArgs = ["git", "-C", fullExercisePath, "checkout", "HEAD", "--", "."];
            const proc = spawn(resetArgs);
            await proc.exited;

            if (proc.exitCode !== 0) {
                const stderr = await new Response(proc.stderr).text();
                console.warn(`Warning: Failed to reset ${exercisePath}: ${stderr}`);
            } else if (verbose) {
                console.log(`✅ Successfully reset ${exercisePath}`);
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.warn(`Warning: Git reset failed for ${exercisePath}: ${errorMsg}`);
        }
    }

    async logDiffAfterAgent(exercisePath: string): Promise<void> {
        try {
            const fullExercisePath = join(process.cwd(), exercisePath);
            
            const diffArgs = [
                "git", "-C", fullExercisePath, "diff", "HEAD", 
                "--", ".", 
                // Node.js lockfiles
                ":(exclude)yarn.lock", 
                ":(exclude)package-lock.json", 
                ":(exclude)bun.lockb",
                ":(exclude)pnpm-lock.yaml",
                ":(exclude)npm-shrinkwrap.json",
                // Python lockfiles
                ":(exclude)Pipfile.lock",
                ":(exclude)poetry.lock",
                ":(exclude)pdm.lock",
                // Rust lockfiles
                ":(exclude)Cargo.lock",
                // Go lockfiles
                ":(exclude)go.sum",
                // Ruby lockfiles
                ":(exclude)Gemfile.lock",
                // PHP lockfiles
                ":(exclude)composer.lock",
                // .NET lockfiles
                ":(exclude)packages.lock.json",
                ":(exclude)project.assets.json",
                // Java/Kotlin lockfiles
                ":(exclude)gradle.lockfile",
                ":(exclude)*.lockfile",
                // General patterns
                ":(exclude)*.lock",
                ":(exclude)*-lock.*",
                ":(exclude)lockfile*"
            ];
            const proc = spawn(diffArgs);
            await proc.exited;

            if (proc.exitCode === 0) {
                const stdout = await new Response(proc.stdout).text();
                if (stdout.trim()) {
                    console.log(`--- Diff for ${exercisePath} ---`);
                    console.log(stdout);
                    console.log(`--- End of diff ---`);
                } else {
                    console.log(`📋 No changes detected in ${exercisePath}`);
                }
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.warn(`Warning: Failed to get diff for ${exercisePath}: ${errorMsg}`);
        }
    }

    async restoreTestFiles(exercisePath: string, testFiles: string[]): Promise<void> {
        if (testFiles.length === 0) return;
        
        try {
            const fullExercisePath = join(process.cwd(), exercisePath);
            
            // Restore specified test files using git restore
            for (const testFile of testFiles) {
                const restoreArgs = ["git", "-C", fullExercisePath, "restore", testFile];
                const restoreProc = spawn(restoreArgs);
                await restoreProc.exited;
                
                if (restoreProc.exitCode === 0) {
                    console.log(`🔄 Restored test file: ${testFile}`);
                } else {
                    const stderr = await new Response(restoreProc.stderr).text();
                    console.warn(`Warning: Failed to restore ${testFile}: ${stderr}`);
                }
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.warn(`Warning: Failed to restore test files: ${errorMsg}`);
        }
    }
}
