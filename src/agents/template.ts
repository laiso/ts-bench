import type { AgentConfig, FileList } from './types';

export interface TemplateContext {
    config: AgentConfig;
    instructions: string;
    fileList?: FileList;
    /** Additional agent-specific substitutions, e.g. {kimiConfig} */
    extra?: Record<string, string>;
}

/**
 * Expand recursive shell variable fallbacks like ${VAR:-${FALLBACK:-default}} or ${VAR}
 */
export function resolveEnvString(str: string): string {
    // Repeatedly match innermost ${VAR} or ${VAR:-fallback}
    let prev = '';
    let current = str;
    let iterations = 0;

    // Innermost pattern: no nested "${" inside the brackets
    const pattern = /\$\{([A-Za-z0-9_]+)(?::-([^${}]*))?\}/g;

    while (prev !== current && iterations < 15) {
        prev = current;
        iterations++;
        current = current.replace(pattern, (_, varName, defaultVal) => {
            const val = process.env[varName];
            if (val !== undefined && val !== '') {
                return val;
            }
            return defaultVal !== undefined ? defaultVal : '';
        });
    }

    return current;
}

/**
 * Expand template expressions in strings.
 *
 * Env references (${VAR}) are resolved on the template itself, BEFORE any
 * dynamic values are injected, so task instructions containing `${...}`
 * (e.g. TypeScript template literals) are passed through verbatim.
 */
export function expandTemplate(
    template: string,
    context: TemplateContext
): string {
    const { config, instructions, extra } = context;

    // Substitute environment variables ${VAR} or ${VAR:-default} from the template only
    let result = resolveEnvString(template);

    // Substitute {model} / {provider} (replacer functions keep `$` sequences literal)
    result = result.replace(/\{model\}/g, () => config.model ?? '');
    result = result.replace(/\{provider\}/g, () => config.provider ?? '');

    // Substitute {exercise}
    if (config.exercise) {
        result = result.replace(/\{exercise\}/g, () => config.exercise!);
    }

    // Agent-specific extras, e.g. {kimiConfig}
    if (extra) {
        for (const [key, value] of Object.entries(extra)) {
            result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), () => value);
        }
    }

    // Substitute {instructions} last so its content is never re-expanded
    result = result.replace(/\{instructions\}/g, () => instructions);

    return result;
}

/**
 * Expands an array of CLI argument templates into final argument list.
 * Supports conditional sections and expanding file list items.
 */
export function expandArgsTemplate(
    commandTemplate: string[],
    context: TemplateContext
): string[] {
    const { config, fileList } = context;
    const finalArgs: string[] = ['bash', config.agentScriptPath];

    for (const item of commandTemplate) {
        // Conditional block on model, e.g. "{#model}--model {model}{/model}"
        if (item.includes('{#model}')) {
            if (!config.model) {
                continue;
            }
            const inner = item.replace(/\{#model\}/g, '').replace(/\{\/model\}/g, '');
            const expanded = expandTemplate(inner, context);
            finalArgs.push(...expanded.split(/\s+/).filter(Boolean));
            continue;
        }

        // Bare file list: expand to one argument per file, or nothing when empty
        if (item === '{sourceFiles}' || item === '{testFiles}') {
            const files = item === '{sourceFiles}' ? fileList?.sourceFiles : fileList?.testFiles;
            if (files && files.length > 0) {
                finalArgs.push(...files);
            }
            continue;
        }

        // Flag-per-file form: "--read {testFiles}" → --read a.test.ts --read b.test.ts
        // An optional default is used when the list is empty: "--file {sourceFiles:-*.ts}"
        const pair = item.match(/^(.+?)\s+\{(sourceFiles|testFiles)(?::-([^}]*))?\}$/);
        if (pair) {
            const [, flag, listName, fallback] = pair;
            const files = listName === 'sourceFiles' ? fileList?.sourceFiles : fileList?.testFiles;
            const effective = files && files.length > 0
                ? files
                : (fallback !== undefined ? [fallback] : []);
            for (const file of effective) {
                finalArgs.push(flag!, file);
            }
            continue;
        }

        const expanded = expandTemplate(item, context);
        finalArgs.push(expanded);
    }

    return finalArgs;
}
