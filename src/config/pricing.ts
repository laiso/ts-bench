/**
 * Per-model token pricing table (USD per 1M tokens).
 * Prices are approximate and may change — update as needed.
 */

export interface ModelPricing {
    inputPricePerMillion: number;  // USD per 1M input tokens
    outputPricePerMillion: number; // USD per 1M output tokens
}

/**
 * Pricing table keyed by lowercase model name substring.
 * Matched with `String.includes()` so partial names work (e.g. "claude-opus-4" matches "claude-opus-4-5").
 * Entries are checked in order, so put more specific patterns first.
 */
const PRICING_TABLE: Array<{ pattern: string; pricing: ModelPricing }> = [
    // Claude 4 family
    { pattern: 'claude-opus-4',      pricing: { inputPricePerMillion: 15.00, outputPricePerMillion: 75.00 } },
    { pattern: 'claude-sonnet-4',    pricing: { inputPricePerMillion: 3.00,  outputPricePerMillion: 15.00 } },
    { pattern: 'claude-haiku-4',     pricing: { inputPricePerMillion: 0.80,  outputPricePerMillion: 4.00  } },
    // Claude 3.x family
    { pattern: 'claude-3-5-sonnet',  pricing: { inputPricePerMillion: 3.00,  outputPricePerMillion: 15.00 } },
    { pattern: 'claude-3-5-haiku',   pricing: { inputPricePerMillion: 0.80,  outputPricePerMillion: 4.00  } },
    { pattern: 'claude-3-opus',      pricing: { inputPricePerMillion: 15.00, outputPricePerMillion: 75.00 } },
    { pattern: 'claude-3-sonnet',    pricing: { inputPricePerMillion: 3.00,  outputPricePerMillion: 15.00 } },
    { pattern: 'claude-3-haiku',     pricing: { inputPricePerMillion: 0.25,  outputPricePerMillion: 1.25  } },
    // OpenAI o-series
    { pattern: 'o3-mini',            pricing: { inputPricePerMillion: 1.10,  outputPricePerMillion: 4.40  } },
    { pattern: 'o3',                 pricing: { inputPricePerMillion: 10.00, outputPricePerMillion: 40.00 } },
    { pattern: 'o1-mini',            pricing: { inputPricePerMillion: 1.50,  outputPricePerMillion: 6.00  } },
    { pattern: 'o1',                 pricing: { inputPricePerMillion: 15.00, outputPricePerMillion: 60.00 } },
    // GPT-4 family
    { pattern: 'gpt-4o-mini',        pricing: { inputPricePerMillion: 0.15,  outputPricePerMillion: 0.60  } },
    { pattern: 'gpt-4o',             pricing: { inputPricePerMillion: 2.50,  outputPricePerMillion: 10.00 } },
    { pattern: 'gpt-4-turbo',        pricing: { inputPricePerMillion: 10.00, outputPricePerMillion: 30.00 } },
    { pattern: 'gpt-4',              pricing: { inputPricePerMillion: 30.00, outputPricePerMillion: 60.00 } },
    { pattern: 'gpt-3.5-turbo',      pricing: { inputPricePerMillion: 0.50,  outputPricePerMillion: 1.50  } },
    // Gemini family
    { pattern: 'gemini-2.5-pro',     pricing: { inputPricePerMillion: 1.25,  outputPricePerMillion: 10.00 } },
    { pattern: 'gemini-2.0-flash',   pricing: { inputPricePerMillion: 0.075, outputPricePerMillion: 0.30  } },
    { pattern: 'gemini-1.5-pro',     pricing: { inputPricePerMillion: 1.25,  outputPricePerMillion: 5.00  } },
    { pattern: 'gemini-1.5-flash',   pricing: { inputPricePerMillion: 0.075, outputPricePerMillion: 0.30  } },
];

/**
 * Look up pricing for a model name.
 * Returns undefined if the model is not in the pricing table.
 */
export function getModelPricing(modelName: string): ModelPricing | undefined {
    const lower = modelName.toLowerCase();
    for (const { pattern, pricing } of PRICING_TABLE) {
        if (lower.includes(pattern)) {
            return pricing;
        }
    }
    return undefined;
}

/**
 * Calculate cost in USD for the given token counts and model name.
 * Returns undefined if the model pricing is unknown.
 */
export function calculateCost(
    inputTokens: number,
    outputTokens: number,
    modelName: string
): number | undefined {
    const pricing = getModelPricing(modelName);
    if (!pricing) return undefined;
    return (
        (inputTokens * pricing.inputPricePerMillion) / 1_000_000 +
        (outputTokens * pricing.outputPricePerMillion) / 1_000_000
    );
}
