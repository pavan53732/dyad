# Autonomous Tools Ecosystem

The Autonomous Tools Ecosystem is a collection of advanced AI-powered tools designed to automate software development workflows. These tools can work independently or be orchestrated together by the `autonomous_software_engineer` to accomplish complex development tasks from planning to PR submission.

## Overview

The ecosystem consists of six autonomous tools that form a complete development pipeline:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Autonomous Tools Pipeline                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────┐  │
│  │  execute_       │───▶│ autonomous_      │───▶│ autonomous_fix_loop │  │
│  │  project_plan   │    │ software_engineer│    │ (Self-Healing)      │  │
│  └─────────────────┘    └─────────────────┘    └─────────────────────┘  │
│                                  │                        │                  │
│                                  ▼                        ▼                  │
│                          ┌─────────────────┐    ┌─────────────────────┐     │
│                          │ git_commit_     │◀───│ autonomous_test_   │     │
│                          │ and_push        │    │ generator           │     │
│                          └─────────────────┘    └─────────────────────┘     │
│                                  │                                            │
│                                  ▼                                            │
│                          ┌─────────────────┐                                 │
│                          │ autonomous_     │                                 │
│                          │ pull_request    │                                 │
│                          └─────────────────┘                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Tools Reference

### 1. autonomous_test_generator

**Purpose:** Auto-generates and executes E2E tests using Playwright to verify code behavior.

**File:** [`src/pro/main/ipc/handlers/local_agent/tools/autonomous_test_generator.ts`](src/pro/main/ipc/handlers/local_agent/tools/autonomous_test_generator.ts)

#### What It Does

1. Analyzes the target component or file
2. Uses AI to generate a Playwright test fixture and spec file
3. Executes the generated test against the built application
4. Reports pass/fail status with detailed output

#### How to Use

```typescript
{
  tool: "autonomous_test_generator",
  args: {
    testName: "counter_verification",           // Unique name for the test
    componentPath: "src/components/Counter.tsx", // Path to component being tested
    behaviorToTest: "Clicking increment button increases count by 1" // What to verify
  }
}
```

#### Parameters

| Parameter        | Type   | Required | Description                                                    |
| ---------------- | ------ | -------- | -------------------------------------------------------------- |
| `testName`       | string | Yes      | Unique name for the test file (e.g., `'counter_verification'`) |
| `componentPath`  | string | Yes      | Relative path to the component or file to be tested            |
| `behaviorToTest` | string | Yes      | Description of the behavior the test should verify             |

#### Output Files

- **Fixture:** `e2e-tests/fixtures/engine/local-agent/{testName}.ts`
- **Spec:** `e2e-tests/{testName}.spec.ts`

#### Example Usage

```
User: "Write a test that verifies clicking the submit button validates the form"

Agent calls:
{
  tool: "autonomous_test_generator",
  args: {
    testName: "form_validation",
    componentPath: "src/components/Form.tsx",
    behaviorToTest: "Submit button triggers form validation and shows error messages for invalid fields"
  }
}
```

---

### 2. autonomous_fix_loop

**Purpose:** Self-heals TypeScript errors by running type checks, analyzing errors, and automatically applying fixes in a loop.

**File:** [`src/pro/main/ipc/handlers/local_agent/tools/autonomous_fix_loop.ts`](src/pro/main/ipc/handlers/local_agent/tools/autonomous_fix_loop.ts)

#### What It Does

1. Runs TypeScript type checks (`npm run ts`)
2. Analyzes any errors found
3. Uses AI to generate fix suggestions
4. Applies fixes using search/replace blocks
5. Repeats until no errors remain or max iterations reached

#### How to Use

```typescript
{
  tool: "autonomous_fix_loop",
  args: {
    maxIterations: 3  // Maximum fix-and-check iterations (default: 3)
  }
}
```

#### Parameters

| Parameter       | Type   | Required | Default | Description                                |
| --------------- | ------ | -------- | ------- | ------------------------------------------ |
| `maxIterations` | number | No       | 3       | Maximum number of fix-and-check iterations |

#### Behavior

- **Success:** Returns "No type errors found. Project is clean."
- **Partial Fix:** Returns summary of fixed files
- **Stall:** Stops if no progress made in an iteration
- **Max Reached:** Reports total files fixed and remaining errors

#### Example Usage

```
User: "Fix all the TypeScript errors in the project"

Agent calls:
{
  tool: "autonomous_fix_loop",
  args: {
    maxIterations: 5
  }
}

// Output: Iteratively fixes TypeScript errors across files
```

---

### 3. git_commit_and_push

**Purpose:** Stages all changes, commits with a message, and pushes to the connected GitHub repository.

**File:** [`src/pro/main/ipc/handlers/local_agent/tools/git_commit_and_push.ts`](src/pro/main/ipc/handlers/local_agent/tools/git_commit_and_push.ts)

#### What It Does

1. Stages all uncommitted changes (`git add -A`)
2. Commits with the provided message
3. Gets current branch name
4. Pushes to origin remote

#### How to Use

```typescript
{
  tool: "git_commit_and_push",
  args: {
    message: "feat: Add new user authentication flow"  // Commit message
  }
}
```

#### Parameters

| Parameter | Type   | Required | Description                               |
| --------- | ------ | -------- | ----------------------------------------- |
| `message` | string | Yes      | The commit message explaining the changes |

#### Requirements

- GitHub must be connected in settings
- Changes must compile and be ready to push

#### Example Usage

```
User: "Commit my changes with a descriptive message"

Agent calls:
{
  tool: "git_commit_and_push",
  args: {
    message: "feat: Implement user dashboard with analytics\n\n- Add dashboard layout\n- Integrate analytics API\n- Add loading states"
  }
}
```

---

### 4. execute_project_plan

**Purpose:** Reads a project plan (TODO.md) and executes each task sequentially with automatic error fixing and testing.

**File:** [`src/pro/main/ipc/handlers/local_agent/tools/execute_project_plan.ts`](src/pro/main/ipc/handlers/local_agent/tools/execute_project_plan.ts)

#### What It Does

1. Reads the project plan file (default: `TODO.md`)
2. Parses tasks from markdown format (supports `- [ ]`, `- [x]`, `TODO:`)
3. Executes each pending task:
   - Analyzes the task
   - Writes required code
   - Runs type checks
   - Auto-fixes TypeScript errors
   - Generates and runs tests
4. Updates the plan file with completion status
5. Reports progress after each task

#### How to Use

```typescript
{
  tool: "execute_project_plan",
  args: {
    planPath: "TODO.md",      // Path to project plan (default: TODO.md)
    maxIterations: 10,        // Max tasks to execute (default: 10)
    autoFixErrors: true,      // Auto-fix TS errors (default: true)
    generateTests: true       // Generate/run tests (default: true)
  }
}
```

#### Parameters

| Parameter       | Type    | Required | Default   | Description                                         |
| --------------- | ------- | -------- | --------- | --------------------------------------------------- |
| `planPath`      | string  | No       | "TODO.md" | Path to the project plan file                       |
| `maxIterations` | number  | No       | 10        | Maximum number of task iterations                   |
| `autoFixErrors` | boolean | No       | true      | Automatically fix TypeScript errors after each task |
| `generateTests` | boolean | No       | true      | Generate and run tests after each task              |

#### Supported Task Formats

```markdown
# TODO.md

## Phase 1: Setup

- [ ] Initialize project structure
- [ ] Set up testing framework

## Phase 2: Features

- [ ] Implement user authentication
- [ ] Create dashboard UI
```

Or:

```markdown
TODO: Initialize project structure
TODO: Set up testing framework
TODO: Implement user authentication
```

#### Example Usage

```
User: "Execute my project plan in TODO.md"

Agent calls:
{
  tool: "execute_project_plan",
  args: {
    planPath: "TODO.md",
    maxIterations: 5,
    autoFixErrors: true,
    generateTests: true
  }
}
```

---

### 5. autonomous_pull_request

**Purpose:** Creates GitHub Pull Requests automatically, including AI-generated descriptions based on commit history.

**File:** [`src/pro/main/ipc/handlers/local_agent/tools/autonomous_pull_request.ts`](src/pro/main/ipc/handlers/local_agent/tools/autonomous_pull_request.ts)

#### What It Does

1. Checks for uncommitted changes and commits them if needed
2. Pushes the current branch to origin
3. Uses AI to generate PR title and description based on:
   - Recent commit messages
   - Changed files
   - Branch name
4. Creates or updates the pull request on GitHub
5. Optionally adds labels

#### How to Use

```typescript
{
  tool: "autonomous_pull_request",
  args: {
    title: "Feature: Add user authentication",     // Optional (auto-generated if not provided)
    body: "This PR adds OAuth login...",            // Optional (auto-generated if not provided)
    labels: ["enhancement", "security"],           // Optional
    baseBranch: "main",                             // Optional (default: main)
    commitMessage: "chore: Prepare for PR"          // Optional
  }
}
```

#### Parameters

| Parameter       | Type     | Required | Default        | Description                                     |
| --------------- | -------- | -------- | -------------- | ----------------------------------------------- |
| `title`         | string   | No       | Auto-generated | PR title                                        |
| `body`          | string   | No       | Auto-generated | PR description body                             |
| `labels`        | string[] | No       | None           | Labels to add to the PR                         |
| `baseBranch`    | string   | No       | "main"         | Base branch to merge into                       |
| `commitMessage` | string   | No       | Auto-generated | Commit message if there are uncommitted changes |

#### AI-Generated Description

When not provided, the tool generates:

- **Title:** Imperative mood, 50 chars or less
- **Body:**
  - Brief summary (2-3 sentences)
  - List of recent commits
  - List of changed files with status

#### Requirements

- GitHub must be connected in settings
- App must be linked to a GitHub repository

#### Example Usage

```
User: "Create a PR for this feature branch"

Agent calls:
{
  tool: "autonomous_pull_request",
  args: {
    labels: ["feat", "needs-review"],
    baseBranch: "main"
  }
}
```

---

### 6. autonomous_software_engineer

**Purpose:** The ultimate meta-orchestrator that combines all tools into a complete development pipeline.

**File:** [`src/pro/main/ipc/handlers/local_agent/tools/autonomous_software_engineer.ts`](src/pro/main/ipc/handlers/local_agent/tools/autonomous_software_engineer.ts)

#### What It Does

The `autonomous_software_engineer` orchestrates the entire development lifecycle:

1. **Planning Phase**
   - Reads existing plan from `planPath` or
   - Generates a new TODO.md plan using AI

2. **Execution Phase** (for each task)
   - Uses AI as a sub-agent to implement the task
   - Has access to: `write_file`, `edit_file`, `search_replace`, `read_file`, `list_files`, `code_search`

3. **Heal Phase**
   - Runs `autonomous_fix_loop` to fix any TypeScript errors

4. **Verify Phase**
   - Runs `autonomous_test_generator` to verify the implementation

5. **Submission Phase**
   - Calls `git_commit_and_push` to commit all changes
   - Calls `autonomous_pull_request` to create a PR

#### How to Use

```typescript
{
  tool: "autonomous_software_engineer",
  args: {
    goal: "Implement user authentication with OAuth",  // High-level goal
    planPath: "TODO.md",                               // Plan file path
    maxTasks: 5                                        // Max tasks to execute
  }
}
```

#### Parameters

| Parameter  | Type   | Required | Default   | Description                                         |
| ---------- | ------ | -------- | --------- | --------------------------------------------------- |
| `goal`     | string | Yes      | -         | The high-level goal or feature request to implement |
| `planPath` | string | No       | "TODO.md" | Path to the project plan file                       |
| `maxTasks` | number | No       | 5         | Maximum number of tasks to execute from the plan    |

#### Pipeline Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Planning   │───▶│  Execution  │───▶│    Heal     │───▶│   Verify    │
│  (Safety)   │    │  (Gated)    │    │ (Fix Loop)  │    │ (Sim Audit) │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │                  │
       ▼                  ▼                  ▼                  ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ Institutional│   │ Deterministic│   │ Fact Grounding│   │ Extreme      │
│ Memory Loop  │   │ Dispatcher   │   │ Engine        │   │ Simulation   │
└──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
```

#### Example Usage

```typescript
{
  tool: "autonomous_software_engineer",
  args: {
    goal: "Implement dark mode feature",
    planPath: "TODO.md",
    maxTasks: 10
  }
}
```

---

## The Aegis Safety Cluster (Level 7.0)

These tools provide the deterministic gatekeeping and semantic grounding that define Level 7.0 Sovereignty.

### 7. deterministic_dispatcher

**Purpose:** Acts as a hard gatekeeper (Mechanism 171) for all state-changing tool calls.

**File:** [`src/pro/main/ipc/handlers/local_agent/tools/deterministic_dispatcher.ts`](src/pro/main/ipc/handlers/local_agent/tools/deterministic_dispatcher.ts)

- **Verification**: It parses the mission plan (TODO.md) and verifies that every tool call aligns with an uncompleted task.
- **Mission Lock**: If the agent attempts an out-of-scope action, the dispatcher returns an `ACCESS DENIED` error, blocking the LLM from making unauthorized changes.

### 8. fact_grounding_engine

**Purpose:** Mathematically grounds AI claims in the physical codebase (Mechanism 7).

**File:** [`src/pro/main/ipc/handlers/local_agent/tools/fact_grounding_engine.ts`](src/pro/main/ipc/handlers/local_agent/tools/fact_grounding_engine.ts)

- **Bayesian Verification**: Cross-references claims with the `knowledge_base.json` and the source code (via Ripgrep).
- **Confidence Scoring**: Returns a grounding score. Low-score claims are flagged as potential hallucinations.

### 9. aegis_containment_coordinator

**Purpose:** Triggers emergency protocols if risk signals exceed defined thresholds (Mechanism 181).

**File:** [`src/pro/main/ipc/handlers/local_agent/tools/aegis_containment_coordinator.ts`](src/pro/main/ipc/handlers/local_agent/tools/aegis_containment_coordinator.ts)

- **Quotas**: Enforces MB/token limits on tool calls.
- **Termination**: Can terminate a session or revoke tool access if "Predictive Drift" or "Hallucination" signals are critical.

---

## Intelligence & Reasoning Clusters

### 10. metacognition

**Purpose:** Performs higher-order reasoning and monitors for mission drift (Mechanism 151).

**File:** [`src/pro/main/ipc/handlers/local_agent/tools/metacognition.ts`](src/pro/main/ipc/handlers/local_agent/tools/metacognition.ts)

- **Simulation Branching**: Predicts outcomes before execution to detect drift.
- **Theory of Mind**: Analyzes user intent for ambiguity or conflicting instructions.

### 11. self_improver / failure_repository

**Purpose:** Implements Institutional Memory (Mechanism 61) to prevent repetitive errors.

**File:** [`src/pro/main/ipc/handlers/local_agent/tools/self_improver.ts`](src/pro/main/ipc/handlers/local_agent/tools/self_improver.ts)

- **Anti-Pattern Logging**: Records technical failures in `.dyad/failure_repository.json`.
- **Recursive Learning**: Future planning cycles ingest these anti-patterns to hearth the agent's strategy against historical pitfalls.

---

## Pipeline Flow Examples

### Example 1: Quick Fix

```
User: "Fix all TypeScript errors"

1. autonomous_fix_loop({ maxIterations: 3 })
   └─> Fixed 5 files, 0 errors remaining
```

### Example 2: Feature with Testing

```
User: "Add a login form component with tests"

1. write_file({ path: "src/components/LoginForm.tsx", content: "..." })
2. autonomous_fix_loop({ maxIterations: 2 })
3. autonomous_test_generator({
     testName: "login_form",
     componentPath: "src/components/LoginForm.tsx",
     behaviorToTest: "Form validates email and password fields"
   })
4. git_commit_and_push({ message: "feat: Add login form component" })
```

### Example 3: Full Autonomous Development

```
User: "Build a new user profile page"

1. autonomous_software_engineer({
     goal: "Build user profile page",
     planPath: "TODO.md",
     maxTasks: 8
   })
   │
   ├─> Planning: Generate TODO.md
   │
   ├─> Task 1: Create profile component
   │   ├─> write_file(...)
   │   ├─> autonomous_fix_loop
   │   └─> autonomous_test_generator
   │
   ├─> Task 2: Add profile styles
   │   ├─> edit_file(...)
   │   ├─> autonomous_fix_loop
   │   └─> autonomous_test_generator
   │
   ├─> ... (more tasks)
   │
   └─> Submission:
       ├─> git_commit_and_push
       └─> autonomous_pull_request
```

---

## Best Practices

### 1. Start Small

- Use `autonomous_fix_loop` for quick error fixes
- Use `autonomous_test_generator` to verify specific behaviors

### 2. Use execute_project_plan for Medium Tasks

- Create a detailed TODO.md
- Let the tool execute sequentially
- Monitor progress via `<dyad-status>` tags

### 3. Use autonomous_software_engineer for Complex Features

- Provide a clear, high-level goal
- Trust the pipeline end-to-end
- Review the generated PR

### 4. Monitor Output

- All tools stream status via `<dyad-status>` XML tags
- Check the chat for progress updates
- Review test results before accepting

---

## Troubleshooting

### autonomous_test_generator fails

- Ensure `npm run build` has been run
- Check component path is correct
- Verify Playwright is installed

### autonomous_fix_loop stalls

- Increase `maxIterations`
- Manually review the problematic file
- The error may require human intervention

### git_commit_and_push fails

- Check GitHub is connected in settings
- Ensure no merge conflicts
- Verify branch name is valid

### autonomous_pull_request fails

- Verify GitHub repository is linked to the app
- Check access token permissions
- Ensure base branch exists

---

## Related Files

- [Tool Definitions](src/pro/main/ipc/handlers/local_agent/tool_definitions.ts)
- [Local Agent Tools](src/pro/main/ipc/handlers/local_agent/tools/)
- [E2E Testing Rules](rules/e2e-testing.md)
- [Git Workflow Rules](rules/git-workflow.md)

---

## Knowledge Integration Layer (KIL)

The Knowledge Integration Layer provides unified access to all knowledge sources in Dyad. It enables cross-module queries and persistent learning from architecture decisions.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    KNOWLEDGE INTEGRATION LAYER                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ Query        │  │ Knowledge    │  │ Learning                 │ │
│  │ Orchestrator │  │ Aggregator   │  │ Repository               │ │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘ │
│         │                 │                        │                │
│         └─────────────────┼────────────────────────┘                │
│                           │                                         │
│         ┌─────────────────┼─────────────────┐                       │
│         │                 │                 │                       │
│         ▼                 ▼                 ▼                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Knowledge    │  │ Vector       │  │ Dependency   │              │
│  │ Graph        │  │ Memory       │  │ Graph        │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### IPC Channels

The KIL exposes the following IPC channels for renderer-to-main communication:

| Channel | Purpose |
|---------|---------|
| `kil:query` | Execute a unified knowledge query across sources |
| `kil:query-similar` | Find similar entities across all sources |
| `kil:record-decision` | Record an architecture decision with context |
| `kil:get-recommendations` | Get recommendations based on past decisions |
| `kil:build-context` | Build aggregated context for a task |
| `kil:clear-cache` | Clear the query cache |
| `kil:get-stats` | Get cache and query statistics |

### Knowledge Sources

| Source | Module | Data Types |
|--------|--------|------------|
| **Code Graph** | `knowledge_graph/` | Entities, relationships, code structure |
| **Vector Memory** | `vector_memory/` | Embeddings, semantic search results |
| **Dependency Graph** | `dependency_analyzer.ts` | Package dependencies, version info |
| **Architecture** | `architecture_knowledge_graph.ts` | Patterns, decisions, constraints |
| **Reasoning** | `reasoning_infrastructure.ts` | Traces, insights, learned patterns |

### Query Example

```typescript
// Execute a unified knowledge query
const result = await ipcRenderer.invoke('kil:query', {
  query: 'authentication implementation',
  sources: ['code_graph', 'vector_memory', 'architecture'],
  maxResults: 20,
  rankingStrategy: 'hybrid'
});

// Result contains aggregated results from all sources
result.results.forEach(r => {
  console.log(`${r.source}: ${r.entity.name} (score: ${r.score})`);
});
```

### Decision Recording

```typescript
// Record an architecture decision for learning
await ipcRenderer.invoke('kil:record-decision', {
  decision: 'Use JWT for authentication',
  context: {
    requirements: ['stateless', 'scalable', 'mobile-friendly'],
    constraints: ['no server-side sessions']
  },
  alternatives: ['Session cookies', 'OAuth only'],
  selectedOption: 'JWT with refresh tokens',
  rationale: 'Best balance of security and scalability',
  confidence: 0.85
});

// Later, get recommendations based on similar decisions
const recommendations = await ipcRenderer.invoke('kil:get-recommendations', {
  context: {
    requirements: ['stateless', 'scalable']
  }
});
```

### Benefits

1. **Unified Access**: Single interface for all knowledge sources
2. **Cross-Source Reasoning**: Find related entities across modules
3. **Persistent Learning**: Learn from past architecture decisions
4. **Context Enrichment**: Build rich context for AI tools
5. **Recommendation Engine**: Get suggestions based on successful patterns
