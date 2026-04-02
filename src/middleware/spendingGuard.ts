/**
 * Spending Guard — Enforces per-session spending caps
 */

interface SpendingRecord {
  totalSpent: number;
  txCount: number;
  sessionStart: number;
}

const sessions = new Map<string, SpendingRecord>();

// Configuration via environment or defaults
const MAX_TX_PER_SESSION = Number(process.env.OWS_MAX_TX) || 50;
const MAX_SPEND_PER_SESSION = Number(process.env.OWS_MAX_SPEND) || 1.0; // in native token units
const SESSION_DURATION_MS = Number(process.env.OWS_SESSION_DURATION) || 3600_000; // 1 hour

/**
 * Check if a transaction is within spending limits
 */
export function checkSpendingLimit(
  walletName: string,
  amount: number = 0
): { allowed: boolean; reason?: string } {
  const now = Date.now();
  const key = walletName;

  let record = sessions.get(key);

  // Reset expired sessions
  if (!record || now - record.sessionStart > SESSION_DURATION_MS) {
    record = { totalSpent: 0, txCount: 0, sessionStart: now };
    sessions.set(key, record);
  }

  // Check transaction count
  if (record.txCount >= MAX_TX_PER_SESSION) {
    return {
      allowed: false,
      reason: `Transaction limit reached (${MAX_TX_PER_SESSION}/session). Resets in ${Math.ceil((record.sessionStart + SESSION_DURATION_MS - now) / 60000)} minutes.`,
    };
  }

  // Check spending cap
  if (record.totalSpent + amount > MAX_SPEND_PER_SESSION) {
    return {
      allowed: false,
      reason: `Spending cap reached (${MAX_SPEND_PER_SESSION} max/session). Current: ${record.totalSpent.toFixed(6)}`,
    };
  }

  // Record the transaction
  record.txCount++;
  record.totalSpent += amount;

  return { allowed: true };
}

/**
 * Get spending summary for a wallet session
 */
export function getSpendingSummary(walletName: string): {
  totalSpent: number;
  txCount: number;
  remainingTx: number;
  remainingSpend: number;
  sessionAge: number;
} {
  const now = Date.now();
  const record = sessions.get(walletName);

  if (!record) {
    return {
      totalSpent: 0,
      txCount: 0,
      remainingTx: MAX_TX_PER_SESSION,
      remainingSpend: MAX_SPEND_PER_SESSION,
      sessionAge: 0,
    };
  }

  return {
    totalSpent: record.totalSpent,
    txCount: record.txCount,
    remainingTx: Math.max(0, MAX_TX_PER_SESSION - record.txCount),
    remainingSpend: Math.max(0, MAX_SPEND_PER_SESSION - record.totalSpent),
    sessionAge: Math.floor((now - record.sessionStart) / 1000),
  };
}
