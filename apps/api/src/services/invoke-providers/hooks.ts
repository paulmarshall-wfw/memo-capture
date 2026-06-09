import {
  MEMO_EXPANSION_HOOK_KEY,
  SUGGEST_NEW_MEMOS_HOOK_KEY
} from "../llm.js";
import type { HostHook } from "@invoke-providers/core";

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

export function createMemoCaptureHostHooks(): Record<string, HostHook> {
  return Object.fromEntries(
    listImplementedTaskHooks().map((hookKey) => [
      hookKey,
      ((invocation) => ({
        applied: false,
        output: invocation.providerResult?.output ?? null,
        reason: "Memo Capture stages provider output for review before domain mutation."
      })) satisfies HostHook
    ])
  );
}
