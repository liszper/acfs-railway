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
- **NTM Orchestration** — multi-agent coordination with recipes, workflows, and a visual dashboard
- **Session Manager** — browser dashboard for NTM spawning, session management, and agent controls

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
                    ┌─────────┼─────────────────┐
                    ▼         ▼                  ▼
              NTM Dashboard   Manual Sessions    code-server (:18080)
              (spawn/send/    (tmux + ttyd)      VS Code in browser
               recipes/
               workflows)
```

The **Session Manager** (`session-manager/server.js`) serves a dashboard at the root URL with full NTM integration. You can spawn multi-agent sessions using recipes (e.g. `full-stack`, `balanced`), workflow templates (e.g. `red-green`, `review-pipeline`), or custom agent combinations. Each session gets its own tmux window with dedicated ttyd instances. Sessions persist across browser refreshes.

**Persistence** — Railway volumes keep your data across deploys:
- `/data/projects` — your code
- `/data/home/<user>` — home directory, shell history, configs

## Complete Tool Reference

Every tool below is pre-installed, configured, and ready to use. Tools marked **Agents use automatically** require no setup — AI agents discover and use them out of the box. Tools marked with config paths can be customized by editing those files and rebuilding the image.

### AI Coding Agents

**Claude Code** (`cc`)
- Anthropic's AI coding agent. Start with `cc` (alias for `claude --dangerously-skip-permissions`)
- Pre-configured with DCG hook (blocks dangerous commands) and MCP Agent Mail (inter-agent messaging)
- Config: `~/.claude/settings.json` — hooks + MCP servers
- Agents: This IS an agent

**Codex CLI** (`cod`)
- OpenAI's AI coding agent. Start with `cod` (alias for `codex --dangerously-bypass-approvals-and-sandbox`)
- Pre-configured with MCP Agent Mail
- Config: `~/.codex/config.toml` — MCP servers
- Agents: This IS an agent

**Gemini CLI** (`gmi`)
- Google's AI coding agent. The `gmi` function auto-updates, patches known bugs, then launches with `gemini --yolo`
- Pre-configured with MCP Agent Mail
- Config: `~/.gemini/settings.json` — MCP servers; `~/.gemini/GEMINI.md` — instructions
- Agents: This IS an agent

**OpenCode** (`opencode`)
- Terminal AI coding agent enhanced with oh-my-opencode multi-model harness
- Configured at first boot via `bunx oh-my-opencode install` with model flags from OMO_* env vars
- Config: `~/.config/opencode/opencode.json` (auto-generated)
- Agents: This IS an agent

### Multi-Agent Orchestration

**NTM — Named Tmux Manager** (`ntm`)
- Multi-agent session cockpit. Spawn agent teams, send prompts, manage sessions. The brain of multi-agent workflows.
- Key commands: `ntm spawn --recipe full-stack -p /data/projects/myapp`, `ntm list`, `ntm send <session> "prompt"`, `ntm attach <session>`, `ntm palette`
- 6 built-in recipes: minimal (1 Claude), quick-claude (2 Claude), full-stack (3 Claude + 2 Codex + 1 Gemini), balanced (2 Claude + 1 Codex + 1 Gemini), review (2 Claude + 1 Codex), heavy (4 Claude + 3 Codex + 2 Gemini)
- 4 workflow templates: red-green (TDD), review-pipeline, spike-and-stabilize, mob-programming
- Also accessible from the web dashboard (spawn panel, session controls)
- Config: `~/.config/ntm/config.toml` — agent commands, resilience settings, CASS/DCG integrations
- Agents: Used BY agents (they're spawned inside NTM sessions)

**MCP Agent Mail** (`am`)
- Asynchronous messaging layer for inter-agent coordination. Agents register identities, reserve files (prevents conflicts), send threaded messages, and read inboxes — all via MCP protocol.
- Key tools (used by agents): `ensure_project`, `register_agent`, `send_message`, `fetch_inbox`, `file_reservation_paths`
- Macros for speed: `macro_start_session`, `macro_prepare_thread`, `macro_file_reservation_cycle`
- All 3 agents (Claude, Codex, Gemini) have this MCP server pre-configured
- Persistent mailbox at `/data/mcp-agent-mail/mailbox` (survives deploys)
- Config: Built into each agent's settings (claude/settings.json, codex/config.toml, gemini/settings.json)
- Agents: **Agents use this automatically** via MCP — no human intervention needed

**SLB — Simultaneous Launch Button** (`slb`)
- Two-person rule enforcement for dangerous operations. Requires two agents to independently approve before destructive commands execute.
- Usage: `slb <dangerous-command>` — blocks until two approvals are received
- Agents: **Agents invoke this** when needed (via DCG integration or directly)

### Language Runtimes & Package Managers

**Bun** (`bun`, `bunx`)
- Ultra-fast JavaScript/TypeScript runtime, bundler, and package manager. Used as the default for TS/JS tooling in the container.
- Aliases: `bdev` → `bun run dev`, `bl` → `bun run lint`, `bt` → `bun run type-check`
- Agents: Agents use bun for running JS/TS projects

**Node.js** (`node`, `npm`, `npx`)
- LTS version installed via `n` version manager. Powers npm global tools (Claude Code, Codex, Gemini CLI, etc).
- Version management: `n lts`, `n latest`, `n <version>`
- Agents: Agents use node/npm for project tooling

**Python + uv** (`python3`, `uv`, `uvx`)
- Python 3 with uv (ultra-fast pip replacement). uv handles venv creation, dependency resolution, and installs 10-100x faster than pip.
- Usage: `uv venv`, `uv pip install <pkg>`, `uvx <tool>` (run tool without install)
- Agents: Agents use uv for Python projects

**Go** (`go`)
- Go 1.23.6. Used to build NTM, SLB, BV, CAAM, and gopls.
- Agents: Agents use go for Go projects

**Rust** (`cargo`, `rustc`, `rustup`)
- Stable toolchain via rustup. Used to build Beads, CASS, DCG, ast-grep, and 10+ other Rust tools.
- Agents: Agents use cargo for Rust projects

### LSP Servers

These run in the background and give AI agents real-time diagnostics (type errors, unused imports, etc). Agents call `lsp_diagnostics`, `lsp_rename`, `lsp_goto_definition` etc. powered by these servers. **No human action needed — agents auto-discover them.**

| Server | Languages | Command |
|--------|-----------|---------|
| typescript-language-server | TypeScript, JavaScript | `typescript-language-server --stdio` |
| pyright | Python | `pyright-langserver --stdio` |
| gopls | Go | `gopls serve` |
| rust-analyzer | Rust | `rust-analyzer` |

### Modern CLI Tools

**bat** (`bat`, aliased as `cat`)
- Syntax-highlighted file viewer with line numbers. Replaces `cat`. Theme: Catppuccin Mocha.
- Usage: `bat file.rs`, `cat file.rs` (same thing via alias)
- Also used as: `MANPAGER` (colorized man pages), fzf preview pane
- Config: `~/.config/bat/config`
- Agents: **Agents benefit** — better file previews in tools that use cat

**fd** (`fd`, aliased as `find`)
- Ultra-fast file finder. Replaces `find`. Respects .gitignore, colorized output.
- Usage: `fd pattern`, `find pattern` (same via alias), `fd -e rs` (find by extension)
- Also used as: fzf file source (`FZF_DEFAULT_COMMAND`), fzf completion backend
- Agents: Agents use fd for file discovery

**ripgrep** (`rg`, aliased as `grep`)
- Ultra-fast content search. Replaces `grep`. Respects .gitignore.
- Usage: `rg pattern`, `grep pattern` (same via alias), `rg -t rust unwrap`
- Agents: Agents use rg extensively for code search

**eza** (`eza`, aliased as `ls`, `ll`, `la`, `tree`)
- Modern file lister with icons, git status, tree view. Replaces `ls`.
- Aliases: `ls` → `eza --icons`, `ll` → `eza -l --icons`, `la` → `eza -la --icons`, `tree` → `eza --tree --icons`
- Also: auto-runs on `cd` (via zsh chpwd hook)
- Agents: Agents see eza output when listing directories

**delta** (`delta`)
- Beautiful git diff viewer with syntax highlighting, line numbers, side-by-side mode.
- Auto-configured as git pager (`git config core.pager delta`). All `git diff`, `git log`, `git show` use delta automatically.
- Also: lazygit pager, interactive diff filter
- Config: Set via git config in entrypoint
- Agents: **Agents benefit automatically** — all git diffs are syntax-highlighted

**fzf** (`fzf`, Ctrl+T, Ctrl+R, Alt+C)
- Fuzzy finder for files, history, directories. Catppuccin-themed.
- Keybindings: `Ctrl+T` (find files, bat preview), `Ctrl+R` (search history via atuin), `Alt+C` (cd to directory, eza tree preview)
- Uses fd as file source, bat for file preview, eza for directory preview
- Config: Env vars in zshrc (`FZF_DEFAULT_COMMAND`, `FZF_DEFAULT_OPTS`, etc.)
- Agents: Agents can use fzf in scripts

**zoxide** (`z`, `zi`)
- Smart directory jumper. Learns your most-visited directories, then `z foo` jumps to the best match.
- Usage: `z projects` (jump to /data/projects), `zi` (interactive selection)
- Agents: Available to agents for navigation

**lazygit** (`lg`)
- Full-featured git TUI. Staging, committing, branching, rebasing — all from a terminal UI.
- Usage: `lg` (launch in current repo)
- Config: `~/.config/lazygit/config.yml` — uses delta as pager
- Agents: Agents can launch lazygit if needed

**ast-grep** (`sg`)
- AST-aware code search and rewriting. Unlike regex, it understands code structure — ignores comments/strings, matches syntax patterns.
- Usage: `sg run -l Rust -p '$EXPR.unwrap()'` (find all unwrap calls), `sg run -l TypeScript -p 'console.log($MSG)'`
- Required by UBS (Ultimate Bug Scanner) for structural analysis
- Agents: **Agents use ast-grep** for refactoring and code search

**atuin** (`atuin`, Ctrl+R)
- Searchable shell history database. Replaces default Ctrl+R with fuzzy, context-aware history search.
- Usage: `Ctrl+R` (search), `atuin search <query>`, `atuin stats`
- Config: `~/.config/atuin/config.toml` — local-only mode (no sync server), fuzzy search
- Agents: History is searchable by agents via CASS

### Code Quality & Safety

**DCG — Destructive Command Guard** (`dcg`)
- Intercepts dangerous commands (`rm -rf`, `git reset --hard`, `git push --force`, etc.) before they execute. Blocks or requires confirmation.
- **Agents: Runs automatically** — Claude Code has DCG as a `PreToolUse` hook on every Bash command. NTM also integrates DCG.
- Config: Baked into `~/.claude/settings.json` hooks and `~/.config/ntm/config.toml`

**UBS — Ultimate Bug Scanner** (`ubs`)
- AST-aware multi-language bug scanner. Catches memory safety issues, SQL injection, resource leaks, unwrap panics, and more.
- Usage: `ubs file.rs file2.rs` (scan specific files), `ubs $(git diff --name-only --cached)` (scan staged files), `ubs .` (scan whole project)
- Exit 0 = clean, Exit >0 = bugs found. Each finding includes file:line:col and a fix suggestion.
- **Agents: Runs automatically** — Claude Code has UBS as an `on-file-write` hook
- Config: Hook at `~/.claude/hooks/on-file-write.sh`

**Beads** (`br`)
- Dependency-aware issue tracker. Lightweight, graph-based. Issues can block other issues; `br ready` shows only unblocked work.
- Key commands: `br ready` (show ready work), `br create --title="..." --type=task --priority=2`, `br list --status=open`, `br close <id>`, `br sync --flush-only`
- Priority: P0=critical → P4=backlog. Types: task, bug, feature, epic, question, docs
- **Agents: Agents use beads** for task management. Thread IDs link to Agent Mail (`thread_id="br-123"`).

**BV — Beads Viewer** (`bv`)
- Graph-aware triage engine for Beads. Computes PageRank, betweenness, critical path, HITS metrics to answer "what should I work on next?"
- **CRITICAL: Use `--robot-*` flags only.** Bare `bv` launches interactive TUI.
- Key commands: `bv --robot-triage` (THE mega-command — top picks, quick wins, blockers), `bv --robot-next` (single top pick), `bv --robot-plan` (parallel execution tracks), `bv --robot-insights` (full graph metrics)
- **Agents: Agents use BV** to prioritize work. `--robot-triage` is the entry point.

### Agent Workflow Tools

**CASS — Coding Agent Session Search** (`cass`)
- Full-text search across all agent session histories (Claude, Codex, Gemini conversations). Find what any agent said about a topic.
- Usage: `cass <query>` (search all sessions), `cass --agent claude <query>`
- Config: `~/.config/cass/sources.toml` — paths to session data
- **Agents: Agents use CASS** to recall past conversations and context

**CM — Procedural Memory** (`cm`)
- Long-term memory for agents. Stores and retrieves patterns, decisions, and learnings across sessions.
- Usage: `cm recall <query>` (search past patterns), `cm store <key> <value>`
- **Agents: Agents use CM** to maintain continuity across sessions

**CAAM — Agent Account Manager** (`caam`)
- Switch between AI provider API keys. Useful when hitting rate limits — rotate to a different key.
- Usage: `caam switch`, `caam status`
- Integrated with NTM (auto-rotate on rate limit)
- **Agents: Used by NTM** to auto-rotate API keys

**CAUT — Coding Agent Usage Tracker** (`caut`)
- Tracks token usage and costs across all AI providers (Anthropic, OpenAI, Google).
- Usage: `caut report` (usage summary), `caut report --json`
- Config: `~/.config/caut/config.toml` — all providers enabled
- Also accessible from the dashboard Tools tab
- **Agents: Tracked automatically** — provides cost visibility

**Meta Skill** (`meta-skill` or `ms`)
- Semantic search knowledge base. Index and search across skills, documentation, and code patterns.
- Config: `~/.config/ms/config.toml` — CASS/DCG integration
- **Agents: Agents query Meta Skill** for relevant knowledge

### Utilities & Converters

**RANO — Network Observer** (`rano`)
- Monitors network requests from AI CLI tools. Logs API calls, tracks latency, detects anomalies.
- Config: `~/.config/rano/config.conf` — logs persist to `/data/rano/logs`
- Agents: Runs in background, observes agent API calls

**APR — Automated Plan Reviser** (`apr`)
- Iteratively refines project specs/plans using AI feedback loops.
- Usage: `apr <spec-file>`
- Agents: Agents can invoke APR for plan refinement

**JFP — Jeffrey's Prompts** (`jfp`)
- Curated library of agent prompts for common tasks (code review, refactoring, debugging, etc).
- Usage: `jfp list`, `jfp show <prompt-name>`
- Agents: Agents can pull optimized prompts from the library

**S2P — Source to Prompt** (`s2p`)
- TUI that converts source code into optimized prompts for AI agents. Select files, configure context, generate prompt.
- Usage: `s2p` (launches TUI)
- Human-facing tool

**Brenner Bot** (`brenner`)
- Research session manager. Conducts structured research sessions with AI agents on a topic.
- Usage: `brenner <topic>`
- Agents: Agents can use Brenner for deep research

**RU — Repo Updater** (`ru`)
- Multi-repo sync tool. Pull, commit, and push across all managed repositories.
- Usage: `ru sync` (sync all repos), `ru status`
- Config: `~/.config/ru/config` — base path `/data/projects`, flat layout

**GIIL** (`giil`)
- Download images from URLs. Simple utility for grabbing image assets.
- Usage: `giil <url> [output-dir]`

**CSCTF** (`csctf`)
- Save shared chat conversations to files. Export agent conversations for reference.
- Usage: `csctf <conversation-url>`

**XF** (`xf`)
- Ultra-fast Twitter/X archive search powered by Tantivy (Rust full-text engine).
- Usage: `xf search <query>`

**Toon Rust** (`toon`)
- Token-optimized notation. Compress code representations to save tokens when feeding to AI agents.
- Usage: `toon <file>`
- Agents: Can reduce token usage in large contexts

**MDWB — Markdown Web Browser** (`mdwb`)
- Renders web pages as markdown. Useful for feeding web content to AI agents.
- Usage: `mdwb <url>`
- Note: Requires OCR capabilities for some pages

**Rust Proxy** (`rust-proxy`)
- Transparent HTTP/HTTPS proxy routing. Useful for intercepting/inspecting API traffic.
- Usage: `rust-proxy --port <port>`

**AADC — ASCII Diagram Corrector** (`aadc`)
- Fixes and aligns ASCII art diagrams in code comments and documentation.
- Usage: `aadc <file>`
- Agents: Can fix agent-generated ASCII diagrams

### Cloud CLIs

All cloud CLIs auto-authenticate from environment variables set in Railway.

| CLI | Command | Auth Env Var | What It Does |
|-----|---------|-------------|--------------|
| Railway | `railway` | `RAILWAY_TOKEN` | Deploy, manage Railway services |
| Wrangler | `wrangler` | `CLOUDFLARE_API_TOKEN` | Cloudflare Workers, R2, KV |
| Supabase | `supabase` | `SUPABASE_ACCESS_TOKEN` | Postgres, auth, storage, edge functions |
| Vercel | `vercel` | `VERCEL_TOKEN` | Deploy frontend, serverless functions |
| Vault | `vault` | `VAULT_ADDR` + `VAULT_TOKEN` | HashiCorp secrets management |
| GitHub CLI | `gh` | `GH_TOKEN` | PRs, issues, releases, repos |

Agents: **Agents use these directly** — `gh` is especially critical for creating PRs and managing issues.

### Web Interface

**code-server** (port 18080)
- VS Code in the browser. Full editor with extensions, terminal, debugging.
- Access via dashboard link or directly at `:18080`
- Auth: same password as `TTYD_PASS`

**ttyd** (internal, managed by Session Manager)
- Web terminal backend. Each browser terminal tab is a ttyd instance connected to a tmux session.
- Not accessed directly — the Session Manager routes to ttyd instances automatically.

**Session Manager Dashboard** (port 7681, root URL)
- The main interface. NTM spawn panel, session management, agent status badges, Tools tab.
- Tabs: Sessions, NTM (recipes + workflows + custom spawn), Tools (inventory, system stats, CASS search, CAUT usage)

### Shell & Terminal

**zsh + Oh My Zsh + Powerlevel10k**
- Pre-configured shell with: git plugin, sudo plugin, syntax highlighting, autosuggestions, colored man pages
- Theme: Powerlevel10k (instant prompt, git status, error codes)
- Config: `~/.zshrc`

**tmux** (Ctrl-a prefix)
- Terminal multiplexer. Every session runs inside tmux for persistence.
- Key bindings: `Ctrl-a |` (split horizontal), `Ctrl-a -` (split vertical), `Ctrl-a h/j/k/l` (navigate panes), `Ctrl-a z` (zoom), `Ctrl-a [` (copy mode → `v` to select → `y` to copy)
- Mouse mode OFF (browser handles selection natively for copy-paste)
- Config: `~/.tmux.conf`

**Clipboard helpers** (`clip`, `xclip`, `xsel`)
- OSC 52 clipboard shims that bridge tmux → ttyd → browser clipboard. All three commands do the same thing via different names (some tools expect xclip, others xsel).
- Usage: `echo "text" | clip` (copy), `clip "text"` (copy arg), `clip -o` (paste from tmux buffer)
- Agents: **Agents use these** when they need to interact with clipboard

**acfs-update** (`acfs-update`)
- Update all tools in-place without rebuilding the Docker image. Pulls latest versions of the Dicklesworthstone stack tools.
- Usage: `acfs-update`

## Project Structure

```
acfs-railway/
├── Dockerfile                 # Builds the full image (50+ tools)
├── railway.toml               # Railway deployment config
├── railway.json               # Railway deployment config
├── session-manager/
│   └── server.js              # NTM dashboard + ttyd session routing
├── .env.example               # All env vars with defaults
├── acfs/                      # Configs copied INTO the Docker image
│   ├── AGENTS.md              # Agent instructions for the container
│   ├── bin/acfs-update        # Update tools without image rebuild
│   ├── bin/clip               # OSC 52 clipboard helper (web terminal copy)
│   ├── bin/xclip              # xclip shim → OSC 52
│   ├── bin/xsel               # xsel shim → OSC 52
│   ├── claude/settings.json   # Claude Code settings (DCG hooks + MCP Agent Mail)
│   ├── codex/config.toml      # Codex CLI MCP config
│   ├── gemini/GEMINI.md       # Gemini CLI instructions
│   ├── gemini/settings.json   # Gemini CLI MCP config
│   ├── ntm/config.toml        # NTM multi-agent orchestration config
│   ├── atuin/config.toml      # Atuin shell history (local-only, no sync)
│   ├── bat/config             # bat theme + pager settings
│   ├── lazygit/config.yml     # lazygit delta pager
│   ├── rano/config.conf       # RANO network observer config
│   ├── meta-skill/config.toml # Meta Skill search + CASS/DCG integration
│   ├── cass/sources.toml      # CASS agent session source paths
│   ├── caut/config.toml       # CAUT agent usage tracker (all providers)
│   ├── ru/config              # Repo Updater settings
│   ├── zsh/acfs.zshrc         # Shell config (aliases, fzf, integrations)
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
