/**
 * Pattern Detector Tool
 * Detects architectural patterns in codebase:
 * - Microservice architecture
 * - Monolith architecture
 * - Event-driven architecture
 * - CQRS architecture
 * - Domain-driven design (DDD)
 * - Clean architecture
 * - Layered architecture
 * - Hexagonal architecture
 */

import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { ToolDefinition, type AgentContext } from "./types";

// Input schema
const PatternDetectorArgs = z.object({
  /** Path to the project (defaults to app root) */
  projectPath: z.string().optional(),
  /** Specific patterns to detect (defaults to all) */
  patterns: z
    .enum([
      "all",
      "microservice",
      "monolith",
      "event-driven",
      "cqrs",
      "ddd",
      "clean",
      "layered",
      "hexagonal",
    ])
    .array()
    .default(["all"]),
  /** Minimum confidence threshold (0-1) */
  minConfidence: z.number().min(0).max(1).default(0.5),
  /** Include detailed evidence for each detected pattern */
  includeEvidence: z.boolean().default(true),
});

type PatternDetectorArgs = z.infer<typeof PatternDetectorArgs>;

// Result types
interface PatternEvidence {
  file: string;
  line?: number;
  description: string;
  weight: number;
}

interface DetectedArchitecturePattern {
  name: string;
  confidence: number;
  description: string;
  indicators: string[];
  evidence: PatternEvidence[];
  fileStructure: string[];
}

interface PatternDetectionReport {
  detectedPatterns: DetectedArchitecturePattern[];
  summary: {
    totalPatterns: number;
    dominantArchitecture: string;
    patternScore: Record<string, number>;
    recommendations: string[];
  };
}

// Pattern indicators - files and directories that suggest specific patterns
const PATTERN_INDICATORS: Record<
  string,
  Array<{ pattern: RegExp; weight: number }>
> = {
  microservice: [
    { pattern: /\/services\/[a-z-]+\//i, weight: 3 },
    { pattern: /\/api-gateway\//i, weight: 3 },
    { pattern: /\/service-registry\//i, weight: 3 },
    { pattern: /\/docker-compose/i, weight: 2 },
    { pattern: /Dockerfile/i, weight: 1 },
    { pattern: /kubernetes/i, weight: 3 },
    { pattern: /\/microservices\//i, weight: 3 },
    { pattern: /\.proto$/i, weight: 2 },
    { pattern: /grpc/i, weight: 2 },
  ],
  monolith: [
    { pattern: /\/core\//i, weight: 2 },
    { pattern: /\/app\//i, weight: 1 },
    { pattern: /package\.json/i, weight: 1 },
    { pattern: /\/src\//i, weight: 1 },
    { pattern: /webpack/i, weight: 1 },
    { pattern: /vite\.config/i, weight: 1 },
  ],
  "event-driven": [
    { pattern: /\/events\//i, weight: 3 },
    { pattern: /\/event-bus/i, weight: 3 },
    { pattern: /\/kafka/i, weight: 3 },
    { pattern: /\/rabbitmq/i, weight: 3 },
    { pattern: /\/pubsub/i, weight: 3 },
    { pattern: /\/event-stream/i, weight: 3 },
    { pattern: /emit\s*\(/i, weight: 2 },
    { pattern: /on\s*\(\s*['"]event['"]/i, weight: 2 },
    { pattern: /event-emitter/i, weight: 2 },
  ],
  cqrs: [
    { pattern: /\/commands\//i, weight: 3 },
    { pattern: /\/queries\//i, weight: 3 },
    { pattern: /\/command-handler/i, weight: 3 },
    { pattern: /\/query-handler/i, weight: 3 },
    { pattern: /\/read-model/i, weight: 3 },
    { pattern: /\/write-model/i, weight: 3 },
    { pattern: /command-bus/i, weight: 2 },
    { pattern: /query-bus/i, weight: 2 },
  ],
  ddd: [
    { pattern: /\/domain\//i, weight: 3 },
    { pattern: /\/entities\//i, weight: 2 },
    { pattern: /\/value-objects\//i, weight: 3 },
    { pattern: /\/aggregates\//i, weight: 3 },
    { pattern: /\/domain-events\//i, weight: 3 },
    { pattern: /\/repositories\//i, weight: 2 },
    { pattern: /\/services\//i, weight: 1 },
    { pattern: /\/bounded-contexts\//i, weight: 3 },
    { pattern: /\/domain-services\//i, weight: 3 },
  ],
  clean: [
    { pattern: /\/domain\//i, weight: 2 },
    { pattern: /\/application\//i, weight: 3 },
    { pattern: /\/infrastructure\//i, weight: 3 },
    { pattern: /\/presentation\//i, weight: 3 },
    { pattern: /\/interfaces\//i, weight: 2 },
    { pattern: /\/use-cases\//i, weight: 3 },
    { pattern: /\/adapters\//i, weight: 3 },
  ],
  layered: [
    { pattern: /\/presentation\//i, weight: 2 },
    { pattern: /\/application\//i, weight: 2 },
    { pattern: /\/domain\//i, weight: 2 },
    { pattern: /\/infrastructure\//i, weight: 2 },
    { pattern: /\/controllers\//i, weight: 2 },
    { pattern: /\/services\//i, weight: 1 },
    { pattern: /\/models\//i, weight: 1 },
    { pattern: /\/utils\//i, weight: 1 },
    { pattern: /\/layers\//i, weight: 2 },
  ],
  hexagonal: [
    { pattern: /\/ports\//i, weight: 3 },
    { pattern: /\/adapters\//i, weight: 3 },
    { pattern: /\/domain\//i, weight: 2 },
    { pattern: /\/primary\//i, weight: 3 },
    { pattern: /\/secondary\//i, weight: 3 },
    { pattern: /\/driving\//i, weight: 3 },
    { pattern: /\/driven\//i, weight: 3 },
    { pattern: /\/inbound\//i, weight: 3 },
    { pattern: /\/outbound\//i, weight: 3 },
  ],
};

// Language/framework specific patterns
const FRAMEWORK_PATTERNS: Array<{
  pattern: RegExp;
  frameworks: string[];
  weight: number;
}> = [
  { pattern: /nextjs|next\.config/i, frameworks: ["Next.js"], weight: 3 },
  { pattern: /react/i, frameworks: ["React"], weight: 2 },
  { pattern: /vue/i, frameworks: ["Vue"], weight: 2 },
  { pattern: /angular/i, frameworks: ["Angular"], weight: 2 },
  { pattern: /express/i, frameworks: ["Express"], weight: 2 },
  { pattern: /fastapi/i, frameworks: ["FastAPI"], weight: 2 },
  { pattern: /django/i, frameworks: ["Django"], weight: 2 },
  { pattern: /rails/i, frameworks: ["Rails"], weight: 2 },
  { pattern: /spring/i, frameworks: ["Spring"], weight: 2 },
  { pattern: /nestjs|nest/i, frameworks: ["NestJS"], weight: 3 },
  { pattern: /prisma/i, frameworks: ["Prisma"], weight: 2 },
  { pattern: /drizzle/i, frameworks: ["Drizzle ORM"], weight: 2 },
  { pattern: /sequelize/i, frameworks: ["Sequelize"], weight: 2 },
  { pattern: /typeorm/i, frameworks: ["TypeORM"], weight: 2 },
  { pattern: /redux/i, frameworks: ["Redux"], weight: 2 },
  { pattern: /zustand/i, frameworks: ["Zustand"], weight: 2 },
  { pattern: /mobx/i, frameworks: ["MobX"], weight: 2 },
  { pattern: /electron/i, frameworks: ["Electron"], weight: 3 },
];

// Scan project for pattern indicators
async function scanForPatterns(
  projectPath: string,
  targetPatterns: string[],
): Promise<{
  fileStructure: string[];
  patternMatches: Record<string, PatternEvidence[]>;
  frameworks: string[];
}> {
  const fileStructure: string[] = [];
  const patternMatches: Record<string, PatternEvidence[]> = {};
  const frameworks: string[] = [];

  const skipDirs = new Set([
    "node_modules",
    "dist",
    "build",
    ".next",
    "__pycache__",
    "venv",
    "coverage",
    ".git",
    "target",
    "bin",
    "obj",
    ".cache",
    ".storybook",
  ]);

  // Initialize pattern matches
  const patternsToCheck =
    targetPatterns.includes("all") || targetPatterns.length === 0
      ? Object.keys(PATTERN_INDICATORS)
      : targetPatterns;

  for (const p of patternsToCheck) {
    patternMatches[p] = [];
  }

  async function scanDirectory(
    dirPath: string,
    depth: number = 0,
  ): Promise<void> {
    if (depth > 6) return; // Limit depth

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name.startsWith(".") || skipDirs.has(entry.name)) {
          continue;
        }

        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(projectPath, fullPath);

        if (entry.isDirectory()) {
          fileStructure.push(`${relativePath}/`);
          await scanDirectory(fullPath, depth + 1);
        } else {
          fileStructure.push(relativePath);

          // Check against pattern indicators
          for (const [patternName, indicators] of Object.entries(
            PATTERN_INDICATORS,
          )) {
            if (!patternsToCheck.includes(patternName)) continue;

            for (const indicator of indicators) {
              if (
                indicator.pattern.test(relativePath) ||
                indicator.pattern.test(entry.name)
              ) {
                patternMatches[patternName].push({
                  file: relativePath,
                  description: `Found ${patternName} indicator: ${entry.name}`,
                  weight: indicator.weight,
                });
              }
            }
          }

          // Check for framework patterns
          for (const fp of FRAMEWORK_PATTERNS) {
            if (fp.pattern.test(relativePath) || fp.pattern.test(entry.name)) {
              for (const fw of fp.frameworks) {
                if (!frameworks.includes(fw)) {
                  frameworks.push(fw);
                }
              }
            }
          }
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  await scanDirectory(projectPath, 0);

  return { fileStructure, patternMatches, frameworks };
}

// Analyze content for deeper pattern detection
async function analyzeContentForPatterns(
  projectPath: string,
  patternMatches: Record<string, PatternEvidence[]>,
): Promise<void> {
  const skipDirs = new Set(["node_modules", "dist", "build", ".next", ".git"]);

  async function checkFiles(dirPath: string, depth: number = 0): Promise<void> {
    if (depth > 4) return;

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name.startsWith(".") || skipDirs.has(entry.name)) {
          continue;
        }

        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          await checkFiles(fullPath, depth + 1);
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          if (
            ![".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".java"].includes(ext)
          ) {
            continue;
          }

          try {
            const content = fs.readFileSync(fullPath, "utf-8");
            const relativePath = path.relative(projectPath, fullPath);

            // Event-driven patterns in code
            if (content.includes("emit(") || content.includes("EventEmitter")) {
              if (
                !patternMatches["event-driven"].find(
                  (e) => e.file === relativePath,
                )
              ) {
                patternMatches["event-driven"].push({
                  file: relativePath,
                  description: "Event emitter usage detected in code",
                  weight: 2,
                });
              }
            }

            // CQRS patterns
            if (content.includes("Command") || content.includes("Query")) {
              if (!patternMatches.cqrs.find((e) => e.file === relativePath)) {
                patternMatches.cqrs.push({
                  file: relativePath,
                  description: "Command/Query pattern in code",
                  weight: 2,
                });
              }
            }

            // DDD patterns
            const dddKeywords = [
              "Entity",
              "ValueObject",
              "Aggregate",
              "DomainEvent",
            ];
            for (const kw of dddKeywords) {
              if (content.includes(kw)) {
                if (!patternMatches.ddd.find((e) => e.file === relativePath)) {
                  patternMatches.ddd.push({
                    file: relativePath,
                    description: `DDD pattern: ${kw}`,
                    weight: 2,
                  });
                }
              }
            }
          } catch {
            // Skip unreadable files
          }
        }
      }
    } catch {
      // Skip inaccessible
    }
  }

  await checkFiles(projectPath, 0);
}

// Calculate confidence scores for each pattern
function calculatePatternScores(
  patternMatches: Record<string, PatternEvidence[]>,
  fileStructure: string[],
  _frameworks: string[],
): DetectedArchitecturePattern[] {
  const patterns: DetectedArchitecturePattern[] = [];
  const totalFiles = fileStructure.filter((f) => !f.endsWith("/")).length;

  // Pattern descriptions
  const patternDescriptions: Record<string, string> = {
    microservice:
      "Distributed architecture with independently deployable services communicating over network",
    monolith:
      "Single deployable application with all functionality in one codebase",
    "event-driven":
      "Architecture where components communicate through asynchronous events",
    cqrs: "Command Query Responsibility Segregation - separate models for read and write operations",
    ddd: "Domain-Driven Design - organized around business domain concepts",
    clean:
      "Clean Architecture with separated layers (domain, application, infrastructure, presentation)",
    layered:
      "Traditional layered architecture (presentation, application, domain, infrastructure)",
    hexagonal:
      "Hexagonal/Ports & Adapters architecture with clear separation of concerns",
  };

  for (const [patternName, evidence] of Object.entries(patternMatches)) {
    if (evidence.length === 0) continue;

    // Calculate weighted score
    const totalWeight = evidence.reduce((sum, e) => sum + e.weight, 0);
    const normalizedScore = Math.min(1, totalWeight / (totalFiles * 0.1)); // Adjust denominator for normalization

    // Get unique files
    const uniqueFiles = [...new Set(evidence.map((e) => e.file))];
    const fileStructure = uniqueFiles.slice(0, 10);

    // Generate indicators based on evidence
    const indicators = evidence.slice(0, 5).map((e) => e.description);

    patterns.push({
      name: patternName,
      confidence: normalizedScore,
      description: patternDescriptions[patternName] || "",
      indicators,
      evidence: evidence.slice(0, 20),
      fileStructure,
    });
  }

  // Sort by confidence
  return patterns.sort((a, b) => b.confidence - a.confidence);
}

// Determine dominant architecture and generate recommendations
function analyzeResults(
  patterns: DetectedArchitecturePattern[],
  frameworks: string[],
): {
  dominantArchitecture: string;
  patternScore: Record<string, number>;
  recommendations: string[];
} {
  const patternScore: Record<string, number> = {};
  for (const p of patterns) {
    patternScore[p.name] = Math.round(p.confidence * 100);
  }

  // Determine dominant architecture
  let dominantArchitecture = "monolith";
  if (patterns.length > 0 && patterns[0].confidence > 0.3) {
    dominantArchitecture = patterns[0].name;
  }

  // Generate recommendations
  const recommendations: string[] = [];

  // Based on detected patterns
  for (const pattern of patterns) {
    if (pattern.confidence > 0.7) {
      recommendations.push(
        `Strong ${pattern.name} characteristics detected - consider organizing code to emphasize this pattern`,
      );
    } else if (pattern.confidence > 0.4) {
      recommendations.push(
        `Partial ${pattern.name} characteristics - evaluate if full adoption would benefit the project`,
      );
    }
  }

  // Based on frameworks
  if (frameworks.includes("NestJS")) {
    recommendations.push(
      "NestJS promotes modular architecture - consider organizing by modules (bounded contexts)",
    );
  }
  if (frameworks.includes("Next.js")) {
    recommendations.push(
      "Next.js supports various patterns - evaluate routing strategy for scalability",
    );
  }

  // Add missing pattern recommendations
  const detectedPatternNames = new Set(patterns.map((p) => p.name));
  if (
    !detectedPatternNames.has("layered") &&
    !detectedPatternNames.has("clean")
  ) {
    recommendations.push(
      "Consider implementing a clear layered or clean architecture for better maintainability",
    );
  }

  return { dominantArchitecture, patternScore, recommendations };
}

// Main detection function
async function detectPatterns(
  args: PatternDetectorArgs,
  ctx: AgentContext,
): Promise<PatternDetectionReport> {
  const projectPath = args.projectPath
    ? path.isAbsolute(args.projectPath)
      ? args.projectPath
      : path.join(ctx.appPath, args.projectPath)
    : ctx.appPath;

  if (!fs.existsSync(projectPath)) {
    throw new Error(`Project path does not exist: ${projectPath}`);
  }

  ctx.onXmlStream(
    `<dyad-status title="Pattern Detector">Scanning project structure...</dyad-status>`,
  );

  // Phase 1: Scan for pattern indicators in file structure
  const { fileStructure, patternMatches, frameworks } = await scanForPatterns(
    projectPath,
    args.patterns.includes("all") ? [] : args.patterns,
  );

  ctx.onXmlStream(
    `<dyad-status title="Pattern Detector">Analyzing ${fileStructure.length} files...</dyad-status>`,
  );

  // Phase 2: Analyze content for deeper patterns
  await analyzeContentForPatterns(projectPath, patternMatches);

  // Phase 3: Calculate confidence scores
  const detectedPatterns = calculatePatternScores(
    patternMatches,
    fileStructure,
    frameworks,
  );

  // Filter by minimum confidence
  const filteredPatterns = detectedPatterns.filter(
    (p) => p.confidence >= args.minConfidence,
  );

  // Phase 4: Analyze results and generate recommendations
  const { dominantArchitecture, patternScore, recommendations } =
    analyzeResults(filteredPatterns, frameworks);

  return {
    detectedPatterns: filteredPatterns,
    summary: {
      totalPatterns: filteredPatterns.length,
      dominantArchitecture,
      patternScore,
      recommendations,
    },
  };
}

// Generate XML report
function generatePatternXml(report: PatternDetectionReport): string {
  const lines: string[] = [
    `# Architecture Pattern Detection Report`,
    ``,
    `## Summary`,
    `- **Total Patterns Detected**: ${report.summary.totalPatterns}`,
    `- **Dominant Architecture**: ${report.summary.dominantArchitecture}`,
    `- **Frameworks Detected**: ${Object.keys(report.summary.patternScore).length > 0 ? "See patterns below" : "Standard project structure"}`,
    ``,
  ];

  // Detected patterns
  if (report.detectedPatterns.length > 0) {
    lines.push(`## 🏗️ Detected Patterns`);

    for (const pattern of report.detectedPatterns) {
      const confidencePercent = Math.round(pattern.confidence * 100);
      const confidenceEmoji =
        confidencePercent >= 70 ? "🟢" : confidencePercent >= 40 ? "🟡" : "🔴";

      lines.push(
        `### ${confidenceEmoji} ${pattern.name.charAt(0).toUpperCase() + pattern.name.slice(1)} Architecture`,
      );
      lines.push(`- **Confidence**: ${confidencePercent}%`);
      lines.push(`- **Description**: ${pattern.description}`);

      if (pattern.indicators.length > 0) {
        lines.push(`- **Indicators**: ${pattern.indicators.join(", ")}`);
      }

      if (pattern.evidence.length > 0 && report.summary.totalPatterns <= 5) {
        lines.push(`- **Evidence**:`);
        for (const evidence of pattern.evidence.slice(0, 5)) {
          lines.push(`  - ${evidence.file}: ${evidence.description}`);
        }
      }

      lines.push(``);
    }
  } else {
    lines.push(`## ℹ️ No Clear Patterns Detected`);
    lines.push(
      `The codebase may be in early stages or use a custom architecture approach.`,
    );
    lines.push(``);
  }

  // Recommendations
  if (report.summary.recommendations.length > 0) {
    lines.push(`## 💡 Recommendations`);
    for (const rec of report.summary.recommendations) {
      lines.push(`- ${rec}`);
    }
  }

  // Pattern Scores
  if (Object.keys(report.summary.patternScore).length > 0) {
    lines.push(``);
    lines.push(`## 📊 Pattern Scores`);
    for (const [pattern, score] of Object.entries(
      report.summary.patternScore,
    )) {
      lines.push(`- **${pattern}**: ${score}%`);
    }
  }

  return lines.join("\n");
}

export const patternDetectorTool: ToolDefinition<PatternDetectorArgs> = {
  name: "pattern_detector",
  description:
    "Detect architectural patterns in codebase: microservice, monolith, event-driven, CQRS, DDD, clean, layered, and hexagonal architectures with confidence scores and evidence.",
  inputSchema: PatternDetectorArgs,
  defaultConsent: "always",
  modifiesState: false,

  execute: async (args, ctx) => {
    const report = await detectPatterns(args, ctx);

    const reportXml = generatePatternXml(report);

    const topPattern = report.detectedPatterns[0];
    const confidence = topPattern
      ? `${Math.round(topPattern.confidence * 100)}%`
      : "N/A";

    ctx.onXmlComplete(
      `<dyad-status title="Pattern Detection Complete">${report.summary.dominantArchitecture} architecture detected (${confidence} confidence)</dyad-status>`,
    );

    return reportXml;
  },
};
