# AI Sovereignty & Safety (Level 7.0)

This document outlines the safety protocols and architectural constraints that ensure Dyad operates with **Total Autonomous Sovereignty** while maintaining strict alignment with user goals.

## The Deterministic Dispatcher

Dyad's core engineering loop (`autonomous_software_engineer.ts`) is gated by a **Deterministic Dispatcher**.

- **Task Alignment**: No state-changing tool (e.g., `write_file`, `edit_file`, `tool_synthesizer`) can be executed unless the dispatcher verifies it aligns with an active, uncompleted task in `TODO.md` (or the mission plan path provided).
- **Physical State Machine**: The dispatcher is implemented as an un-influenceable layer (Mechanism 171) that physically blocks LLM output if it deviates from the plan.
- **Plan Healing**: If the dispatcher detects a mismatch, it triggers a plan repair cycle (Mechanism 145) to either align the task list or correct the agent's trajectory.

## Aegis Hardening Protocols

The "Aegis" layer provides a defense-in-depth approach to AI safety:

1. **Metacognitive Drift Monitoring (Mechanism 151)**: The system continuously monitors its own reasoning traces for "semantic drift" away from the original goal.
2. **Bayesian Hallucination Detection (Mechanism 7)**: Autonomous outputs are cross-referenced with local facts (via `fact_grounding_engine.ts`) to estimate the probability of hallucination.
3. **Emergency Containment (Mechanism 181)**: The `aegis_containment_coordinator.ts` can restricted tool access or terminate sessions if safety violations or quota overruns are detected.

## Mission Lock (Hard Constraint)

To maintain the integrity of the Sovereignty layer, the following "Mission Lock" rule is enforced:

- **Loop Integrity**: Any modification to the `autonomous_software_engineer.ts` loop or the `deterministic_dispatcher.ts` logic requires a mandatory Security & Sovereignty Audit.
- **Plan Primacy**: The `TODO.md` is the "Source of Truth" for all autonomous actions. If a task isn't in the plan, it DOES NOT EXIST for the dispatcher.

## Tool Synthesis Protocols

When the agent synthesizes new tools via `tool_synthesizer.ts`, strict security bounds apply:

- **Path Normalization**: All generated tool files must reside strictly within `src/pro/main/ipc/handlers/local_agent/tools/`.
- **Validation**: Tool names are restricted to snake*case (`/^[a-z0-9*]+$/`) and paths are normalized to prevent traversal attacks.
- **Type Safety**: Synthesized tools must define strict Zod schemas to maintain the integrity of the tool loop.

## Fact Grounding

Agents MUST ground their claims in reality using the `fact_grounding_engine.ts`.

- **Verification**: Claims about the codebase or external documentation should be verified via `grep` or `read_file` before being presented as fact.
- **Traceability**: The `metacognition` system audits these groundings to ensure the agent isn't "hallucinating" its own verification steps.
