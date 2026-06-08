import {
  MEMO_EXPANSION_HOOK_KEY,
  SUGGEST_NEW_MEMOS_HOOK_KEY
} from "../llm.js";

const IMPLEMENTED_TASK_HOOKS = new Set([
  MEMO_EXPANSION_HOOK_KEY,
  SUGGEST_NEW_MEMOS_HOOK_KEY
]);

export function isTaskHookImplemented(hookKey: string): boolean {
  return IMPLEMENTED_TASK_HOOKS.has(hookKey);
}

export function listImplementedTaskHooks(): string[] {
  return [...IMPLEMENTED_TASK_HOOKS].sort();
}
