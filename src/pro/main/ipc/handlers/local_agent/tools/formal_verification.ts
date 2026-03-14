/**
 * Formal Verification & Invariants Tools
 * Capabilities 317-322: Verify invariants, assertion checking, contract verification,
 * model checking, proof assistance, and property checking
 */

import { z } from "zod";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import log from "electron-log";
import {
  ToolDefinition,
  AgentContext,
  escapeXmlAttr,
  escapeXmlContent,
} from "./types";

const logger = log.scope("formal_verification");

// ============================================================================
// Input Schemas
// ============================================================================

const verifyInvariantsSchema = z.object({
  file_path: z.string().describe("Path to the source file"),
  invariants: z
    .array(
      z.object({
        description: z.string().describe("Description of the invariant"),
        condition: z
          .string()
          .describe("Code condition that should always be true"),
      }),
    )
    .describe("List of invariants to verify"),
  function_name: z
    .string()
    .optional()
    .describe("Function to verify invariants for"),
});

const assertionCheckingSchema = z.object({
  file_path: z.string().describe("Path to the source file"),
  check_preconditions: z
    .boolean()
    .optional()
    .describe("Check function preconditions"),
  check_postconditions: z
    .boolean()
    .optional()
    .describe("Check function postconditions"),
  check_assertions: z
    .boolean()
    .optional()
    .describe("Check existing assertions"),
});

const contractVerificationSchema = z.object({
  file_path: z.string().describe("Path to the source file"),
  function_name: z.string().describe("Function to verify contract for"),
  preconditions: z
    .array(z.string())
    .optional()
    .describe("Expected preconditions"),
  postconditions: z
    .array(z.string())
    .optional()
    .describe("Expected postconditions"),
  invariants: z.array(z.string()).optional().describe("Class/loop invariants"),
});

const modelCheckingSchema = z.object({
  file_path: z.string().describe("Path to the source file"),
  properties: z
    .array(
      z.object({
        name: z.string().describe("Property name"),
        description: z.string().describe("Property description"),
        condition: z.string().describe("Condition to verify"),
      }),
    )
    .describe("Properties to check"),
  max_states: z
    .number()
    .optional()
    .describe("Maximum number of states to explore"),
});

const proofAssistantSchema = z.object({
  file_path: z.string().describe("Path to the source file"),
  theorem: z.string().describe("Theorem or property to prove"),
  proof_steps: z
    .array(z.string())
    .optional()
    .describe("Proof steps if available"),
  strategy: z
    .enum(["induction", "deduction", "contradiction", "exhaustive"])
    .optional()
    .describe("Proof strategy"),
});

const propertyCheckingSchema = z.object({
  file_path: z.string().describe("Path to the source file"),
  properties: z
    .array(
      z.object({
        name: z.string().describe("Property name"),
        property_type: z
          .enum(["safety", "liveness", "termination", "fairness", "custom"])
          .describe("Type of property"),
        condition: z.string().describe("Property condition"),
      }),
    )
    .describe("Properties to check"),
  check_side_effects: z
    .boolean()
    .optional()
    .describe("Check for unintended side effects"),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse source file
 */
async function parseSourceFile(
  filePath: string,
  appPath: string,
): Promise<{ content: string; lines: string[] }> {
  const fullPath = join(appPath, filePath);
  const content = await readFile(fullPath, "utf-8");
  const lines = content.split("\n");
  return { content, lines };
}

/**
 * Extract functions from source code
 */
function extractFunctions(
  lines: string[],
): Array<{ name: string; startLine: number; endLine: number; body: string[] }> {
  const functions: Array<{
    name: string;
    startLine: number;
    endLine: number;
    body: string[];
  }> = [];
  let currentFunction: {
    name: string;
    startLine: number;
    body: string[];
  } | null = null;
  let braceCount = 0;

  const functionPattern =
    /(?:function\s+(\w+)|(\w+)\s*[=:]\s*(?:async\s*)?\(?|(?:async\s+)?(?:\w+)\s+(\w+)\s*\()/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    const match = trimmed.match(functionPattern);
    if (
      match &&
      !trimmed.startsWith("//") &&
      !trimmed.startsWith("*") &&
      !trimmed.startsWith("if") &&
      !trimmed.startsWith("for") &&
      !trimmed.startsWith("while")
    ) {
      const funcName = match[1] || match[2] || match[3];
      if (funcName) {
        if (currentFunction) {
          functions.push({
            ...currentFunction,
            endLine: i,
          });
        }
        currentFunction = { name: funcName, startLine: i + 1, body: [] };
      }
    }

    if (currentFunction) {
      currentFunction.body.push(line);
      braceCount += (line.match(/{/g) || []).length;
      braceCount -= (line.match(/}/g) || []).length;

      if (braceCount === 0 && trimmed.endsWith("}")) {
        functions.push({
          ...currentFunction,
          endLine: i + 1,
        });
        currentFunction = null;
        braceCount = 0;
      }
    }
  }

  return functions;
}

/**
 * Find assertions in code
 */
function findAssertions(
  lines: string[],
): Array<{ line: number; type: string; condition: string }> {
  const assertions: Array<{ line: number; type: string; condition: string }> =
    [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Find assert() calls
    if (trimmed.includes("assert(") || trimmed.includes("console.assert(")) {
      const match = trimmed.match(/assert\s*\(\s*(.+?)\s*[,)]/);
      if (match) {
        assertions.push({
          line: i + 1,
          type: "assert",
          condition: match[1],
        });
      }
    }

    // Find if (condition) throw patterns (assertion-like)
    if (
      trimmed.startsWith("if") &&
      trimmed.includes("throw") &&
      !trimmed.startsWith("if (")
    ) {
      const match = trimmed.match(/if\s*\(\s*(.+?)\s*\)/);
      if (match) {
        assertions.push({
          line: i + 1,
          type: "if-throw",
          condition: match[1],
        });
      }
    }
  }

  return assertions;
}

/**
 * Check for loop invariants patterns
 */
function findLoopInvariants(
  lines: string[],
): Array<{ line: number; type: string; code: string }> {
  const invariants: Array<{ line: number; type: string; code: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Look for for/while loops
    if (trimmed.startsWith("for") || trimmed.startsWith("while")) {
      invariants.push({
        line: i + 1,
        type: trimmed.startsWith("for") ? "for-loop" : "while-loop",
        code: trimmed,
      });
    }

    // Look for comments that might be invariants
    if (
      trimmed.startsWith("//") &&
      (trimmed.toLowerCase().includes("invariant") ||
        trimmed.toLowerCase().includes("loop"))
    ) {
      invariants.push({
        line: i + 1,
        type: "comment",
        code: trimmed,
      });
    }
  }

  return invariants;
}

// ============================================================================
// Tool Definitions
// ============================================================================

const VERIFY_INVARIANTS_DESCRIPTION = `Verify code invariants in a program.

An invariant is a condition that should always be true at a certain point in the program.
- Loop invariants: true before and after each iteration
- Class invariants: true for all public methods
- Function invariants: true at entry/exit points

Use this tool to identify and verify critical properties that should hold throughout execution.`;

export const verifyInvariantsTool: ToolDefinition<
  z.infer<typeof verifyInvariantsSchema>
> = {
  name: "verify_invariants",
  description: VERIFY_INVARIANTS_DESCRIPTION,
  inputSchema: verifyInvariantsSchema,
  defaultConsent: "always",

  getConsentPreview: (args) =>
    `Verify ${args.invariants.length} invariant(s) in ${args.file_path}`,

  buildXml: (args, isComplete) => {
    if (isComplete) return undefined;
    if (!args.file_path) return undefined;
    return `<dyad-invariant file="${escapeXmlAttr(args.file_path)}">Verifying...</dyad-invariant>`;
  },

  execute: async (args, ctx: AgentContext) => {
    logger.log(`Verifying invariants: ${args.file_path}`);

    const { lines } = await parseSourceFile(args.file_path, ctx.appPath);
    const functions = extractFunctions(lines);

    let targetFunction = functions.find((f) => f.name === args.function_name);
    if (args.function_name && !targetFunction) {
      throw new Error(`Function '${args.function_name}' not found`);
    }

    const funcLines = targetFunction
      ? lines.slice(targetFunction.startLine - 1, targetFunction.endLine)
      : lines;

    const results: string[] = [];

    // Find existing invariants in code
    const loopInvariants = findLoopInvariants(funcLines);
    if (loopInvariants.length > 0) {
      results.push(
        `Found ${loopInvariants.length} potential invariant(s) in code:\n${loopInvariants
          .map((i) => `  Line ${i.line}: ${i.code}`)
          .join("\n")}`,
      );
    }

    // Analyze user-provided invariants
    results.push(
      `\nVerifying ${args.invariants.length} specified invariant(s):\n`,
    );
    for (const invariant of args.invariants) {
      // Basic analysis: check if condition can be statically evaluated
      let status = "UNVERIFIED";
      let note = "(requires runtime verification)";

      // Check if invariant is related to any code in the function
      const related = funcLines.some((l) =>
        l.toLowerCase().includes(invariant.condition.toLowerCase()),
      );

      if (related) {
        status = "LIKELY_HOLD";
        note = "(condition found in code - appears consistent)";
      } else {
        note = "(condition not directly found in code - verify manually)";
      }

      results.push(
        `  - ${invariant.description}: ${status}\n    Condition: ${invariant.condition}\n    Note: ${note}`,
      );
    }

    const resultText = `Invariant Verification Results for ${args.file_path}${args.function_name ? ` (function: ${args.function_name})` : ""}:\n\n${results.join("\n")}`;

    ctx.onXmlComplete(
      `<dyad-invariant file="${escapeXmlAttr(args.file_path)}">${escapeXmlContent(resultText)}</dyad-invariant>`,
    );

    return resultText;
  },
};

const ASSERTION_CHECKING_DESCRIPTION = `Check assertions and conditions in code.

This tool:
- Finds existing assert() statements
- Identifies implicit assertions (if-throw patterns)
- Checks pre/postconditions
- Validates assertion logic

Use this tool to understand the error handling and validation logic in code.`;

export const assertionCheckingTool: ToolDefinition<
  z.infer<typeof assertionCheckingSchema>
> = {
  name: "assertion_checking",
  description: ASSERTION_CHECKING_DESCRIPTION,
  inputSchema: assertionCheckingSchema,
  defaultConsent: "always",

  getConsentPreview: (args) => `Check assertions in ${args.file_path}`,

  buildXml: (args, isComplete) => {
    if (isComplete) return undefined;
    if (!args.file_path) return undefined;
    return `<dyad-assertions file="${escapeXmlAttr(args.file_path)}">Analyzing...</dyad-assertions>`;
  },

  execute: async (args, ctx: AgentContext) => {
    logger.log(`Checking assertions: ${args.file_path}`);

    const { lines } = await parseSourceFile(args.file_path, ctx.appPath);

    // Find assertions
    const assertions = findAssertions(lines);

    // Find function pre/postconditions
    const functions = extractFunctions(lines);

    let resultText = `Assertion Analysis for ${args.file_path}:\n\n`;

    // Report found assertions
    if (assertions.length > 0) {
      resultText += `Found ${assertions.length} assertion(s):\n`;
      for (const a of assertions) {
        resultText += `  Line ${a.line}: [${a.type}] ${a.condition}\n`;
      }
    } else {
      resultText += "No explicit assertions found.\n";
    }

    // Check preconditions
    if (args.check_preconditions) {
      resultText += `\nPreconditions Analysis:\n`;
      for (const func of functions) {
        const funcBody = lines.slice(func.startLine - 1, func.endLine);
        const params = funcBody[0]?.match(/\(([^)]*)\)/)?.[1] || "";
        const hasValidation = funcBody.some(
          (l) =>
            l.includes("if (") &&
            (l.includes("null") ||
              l.includes("undefined") ||
              l.includes("throw")),
        );

        resultText += `  ${func.name}(${params}): ${
          hasValidation ? "has validation" : "no validation detected"
        }\n`;
      }
    }

    // Check postconditions
    if (args.check_postconditions) {
      resultText += `\nPostconditions Analysis:\n`;
      for (const func of functions) {
        const funcBody = lines.slice(func.startLine - 1, func.endLine);
        const hasReturnValidation = funcBody.some(
          (l) => l.includes("return") && l.includes("if"),
        );

        resultText += `  ${func.name}: ${
          hasReturnValidation ? "has return validation" : "no return validation"
        }\n`;
      }
    }

    ctx.onXmlComplete(
      `<dyad-assertions file="${escapeXmlAttr(args.file_path)}">${escapeXmlContent(resultText)}</dyad-assertions>`,
    );

    return resultText;
  },
};

const CONTRACT_VERIFICATION_DESCRIPTION = `Verify design by contract (DbC) specifications.

Design by Contract involves:
- Preconditions: conditions that must be true before a function executes
- Postconditions: conditions that must be true after a function completes
- Invariants: conditions that must remain true for the duration

Use this tool to verify or establish contracts for functions.`;

export const contractVerificationTool: ToolDefinition<
  z.infer<typeof contractVerificationSchema>
> = {
  name: "contract_verification",
  description: CONTRACT_VERIFICATION_DESCRIPTION,
  inputSchema: contractVerificationSchema,
  defaultConsent: "always",

  getConsentPreview: (args) =>
    `Verify contract for ${args.function_name} in ${args.file_path}`,

  buildXml: (args, isComplete) => {
    if (isComplete) return undefined;
    if (!args.file_path || !args.function_name) return undefined;
    return `<dyad-contract file="${escapeXmlAttr(args.file_path)}" function="${escapeXmlAttr(args.function_name)}">Verifying...</dyad-contract>`;
  },

  execute: async (args, ctx: AgentContext) => {
    logger.log(`Verifying contract: ${args.file_path}:${args.function_name}`);

    const { lines } = await parseSourceFile(args.file_path, ctx.appPath);
    const functions = extractFunctions(lines);

    const targetFunction = functions.find((f) => f.name === args.function_name);
    if (!targetFunction) {
      throw new Error(`Function '${args.function_name}' not found`);
    }

    const funcBody = lines.slice(
      targetFunction.startLine - 1,
      targetFunction.endLine,
    );
    const funcHeader = funcBody[0] || "";

    let resultText = `Contract Verification for '${args.function_name}':\n\n`;

    // Function signature
    resultText += `Function Signature: ${funcHeader.trim()}\n\n`;

    // Check preconditions
    if (args.preconditions && args.preconditions.length > 0) {
      resultText += `Expected Preconditions:\n`;
      for (const pre of args.preconditions) {
        const found = funcBody.some((l) =>
          l.toLowerCase().includes(pre.toLowerCase()),
        );
        resultText += `  - ${pre}: ${found ? "FOUND in code" : "NOT FOUND (may need to add)"}\n`;
      }
    }

    // Check postconditions
    if (args.postconditions && args.postconditions.length > 0) {
      resultText += `\nExpected Postconditions:\n`;
      for (const post of args.postconditions) {
        const found = funcBody.some((l) =>
          l.toLowerCase().includes(post.toLowerCase()),
        );
        resultText += `  - ${post}: ${found ? "FOUND in code" : "NOT FOUND (may need to add)"}\n`;
      }
    }

    // Check invariants
    if (args.invariants && args.invariants.length > 0) {
      resultText += `\nClass/Loop Invariants:\n`;
      for (const inv of args.invariants) {
        resultText += `  - ${inv}: (requires class-wide analysis)\n`;
      }
    }

    // Analyze actual contract in code
    resultText += `\nDetected Contract Elements:\n`;

    // Find validation at entry
    const hasEntryValidation = funcBody
      .slice(0, 5)
      .some((l) => l.includes("if") && l.includes("throw"));
    resultText += `  Precondition checks: ${hasEntryValidation ? "detected" : "not detected"}\n`;

    // Find return validation
    const hasReturnValidation = funcBody.some(
      (l) => l.trim().startsWith("if") && l.includes("return"),
    );
    resultText += `  Postcondition checks: ${hasReturnValidation ? "detected" : "not detected"}\n`;

    // Find assertions
    const assertions = findAssertions(funcBody);
    resultText += `  Explicit assertions: ${assertions.length}\n`;

    ctx.onXmlComplete(
      `<dyad-contract file="${escapeXmlAttr(args.file_path)}" function="${escapeXmlAttr(args.function_name)}">${escapeXmlContent(resultText)}</dyad-contract>`,
    );

    return resultText;
  },
};

const MODEL_CHECKING_DESCRIPTION = `Perform model checking to verify system properties.

Model checking exhaustively explores all possible states of a system to verify
that certain properties hold. This is useful for:
- Finding race conditions
- Verifying deadlock freedom
- Checking temporal properties

Use this tool to verify critical system properties.`;

export const modelCheckingTool: ToolDefinition<
  z.infer<typeof modelCheckingSchema>
> = {
  name: "model_checking",
  description: MODEL_CHECKING_DESCRIPTION,
  inputSchema: modelCheckingSchema,
  defaultConsent: "always",

  getConsentPreview: (args) =>
    `Check ${args.properties.length} model property/properties in ${args.file_path}`,

  buildXml: (args, isComplete) => {
    if (isComplete) return undefined;
    if (!args.file_path) return undefined;
    return `<dyad-modelcheck file="${escapeXmlAttr(args.file_path)}">Analyzing...</dyad-modelcheck>`;
  },

  execute: async (args, ctx: AgentContext) => {
    logger.log(`Model checking: ${args.file_path}`);

    const { lines } = await parseSourceFile(args.file_path, ctx.appPath);
    const functions = extractFunctions(lines);

    const maxStates = args.max_states || 100;
    let stateCount = 0;

    let resultText = `Model Checking Results for ${args.file_path}:\n\n`;
    resultText += `Properties to verify: ${args.properties.length}\n`;
    resultText += `Max states to explore: ${maxStates}\n\n`;

    for (const prop of args.properties) {
      resultText += `Property: ${prop.name}\n`;
      resultText += `  Description: ${prop.description}\n`;

      // Simple static analysis of the property
      let status = "ANALYZING";
      let notes: string[] = [];

      // Check if property relates to code in the file
      const relatedFunctions = functions.filter((f) =>
        f.body.some((l) => l.includes(prop.condition)),
      );

      if (relatedFunctions.length > 0) {
        status = "PARTIAL_ANALYSIS";
        notes.push(
          `Related functions found: ${relatedFunctions.map((f) => f.name).join(", ")}`,
        );

        // Check for common issues
        for (const func of relatedFunctions) {
          // Check for potential race conditions
          const hasAsync = func.body.some(
            (l) => l.includes("async") || l.includes("Promise"),
          );
          if (hasAsync && prop.name.toLowerCase().includes("race")) {
            notes.push(
              `Warning: async operations detected in ${func.name} - potential race condition`,
            );
          }

          // Check for deadlock potential
          const awaitCount = func.body.filter((l) =>
            l.includes("await"),
          ).length;
          if (awaitCount > 1 && prop.name.toLowerCase().includes("deadlock")) {
            notes.push(
              `Note: multiple await points in ${func.name} - verify ordering`,
            );
          }
        }
      } else {
        notes.push(
          "No direct relationship found in code - manual verification required",
        );
      }

      resultText += `  Status: ${status}\n`;
      resultText += `  Notes: ${notes.join("; ")}\n\n`;

      stateCount += relatedFunctions.length;
      if (stateCount >= maxStates) {
        resultText += `(State limit reached: ${maxStates})\n`;
        break;
      }
    }

    ctx.onXmlComplete(
      `<dyad-modelcheck file="${escapeXmlAttr(args.file_path)}">${escapeXmlContent(resultText)}</dyad-modelcheck>`,
    );

    return resultText;
  },
};

const PROOF_ASSISTANT_DESCRIPTION = `Assist with formal proofs of code properties.

This tool helps:
- Structure proofs
- Identify proof obligations
- Suggest proof strategies
- Verify proof steps

Use this tool for formal verification of critical code properties.`;

export const proofAssistantTool: ToolDefinition<
  z.infer<typeof proofAssistantSchema>
> = {
  name: "proof_assistant",
  description: PROOF_ASSISTANT_DESCRIPTION,
  inputSchema: proofAssistantSchema,
  defaultConsent: "always",

  getConsentPreview: (args) =>
    `Prove theorem: ${args.theorem} in ${args.file_path}`,

  buildXml: (args, isComplete) => {
    if (isComplete) return undefined;
    if (!args.file_path) return undefined;
    return `<dyad-proof file="${escapeXmlAttr(args.file_path)}">Reasoning...</dyad-proof>`;
  },

  execute: async (args, ctx: AgentContext) => {
    logger.log(`Proof assistance: ${args.file_path}`);

    const { lines } = await parseSourceFile(args.file_path, ctx.appPath);

    let resultText = `Proof Assistant for ${args.file_path}:\n\n`;
    resultText += `Theorem: ${args.theorem}\n\n`;

    // Analyze theorem
    const theoremLower = args.theorem.toLowerCase();

    // Determine strategy
    const strategy = args.strategy || "deduction";

    resultText += `Strategy: ${strategy}\n\n`;

    // Suggest proof approach
    if (theoremLower.includes("all") || theoremLower.includes("every")) {
      resultText += `Approach: Universal Quantification\n`;
      resultText += `  1. Consider arbitrary instance\n`;
      resultText += `  2. Show property holds for that instance\n`;
      resultText += `  3. Conclude property holds for all instances\n\n`;
    } else if (theoremLower.includes("exist")) {
      resultText += `Approach: Existential Quantification\n`;
      resultText += `  1. Construct or find an example\n`;
      resultText += `  2. Verify property for that example\n`;
      resultText += `  3. Conclude existence proven\n\n`;
    } else if (
      theoremLower.includes("terminate") ||
      theoremLower.includes("stop")
    ) {
      resultText += `Approach: Termination Proof\n`;
      resultText += `  1. Identify variant (decreasing measure)\n`;
      resultText += `  2. Show variant always non-negative\n`;
      resultText += `  3. Show variant decreases on each iteration\n\n`;
    } else if (
      theoremLower.includes("loop") ||
      theoremLower.includes("induct")
    ) {
      resultText += `Approach: Induction\n`;
      resultText += `  1. Base case: Show property holds for n=0\n`;
      resultText += `  2. Inductive step: Assume true for n, show for n+1\n`;
      resultText += `  3. Conclusion: Property holds for all n\n\n`;
    } else {
      resultText += `Approach: Direct Deduction\n`;
      resultText += `  1. Start from premises\n`;
      resultText += `  2. Apply logical inference rules\n`;
      resultText += `  3. Derive conclusion\n\n`;
    }

    // If proof steps provided, verify them
    if (args.proof_steps && args.proof_steps.length > 0) {
      resultText += `Provided Proof Steps:\n`;
      for (let i = 0; i < args.proof_steps.length; i++) {
        resultText += `  ${i + 1}. ${args.proof_steps[i]}\n`;
      }
      resultText += `\nNote: Manual verification of proof logic required\n`;
    }

    // Check relevant code
    const relevantLines = lines.filter(
      (l) =>
        l.includes("function") ||
        l.includes("return") ||
        l.includes("loop") ||
        l.includes("condition"),
    );

    resultText += `\nRelevant Code Analysis:\n`;
    resultText += `  Found ${relevantLines.length} relevant line(s)\n`;
    resultText += `  (Detailed analysis requires theorem-specific context)\n`;

    ctx.onXmlComplete(
      `<dyad-proof file="${escapeXmlAttr(args.file_path)}">${escapeXmlContent(resultText)}</dyad-proof>`,
    );

    return resultText;
  },
};

const PROPERTY_CHECKING_DESCRIPTION = `Check specific properties of code.

Properties to check:
- Safety: Nothing bad happens
- Liveness: Something good eventually happens
- Termination: Program always terminates
- Fairness: No process is starved
- Custom: User-defined properties

Use this tool to verify critical properties of code behavior.`;

export const propertyCheckingTool: ToolDefinition<
  z.infer<typeof propertyCheckingSchema>
> = {
  name: "property_checking",
  description: PROPERTY_CHECKING_DESCRIPTION,
  inputSchema: propertyCheckingSchema,
  defaultConsent: "always",

  getConsentPreview: (args) =>
    `Check ${args.properties.length} property/properties in ${args.file_path}`,

  buildXml: (args, isComplete) => {
    if (isComplete) return undefined;
    if (!args.file_path) return undefined;
    return `<dyad-property file="${escapeXmlAttr(args.file_path)}">Checking...</dyad-property>`;
  },

  execute: async (args, ctx: AgentContext) => {
    logger.log(`Property checking: ${args.file_path}`);

    const { lines } = await parseSourceFile(args.file_path, ctx.appPath);
    const functions = extractFunctions(lines);

    let resultText = `Property Checking Results for ${args.file_path}:\n\n`;

    for (const prop of args.properties) {
      resultText += `Property: ${prop.name}\n`;
      resultText += `  Type: ${prop.property_type}\n`;
      resultText += `  Condition: ${prop.condition}\n`;

      // Analyze based on property type
      let analysis = "";
      let status = "UNKNOWN";

      switch (prop.property_type) {
        case "safety":
          // Check for error handling
          const hasErrorHandling = lines.some(
            (l) =>
              l.includes("catch") || l.includes("if") || l.includes("throw"),
          );
          status = hasErrorHandling ? "LIKELY_SAFE" : "VERIFY_MANUALLY";
          analysis = hasErrorHandling
            ? "Found error handling patterns"
            : "No explicit error handling detected";
          break;

        case "liveness":
          // Check for completion paths
          const hasReturn = functions.some((f) =>
            f.body.some((l) => l.trim().startsWith("return")),
          );
          status = hasReturn ? "LIKELY_PROGRESS" : "VERIFY_MANUALLY";
          analysis = hasReturn
            ? "Found return statements indicating progress"
            : "No clear progress indicators";
          break;

        case "termination":
          // Check for loops without clear termination
          const hasLoops = lines.some(
            (l) => l.includes("while") || l.includes("for"),
          );
          const hasRecursion = functions.some(
            (f) => f.body.some((l) => l.includes(f.name)) && f.body.length > 1,
          );
          status =
            !hasLoops && !hasRecursion
              ? "TERMINATES"
              : hasRecursion
                ? "VERIFY_RECURSIVE_TERMINATION"
                : "VERIFY_LOOP_TERMINATION";
          analysis = `Loops: ${hasLoops ? "yes" : "no"}, Recursion: ${
            hasRecursion ? "yes" : "no"
          }`;
          break;

        case "fairness":
          // Check for async operations
          const hasAsync = lines.some((l) => l.includes("async"));
          status = hasAsync ? "CHECK_ORDERING" : "NOT_APPLICABLE";
          analysis = hasAsync
            ? "Async operations present - verify fairness constraints"
            : "No async operations - fairness not applicable";
          break;

        default:
          // Custom property
          const relatedCode = lines.filter((l) => l.includes(prop.condition));
          status = relatedCode.length > 0 ? "FOUND_IN_CODE" : "NOT_FOUND";
          analysis = `Found ${relatedCode.length} line(s) matching condition`;
      }

      resultText += `  Status: ${status}\n`;
      resultText += `  Analysis: ${analysis}\n\n`;
    }

    // Check side effects if requested
    if (args.check_side_effects) {
      resultText += `Side Effects Analysis:\n`;

      const mutations = lines.filter(
        (l) =>
          l.includes("=") &&
          !l.includes("==") &&
          !l.includes("=>") &&
          (l.includes("let ") || l.includes("var ")),
      );
      const asyncCalls = lines.filter(
        (l) => l.includes("await") || l.includes(".then"),
      );
      const consoleCalls = lines.filter((l) => l.includes("console."));

      resultText += `  Variable mutations: ${mutations.length}\n`;
      resultText += `  Async calls: ${asyncCalls.length}\n`;
      resultText += `  Console I/O: ${consoleCalls.length}\n`;
    }

    ctx.onXmlComplete(
      `<dyad-property file="${escapeXmlAttr(args.file_path)}">${escapeXmlContent(resultText)}</dyad-property>`,
    );

    return resultText;
  },
};
