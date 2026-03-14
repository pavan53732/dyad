import { atom } from "jotai";

// Mission Control Panel visibility state
export const isMissionControlPanelOpenAtom = atom<boolean>(false);

// Dropdown menu state
export const dropdownOpenAtom = atom<boolean>(false);

// Types for Mission Control Panel data
export interface AgentThought {
  id: string;
  title: string;
  content: string;
  state: "pending" | "in-progress" | "finished" | "aborted";
  timestamp: number;
  type: "thought" | "task" | "error" | "test" | "typecheck";
}

export interface TSCError {
  file: string;
  line: number;
  column: number;
  message: string;
  code?: string;
}

export interface TestResult {
  name: string;
  status: "running" | "passed" | "failed" | "skipped";
  output?: string;
  timestamp: number;
}

// Mission Control Panel data atoms
export const agentThoughtsAtom = atom<AgentThought[]>([]);
export const tscErrorsAtom = atom<TSCError[]>([]);
export const testResultsAtom = atom<TestResult[]>([]);
export const currentTaskAtom = atom<string>("");
