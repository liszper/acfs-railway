# ACFS Railway

> One-click deploy of a fully-loaded AI coding environment on [Railway](https://railway.app), with a native desktop app for terminal access.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/acfs-railway?referralCode=99cooking)

## What This Is

A Docker image that packages **50+ developer tools and 3 AI coding agents** into a cloud coding environment deployed on Railway. Includes a **native desktop app** (Tauri) for terminal access with full clipboard and mouse support, plus a web dashboard for session management. Based on [ACFS](https://github.com/Dicklesworthstone/agentic_coding_flywheel_setup).

**What you get:**

- **AI Agents** — Claude Code, Codex CLI, Gemini CLI, OpenCode
- **Native Desktop App** — Tauri-based terminal with SSH, native clipboard, mouse support, tabs
- **Web Dashboard** — Session management, NTM spawning, tools, secrets, project management
- **Languages** — Bun, Node.js, Python (uv), Rust, Go
- **LSP Servers** — typescript-language-server, pyright, gopls, rust-analyzer
- **Modern CLI** — bat, fd, ripgrep, eza, delta, fzf, zoxide, lazygit, ast-grep, atuin
- **Shell** — zsh + Oh My Zsh + Powerlevel10k
- **Cloud CLIs** — Railway, Wrangler, Supabase, Vercel, Vault
- **Dicklesworthstone Stack** — NTM, SLB, Beads, CASS, CM, DCG, UBS, RU, and more
- **Web IDE** — code-server (VS Code in browser)
- **NTM Orchestration** — multi-agent coordination with recipes, workflows, and a visual dashboard

## Quick Start

1. Click **Deploy on Railway** above
2. Set your API keys as environment variables
3. In Railway dashboard, add a **TCP Proxy** on port `2222` (Settings → Networking) for SSH access
4. Open the generated URL — you get a session manager dashboard

### Desktop App (Recommended)

The native desktop app gives you real terminal tabs with full clipboard and mouse support — no browser limitations.

```bash
# Build and run the desktop app
cd desktop
npm install
npx tauri dev
```

Connect with:
- **SSH Host**: your Railway TCP proxy hostname (e.g. `roundhouse.proxy.rlwy.net`)
- **Port**: your Railway TCP proxy port
- **User**: `dev`
- **Password**: your `TTYD_PASS` value
- **API URL**: `https://your-app.up.railway.app`

### Web Dashboard

The web dashboard is always available at your Railway URL for session management, NTM spawning, tools status, secrets, and project management. Terminal sessions are also accessible via the browser using ttyd.

## Architecture

```
┌─────────────────────────┐         ┌──────────────────────────────┐
│    ACFS Desktop App     │         │     Railway Container        │
│  (Tauri + React)        │         │                              │
│                         │         │  ┌─────────────────────┐     │
│  ┌───────────────────┐  │  SSH    │  │   sshd (:2222)      │     │
│  │ Terminal Tab 1     │──┼────────┼──│   → tmux sessions   │     │
│  │ Terminal Tab 2     │  │        │  └─────────────────────┘     │
│  │ Terminal Tab 3     │  │        │                              │
│  └───────────────────┘  │        │  ┌─────────────────────┐     │
│                         │  HTTPS  │  │ Session Manager     │     │
│  ┌───────────────────┐  │────────┼──│ (:7681)             │     │
│  │ Sessions Panel     │  │        │  │  /api/sessions      │     │
│  │ Tools Panel        │  │        │  │  /api/ntm/*         │     │
│  │ Secrets Panel      │  │        │  │  /api/tools/*       │     │
│  │ Projects Panel     │  │        │  │  /api/secrets/*     │     │
│  └───────────────────┘  │        │  │  /api/projects/*    │     │
└─────────────────────────┘        │  └─────────────────────┘     │
                                   │                              │
┌─────────────────────────┐        │  ┌─────────────────────┐     │
│    Web Browser          │  HTTPS  │  │ code-server (:18080)│     │
│  Dashboard + ttyd terms │────────┼──│ VS Code in browser  │     │
└─────────────────────────┘        │  └─────────────────────┘     │
                                   └──────────────────────────────┘
```

**Desktop app**: SSH directly to tmux sessions (native clipboard, mouse, full terminal). API calls over HTTPS for dashboard features.

**Web browser**: Dashboard at root URL for session management. Terminal tabs via ttyd + WebSocket relay. Clipboard requires OSC 52 workarounds.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | For Claude | Anthropic API key |
| `OPENAI_API_KEY` | For Codex | OpenAI API key |
| `GEMINI_API_KEY` | For Gemini | Google AI API key |
| `GH_TOKEN` | No | GitHub CLI token (enables PRs, issues from agents) |
| `TTYD_USER` | No | Terminal/API username (default: `admin`) |
| `TTYD_PASS` | No | Terminal/API/SSH password (default: `changeme`) |
| `ACFS_USER` | No | Linux username in container (default: `dev`) |
| `ACFS_HOSTNAME` | No | Container hostname (default: `acfs`) |
| `GIT_USER_NAME` | No | Git global user.name |
| `GIT_USER_EMAIL` | No | Git global user.email |
| `SSH_PRIVATE_KEY` | No | SSH private key (for git over SSH) |
| `SSH_PUBLIC_KEY` | No | SSH public key |
| `DOTFILES_REPO` | No | Git URL of dotfiles repo (cloned on first boot) |
| `OMO_CLAUDE` | No | oh-my-opencode: Claude subscription (`yes`/`no`/`max20`) |
| `OMO_OPENAI` | No | oh-my-opencode: OpenAI/ChatGPT subscription (`yes`/`no`) |
| `OMO_GEMINI` | No | oh-my-opencode: Gemini integration (`yes`/`no`) |
| `OMO_COPILOT` | No | oh-my-opencode: GitHub Copilot subscription (`yes`/`no`) |
| `OMO_OPENCODE_ZEN` | No | oh-my-opencode: OpenCode Zen access (`yes`/`no`) |
| `OMO_ZAI_CODING_PLAN` | No | oh-my-opencode: Z.ai Coding Plan (`yes`/`no`) |
| `OMO_OPENCODE_GO` | No | oh-my-opencode: OpenCode Go subscription (`yes`/`no`) |
| `RAILWAY_TOKEN` | No | Railway CLI auth token |
| `VERCEL_TOKEN` | No | Vercel CLI auth token |
| `SUPABASE_ACCESS_TOKEN` | No | Supabase CLI auth token |
| `CLOUDFLARE_API_TOKEN` | No | Wrangler (Cloudflare) CLI auth token |
| `OAUTH2_CLIENT_ID` | No | GitHub OAuth App client ID (enables OAuth login) |
| `OAUTH2_CLIENT_SECRET` | No | GitHub OAuth App client secret |
| `OAUTH2_COOKIE_SECRET` | No | Session cookie encryption key |
| `AGENT_MEM_LIMIT` | No | Per-agent memory limit in bytes (default: 8GB) |
| `AGENT_NPROC` | No | Per-agent max processes (default: 256) |
| `WEBHOOK_URL` | No | Webhook URL for event notifications |
| `WEBHOOK_SECRET` | No | HMAC-SHA256 secret for webhook signing |

## Desktop App

The ACFS Desktop app is a native application built with Tauri v2 (Rust + React). It replaces the browser-based ttyd terminal with direct SSH connections.

### Why Desktop?

| | Browser (ttyd) | Desktop App |
|---|---|---|
| Clipboard | OSC 52 hack chain, fragile | Native Cmd+C/V |
| Mouse | Conflicts with tmux | Full support |
| Terminal | xterm.js in browser sandbox | xterm.js with native access |
| Connection | HTTP → Bun → Node → ttyd → tmux | SSH → tmux (direct) |
| Binary size | N/A | ~15MB |

### Tech Stack

- **Tauri v2** — Rust backend (~15MB binary vs Electron's 150MB)
- **React + TypeScript** — Frontend UI
- **xterm.js** — Terminal rendering (same renderer, but with native clipboard access)
- **russh** — Async SSH client in Rust
- **reqwest** — HTTPS API client
- **Zustand** — State management

### Building

```bash
cd desktop

# Development (hot reload)
npm install
npx tauri dev

# Production build
npx tauri build
# Output: src-tauri/target/release/bundle/
#   macOS: .dmg
#   Linux: .AppImage, .deb
#   Windows: .msi, .exe
```

### How It Works

1. **Connect**: Enter SSH host/port (Railway TCP proxy) and API URL
2. **Terminal tabs**: Each tab opens an SSH channel → attaches to a tmux session
3. **Dashboard panels**: Sessions, Tools, Secrets, Projects — all calling the same `/api/*` endpoints over HTTPS
4. **Native clipboard**: Select text, Cmd+C — done. No OSC 52, no shims, no tmux mode conflicts.

## Session Manager

The session manager (`session-manager/src/`) is a TypeScript server running on Bun that provides:

- **Web dashboard** at the root URL with tabs for Sessions, Tools, Secrets, Projects
- **REST API** for all operations (used by both the web dashboard and the desktop app)
- **ttyd proxy** for browser-based terminal access
- **WebSocket relay** for ttyd terminal connections via Bun.serve

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sessions` | List tmux sessions |
| POST | `/api/sessions` | Create session |
| DELETE | `/api/sessions/:name` | Kill session |
| POST | `/api/ntm/spawn` | Spawn NTM multi-agent session |
| POST | `/api/ntm/send` | Send prompt to NTM session |
| POST | `/api/ntm/interrupt` | Interrupt NTM session |
| GET | `/api/ntm/status/:name` | NTM session status |
| GET | `/api/tools/status` | Tool inventory |
| GET | `/api/tools/system` | CPU, memory, disk stats |
| GET | `/api/tools/env` | Environment variable status |
| POST | `/api/tools/cass` | CASS search |
| GET | `/api/tools/caut` | CAUT usage report |
| GET | `/api/secrets/status` | Secrets & auth status |
| POST | `/api/secrets/ssh/generate` | Generate SSH key |
| POST | `/api/secrets/ssh/github` | Upload SSH key to GitHub |
| POST | `/api/secrets/git` | Set git config |
| GET | `/api/projects` | List projects |
| POST | `/api/projects/clone` | Clone repository |
| GET | `/api/projects/:name/detail` | Project git status |
| GET | `/api/projects/:name/tree` | File tree |
| POST | `/api/projects/:name/stage` | Stage files |
| POST | `/api/projects/:name/unstage` | Unstage files |
| POST | `/api/projects/:name/stage-all` | Stage all |
| POST | `/api/projects/:name/commit` | Commit |
| POST | `/api/projects/:name/push` | Push |
| POST | `/api/projects/:name/pull` | Pull |
| GET | `/api/projects/:name/log` | Git log |
| GET | `/api/projects/:name/branches` | List branches |
| GET | `/api/projects/:name/diff` | File diff |

## Complete Tool Reference

Every tool below is pre-installed, configured, and ready to use.

### AI Coding Agents

| Agent | Command | Description |
|-------|---------|-------------|
| Claude Code | `cc` | Anthropic's agent. Pre-configured with DCG hooks + MCP Agent Mail |
| Codex CLI | `cod` | OpenAI's agent. Pre-configured with MCP Agent Mail |
| Gemini CLI | `gmi` | Google's agent. Auto-updates, patches known bugs |
| OpenCode | `opencode` | Multi-model agent with oh-my-opencode harness |

### Multi-Agent Orchestration

| Tool | Command | Description |
|------|---------|-------------|
| NTM | `ntm` | Multi-agent session cockpit. Spawn teams, send prompts, manage sessions |
| Agent Mail | `am` | Async messaging between agents via MCP |
| SLB | `slb` | Two-person rule for dangerous operations |

### Modern CLI

| Tool | Command | Replaces | Description |
|------|---------|----------|-------------|
| bat | `bat`/`cat` | cat | Syntax-highlighted file viewer |
| fd | `fd`/`find` | find | Ultra-fast file finder |
| ripgrep | `rg`/`grep` | grep | Ultra-fast content search |
| eza | `eza`/`ls` | ls | Modern file lister with icons |
| delta | `delta` | diff | Beautiful git diff viewer |
| fzf | `fzf` | — | Fuzzy finder (Ctrl+T, Ctrl+R, Alt+C) |
| zoxide | `z` | cd | Smart directory jumper |
| lazygit | `lg` | — | Git TUI |
| ast-grep | `sg` | — | AST-aware code search/rewrite |
| atuin | `atuin` | history | Searchable shell history |

### Code Quality & Safety

| Tool | Command | Description |
|------|---------|-------------|
| DCG | `dcg` | Destructive Command Guard — blocks dangerous commands |
| UBS | `ubs` | AST-aware multi-language bug scanner |
| Beads | `br` | Dependency-aware issue tracker |
| BV | `bv` | Graph-aware triage engine for Beads |

### Agent Workflow Tools

| Tool | Command | Description |
|------|---------|-------------|
| CASS | `cass` | Search across all agent session histories |
| CM | `cm` | Long-term procedural memory for agents |
| CAUT | `caut` | Token usage and cost tracking |
| Meta Skill | `ms` | Semantic search knowledge base |

### Cloud CLIs

| CLI | Command | Auth Env Var |
|-----|---------|-------------|
| Railway | `railway` | `RAILWAY_TOKEN` |
| Wrangler | `wrangler` | `CLOUDFLARE_API_TOKEN` |
| Supabase | `supabase` | `SUPABASE_ACCESS_TOKEN` |
| Vercel | `vercel` | `VERCEL_TOKEN` |
| Vault | `vault` | `VAULT_ADDR` + `VAULT_TOKEN` |
| GitHub CLI | `gh` | `GH_TOKEN` |

### LSP Servers

| Server | Languages |
|--------|-----------|
| typescript-language-server | TypeScript, JavaScript |
| pyright | Python |
| gopls | Go |
| rust-analyzer | Rust |

## Project Structure

```
acfs-railway/
├── Dockerfile                 # Full image (50+ tools, sshd, supervisord)
├── railway.toml               # Railway deployment config
├── desktop/                   # Native desktop app (Tauri v2 + React)
│   ├── src/                   # React frontend
│   │   ├── components/        # Terminal, SessionsPanel, ConnectionDialog, etc.
│   │   ├── store/             # Zustand stores (connection, terminals)
│   │   ├── api/               # API client + types
│   │   └── styles/            # Dark theme CSS
│   ├── src-tauri/             # Rust backend
│   │   └── src/               # SSH, terminal relay, API client, state
│   ├── package.json
│   └── index.html
├── session-manager/           # Server-side session manager (Bun + TypeScript)
│   └── src/
│       ├── server.ts          # Bun.serve + Node http proxy
│       ├── routes/api.ts      # REST API handlers
│       ├── services/          # Sessions, projects, secrets, tools, NTM, proxy
│       ├── dashboard/         # Web dashboard (HTML, CSS, JS)
│       ├── utils/             # HTTP helpers, shell utilities
│       ├── types.ts           # Shared TypeScript interfaces
│       └── config.ts          # Environment configuration
├── acfs/                      # Configs copied into Docker image
│   ├── tmux/tmux.conf         # Tmux config (mouse off for browser, vim keys)
│   ├── claude/settings.json   # Claude Code settings (DCG + MCP)
│   ├── zsh/acfs.zshrc         # Shell config
│   └── ...                    # Agent configs, tool configs, clipboard shims
└── README.md
```

## Development

### Build & Run Locally

```bash
# Container
docker build -t acfs-railway .
docker run -p 7681:7681 -p 18080:18080 -p 2222:2222 \
  -e ANTHROPIC_API_KEY=sk-... \
  -e TTYD_PASS=mypassword \
  acfs-railway

# Dashboard: http://localhost:7681
# VS Code:   http://localhost:18080
# SSH:       ssh dev@localhost -p 2222

# Desktop app
cd desktop && npm install && npx tauri dev
```

### Container Services

| Service | Port | Description |
|---------|------|-------------|
| Session Manager | 7681 | Web dashboard + API + ttyd proxy |
| code-server | 18080 | VS Code in browser |
| sshd | 2222 | SSH access for desktop app |

All services managed by supervisord. Logs visible via `railway logs`.

## Persistence

Railway volumes keep data across deploys:
- `/data/projects` — your code
- `/data/home/<user>` — home directory, shell history, configs

## Credits

- **Upstream**: [ACFS](https://github.com/Dicklesworthstone/agentic_coding_flywheel_setup) by [Jeffrey Emanuel](https://github.com/Dicklesworthstone)
- **Railway containerization + Desktop app**: [99 Cooking](https://99cook.ing)
