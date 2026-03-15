/**
 * Synthesized Tool: entropy_validator
 * Description: Calculates the Shannon entropy of a string or buffer to identify low-entropy data, often indicating weak cryptographic keys or predictable identifiers.
 */

import { z } from "zod";
import { ToolDefinition, type AgentContext } from "./types";

const entropy_validatorSchema = z.object({
  input: z
    .string()
    .min(1)
    .describe("The string or buffer (hex/base64) to analyze for entropy"),
});

export const entropy_validatorTool: ToolDefinition<
  z.infer<typeof entropy_validatorSchema>
> = {
  name: "entropy_validator",
  description:
    "Calculates the Shannon entropy of a string or buffer to identify low-entropy data, often indicating weak cryptographic keys or predictable identifiers.",
  inputSchema: entropy_validatorSchema,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx: AgentContext) => {
    const calculateShannonEntropy = (str: string): number => {
      const frequencies: Record<string, number> = {};
      for (const char of str) {
        frequencies[char] = (frequencies[char] || 0) + 1;
      }
      const len = str.length;
      let entropy = 0;
      for (const char in frequencies) {
        const p = frequencies[char] / len;
        entropy -= p * Math.log2(p);
      }
      return entropy;
    };

    const entropy = calculateShannonEntropy(args.input);
    const result = {
      entropy: Math.round(entropy * 100) / 100,
      length: args.input.length,
      isLowEntropy: entropy < 3.5 && args.input.length > 8,
      assessment:
        entropy < 3.5
          ? "Low entropy detected - potentially predictable"
          : "High entropy",
    };

    ctx.onXmlComplete(
      `<dyad-status title="Entropy Analysis Complete">Score: ${result.entropy}</dyad-status>`,
    );

    return JSON.stringify(result, null, 2);
  },
};
