/**
 * Response Formatters — Format OWS output for Claude
 */

import type { OWSResult } from "./owsExecutor.js";

export interface MCPTextContent {
  type: "text";
  text: string;
}

export interface MCPResponse {
  [key: string]: unknown;
  content: MCPTextContent[];
  isError?: boolean;
}

/**
 * Create a text content item with literal type
 */
function text(msg: string): MCPTextContent {
  return { type: "text" as const, text: msg };
}

/**
 * Format a successful OWS result for MCP response
 */
export function formatSuccess(result: OWSResult, context?: string): MCPResponse {
  const parts: string[] = [];
  if (context) {
    parts.push(`✅ ${context}`);
    parts.push("");
  }
  if (result.data) {
    parts.push(result.data);
  }
  if (result.error) {
    parts.push("");
    parts.push(`⚠️ Warning: ${result.error}`);
  }
  return { content: [text(parts.join("\n"))] };
}

/**
 * Format an error result for MCP response
 */
export function formatError(result: OWSResult, context?: string): MCPResponse {
  const parts: string[] = [];
  if (context) {
    parts.push(`❌ ${context}`);
    parts.push("");
  }
  parts.push(result.error || "Unknown error occurred");
  return { content: [text(parts.join("\n"))], isError: true };
}

/**
 * Format a general info message
 */
export function formatInfo(message: string): MCPResponse {
  return { content: [text(message)] };
}

/**
 * Auto-format based on result success/failure
 */
export function autoFormat(
  result: OWSResult,
  successContext?: string,
  errorContext?: string
): MCPResponse {
  if (result.success) {
    return formatSuccess(result, successContext);
  }
  return formatError(result, errorContext);
}
