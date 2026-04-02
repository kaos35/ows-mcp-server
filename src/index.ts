#!/usr/bin/env node

/**
 * OWS MCP Wallet Server for Claude
 * ─────────────────────────────────
 * Exposes Open Wallet Standard operations as MCP tools.
 * Claude can create wallets, sign messages/transactions,
 * manage policies, and check balances through natural language.
 *
 * Challenge #6 — OWS Hackathon (April 3, 2026)
 * Author: kaos35 (venus) — @0xvenusdev
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

// ─── OWS Executor ─────────────────────────────────────────────
import {
  createWallet,
  listWallets,
  getWalletInfo,
  signMessage,
  signTransaction,
  createPolicy,
  listPolicies,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  getBalance,
  fundDeposit,
  generateMnemonic,
  fundViaMoonpay,
  crossChainBridge,
} from "./utils/owsExecutor.js";

// ─── Middleware ───────────────────────────────────────────────
import { checkRateLimit, getRateLimitStatus } from "./middleware/rateLimiter.js";
import { checkSpendingLimit, getSpendingSummary } from "./middleware/spendingGuard.js";
import { logAudit, getRecentAudit, getAuditSummary } from "./middleware/auditLog.js";
import { autoFormat, formatError, formatInfo, type MCPResponse } from "./utils/formatters.js";

// ─── Supported Chains ────────────────────────────────────────
const SUPPORTED_CHAINS = [
  "evm", "solana", "bitcoin", "cosmos", "tron", "ton", "sui", "filecoin", "xrpl", "spark",
] as const;

const chainEnum = z.enum(SUPPORTED_CHAINS);

// ═══════════════════════════════════════════════════════════════
// SERVER INITIALIZATION
// ═══════════════════════════════════════════════════════════════

const server = new McpServer({
  name: "ows-wallet-server",
  version: "1.0.0",
});

// ─── Helper: Guarded execution with rate limit + audit ────────
async function guardedExec(
  toolName: string,
  params: Record<string, unknown>,
  fn: () => Promise<MCPResponse>,
  extra?: { wallet?: string; chain?: string }
): Promise<MCPResponse> {
  const startTime = Date.now();

  // Rate limit check
  if (!checkRateLimit(toolName)) {
    const status = getRateLimitStatus(toolName);
    logAudit(toolName, "call", params, "rate_limited", Date.now() - startTime, extra);
    return {
      content: [
        {
          type: "text" as const,
          text: `⏱️ Rate limited. ${status.remaining} calls remaining. Resets in ${status.resetsIn}s.`,
        },
      ],
      isError: true,
    };
  }

  try {
    const result = await fn();
    const duration = Date.now() - startTime;
    logAudit(
      toolName,
      "call",
      params,
      result.isError ? "error" : "success",
      duration,
      extra
    );
    return result;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logAudit(toolName, "call", params, "error", duration, {
      ...extra,
      error: error.message,
    });
    return {
      content: [{ type: "text" as const, text: `❌ Error: ${error.message}` }],
      isError: true,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// WALLET TOOLS
// ═══════════════════════════════════════════════════════════════

server.tool(
  "ows_wallet_create",
  "Create a new OWS multi-chain wallet. Generates addresses for all supported chains (EVM, Solana, Bitcoin, Cosmos, Tron, TON, Sui, Filecoin, XRPL) from a single seed.",
  {
    name: z
      .string()
      .min(1)
      .max(64)
      .describe("Human-readable wallet name (e.g. 'agent-treasury', 'trading-bot')"),
  },
  async ({ name }) => {
    return guardedExec("ows_wallet_create", { name }, async () => {
      const result = await createWallet(name);
      return autoFormat(result, `Wallet '${name}' created successfully`, `Failed to create wallet '${name}'`);
    }, { wallet: name });
  }
);

server.tool(
  "ows_wallet_list",
  "List all OWS wallets stored locally. Returns wallet names, IDs, and creation dates.",
  {},
  async () => {
    return guardedExec("ows_wallet_list", {}, async () => {
      const result = await listWallets();
      return autoFormat(result, "Available wallets", "Failed to list wallets");
    });
  }
);

server.tool(
  "ows_wallet_info",
  "Get detailed information about a specific wallet including all chain addresses, derivation paths, and metadata.",
  {
    name: z.string().min(1).describe("Wallet name to inspect"),
  },
  async ({ name }) => {
    return guardedExec("ows_wallet_info", { name }, async () => {
      const result = await getWalletInfo(name);
      return autoFormat(result, `Wallet '${name}' details`, `Wallet '${name}' not found`);
    }, { wallet: name });
  }
);

// ═══════════════════════════════════════════════════════════════
// SIGNING TOOLS
// ═══════════════════════════════════════════════════════════════

server.tool(
  "ows_sign_message",
  "Sign an arbitrary message using a wallet's private key. The key is decrypted in hardened memory, used to sign, then immediately wiped. Supports all chains.",
  {
    wallet: z.string().min(1).describe("Wallet name to sign with"),
    chain: chainEnum.describe("Target blockchain (evm, solana, bitcoin, cosmos, tron, ton, sui, filecoin, xrpl, spark)"),
    message: z.string().min(1).describe("Message to sign"),
  },
  async ({ wallet, chain, message }) => {
    return guardedExec(
      "ows_sign_message",
      { wallet, chain, message: message.substring(0, 100) + (message.length > 100 ? "..." : "") },
      async () => {
        // Spending guard check
        const spendCheck = checkSpendingLimit(wallet);
        if (!spendCheck.allowed) {
          return {
            content: [{ type: "text" as const, text: `🛑 Spending guard: ${spendCheck.reason}` }],
            isError: true,
          };
        }
        const result = await signMessage(wallet, chain, message);
        return autoFormat(result, `Message signed with '${wallet}' on ${chain}`, `Failed to sign message`);
      },
      { wallet, chain }
    );
  }
);

server.tool(
  "ows_sign_transaction",
  "Sign a raw transaction using a wallet. The OWS policy engine evaluates spending limits, allowlists, and chain restrictions before the key is decrypted. Private key is wiped immediately after signing.",
  {
    wallet: z.string().min(1).describe("Wallet name to sign with"),
    chain: chainEnum.describe("Target blockchain"),
    tx: z.string().min(1).describe("Raw transaction data (hex-encoded)"),
  },
  async ({ wallet, chain, tx }) => {
    return guardedExec(
      "ows_sign_transaction",
      { wallet, chain, tx: tx.substring(0, 20) + "..." },
      async () => {
        const spendCheck = checkSpendingLimit(wallet);
        if (!spendCheck.allowed) {
          return {
            content: [{ type: "text" as const, text: `🛑 Spending guard: ${spendCheck.reason}` }],
            isError: true,
          };
        }
        const result = await signTransaction(wallet, chain, tx);
        return autoFormat(result, `Transaction signed with '${wallet}' on ${chain}`, `Failed to sign transaction`);
      },
      { wallet, chain }
    );
  }
);

// ═══════════════════════════════════════════════════════════════
// POLICY TOOLS
// ═══════════════════════════════════════════════════════════════

server.tool(
  "ows_policy_create",
  "Create a new OWS signing policy. Policies are evaluated before any key material is touched — they can enforce spending limits, contract allowlists, and chain restrictions.",
  {
    name: z.string().min(1).describe("Policy name"),
    executable: z.string().min(1).describe("Absolute path to the policy executable script"),
    action: z.enum(["deny", "warn"]).default("deny").describe("Action when policy fails"),
  },
  async ({ name, executable, action }) => {
    return guardedExec("ows_policy_create", { name, action }, async () => {
      // Create a temporary JSON file for the policy matching OWS spec
      const policyContent = {
        id: name,
        name: name,
        executable: executable,
        action: action
      };
      const tempPath = path.join(os.tmpdir(), `ows-policy-${name}-${Date.now()}.json`);
      await fs.writeFile(tempPath, JSON.stringify(policyContent, null, 2), "utf8");
      
      const result = await createPolicy(tempPath);
      
      // Cleanup temp file
      try { await fs.unlink(tempPath); } catch (e) {}

      return autoFormat(result, `Policy '${name}' created (action: ${action})`, `Failed to create policy`);
    });
  }
);

server.tool(
  "ows_policy_list",
  "List all active OWS signing policies.",
  {},
  async () => {
    return guardedExec("ows_policy_list", {}, async () => {
      const result = await listPolicies();
      return autoFormat(result, "Active policies", "Failed to list policies");
    });
  }
);

// ═══════════════════════════════════════════════════════════════
// API KEY TOOLS
// ═══════════════════════════════════════════════════════════════

server.tool(
  "ows_key_create",
  "Create a scoped API key for agent access. Keys are bound to specific wallets and policies, following the zero-trust model where agents never see raw private keys.",
  {
    name: z.string().min(1).describe("Human-readable key name"),
    walletIds: z.array(z.string()).min(1).describe("Wallet IDs this key can access"),
    policyIds: z.array(z.string()).optional().describe("Policy IDs to evaluate per request"),
  },
  async ({ name, walletIds, policyIds }) => {
    return guardedExec("ows_key_create", { name, walletCount: walletIds.length }, async () => {
      const result = await createApiKey(name, walletIds, policyIds || []);
      return autoFormat(result, `API key '${name}' created`, `Failed to create API key`);
    });
  }
);

server.tool(
  "ows_key_list",
  "List all API keys with their associated wallets and policies.",
  {},
  async () => {
    return guardedExec("ows_key_list", {}, async () => {
      const result = await listApiKeys();
      return autoFormat(result, "API keys", "Failed to list API keys");
    });
  }
);

server.tool(
  "ows_key_revoke",
  "Revoke an API key immediately. The key will no longer be able to access any wallets.",
  {
    keyId: z.string().min(1).describe("API key ID to revoke"),
  },
  async ({ keyId }) => {
    return guardedExec("ows_key_revoke", { keyId }, async () => {
      const result = await revokeApiKey(keyId);
      return autoFormat(result, `API key '${keyId}' revoked`, `Failed to revoke API key`);
    });
  }
);

// ═══════════════════════════════════════════════════════════════
// FUNDING & BALANCE TOOLS
// ═══════════════════════════════════════════════════════════════

server.tool(
  "ows_get_balance",
  "Get the balance of a wallet across all supported chains.",
  {
    wallet: z.string().min(1).describe("Wallet name to check balance for"),
  },
  async ({ wallet }) => {
    return guardedExec("ows_get_balance", { wallet }, async () => {
      const result = await getBalance(wallet);
      return autoFormat(result, `Balance for '${wallet}'`, `Failed to get balance`);
    }, { wallet });
  }
);

server.tool(
  "ows_fund_deposit",
  "Fund a wallet by depositing tokens on a specific chain.",
  {
    wallet: z.string().min(1).describe("Wallet name to fund"),
    chain: chainEnum.describe("Target blockchain"),
    amount: z.string().min(1).describe("Amount to deposit (in native token units)"),
  },
  async ({ wallet, chain, amount }) => {
    return guardedExec("ows_fund_deposit", { wallet, chain, amount }, async () => {
      const spendCheck = checkSpendingLimit(wallet, parseFloat(amount) || 0);
      if (!spendCheck.allowed) {
        return {
          content: [{ type: "text" as const, text: `🛑 Spending guard: ${spendCheck.reason}` }],
          isError: true,
        };
      }
      const result = await fundDeposit(wallet, chain);
      return autoFormat(result, `Funded '${wallet}' with ${amount} on ${chain}`, `Failed to fund wallet`);
    }, { wallet, chain });
  }
);

// ═══════════════════════════════════════════════════════════════
// EXPANSION TOOLS (DEFI & BRIDGE)
// ═══════════════════════════════════════════════════════════════

server.tool(
  "ows_moonpay_buy_crypto",
  "Buy cryptocurrency using Fiat via MoonPay and deposit it directly into the specified OWS wallet.",
  {
    wallet: z.string().min(1).describe("Wallet name to fund"),
    chain: chainEnum.describe("Target blockchain (e.g. 'solana', 'evm')"),
    amount: z.string().min(1).describe("Amount of Fiat to spend (e.g. '50')"),
    currency: z.string().default("usd").describe("Fiat currency to use (e.g. 'usd', 'eur')"),
  },
  async ({ wallet, chain, amount, currency }) => {
    return guardedExec("ows_moonpay_buy_crypto", { wallet, chain, amount, currency }, async () => {
      const result = await fundViaMoonpay(wallet, chain);
      return autoFormat(result, `Successfully initiated MoonPay funding for ${amount} ${currency.toUpperCase()} to '${wallet}' on ${chain}. Please check the provided URL to complete the purchase.`, `Failed to initiate MoonPay checkout`);
    }, { wallet, chain });
  }
);

server.tool(
  "ows_cross_chain_bridge",
  "Bridge assets from one blockchain to another via a cross-chain liquidity protocol (Mocked Demo).",
  {
    wallet: z.string().min(1).describe("Wallet to use for bridging"),
    sourceChain: chainEnum.describe("Blockchain the assets are currently on"),
    targetChain: chainEnum.describe("Blockchain to receive the assets"),
    amount: z.string().min(1).describe("Amount to bridge"),
  },
  async ({ wallet, sourceChain, targetChain, amount }) => {
    return guardedExec("ows_cross_chain_bridge", { wallet, sourceChain, targetChain, amount }, async () => {
      const result = await crossChainBridge(wallet, sourceChain, targetChain, amount);
      return autoFormat(result, `Bridge initiated: ${amount} from ${sourceChain} to ${targetChain}`, `Bridge failed`);
    }, { wallet });
  }
);

// ═══════════════════════════════════════════════════════════════
// MONITORING & AUDIT TOOLS
// ═══════════════════════════════════════════════════════════════

server.tool(
  "ows_audit_log",
  "View the audit log of all agent-initiated wallet operations. Shows recent tool calls, results, and timing information for transparency and compliance.",
  {
    count: z.number().min(1).max(100).default(20).describe("Number of recent entries to show"),
  },
  async ({ count }) => {
    const entries = getRecentAudit(count);
    const summary = getAuditSummary();

    const lines = [
      `📋 Audit Log (last ${entries.length} operations)`,
      `─────────────────────────────────────`,
      `Total: ${summary.totalOperations} | ✅ ${summary.successCount} | ❌ ${summary.errorCount} | ⏱️ ${summary.rateLimitedCount} rate limited | 🛑 ${summary.spendingBlockedCount} spending blocked`,
      `Avg duration: ${summary.avgDuration}ms`,
      ``,
    ];

    for (const entry of entries) {
      const icon = entry.result === "success" ? "✅" : entry.result === "error" ? "❌" : "⚠️";
      lines.push(
        `${icon} [${entry.timestamp}] ${entry.tool}${entry.wallet ? ` (${entry.wallet})` : ""} — ${entry.duration_ms}ms`
      );
    }

    if (Object.keys(summary.toolBreakdown).length > 0) {
      lines.push("", "📊 Tool breakdown:");
      for (const [tool, count] of Object.entries(summary.toolBreakdown)) {
        lines.push(`  ${tool}: ${count} calls`);
      }
    }

    return formatInfo(lines.join("\n"));
  }
);

server.tool(
  "ows_session_status",
  "Get the current session status including spending limits, rate limits, and wallet summaries. Useful for understanding remaining capacity.",
  {
    wallet: z.string().optional().describe("Optional wallet name to check spending for"),
  },
  async ({ wallet }) => {
    const lines = ["📊 OWS MCP Session Status", "═══════════════════════════"];

    if (wallet) {
      const spending = getSpendingSummary(wallet);
      lines.push(
        "",
        `💰 Wallet '${wallet}' Session:`,
        `  Transactions: ${spending.txCount} used / ${spending.remainingTx} remaining`,
        `  Spending: ${spending.totalSpent.toFixed(6)} used / ${spending.remainingSpend.toFixed(6)} remaining`,
        `  Session age: ${spending.sessionAge}s`
      );
    }

    const audit = getAuditSummary();
    lines.push(
      "",
      `📋 Audit Summary:`,
      `  Total operations: ${audit.totalOperations}`,
      `  Success rate: ${audit.totalOperations > 0 ? Math.round((audit.successCount / audit.totalOperations) * 100) : 0}%`,
      `  Avg latency: ${audit.avgDuration}ms`
    );

    lines.push(
      "",
      `🔗 Supported chains: ${SUPPORTED_CHAINS.join(", ")}`,
      "",
      `💡 Tip: Use ows_wallet_create to create your first wallet!`
    );

    return formatInfo(lines.join("\n"));
  }
);

// ═══════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log startup to stderr (stdout is reserved for MCP protocol)
  console.error("🔐 OWS MCP Wallet Server started");
  console.error("   16 tools registered");
  console.error(`   Supported chains: ${SUPPORTED_CHAINS.join(", ")}`);
  console.error("   Ready for Claude Desktop connection");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
