/**
 * Audit Logger — Records all agent-initiated operations
 */

import { writeFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface AuditEntry {
  id: string;
  timestamp: string;
  tool: string;
  wallet?: string;
  chain?: string;
  action: string;
  params: Record<string, unknown>;
  result: "success" | "error" | "rate_limited" | "spending_blocked";
  error?: string;
  duration_ms: number;
}

const LOG_DIR = process.env.OWS_AUDIT_DIR || join(homedir(), ".ows", "audit");
const entries: AuditEntry[] = [];
let entryCounter = 0;

// Ensure audit directory exists
function ensureLogDir() {
  if (!existsSync(LOG_DIR)) {
    try {
      mkdirSync(LOG_DIR, { recursive: true });
    } catch {
      // Silently fail — audit is best-effort
    }
  }
}

/**
 * Generate a unique entry ID
 */
function generateId(): string {
  entryCounter++;
  const ts = Date.now().toString(36);
  const counter = entryCounter.toString(36).padStart(4, "0");
  return `audit_${ts}_${counter}`;
}

/**
 * Log an audit entry
 */
export function logAudit(
  tool: string,
  action: string,
  params: Record<string, unknown>,
  result: AuditEntry["result"],
  duration_ms: number,
  extra?: { wallet?: string; chain?: string; error?: string }
): AuditEntry {
  const entry: AuditEntry = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    tool,
    action,
    params,
    result,
    duration_ms,
    ...extra,
  };

  entries.push(entry);

  // Persist to disk (best-effort)
  try {
    ensureLogDir();
    const today = new Date().toISOString().split("T")[0];
    const logFile = join(LOG_DIR, `${today}.jsonl`);
    writeFileSync(logFile, JSON.stringify(entry) + "\n", { flag: "a" });
  } catch {
    // Silently fail
  }

  return entry;
}

/**
 * Get recent audit entries
 */
export function getRecentAudit(count: number = 20): AuditEntry[] {
  return entries.slice(-count);
}

/**
 * Get audit summary statistics
 */
export function getAuditSummary(): {
  totalOperations: number;
  successCount: number;
  errorCount: number;
  rateLimitedCount: number;
  spendingBlockedCount: number;
  toolBreakdown: Record<string, number>;
  avgDuration: number;
} {
  const summary = {
    totalOperations: entries.length,
    successCount: 0,
    errorCount: 0,
    rateLimitedCount: 0,
    spendingBlockedCount: 0,
    toolBreakdown: {} as Record<string, number>,
    avgDuration: 0,
  };

  let totalDuration = 0;

  for (const entry of entries) {
    switch (entry.result) {
      case "success":
        summary.successCount++;
        break;
      case "error":
        summary.errorCount++;
        break;
      case "rate_limited":
        summary.rateLimitedCount++;
        break;
      case "spending_blocked":
        summary.spendingBlockedCount++;
        break;
    }

    summary.toolBreakdown[entry.tool] =
      (summary.toolBreakdown[entry.tool] || 0) + 1;
    totalDuration += entry.duration_ms;
  }

  summary.avgDuration =
    entries.length > 0 ? Math.round(totalDuration / entries.length) : 0;

  return summary;
}

/**
 * Get today's audit log from disk
 */
export function getTodaysLog(): AuditEntry[] {
  try {
    const today = new Date().toISOString().split("T")[0];
    const logFile = join(LOG_DIR, `${today}.jsonl`);
    if (!existsSync(logFile)) return [];
    const content = readFileSync(logFile, "utf-8");
    return content
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}
