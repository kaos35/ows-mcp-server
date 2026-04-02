# 🔐 OWS MCP Wallet Server for Claude

An MCP (Model Context Protocol) server that gives Claude access to the **Open Wallet Standard (OWS)** — enabling AI agents to create wallets, sign transactions, manage policies, and check balances across 10 blockchains through natural language.

## ✨ What Claude Can Do

```
### 1. Wallet Management
- "Create a new wallet called 'ai-assistant'"
- "List all the wallets we have created so far"
- "Show me the Solana, Ethereum, and SUI addresses for 'hackathon-demo' in a table"

### 2. Secure Signing
- "Sign the message 'Joining OWS Hackathon 2026' on Ethereum using 'hackathon-demo' and show me the signature"
- "Sign this raw transaction payload on the Solana network using 'ai-assistant'"

### 3. Monitoring & Audits
- "Show me today's audit log. Were any transactions rejected or rate-limited?"
- "Check the current session status and how much spend limit we have left"

### 4. Security & Policies
- "Create a new agent policy that limits spending to a maximum of 0.1 ETH per day"
- "List current API keys and revoke any that are unused"

### 🔥 Full Autonomous Agent Flow
- "Please check my wallets. If 'trading-bot' doesn't exist, create it. Then get its Ethereum address and sign the message 'Bot active and listening'. Finally, check the Audit Log and report if the last 3 operations were successful."
```

## 🏗️ Architecture

```
┌──────────────────────────────────────────────┐
│                  Claude Desktop               │
│         (Natural Language Interface)          │
└─────────────────┬────────────────────────────┘
                  │ MCP Protocol (stdio)
┌─────────────────▼────────────────────────────┐
│          OWS MCP Wallet Server               │
│  ┌────────────────────────────────────────┐  │
│  │         14 MCP Tools                   │  │
│  │  Wallet · Sign · Policy · Keys · Fund  │  │
│  └────────────────┬───────────────────────┘  │
│  ┌────────────────▼───────────────────────┐  │
│  │         Middleware Layer               │  │
│  │  Rate Limiter · Spending Guard · Audit │  │
│  └────────────────┬───────────────────────┘  │
└─────────────────┬────────────────────────────┘
                  │ CLI / SDK
┌─────────────────▼────────────────────────────┐
│          OWS Core (Rust + FFI)               │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │  Policy   │  │ Signing  │  │  Wallet   │  │
│  │  Engine   │  │  Core    │  │  Vault    │  │
│  └──────────┘  └──────────┘  └───────────┘  │
│              ~/.ows/wallets/                 │
└──────────────────────────────────────────────┘
```

## 🔧 16 MCP Tools

| Category | Tool | Description |
|----------|------|-------------|
| **Wallet** | `ows_wallet_create` | Create multi-chain wallet (10 chains from 1 seed) |
| | `ows_wallet_list` | List all local wallets |
| | `ows_wallet_info` | Get addresses & metadata |
| **Signing** | `ows_sign_message` | Sign arbitrary messages |
| | `ows_sign_transaction` | Sign raw transactions |
| **Policy** | `ows_policy_create` | Create spending/signing policies |
| | `ows_policy_list` | List active policies |
| **Keys** | `ows_key_create` | Create scoped API keys |
| | `ows_key_list` | List API keys |
| | `ows_key_revoke` | Revoke API keys |
| **Funding/DeFi** | `ows_get_balance` | Check wallet balance |
| | `ows_fund_deposit` | Fund wallet with crypto |
| | `ows_moonpay_buy_crypto` | Buy crypto via MoonPay |
| | `ows_cross_chain_bridge` | Bridge assets across networks |
| **Monitor** | `ows_audit_log` | View operation audit trail |
| | `ows_session_status` | Check limits & session info |

## 🛡️ Security Features

- **Zero key exposure** — Private keys never leave the OWS vault
- **Rate limiting** — Configurable calls/minute per tool
- **Spending guards** — Per-session transaction count & spend caps
- **Audit logging** — Every operation logged to `~/.ows/audit/`
- **Policy engine** — Pre-signing rules evaluated before any key material is touched

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- OWS CLI installed (`npm install -g @open-wallet-standard/core`)

### Install & Build

```bash
cd OWS
npm install
npm run build
```

### Connect to Claude Desktop

1. Copy the example config:
```bash
# Windows
copy claude_desktop_config.example.json %APPDATA%\Claude\claude_desktop_config.json

# macOS
cp claude_desktop_config.example.json ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

2. Update the path in the config to match your installation:
```json
{
  "mcpServers": {
    "ows-wallet": {
      "command": "node",
      "args": ["C:/Users/mcoba/OneDrive/Desktop/OWS/dist/index.js"]
    }
  }
}
```

3. Restart Claude Desktop

4. Try it out:
> "Create a wallet called hackathon-demo and show me its addresses"

### Development Mode

```bash
npm run dev
```

## ⚙️ Configuration (Environment Variables)

| Variable | Default | Description |
|----------|---------|-------------|
| `OWS_CLI_PATH` | `ows` | Path to OWS CLI binary |
| `OWS_PASSWORD` | *(empty)* | Wallet encryption password |
| `OWS_RATE_LIMIT` | `30` | Max tool calls per minute |
| `OWS_MAX_TX` | `50` | Max transactions per session |
| `OWS_MAX_SPEND` | `1.0` | Max spend per session (native token) |
| `OWS_SESSION_DURATION` | `3600000` | Session duration (ms) |
| `OWS_AUDIT_DIR` | `~/.ows/audit` | Audit log directory |

## 🔗 Supported Chains

| Chain | Derivation Path | Address Format |
|-------|----------------|----------------|
| EVM (ETH, Base, Arbitrum) | `m/44'/60'/0'/0/0` | 0x... |
| Solana | `m/44'/501'/0'/0'` | Base58 |
| Bitcoin | `m/84'/0'/0'/0/0` | bc1... |
| Cosmos | `m/44'/118'/0'/0/0` | cosmos1... |
| Tron | `m/44'/195'/0'/0/0` | T... |
| TON | `m/44'/607'/0'` | EQ... |
| Sui | `m/44'/784'/0'/0'/0'` | 0x... |
| Filecoin | `m/44'/461'/0'/0/0` | f1... |
| XRP Ledger | `m/44'/144'/0'/0/0` | r... |
| Spark | `m/84'/0'/0'/0/0` | sp1... |

## 📁 Project Structure

```
OWS/
├── src/
│   ├── index.ts                 # MCP Server (14 tools)
│   ├── utils/
│   │   ├── owsExecutor.ts       # OWS CLI wrapper
│   │   └── formatters.ts        # Response formatters
│   └── middleware/
│       ├── rateLimiter.ts        # Rate limiting
│       ├── spendingGuard.ts      # Spending caps
│       └── auditLog.ts           # Audit logging
├── claude_desktop_config.example.json
├── package.json
├── tsconfig.json
└── README.md
```

## 🔮 Roadmap & Future Features (OWS Tracks Alignment)

As the core MCP integration is completed, this architecture is perfectly positioned to scale into the 5 core OWS Tracks:

*   **⚡ The Exchange (Autonomous Trading)**
    *   `ows_copy_trade`: Autonomous LLM-based execution of copy-trading signals without human intervention.
    *   `ows_liquidity_vault`: Deploying and pooling liquidity on Myriad AMMs based on real-time LLM market sentiment.
*   **🌐 The Grid (Cross-chain Infrastructure)**
    *   `ows_cross_chain_bridge` *(Currently mocked)*: Native integration with Squid/DeBridge routing so Claude can auto-select the cheapest path across the 10+ supported chains.
*   **💬 The Network (Agent-to-Agent)**
    *   `ows_xmtp_send`: Integration with XMTP so Claude can negotiate professional service contracts and settle payments directly with other agents.
*   **🤝 The Commons (Group Capital)**
    *   `ows_investment_club`: Multi-user signers where Claude orchestrates voting and tracking metrics for programmable on-chain investment clubs.
*   **🔍 The Observatory (Onchain Intelligence)**
    *   `ows_risk_screener`: Feeding Allium data into Claude before any `ows_sign_transaction` is executed to proactively prevent interaction with malicious contracts.

## 🏆 Hackathon Submission

**Challenge:** #6 — MCP Wallet Server for Claude
**Track:** Tooling & Infrastructure
**Author:** [kaos35](https://github.com/kaos35)

Built with:
- [Open Wallet Standard](https://openwallet.sh) — Secure local wallet management
- [Model Context Protocol](https://modelcontextprotocol.io) — AI tool integration
- [Claude](https://claude.ai) — AI assistant

## 📄 License

MIT © 2026 kaos35
