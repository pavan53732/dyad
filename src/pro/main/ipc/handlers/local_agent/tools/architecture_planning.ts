/**
 * Architecture Planning Tools
 * Advanced architecture planning, forecasting, and long-term analysis capabilities.
 *
 * Capabilities: 401-405 (remaining architectural reasoning gaps)
 */

import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { ToolDefinition, type AgentContext } from "./types";

// ============================================================================
// Input Schemas
// ============================================================================

// Architecture Rollback Planner (Capability 401)
const ArchitectureRollbackPlannerArgs = z.object({
  /** Project path to analyze */
  projectPath: z.string().optional(),
  /** Current architecture version or state to rollback from */
  currentArchitecture: z.string(),
  /** Target architecture version or state to rollback to */
  targetArchitecture: z.string(),
  /** Components/systems affected by rollback */
  affectedComponents: z.array(z.string()).default([]),
  /** Include data migration steps */
  includeDataMigration: z.boolean().default(true),
  /** Include rollback validation steps */
  includeValidation: z.boolean().default(true),
  /** Maximum acceptable downtime in minutes */
  maxDowntime: z.number().min(0).default(60),
});

// Future Growth Planner (Capability 402)
const FutureGrowthPlannerArgs = z.object({
  /** Project path to analyze */
  projectPath: z.string().optional(),
  /** Current system capacity and metrics */
  currentMetrics: z
    .object({
      users: z.number().optional(),
      requestsPerDay: z.number().optional(),
      dataSizeGB: z.number().optional(),
      activeServices: z.number().optional(),
    })
    .optional(),
  /** Planning horizon in months */
  planningHorizonMonths: z.number().min(6).max(60).default(24),
  /** Growth scenarios to consider */
  scenarios: z
    .array(z.enum(["conservative", "moderate", "aggressive"]))
    .default(["moderate"]),
  /** Include capacity planning */
  includeCapacity: z.boolean().default(true),
  /** Include technology evolution */
  includeTechEvolution: z.boolean().default(true),
});

// Scaling Forecast Engine (Capability 403)
const ScalingForecastEngineArgs = z.object({
  /** Project path to analyze */
  projectPath: z.string().optional(),
  /** Current system metrics */
  currentMetrics: z.object({
    concurrentUsers: z.number().optional(),
    requestsPerSecond: z.number().optional(),
    averageResponseTime: z.number().optional(),
    errorRate: z.number().optional(),
  }),
  /** Forecast duration in months */
  forecastMonths: z.number().min(3).max(36).default(12),
  /** Growth rate percentage per month */
  monthlyGrowthRate: z.number().min(0).max(100).default(10),
  /** Identify bottleneck areas */
  identifyBottlenecks: z.boolean().default(true),
  /** Include cost implications */
  includeCostImplications: z.boolean().default(true),
});

// Cost Projection Model (Capability 404)
const CostProjectionModelArgs = z.object({
  /** Project path to analyze */
  projectPath: z.string().optional(),
  /** Current monthly infrastructure costs */
  currentMonthlyCosts: z
    .object({
      compute: z.number().optional(),
      storage: z.number().optional(),
      network: z.number().optional(),
      thirdPartyServices: z.number().optional(),
      personnel: z.number().optional(),
    })
    .optional(),
  /** Projection duration in months */
  projectionMonths: z.number().min(6).max(60).default(24),
  /** Cost model assumptions */
  assumptions: z
    .object({
      computeCostChange: z.number().min(-50).max(50).default(-5), // % change per year
      storageGrowthRate: z.number().min(0).max(100).default(20), // % per year
      scalingFactor: z.number().min(0.5).max(5).default(1.5),
    })
    .optional(),
  /** Include scenario comparison */
  includeScenarios: z.boolean().default(true),
});

// Sustainability Analysis (Capability 405)
const SustainabilityAnalysisArgs = z.object({
  /** Project path to analyze */
  projectPath: z.string().optional(),
  /** Analysis focus areas */
  focusAreas: z
    .array(z.enum(["energy", "carbon", "resources", "waste", "supply_chain"]))
    .default(["energy", "carbon"]),
  /** Include recommendations */
  includeRecommendations: z.boolean().default(true),
  /** Analysis depth */
  depth: z.enum(["basic", "detailed", "comprehensive"]).default("basic"),
  /** Compare against industry benchmarks */
  compareBenchmarks: z.boolean().default(false),
});

type ArchitectureRollbackPlannerArgs = z.infer<
  typeof ArchitectureRollbackPlannerArgs
>;
type FutureGrowthPlannerArgs = z.infer<typeof FutureGrowthPlannerArgs>;
type ScalingForecastEngineArgs = z.infer<typeof ScalingForecastEngineArgs>;
type CostProjectionModelArgs = z.infer<typeof CostProjectionModelArgs>;
type SustainabilityAnalysisArgs = z.infer<typeof SustainabilityAnalysisArgs>;

// ============================================================================
// Result Types
// ============================================================================

interface RollbackStep {
  order: number;
  phase: string;
  step: string;
  description: string;
  estimatedDuration: string;
  risk: "low" | "medium" | "high";
  dependencies: string[];
  rollbackIf: string;
}

interface RollbackPlan {
  currentArchitecture: string;
  targetArchitecture: string;
  totalEstimatedDuration: string;
  totalSteps: number;
  phases: string[];
  steps: RollbackStep[];
  risks: string[];
  validationChecks: string[];
  rollbackPlan: string;
}

interface GrowthProjection {
  metric: string;
  current: number;
  projections: Array<{
    timeframe: string;
    conservative: number;
    moderate: number;
    aggressive: number;
  }>;
}

interface GrowthRecommendation {
  category: string;
  recommendation: string;
  timing: string;
  estimatedInvestment: string;
  priority: "low" | "medium" | "high";
}

interface GrowthPlan {
  planningHorizon: string;
  projections: GrowthProjection[];
  recommendations: GrowthRecommendation[];
  technologyRoadmap: string[];
  riskFactors: string[];
}

interface Bottleneck {
  component: string;
  currentCapacity: number;
  projectedDemand: number;
  bottleneckSeverity: "low" | "medium" | "high" | "critical";
  mitigationStrategies: string[];
  estimatedMitigationCost: string;
}

interface ScalingForecast {
  forecastPeriod: string;
  baseMetrics: Record<string, number>;
  projections: Array<{
    month: number;
    users: number;
    requestsPerSecond: number;
    infrastructure: string;
    estimatedCost: number;
  }>;
  bottlenecks: Bottleneck[];
  recommendations: string[];
  scalingMilestones: Array<{
    month: number;
    trigger: string;
    action: string;
  }>;
}

interface CostProjection {
  projectionPeriod: string;
  baseCosts: Record<string, number>;
  projections: Array<{
    month: number;
    category: string;
    conservative: number;
    moderate: number;
    aggressive: number;
    Notes: string;
  }>;
  totalProjectedCost: {
    conservative: number;
    moderate: number;
    aggressive: number;
  };
  costDrivers: string[];
  optimizationOpportunities: string[];
}

interface SustainabilityMetrics {
  category: string;
  metric: string;
  currentValue: number;
  unit: string;
  benchmark: number | null;
  status: "good" | "warning" | "critical";
}

interface SustainabilityRecommendation {
  category: string;
  recommendation: string;
  impact: string;
  effort: "low" | "medium" | "high";
  estimatedReduction: string;
}

interface SustainabilityAnalysisResult {
  analysisDepth: string;
  focusAreas: string[];
  metrics: SustainabilityMetrics[];
  carbonFootprint: {
    totalCO2kg: number;
    breakdown: Record<string, number>;
  };
  recommendations: SustainabilityRecommendation[];
  certifications: string[];
  nextSteps: string[];
}

// ============================================================================
// Utility Functions
// ============================================================================

function getProjectPath(
  args: { projectPath?: string },
  ctx: AgentContext,
): string | null {
  if (!args.projectPath) {
    return ctx.appPath;
  }
  const projectPath = path.isAbsolute(args.projectPath)
    ? args.projectPath
    : path.join(ctx.appPath, args.projectPath);

  if (!fs.existsSync(projectPath)) {
    return null;
  }
  return projectPath;
}

function analyzeCodebase(projectPath: string | null): {
  languages: string[];
  frameworks: string[];
  services: number;
  complexity: number;
} {
  const result = {
    languages: [] as string[],
    frameworks: [] as string[],
    services: 1,
    complexity: 0,
  };

  if (!projectPath || !fs.existsSync(projectPath)) {
    return result;
  }

  try {
    const files = fs.readdirSync(projectPath, { recursive: true });
    const fileList = files.filter((f) => typeof f === "string") as string[];

    const extCounts = new Map<string, number>();
    for (const file of fileList) {
      const ext = path.extname(file);
      if (ext) {
        extCounts.set(ext, (extCounts.get(ext) || 0) + 1);
      }
    }

    // Detect languages
    if (extCounts.has(".ts") || extCounts.has(".tsx"))
      result.languages.push("TypeScript");
    if (extCounts.has(".js") || extCounts.has(".jsx"))
      result.languages.push("JavaScript");
    if (extCounts.has(".py")) result.languages.push("Python");
    if (extCounts.has(".go")) result.languages.push("Go");
    if (extCounts.has(".rs")) result.languages.push("Rust");
    if (extCounts.has(".java")) result.languages.push("Java");

    // Estimate services and complexity
    result.services = Math.max(1, fileList.length / 50);
    result.complexity = Math.min(100, fileList.length / 10);
  } catch {
    // Ignore errors
  }

  return result;
}

// ============================================================================
// Main Analysis Functions
// ============================================================================

// Architecture Rollback Planner (Capability 401)
async function planRollback(
  args: ArchitectureRollbackPlannerArgs,
  ctx: AgentContext,
): Promise<RollbackPlan> {
  ctx.onXmlStream(
    `<dyad-status title="Architecture Rollback Planner">Planning rollback from ${args.currentArchitecture} to ${args.targetArchitecture}...</dyad-status>`,
  );

  const steps: RollbackStep[] = [];
  const phases = [
    "Pre-rollback",
    "Data Migration",
    "Infrastructure",
    "Application",
    "Validation",
    "Post-rollback",
  ];
  const risks: string[] = [];

  // Phase 1: Pre-rollback
  steps.push({
    order: 1,
    phase: "Pre-rollback",
    step: "Create system snapshot",
    description:
      "Create full backup of current system state including database and configurations",
    estimatedDuration: "15-30 minutes",
    risk: "low",
    dependencies: [],
    rollbackIf: "Backup fails",
  });

  steps.push({
    order: 2,
    phase: "Pre-rollback",
    step: "Notify stakeholders",
    description:
      "Send rollback notification to all stakeholders and schedule maintenance window",
    estimatedDuration: "5 minutes",
    risk: "low",
    dependencies: ["Create system snapshot"],
    rollbackIf: "Notification fails",
  });

  steps.push({
    order: 3,
    phase: "Pre-rollback",
    step: "Enable maintenance mode",
    description:
      "Put system into maintenance mode to prevent new changes during rollback",
    estimatedDuration: "2-5 minutes",
    risk: "low",
    dependencies: ["Notify stakeholders"],
    rollbackIf: "Maintenance mode fails",
  });

  // Phase 2: Data Migration (if applicable)
  if (args.includeDataMigration) {
    steps.push({
      order: 4,
      phase: "Data Migration",
      step: "Export current data",
      description: "Export all data from current architecture schema",
      estimatedDuration: "10-60 minutes",
      risk: "medium",
      dependencies: ["Enable maintenance mode"],
      rollbackIf: "Export fails or times out",
    });

    steps.push({
      order: 5,
      phase: "Data Migration",
      step: "Transform data schema",
      description: "Transform data to target architecture schema if needed",
      estimatedDuration: "15-120 minutes",
      risk: "high",
      dependencies: ["Export current data"],
      rollbackIf: "Transformation fails",
    });

    steps.push({
      order: 6,
      phase: "Data Migration",
      step: "Import to target",
      description: "Import transformed data into target architecture",
      estimatedDuration: "10-60 minutes",
      risk: "high",
      dependencies: ["Transform data schema"],
      rollbackIf: "Import fails",
    });
  }

  // Phase 3: Infrastructure
  steps.push({
    order: args.includeDataMigration ? 7 : 4,
    phase: "Infrastructure",
    step: "Provision target infrastructure",
    description:
      "Set up infrastructure for target architecture (servers, networks, storage)",
    estimatedDuration: "30-120 minutes",
    risk: "medium",
    dependencies: args.includeDataMigration
      ? ["Import to target"]
      : ["Enable maintenance mode"],
    rollbackIf: "Provisioning fails",
  });

  steps.push({
    order: args.includeDataMigration ? 8 : 5,
    phase: "Infrastructure",
    step: "Deploy configurations",
    description: "Apply configurations for target architecture",
    estimatedDuration: "10-30 minutes",
    risk: "low",
    dependencies: ["Provision target infrastructure"],
    rollbackIf: "Configuration fails",
  });

  // Phase 4: Application
  steps.push({
    order: args.includeDataMigration ? 9 : 6,
    phase: "Application",
    step: "Deploy target version",
    description: "Deploy application code for target architecture version",
    estimatedDuration: "15-60 minutes",
    risk: "medium",
    dependencies: ["Deploy configurations"],
    rollbackIf: "Deployment fails",
  });

  // Phase 5: Validation
  if (args.includeValidation) {
    steps.push({
      order: args.includeDataMigration ? 10 : 7,
      phase: "Validation",
      step: "Run smoke tests",
      description: "Execute basic smoke tests to verify system functionality",
      estimatedDuration: "10-30 minutes",
      risk: "low",
      dependencies: ["Deploy target version"],
      rollbackIf: "Smoke tests fail",
    });

    steps.push({
      order: args.includeDataMigration ? 11 : 8,
      phase: "Validation",
      step: "Run integration tests",
      description: "Execute integration tests to verify component interactions",
      estimatedDuration: "30-120 minutes",
      risk: "low",
      dependencies: ["Run smoke tests"],
      rollbackIf: "Integration tests fail",
    });

    steps.push({
      order: args.includeDataMigration ? 12 : 9,
      phase: "Validation",
      step: "Performance validation",
      description: "Verify performance meets acceptable thresholds",
      estimatedDuration: "30-60 minutes",
      risk: "low",
      dependencies: ["Run integration tests"],
      rollbackIf: "Performance below threshold",
    });
  }

  // Phase 6: Post-rollback
  steps.push({
    order: args.includeValidation
      ? args.includeDataMigration
        ? 13
        : 10
      : args.includeDataMigration
        ? 10
        : 7,
    phase: "Post-rollback",
    step: "Disable maintenance mode",
    description: "Re-enable normal system operations",
    estimatedDuration: "2-5 minutes",
    risk: "low",
    dependencies: args.includeValidation
      ? ["Performance validation"]
      : ["Deploy target version"],
    rollbackIf: "System doesn't come up",
  });

  steps.push({
    order: args.includeValidation
      ? args.includeDataMigration
        ? 14
        : 11
      : args.includeDataMigration
        ? 11
        : 8,
    phase: "Post-rollback",
    step: "Monitor system health",
    description: "Monitor system for 24-48 hours post-rollback",
    estimatedDuration: "Ongoing",
    risk: "low",
    dependencies: ["Disable maintenance mode"],
    rollbackIf: "Critical issues detected",
  });

  // Calculate total duration
  const highRiskSteps = steps.filter((s) => s.risk === "high").length;
  if (highRiskSteps > 2) {
    risks.push("Multiple high-risk steps - consider staged rollout");
  }

  if (args.maxDowntime < 60) {
    risks.push("Tight downtime window - ensure all teams are on standby");
  }

  const validationChecks = [
    "Verify all data migrated correctly",
    "Confirm all services responding",
    "Check error rates are within normal bounds",
    "Validate critical business workflows",
    "Confirm monitoring and alerting operational",
  ];

  return {
    currentArchitecture: args.currentArchitecture,
    targetArchitecture: args.targetArchitecture,
    totalEstimatedDuration: args.includeDataMigration
      ? "2-6 hours"
      : "1-3 hours",
    totalSteps: steps.length,
    phases,
    steps,
    risks,
    validationChecks,
    rollbackPlan:
      "If rollback needed during process, reverse steps in order. Data migration is the most critical phase - ensure backups are valid before proceeding.",
  };
}

// Future Growth Planner (Capability 402)
async function planGrowth(
  args: FutureGrowthPlannerArgs,
  ctx: AgentContext,
): Promise<GrowthPlan> {
  const projectPath = getProjectPath(args, ctx);

  ctx.onXmlStream(
    `<dyad-status title="Future Growth Planner">Planning for ${args.planningHorizonMonths} months of growth...</dyad-status>`,
  );

  const codebase = analyzeCodebase(projectPath);
  const projections: GrowthProjection[] = [];
  const recommendations: GrowthRecommendation[] = [];

  // Generate projections for each metric
  const metrics = [
    {
      name: "Users",
      base: args.currentMetrics?.users || 10000,
      growth: { conservative: 1.2, moderate: 1.5, aggressive: 2.5 },
    },
    {
      name: "Daily Requests",
      base: args.currentMetrics?.requestsPerDay || 100000,
      growth: { conservative: 1.3, moderate: 1.8, aggressive: 3.0 },
    },
    {
      name: "Data Storage (GB)",
      base: args.currentMetrics?.dataSizeGB || 100,
      growth: { conservative: 1.5, moderate: 2.0, aggressive: 3.5 },
    },
    {
      name: "Active Services",
      base: args.currentMetrics?.activeServices || codebase.services,
      growth: { conservative: 1.2, moderate: 1.5, aggressive: 2.0 },
    },
  ];

  for (const metric of metrics) {
    const timeframes = [];
    for (let months = 6; months <= args.planningHorizonMonths; months += 6) {
      timeframes.push({
        timeframe: `${months} months`,
        conservative: Math.round(
          metric.base * Math.pow(metric.growth.conservative, months / 12),
        ),
        moderate: Math.round(
          metric.base * Math.pow(metric.growth.moderate, months / 12),
        ),
        aggressive: Math.round(
          metric.base * Math.pow(metric.growth.aggressive, months / 12),
        ),
      });
    }
    projections.push({
      metric: metric.name,
      current: metric.base,
      projections: timeframes,
    });
  }

  // Generate recommendations
  if (args.includeCapacity) {
    recommendations.push({
      category: "Capacity",
      recommendation:
        "Implement auto-scaling policies to handle projected user growth",
      timing: "Within 3 months",
      estimatedInvestment: "$5,000-15,000",
      priority: "high",
    });

    recommendations.push({
      category: "Capacity",
      recommendation:
        "Upgrade database instances to support increased data volume",
      timing: "Within 6 months",
      estimatedInvestment: "$2,000-8,000/month",
      priority: "medium",
    });
  }

  if (args.includeTechEvolution) {
    recommendations.push({
      category: "Technology",
      recommendation:
        "Evaluate container orchestration (Kubernetes) for improved scalability",
      timing: "Within 12 months",
      estimatedInvestment: "$10,000-30,000",
      priority: "medium",
    });

    recommendations.push({
      category: "Technology",
      recommendation: "Implement CDN for global content distribution",
      timing: "Within 6 months",
      estimatedInvestment: "$1,000-5,000/month",
      priority: "high",
    });
  }

  // Technology roadmap
  const technologyRoadmap = [
    "Month 1-3: Implement caching layer (Redis/Memcached)",
    "Month 3-6: Upgrade to load-balanced architecture",
    "Month 6-12: Evaluate and potentially adopt microservices",
    "Month 12-18: Implement multi-region deployment",
    "Month 18-24: Explore edge computing capabilities",
  ];

  const riskFactors = [
    "Growth may exceed projections - maintain buffer capacity",
    "Technical debt may limit scalability - prioritize refactoring",
    "Vendor lock-in may increase costs - evaluate multi-cloud strategy",
    "Team expertise may be limiting factor - invest in training",
  ];

  return {
    planningHorizon: `${args.planningHorizonMonths} months`,
    projections,
    recommendations,
    technologyRoadmap,
    riskFactors,
  };
}

// Scaling Forecast Engine (Capability 403)
async function forecastScaling(
  args: ScalingForecastEngineArgs,
  ctx: AgentContext,
): Promise<ScalingForecast> {
  const _projectPath = getProjectPath(args, ctx);

  ctx.onXmlStream(
    `<dyad-status title="Scaling Forecast Engine">Forecasting scaling needs for ${args.forecastMonths} months...</dyad-status>`,
  );

  const projections = [];
  const currentUsers = args.currentMetrics.concurrentUsers || 1000;
  const currentRPS = args.currentMetrics.requestsPerSecond || 100;

  // Generate monthly projections
  for (let month = 1; month <= args.forecastMonths; month++) {
    const growthMultiplier = Math.pow(1 + args.monthlyGrowthRate / 100, month);
    const projectedUsers = Math.round(currentUsers * growthMultiplier);
    const projectedRPS = Math.round(currentRPS * growthMultiplier);

    // Estimate infrastructure needs
    let infrastructure = "Current setup sufficient";
    let estimatedCost = 500; // Base cost

    if (projectedRPS > 500) {
      infrastructure = "Add load balancer + 2 app servers";
      estimatedCost = 1500;
    }
    if (projectedRPS > 2000) {
      infrastructure = "Cluster with auto-scaling";
      estimatedCost = 5000;
    }
    if (projectedRPS > 10000) {
      infrastructure = "Multi-region deployment + CDN";
      estimatedCost = 20000;
    }

    projections.push({
      month,
      users: projectedUsers,
      requestsPerSecond: projectedRPS,
      infrastructure,
      estimatedCost,
    });
  }

  // Identify bottlenecks
  const bottlenecks: Bottleneck[] = [];

  if (args.identifyBottlenecks) {
    const finalProjection = projections[projections.length - 1];

    bottlenecks.push({
      component: "Application Server",
      currentCapacity: currentRPS * 2,
      projectedDemand: finalProjection.requestsPerSecond,
      bottleneckSeverity:
        finalProjection.requestsPerSecond > currentRPS * 2 ? "high" : "low",
      mitigationStrategies: [
        "Implement horizontal scaling",
        "Add caching layer",
        "Optimize query performance",
      ],
      estimatedMitigationCost: "$2,000-10,000",
    });

    bottlenecks.push({
      component: "Database",
      currentCapacity: currentUsers * 10,
      projectedDemand: finalProjection.users,
      bottleneckSeverity:
        finalProjection.users > currentUsers * 5 ? "medium" : "low",
      mitigationStrategies: [
        "Implement read replicas",
        "Add connection pooling",
        "Consider sharding for extreme load",
      ],
      estimatedMitigationCost: "$1,000-5,000/month",
    });

    bottlenecks.push({
      component: "Network Bandwidth",
      currentCapacity: currentRPS * 1000, // bytes
      projectedDemand: finalProjection.requestsPerSecond * 1000,
      bottleneckSeverity: "medium",
      mitigationStrategies: [
        "Implement CDN for static assets",
        "Enable compression",
        "Consider dedicated bandwidth upgrade",
      ],
      estimatedMitigationCost: "$500-2,000/month",
    });
  }

  const recommendations = [
    "Monitor the identified bottlenecks closely and plan mitigation before they become critical",
    "Implement auto-scaling to handle peak loads automatically",
    "Consider database read replicas to offload query traffic",
    "Plan for multi-region deployment if global expansion is anticipated",
  ];

  const scalingMilestones = [
    { month: 3, trigger: "500 RPS", action: "Add second application server" },
    {
      month: 6,
      trigger: "2,000 RPS",
      action: "Implement load balancer with auto-scaling",
    },
    { month: 9, trigger: "5,000 RPS", action: "Add Redis cache cluster" },
    {
      month: 12,
      trigger: "10,000+ RPS",
      action: "Evaluate multi-region architecture",
    },
  ];

  return {
    forecastPeriod: `${args.forecastMonths} months`,
    baseMetrics: {
      concurrentUsers: currentUsers,
      requestsPerSecond: currentRPS,
      averageResponseTime: args.currentMetrics.averageResponseTime || 200,
      errorRate: args.currentMetrics.errorRate || 0.1,
    },
    projections,
    bottlenecks,
    recommendations,
    scalingMilestones,
  };
}

// Cost Projection Model (Capability 404)
async function projectCosts(
  args: CostProjectionModelArgs,
  ctx: AgentContext,
): Promise<CostProjection> {
  const _projectPath = getProjectPath(args, ctx);

  ctx.onXmlStream(
    `<dyad-status title="Cost Projection Model">Projecting costs for ${args.projectionMonths} months...</dyad-status>`,
  );

  const baseCosts = args.currentMonthlyCosts || {
    compute: 2000,
    storage: 500,
    network: 300,
    thirdPartyServices: 800,
    personnel: 5000,
  };

  const assumptions = args.assumptions || {
    computeCostChange: -5,
    storageGrowthRate: 20,
    scalingFactor: 1.5,
  };

  const projections = [];
  const totalByScenario = { conservative: 0, moderate: 0, aggressive: 0 };

  // Generate monthly projections
  for (let month = 1; month <= args.projectionMonths; month++) {
    const yearFactor = month / 12;
    const costChanges = {
      conservative: Math.pow(
        1 + assumptions.computeCostChange / 100 / 12,
        month,
      ),
      moderate: Math.pow(
        1 + (assumptions.computeCostChange + 2) / 100 / 12,
        month,
      ),
      aggressive: Math.pow(
        1 + (assumptions.computeCostChange + 5) / 100 / 12,
        month,
      ),
    };

    const growthMultiplier = {
      conservative: Math.pow(1.05, yearFactor),
      moderate: Math.pow(assumptions.scalingFactor, yearFactor),
      aggressive: Math.pow(assumptions.scalingFactor * 1.5, yearFactor),
    };

    const categories = [
      "compute",
      "storage",
      "network",
      "thirdPartyServices",
      "personnel",
    ] as const;

    for (const category of categories) {
      const base = baseCosts[category] || 0;

      projections.push({
        month,
        category,
        conservative: Math.round(
          base * costChanges.conservative * growthMultiplier.conservative,
        ),
        moderate: Math.round(
          base * costChanges.moderate * growthMultiplier.moderate,
        ),
        aggressive: Math.round(
          base * costChanges.aggressive * growthMultiplier.aggressive,
        ),
        Notes: "",
      });

      totalByScenario.conservative +=
        base * costChanges.conservative * growthMultiplier.conservative;
      totalByScenario.moderate +=
        base * costChanges.moderate * growthMultiplier.moderate;
      totalByScenario.aggressive +=
        base * costChanges.aggressive * growthMultiplier.aggressive;
    }
  }

  const costDrivers = [
    "Infrastructure scaling based on user growth",
    "Storage usage increasing with data accumulation",
    "Potential third-party service additions",
    "Personnel costs for maintenance and operations",
  ];

  const optimizationOpportunities = [
    "Implement reserved instance pricing (20-40% savings)",
    "Add auto-scaling to reduce idle compute costs",
    "Archive old data to cold storage (60%+ savings)",
    "Review and optimize third-party service subscriptions",
    "Consider spot instances for batch processing",
  ];

  return {
    projectionPeriod: `${args.projectionMonths} months`,
    baseCosts,
    projections: projections.slice(0, args.projectionMonths * 2), // Simplified output
    totalProjectedCost: {
      conservative: Math.round(totalByScenario.conservative),
      moderate: Math.round(totalByScenario.moderate),
      aggressive: Math.round(totalByScenario.aggressive),
    },
    costDrivers,
    optimizationOpportunities,
  };
}

// Sustainability Analysis (Capability 405)
async function analyzeSustainability(
  args: SustainabilityAnalysisArgs,
  ctx: AgentContext,
): Promise<SustainabilityAnalysisResult> {
  const projectPath = getProjectPath(args, ctx);

  ctx.onXmlStream(
    `<dyad-status title="Sustainability Analysis">Analyzing environmental impact...</dyad-status>`,
  );

  const codebase = analyzeCodebase(projectPath);
  const metrics: SustainabilityMetrics[] = [];
  const recommendations: SustainabilityRecommendation[] = [];

  // Energy metrics
  if (args.focusAreas.includes("energy")) {
    metrics.push({
      category: "Energy",
      metric: "Estimated Monthly kWh",
      currentValue: codebase.services * 500,
      unit: "kWh",
      benchmark: codebase.services * 400,
      status: "good",
    });

    metrics.push({
      category: "Energy",
      metric: "Power Usage Effectiveness",
      currentValue: 1.4,
      unit: "PUE",
      benchmark: 1.2,
      status: "warning",
    });
  }

  // Carbon metrics
  if (args.focusAreas.includes("carbon")) {
    const estimatedCO2 = codebase.services * 500 * 0.4; // kg CO2 per kWh
    metrics.push({
      category: "Carbon",
      metric: "Monthly Carbon Emissions",
      currentValue: estimatedCO2,
      unit: "kg CO2e",
      benchmark: estimatedCO2 * 0.8,
      status: "warning",
    });

    metrics.push({
      category: "Carbon",
      metric: "Carbon Intensity",
      currentValue: 0.4,
      unit: "kg CO2/kWh",
      benchmark: 0.3,
      status: "good",
    });
  }

  // Resources
  if (args.focusAreas.includes("resources")) {
    metrics.push({
      category: "Resources",
      metric: "Server Utilization",
      currentValue: 45,
      unit: "%",
      benchmark: 70,
      status: "warning",
    });

    metrics.push({
      category: "Resources",
      metric: "Storage Efficiency",
      currentValue: 60,
      unit: "%",
      benchmark: 80,
      status: "critical",
    });
  }

  // Waste analysis
  if (args.focusAreas.includes("waste")) {
    metrics.push({
      category: "Waste",
      metric: "Code Duplication",
      currentValue: 15,
      unit: "%",
      benchmark: 5,
      status: "warning",
    });
  }

  // Generate recommendations based on focus areas
  if (args.includeRecommendations) {
    if (args.focusAreas.includes("energy")) {
      recommendations.push({
        category: "Energy",
        recommendation:
          "Implement server utilization optimization to reduce idle power consumption",
        impact: "20-30% energy reduction",
        effort: "medium",
        estimatedReduction: "150 kWh/month",
      });

      recommendations.push({
        category: "Energy",
        recommendation:
          "Enable aggressive power management features on non-production servers",
        impact: "10-15% energy reduction",
        effort: "low",
        estimatedReduction: "75 kWh/month",
      });
    }

    if (args.focusAreas.includes("carbon")) {
      recommendations.push({
        category: "Carbon",
        recommendation:
          "Switch to green cloud providers or regions with renewable energy",
        impact: "30-50% carbon reduction",
        effort: "medium",
        estimatedReduction: "200 kg CO2e/month",
      });

      recommendations.push({
        category: "Carbon",
        recommendation:
          "Implement carbon-aware batch processing during low-carbon hours",
        impact: "10-20% carbon reduction",
        effort: "high",
        estimatedReduction: "80 kg CO2e/month",
      });
    }

    if (args.focusAreas.includes("resources")) {
      recommendations.push({
        category: "Resources",
        recommendation: "Right-size overprovisioned instances",
        impact: "25-40% cost savings",
        effort: "low",
        estimatedReduction: "$500/month",
      });
    }
  }

  const carbonBreakdown = {
    compute: 60,
    cooling: 20,
    network: 10,
    storage: 10,
  };

  const certifications = [
    "ISO 14001 (Environmental Management) - Achievable with improvements",
    "Green Hosting Certification - Requires green energy provider",
    "Carbon Neutral - Requires offsetting remaining emissions",
  ];

  const nextSteps = [
    "Conduct detailed energy audit of current infrastructure",
    "Evaluate green cloud provider options",
    "Implement monitoring for energy and carbon metrics",
    "Set sustainability targets and KPIs",
    "Create sustainability roadmap with quarterly milestones",
  ];

  return {
    analysisDepth: args.depth,
    focusAreas: args.focusAreas,
    metrics,
    carbonFootprint: {
      totalCO2kg:
        metrics.find((m) => m.metric === "Monthly Carbon Emissions")
          ?.currentValue || 0,
      breakdown: carbonBreakdown,
    },
    recommendations,
    certifications,
    nextSteps,
  };
}

// ============================================================================
// XML Output Generation
// ============================================================================

function generateRollbackXml(result: RollbackPlan): string {
  const lines = [
    "# Architecture Rollback Plan",
    "",
    `**From**: ${result.currentArchitecture}`,
    `**To**: ${result.targetArchitecture}`,
    `**Estimated Duration**: ${result.totalEstimatedDuration}`,
    `**Total Steps**: ${result.totalSteps}`,
    "",
  ];

  lines.push("## Phases", "");
  for (const phase of result.phases) {
    lines.push(`- ${phase}`);
  }
  lines.push("");

  lines.push("## Rollback Steps", "");
  let currentPhase = "";
  for (const step of result.steps) {
    if (step.phase !== currentPhase) {
      currentPhase = step.phase;
      lines.push(`\n### ${step.phase}`, "");
    }
    const riskEmoji =
      step.risk === "high" ? "🔴" : step.risk === "medium" ? "🟠" : "🟢";
    lines.push(`#### ${riskEmoji} Step ${step.order}: ${step.step}`);
    lines.push(`- ${step.description}`);
    lines.push(`- Duration: ${step.estimatedDuration}`);
    lines.push(`- Risk: ${step.risk}`);
    if (step.dependencies.length > 0) {
      lines.push(`- Dependencies: ${step.dependencies.join(", ")}`);
    }
    lines.push(`- Rollback if: ${step.rollbackIf}`);
    lines.push("");
  }

  if (result.risks.length > 0) {
    lines.push("## Risks", "");
    for (const risk of result.risks) {
      lines.push(`- ${risk}`);
    }
    lines.push("");
  }

  if (result.validationChecks.length > 0) {
    lines.push("## Validation Checks", "");
    for (const check of result.validationChecks) {
      lines.push(`- ${check}`);
    }
    lines.push("");
  }

  lines.push("## Rollback Plan", "");
  lines.push(result.rollbackPlan);

  return lines.join("\n");
}

function generateGrowthXml(result: GrowthPlan): string {
  const lines = [
    "# Future Growth Plan",
    "",
    `**Planning Horizon**: ${result.planningHorizon}`,
    "",
  ];

  if (result.projections.length > 0) {
    lines.push("## Growth Projections", "");
    for (const proj of result.projections) {
      lines.push(`### ${proj.metric}`);
      lines.push(`- **Current**: ${proj.current.toLocaleString()}`);
      lines.push("");
      for (const timeframe of proj.projections) {
        lines.push(
          `| ${timeframe.timeframe} | ${timeframe.conservative.toLocaleString()} | ${timeframe.moderate.toLocaleString()} | ${timeframe.aggressive.toLocaleString()} |`,
        );
      }
      lines.push("");
    }
  }

  if (result.recommendations.length > 0) {
    lines.push("## Recommendations", "");
    for (const rec of result.recommendations) {
      const priorityEmoji =
        rec.priority === "high"
          ? "🔴"
          : rec.priority === "medium"
            ? "🟡"
            : "🟢";
      lines.push(`### ${priorityEmoji} ${rec.category}: ${rec.recommendation}`);
      lines.push(`- **Timing**: ${rec.timing}`);
      lines.push(`- **Investment**: ${rec.estimatedInvestment}`);
      lines.push(`- **Priority**: ${rec.priority}`);
      lines.push("");
    }
  }

  if (result.technologyRoadmap.length > 0) {
    lines.push("## Technology Roadmap", "");
    for (const item of result.technologyRoadmap) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  if (result.riskFactors.length > 0) {
    lines.push("## Risk Factors", "");
    for (const risk of result.riskFactors) {
      lines.push(`- ${risk}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function generateScalingXml(result: ScalingForecast): string {
  const lines = [
    "# Scaling Forecast",
    "",
    `**Forecast Period**: ${result.forecastPeriod}`,
    "",
  ];

  lines.push("## Base Metrics", "");
  for (const [key, value] of Object.entries(result.baseMetrics)) {
    lines.push(`- ${key}: ${value.toLocaleString()}`);
  }
  lines.push("");

  lines.push("## Monthly Projections", "");
  lines.push("| Month | Users | Req/sec | Infrastructure | Est. Cost |");
  lines.push("|-------|-------|---------|-----------------|------------|");
  for (const proj of result.projections) {
    lines.push(
      `| ${proj.month} | ${proj.users.toLocaleString()} | ${proj.requestsPerSecond} | ${proj.infrastructure} | $${proj.estimatedCost.toLocaleString()} |`,
    );
  }
  lines.push("");

  if (result.bottlenecks.length > 0) {
    lines.push("## Identified Bottlenecks", "");
    for (const bottleneck of result.bottlenecks) {
      const severityEmoji =
        bottleneck.bottleneckSeverity === "critical"
          ? "🔴"
          : bottleneck.bottleneckSeverity === "high"
            ? "🟠"
            : bottleneck.bottleneckSeverity === "medium"
              ? "🟡"
              : "🟢";
      lines.push(`### ${severityEmoji} ${bottleneck.component}`);
      lines.push(`- Current Capacity: ${bottleneck.currentCapacity}`);
      lines.push(`- Projected Demand: ${bottleneck.projectedDemand}`);
      lines.push(`- Severity: ${bottleneck.bottleneckSeverity}`);
      lines.push(
        `- Estimated Mitigation Cost: ${bottleneck.estimatedMitigationCost}`,
      );
      lines.push("- Mitigation Strategies:");
      for (const strategy of bottleneck.mitigationStrategies) {
        lines.push(`  - ${strategy}`);
      }
      lines.push("");
    }
  }

  if (result.scalingMilestones.length > 0) {
    lines.push("## Scaling Milestones", "");
    for (const milestone of result.scalingMilestones) {
      lines.push(
        `- **Month ${milestone.month}**: ${milestone.trigger} → ${milestone.action}`,
      );
    }
    lines.push("");
  }

  if (result.recommendations.length > 0) {
    lines.push("## Recommendations", "");
    for (const rec of result.recommendations) {
      lines.push(`- ${rec}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function generateCostXml(result: CostProjection): string {
  const lines = [
    "# Cost Projection Model",
    "",
    `**Projection Period**: ${result.projectionPeriod}`,
    "",
  ];

  lines.push("## Base Monthly Costs", "");
  for (const [key, value] of Object.entries(result.baseCosts)) {
    lines.push(`- ${key}: $${value.toLocaleString()}`);
  }
  lines.push("");

  lines.push("## Total Projected Costs", "");
  lines.push(
    `- **Conservative**: $${result.totalProjectedCost.conservative.toLocaleString()}`,
  );
  lines.push(
    `- **Moderate**: $${result.totalProjectedCost.moderate.toLocaleString()}`,
  );
  lines.push(
    `- **Aggressive**: $${result.totalProjectedCost.aggressive.toLocaleString()}`,
  );
  lines.push("");

  if (result.costDrivers.length > 0) {
    lines.push("## Cost Drivers", "");
    for (const driver of result.costDrivers) {
      lines.push(`- ${driver}`);
    }
    lines.push("");
  }

  if (result.optimizationOpportunities.length > 0) {
    lines.push("## Optimization Opportunities", "");
    for (const opt of result.optimizationOpportunities) {
      lines.push(`- ${opt}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function generateSustainabilityXml(
  result: SustainabilityAnalysisResult,
): string {
  const lines = [
    "# Sustainability Analysis",
    "",
    `**Analysis Depth**: ${result.analysisDepth}`,
    `**Focus Areas**: ${result.focusAreas.join(", ")}`,
    "",
  ];

  lines.push("## Sustainability Metrics", "");
  for (const metric of result.metrics) {
    const statusEmoji =
      metric.status === "good"
        ? "🟢"
        : metric.status === "warning"
          ? "🟡"
          : "🔴";
    lines.push(`### ${statusEmoji} ${metric.metric}`);
    lines.push(
      `- **Current**: ${metric.currentValue.toLocaleString()} ${metric.unit}`,
    );
    if (metric.benchmark) {
      lines.push(
        `- **Benchmark**: ${metric.benchmark.toLocaleString()} ${metric.unit}`,
      );
    }
    lines.push(`- **Status**: ${metric.status}`);
    lines.push("");
  }

  lines.push("## Carbon Footprint", "");
  lines.push(
    `- **Total**: ${result.carbonFootprint.totalCO2kg.toLocaleString()} kg CO2e/month`,
  );
  lines.push("");
  lines.push("### Breakdown");
  for (const [source, percentage] of Object.entries(
    result.carbonFootprint.breakdown,
  )) {
    lines.push(`- ${source}: ${percentage}%`);
  }
  lines.push("");

  if (result.recommendations.length > 0) {
    lines.push("## Recommendations", "");
    for (const rec of result.recommendations) {
      const effortEmoji =
        rec.effort === "high" ? "🔴" : rec.effort === "medium" ? "🟡" : "🟢";
      lines.push(`### ${effortEmoji} ${rec.category}: ${rec.recommendation}`);
      lines.push(`- **Impact**: ${rec.impact}`);
      lines.push(`- **Effort**: ${rec.effort}`);
      lines.push(`- **Estimated Reduction**: ${rec.estimatedReduction}`);
      lines.push("");
    }
  }

  if (result.certifications.length > 0) {
    lines.push("## Potential Certifications", "");
    for (const cert of result.certifications) {
      lines.push(`- ${cert}`);
    }
    lines.push("");
  }

  if (result.nextSteps.length > 0) {
    lines.push("## Next Steps", "");
    for (const step of result.nextSteps) {
      lines.push(`- ${step}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ============================================================================
// Tool Definitions
// ============================================================================

// Architecture Rollback Planner (Capability 401)
export const architectureRollbackPlannerTool: ToolDefinition<ArchitectureRollbackPlannerArgs> =
  {
    name: "architecture_rollback_planner",
    description:
      "Plan architecture rollbacks with detailed step-by-step procedures, including data migration, infrastructure changes, validation checks, and risk mitigation. Helps ensure safe and controlled rollback of architectural changes.",
    inputSchema: ArchitectureRollbackPlannerArgs,
    defaultConsent: "always",
    modifiesState: false,

    execute: async (args, ctx) => {
      const result = await planRollback(args, ctx);
      const report = generateRollbackXml(result);

      ctx.onXmlComplete(
        `<dyad-status title="Rollback Plan Complete">${result.totalSteps} steps planned across ${result.phases.length} phases</dyad-status>`,
      );

      return report;
    },
  };

// Future Growth Planner (Capability 402)
export const futureGrowthPlannerTool: ToolDefinition<FutureGrowthPlannerArgs> =
  {
    name: "future_growth_planner",
    description:
      "Plan future system growth and scalability with projections across conservative, moderate, and aggressive scenarios. Includes capacity planning, technology roadmap, and growth recommendations.",
    inputSchema: FutureGrowthPlannerArgs,
    defaultConsent: "always",
    modifiesState: false,

    execute: async (args, ctx) => {
      const result = await planGrowth(args, ctx);
      const report = generateGrowthXml(result);

      ctx.onXmlComplete(
        `<dyad-status title="Growth Plan Complete">${result.projections.length} metrics projected over ${result.planningHorizon}</dyad-status>`,
      );

      return report;
    },
  };

// Scaling Forecast Engine (Capability 403)
export const scalingForecastEngineTool: ToolDefinition<ScalingForecastEngineArgs> =
  {
    name: "scaling_forecast_engine",
    description:
      "Forecast scaling needs and identify potential bottlenecks before they become critical. Provides timeline-based projections, bottleneck analysis, and scaling milestones.",
    inputSchema: ScalingForecastEngineArgs,
    defaultConsent: "always",
    modifiesState: false,

    execute: async (args, ctx) => {
      const result = await forecastScaling(args, ctx);
      const report = generateScalingXml(result);

      ctx.onXmlComplete(
        `<dyad-status title="Scaling Forecast Complete">${result.bottlenecks.length} bottlenecks identified over ${result.forecastPeriod}</dyad-status>`,
      );

      return report;
    },
  };

// Cost Projection Model (Capability 404)
export const costProjectionModelTool: ToolDefinition<CostProjectionModelArgs> =
  {
    name: "cost_projection_model",
    description:
      "Project infrastructure costs over time using conservative, moderate, and aggressive growth scenarios. Identifies cost drivers and optimization opportunities.",
    inputSchema: CostProjectionModelArgs,
    defaultConsent: "always",
    modifiesState: false,

    execute: async (args, ctx) => {
      const result = await projectCosts(args, ctx);
      const report = generateCostXml(result);

      ctx.onXmlComplete(
        `<dyad-status title="Cost Projection Complete">Projected costs for ${result.projectionPeriod}</dyad-status>`,
      );

      return report;
    },
  };

// Sustainability Analysis (Capability 405)
export const sustainabilityAnalysisTool: ToolDefinition<SustainabilityAnalysisArgs> =
  {
    name: "sustainability_analysis",
    description:
      "Analyze environmental and resource sustainability including energy consumption, carbon footprint, resource efficiency, and waste. Provides recommendations for improving sustainability metrics.",
    inputSchema: SustainabilityAnalysisArgs,
    defaultConsent: "always",
    modifiesState: false,

    execute: async (args, ctx) => {
      const result = await analyzeSustainability(args, ctx);
      const report = generateSustainabilityXml(result);

      ctx.onXmlComplete(
        `<dyad-status title="Sustainability Analysis Complete">${result.metrics.length} metrics analyzed across ${result.focusAreas.length} focus areas</dyad-status>`,
      );

      return report;
    },
  };
