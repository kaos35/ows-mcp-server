/**
 * OWS CLI Executor — Wraps OWS CLI commands as async functions
 * Falls back to SDK imports when available, uses CLI subprocess otherwise
 */

import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// Configuration
const OWS_CLI = process.env.OWS_CLI_PATH || "ows";
const OWS_PASSWORD = process.env.OWS_PASSWORD || "";
const COMMAND_TIMEOUT = 30_000; // 30 seconds

export interface OWSResult {
  success: boolean;
  data: string;
  error?: string;
}

/**
 * Execute an OWS CLI command
 */
async function execOWS(args: string[]): Promise<OWSResult> {
  try {
    const env = { ...process.env };
    if (OWS_PASSWORD) {
      env.OWS_PASSWORD = OWS_PASSWORD;
    }

    const { stdout, stderr } = await execFileAsync(OWS_CLI, args, {
      timeout: COMMAND_TIMEOUT,
      env,
      maxBuffer: 1024 * 1024, // 1MB
    });

    return {
      success: true,
      data: stdout.trim(),
      error: stderr.trim() || undefined,
    };
  } catch (error: any) {
    return {
      success: false,
      data: "",
      error: error.message || "Unknown error executing OWS command",
    };
  }
}

// ─── Wallet Operations ────────────────────────────────────────

export async function createWallet(name: string): Promise<OWSResult> {
  return execOWS(["wallet", "create", "--name", name]);
}

export async function listWallets(): Promise<OWSResult> {
  return execOWS(["wallet", "list"]);
}

export async function getWalletInfo(name: string): Promise<OWSResult> {
  return execOWS(["wallet", "info", "--name", name]);
}

// ─── Signing Operations ───────────────────────────────────────

export async function signMessage(
  wallet: string,
  chain: string,
  message: string
): Promise<OWSResult> {
  return execOWS([
    "sign",
    "message",
    "--wallet",
    wallet,
    "--chain",
    chain,
    "--message",
    message,
  ]);
}

export async function signTransaction(
  wallet: string,
  chain: string,
  tx: string
): Promise<OWSResult> {
  return execOWS([
    "sign",
    "tx",
    "--wallet",
    wallet,
    "--chain",
    chain,
    "--tx",
    tx,
  ]);
}

// ─── Policy Operations ───────────────────────────────────────

export async function createPolicy(
  name: string,
  executable: string,
  action: "deny" | "warn" = "deny"
): Promise<OWSResult> {
  return execOWS([
    "policy",
    "create",
    "--name",
    name,
    "--executable",
    executable,
    "--action",
    action,
  ]);
}

export async function listPolicies(): Promise<OWSResult> {
  return execOWS(["policy", "list"]);
}

// ─── API Key Operations ──────────────────────────────────────

export async function createApiKey(
  name: string,
  walletIds: string[],
  policyIds: string[] = []
): Promise<OWSResult> {
  const args = ["key", "create", "--name", name];
  for (const wid of walletIds) {
    args.push("--wallet", wid);
  }
  for (const pid of policyIds) {
    args.push("--policy", pid);
  }
  return execOWS(args);
}

export async function listApiKeys(): Promise<OWSResult> {
  return execOWS(["key", "list"]);
}

export async function revokeApiKey(keyId: string): Promise<OWSResult> {
  return execOWS(["key", "revoke", "--id", keyId]);
}

// ─── Funding Operations ──────────────────────────────────────

export async function getBalance(wallet: string): Promise<OWSResult> {
  return execOWS(["fund", "balance", "--wallet", wallet]);
}

export async function fundDeposit(
  wallet: string,
  chain: string,
  amount: string
): Promise<OWSResult> {
  return execOWS([
    "fund",
    "deposit",
    "--wallet",
    wallet,
    "--chain",
    chain,
    "--amount",
    amount,
  ]);
}

// ─── Mnemonic Operations ─────────────────────────────────────

export async function generateMnemonic(): Promise<OWSResult> {
  return execOWS(["mnemonic", "generate"]);
}
