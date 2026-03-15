import { formatDuration } from './duration';
import type { CommandResult } from './shell';

export interface Logger {
    logAgentCommand(args: string[]): void;
    logTestCommand(args: string[]): void;
    logAgentSuccess(exercise: string, duration: number, verbose?: boolean, result?: CommandResult): void;
    logAgentFailure(exercise: string, duration: number, verbose: boolean, result: CommandResult): void;
    logAgentError(exercise: string, duration: number, errorMsg: string): void;
    logTestSuccess(exercise: string, duration: number): void;
    logTestFailure(exercise: string, duration: number, verbose: boolean, result: CommandResult): void;
    logTestError(exercise: string, duration: number, errorMsg: string): void;
    logExerciseStart(exercise: string): void;
    logExerciseResult(exercise: string, success: boolean, duration: number): void;
    info(message: string): void;
}

export class ConsoleLogger implements Logger {
    private sanitizeCommand(args: string[]): string {
        const sanitized = args.map(arg => {
            // Hide API keys and sensitive environment variables
            if (arg.match(/^[A-Z_]+_API_KEY=/) || 
                arg.match(/^[A-Z_]+_TOKEN=/) ||
                arg.match(/^[A-Z_]+_SECRET=/) ||
                arg.includes('sk-') ||
                arg.includes('Bearer ')) {
                const [key] = arg.split('=');
                return `${key}=***`;
            }
            return arg;
        });
        
        const command = sanitized.join(" ");
        return command.length > 1024 ? command.slice(0, 1024) + "..." : command;
    }
    
    public redact(text: string): string {
        if (!text) return text;
        let out = text;
        out = out.replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer ***');
        out = out.replace(/sk-[A-Za-z0-9]{10,}/g, 'sk-***');
        out = out.replace(/([A-Z_]+_(API_KEY|TOKEN|SECRET))=([^\s]+)/g, '$1=***');
        return out;
    }

    logAgentCommand(args: string[]): void {
        const sanitizedCommand = this.sanitizeCommand(args);
        console.log(`🤖 Agent command: ${sanitizedCommand}`);
    }

    logTestCommand(args: string[]): void {
        console.log(`🧪 Test command: ${args.join(" ")}`);
    }

    logAgentSuccess(exercise: string, duration: number, verbose: boolean = false, result?: CommandResult): void {
        console.log(`🤖 ${exercise} - Agent Success (${formatDuration(duration)})`);
        if (verbose && result) {
            if (result.stdout) {
                const redacted = this.redact(result.stdout);
                console.log(`  Agent Output Preview: ${redacted.slice(0, 300)}${redacted.length > 300 ? '...' : ''}`);
            }
        }
    }

    logAgentFailure(exercise: string, duration: number, verbose: boolean, result: CommandResult): void {
        console.log(`🤖 ${exercise} - Agent Failed (${formatDuration(duration)})`);
        if (verbose) {
            if (result.stdout) console.log(`  Agent STDOUT: ${result.stdout.slice(0, 500)}...`);
            if (result.stdout) console.log(`  Agent STDOUT: ${this.redact(result.stdout).slice(0, 500)}...`);
            if (result.stderr) console.log(`  Agent STDERR: ${this.redact(result.stderr).slice(0, 500)}...`);
        }
    }

    logAgentError(exercise: string, duration: number, errorMsg: string): void {
        console.log(`🤖 ${exercise} - Agent Error (${formatDuration(duration)}): ${errorMsg}`);
    }

    logTestSuccess(exercise: string, duration: number): void {
        console.log(`🧪 ${exercise} - Test Success (${formatDuration(duration)})`);
    }

    logTestFailure(exercise: string, duration: number, verbose: boolean, result: CommandResult): void {
        console.log(`🧪 ${exercise} - Test Failed (${formatDuration(duration)})`);
        if (verbose) {
            // Show last 2000 chars for better visibility of test results
            if (result.stdout) console.log(`  Test STDOUT:\n${this.redact(result.stdout).slice(-2000)}`);
            if (result.stderr) console.log(`  Test STDERR:\n${this.redact(result.stderr).slice(-1000)}`);
        }
    }

    logTestError(exercise: string, duration: number, errorMsg: string): void {
        console.log(`🧪 ${exercise} - Test Error (${formatDuration(duration)}): ${errorMsg}`);
    }

    logExerciseStart(exercise: string): void {
        console.log(`🧪 Starting ${exercise}...`);
    }

    logExerciseResult(exercise: string, success: boolean, duration: number): void {
        const status = success ? '✅' : '❌';
        const message = success ? 'Overall Success' : 'Overall Failed';
        console.log(`${status} ${exercise} - ${message} (${formatDuration(duration)})`);
    }

    info(message: string): void {
        console.log(message);
    }
}