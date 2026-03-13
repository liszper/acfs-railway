# ACFS Railway

> One-click deploy of a fully-loaded AI coding environment on [Railway](https://railway.app).

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/acfs-railway?referralCode=99cooking)

## What This Is

A Docker image that packages **50+ developer tools and 3 AI coding agents** into a browser-accessible terminal, deployed on Railway. Based on [ACFS](https://github.com/Dicklesworthstone/agentic_coding_flywheel_setup).

**What you get:**

- **AI Agents** — Claude Code, Codex CLI, Gemini CLI, OpenCode
- **Languages** — Bun, Node.js, Python (uv), Rust, Go
- **LSP Servers** — typescript-language-server, pyright, gopls, rust-analyzer (powers agent diagnostics)
- **Modern CLI** — bat, fd, ripgrep, eza, delta, fzf, zoxide, lazygit, ast-grep, atuin
- **Shell** — zsh + Oh My Zsh + Powerlevel10k
- **Cloud CLIs** — Railway, Wrangler, Supabase, Vercel, Vault
- **Dicklesworthstone Stack** — NTM, SLB, Beads, CASS, CM, DCG, UBS, RU, and more
- **Web IDE** — code-server (VS Code in browser)
- **Session Manager** — dashboard for managing multiple tmux/ttyd sessions

## Quick Start

1. Click **Deploy on Railway** above
2. Set your API keys as environment variables
3. Open the generated URL — you get a session manager dashboard
4. Create terminal sessions, each backed by tmux

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | For Claude | Anthropic API key |
| `OPENAI_API_KEY` | For Codex | OpenAI API key |
| `GEMINI_API_KEY` | For Gemini | Google AI API key |
| `GH_TOKEN` | No | GitHub CLI token (enables PRs, issues from agents) |
| `TTYD_USER` | No | Web terminal username (default: `admin`) |
| `TTYD_PASS` | No | Web terminal password (default: `changeme`) |
| `ACFS_USER` | No | Linux username in container (default: `dev`) |
| `ACFS_HOSTNAME` | No | Container hostname (default: `acfs`) |
| `GIT_USER_NAME` | No | Git global user.name |
| `GIT_USER_EMAIL` | No | Git global user.email |
| `SSH_PRIVATE_KEY` | No | SSH private key (for git over SSH) |
| `SSH_PUBLIC_KEY` | No | SSH public key |
| `DOTFILES_REPO` | No | Git URL of dotfiles repo (cloned on first boot) |
| `OMO_CLAUDE` | No | oh-my-opencode: Claude subscription (`yes`/`no`/`max20`, default: `yes`) |
| `OMO_OPENAI` | No | oh-my-opencode: OpenAI/ChatGPT subscription (`yes`/`no`, default: `no`) |
| `OMO_GEMINI` | No | oh-my-opencode: Gemini integration (`yes`/`no`, default: `no`) |
| `OMO_COPILOT` | No | oh-my-opencode: GitHub Copilot subscription (`yes`/`no`, default: `no`) |
| `OMO_OPENCODE_ZEN` | No | oh-my-opencode: OpenCode Zen access (`yes`/`no`, default: `no`) |
| `OMO_ZAI_CODING_PLAN` | No | oh-my-opencode: Z.ai Coding Plan (`yes`/`no`, default: `no`) |
| `OMO_OPENCODE_GO` | No | oh-my-opencode: OpenCode Go subscription (`yes`/`no`, default: `no`) |
| `RAILWAY_TOKEN` | No | Railway CLI auth token |
| `VERCEL_TOKEN` | No | Vercel CLI auth token |
| `SUPABASE_ACCESS_TOKEN` | No | Supabase CLI auth token |
| `CLOUDFLARE_API_TOKEN` | No | Wrangler (Cloudflare) CLI auth token |

## How It Works

```
Browser → Railway URL → Session Manager (:7681)
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
              tmux session 1      tmux session 2
              (via ttyd)          (via ttyd)

              code-server (:18080) — VS Code in browser
```

The **Session Manager** (`session-manager/server.js`) serves a dashboard at the root URL. Each terminal session gets its own tmux session with a dedicated ttyd instance. Sessions persist across browser refreshes.

**Persistence** — Railway volumes keep your data across deploys:
- `/data/projects` — your code
- `/data/home/<user>` — home directory, shell history, configs

## Project Structure

```
acfs-railway/
├── Dockerfile                 # Builds the full image (50+ tools)
├── railway.toml               # Railway deployment config
├── railway.json               # Railway deployment config
├── session-manager/
│   └── server.js              # Dashboard + ttyd session routing
├── .env.example               # All env vars with defaults
├── acfs/                      # Configs copied INTO the Docker image
│   ├── AGENTS.md              # Agent instructions for the container
│   ├── bin/acfs-update        # Update tools without image rebuild
│   ├── claude/settings.json   # Claude Code settings (DCG hooks + MCP Agent Mail)
│   ├── codex/config.toml      # Codex CLI MCP config
│   ├── gemini/GEMINI.md       # Gemini CLI instructions
│   ├── gemini/settings.json   # Gemini CLI MCP config
│   ├── zsh/acfs.zshrc         # Shell config (aliases, integrations)
│   ├── zsh/p10k.zsh           # Powerlevel10k theme
│   ├── tmux/tmux.conf         # Tmux config (Ctrl-a prefix, vim keys)
│   └── onboard/lessons/       # Tutorial content
├── .claude/hooks/             # Claude Code hooks (copied into image)
├── AGENTS.md                  # Agent guidelines for THIS repo
├── README.md
└── LICENSE
```

## Development

### Build & Run Locally

```bash
docker build -t acfs-railway .

docker run -p 7681:7681 -p 18080:18080 \
  -e ANTHROPIC_API_KEY=sk-... \
  -e TTYD_PASS=mypassword \
  acfs-railway

# Dashboard: http://localhost:7681
# VS Code:   http://localhost:18080
```

### Dockerfile Phases

The Dockerfile installs tools in order:
1. Base system packages (apt)
2. Go + Rust toolchains
3. Modern CLI tools (bat, fd, ripgrep, eza, delta, fzf, zoxide, lazygit)
4. Language runtimes (Bun, Node.js, Python/uv)
5. AI coding agents (Claude, Codex, Gemini, OpenCode) + LSP servers
6. Cloud CLIs (Railway, Wrangler, Supabase, Vercel, Vault)
7. Dicklesworthstone stack — Go tools (NTM, SLB, BV, CAAM)
8. Dicklesworthstone stack — Rust tools (Beads, CASS, DCG, etc.)
9. Dicklesworthstone stack — Script/TS/Python tools (Agent Mail, UBS, CM, RU, etc.)
10. Shell setup (Oh My Zsh, Powerlevel10k, plugins)
11. Config deployment (zshrc, tmux.conf, AGENTS.md, agent MCP configs, hooks)
12. Entrypoint (user setup, SSH keys, git auth, cloud CLI auth, session manager)

### Modifying Container Configs

Files in `acfs/` get copied into the Docker image:
- Edit `acfs/zsh/acfs.zshrc` to change shell aliases and integrations
- Edit `acfs/tmux/tmux.conf` to change tmux keybindings
- Edit `acfs/AGENTS.md` to change agent instructions inside the container
- Edit `acfs/claude/settings.json` to change Claude Code settings

Rebuild the Docker image after changes.

## Credits

- **Upstream**: [ACFS](https://github.com/Dicklesworthstone/agentic_coding_flywheel_setup) by [Jeffrey Emanuel](https://github.com/Dicklesworthstone)
- **Railway containerization**: [99 Cooking](https://99cook.ing)
