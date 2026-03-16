# ============================================================
# ACFS Railway — Agentic Coding Flywheel on Railway
# Browser-accessible coding terminal with AI agents pre-installed
# Multi-stage build: Go/Rust stack tools built in builder stages,
# only binaries copied to final image (~4GB layer savings)
# ============================================================

# ===== Stage 1: Go stack tool builder =====
# Go 1.25+ required by ntm, bv; 1.24.4+ by slb
FROM golang:1.26.1-bookworm AS go-tools
WORKDIR /build
RUN mkdir -p /out

# NTM — multi-agent tmux orchestrator
RUN git clone --depth 1 https://github.com/Dicklesworthstone/ntm.git ntm \
    && cd ntm && go build -o /out/ntm ./cmd/ntm \
    && cd /build && rm -rf ntm

# SLB — two-person rule safety (use goreleaser prebuilt binary)
RUN curl -fsSL "https://github.com/Dicklesworthstone/simultaneous_launch_button/releases/latest/download/slb_$(curl -fsSL https://api.github.com/repos/Dicklesworthstone/simultaneous_launch_button/releases/latest | grep tag_name | cut -d'"' -f4 | sed 's/^v//')_linux_amd64.tar.gz" \
    | tar -xz -C /out/ slb 2>/dev/null \
    || (git clone --depth 1 https://github.com/Dicklesworthstone/simultaneous_launch_button.git slb \
        && cd slb && go build -o /out/slb ./cmd/slb \
        && cd /build && rm -rf slb)

# BV — graph-aware triage engine for Beads
RUN git clone --depth 1 https://github.com/Dicklesworthstone/beads_viewer.git bv \
    && cd bv && go build -o /out/bv ./cmd/bv \
    && cd /build && rm -rf bv

# ===== Stage 2: Rust stack tool builder =====
FROM rust:latest AS rust-tools
WORKDIR /build
RUN mkdir -p /out

RUN cargo install ast-grep --locked 2>/dev/null && cp /usr/local/cargo/bin/sg /out/ || true

# beads_rust — binary name is "br" (defined via [[bin]] in Cargo.toml)
RUN (git clone --depth 1 https://github.com/Dicklesworthstone/beads_rust.git beads \
    && cd beads && cargo build --release \
    && cp target/release/br /out/ \
    && cd /build && rm -rf beads) || true

RUN (git clone --depth 1 https://github.com/Dicklesworthstone/meta_skill.git ms \
    && cd ms && cargo build --release \
    && find target/release -maxdepth 1 -type f -executable ! -name "*.d" -exec cp {} /out/ \; \
    && cd /build && rm -rf ms) || true

RUN (git clone --depth 1 https://github.com/Dicklesworthstone/coding_agent_session_search.git cass \
    && cd cass && cargo build --release \
    && find target/release -maxdepth 1 -type f -executable ! -name "*.d" -exec cp {} /out/ \; \
    && cd /build && rm -rf cass) || true

RUN (git clone --depth 1 https://github.com/Dicklesworthstone/xf.git xf \
    && cd xf && cargo build --release \
    && find target/release -maxdepth 1 -type f -executable ! -name "*.d" -exec cp {} /out/ \; \
    && cd /build && rm -rf xf) || true

RUN (git clone --depth 1 https://github.com/Dicklesworthstone/toon_rust.git tru \
    && cd tru && cargo build --release \
    && find target/release -maxdepth 1 -type f -executable ! -name "*.d" -exec cp {} /out/ \; \
    && cd /build && rm -rf tru) || true

RUN (git clone --depth 1 https://github.com/Dicklesworthstone/rano.git rano \
    && cd rano && cargo build --release \
    && find target/release -maxdepth 1 -type f -executable ! -name "*.d" -exec cp {} /out/ \; \
    && cd /build && rm -rf rano) || true

RUN (git clone --depth 1 https://github.com/Dicklesworthstone/rust_proxy.git rp \
    && cd rp && cargo build --release \
    && find target/release -maxdepth 1 -type f -executable ! -name "*.d" -exec cp {} /out/ \; \
    && cd /build && rm -rf rp) || true

RUN (git clone --depth 1 https://github.com/Dicklesworthstone/aadc.git aadc \
    && cd aadc && cargo build --release \
    && find target/release -maxdepth 1 -type f -executable ! -name "*.d" -exec cp {} /out/ \; \
    && cd /build && rm -rf aadc) || true

RUN (git clone --depth 1 https://github.com/Dicklesworthstone/coding_agent_usage_tracker.git caut \
    && cd caut && cargo build --release \
    && find target/release -maxdepth 1 -type f -executable ! -name "*.d" -exec cp {} /out/ \; \
    && cd /build && rm -rf caut) || true

# JFP — JeffreysPrompts CLI (agent-optimized prompt browser)
RUN (git clone --depth 1 https://github.com/Dicklesworthstone/jeffreysprompts.com.git jfp \
    && cd jfp && cargo build --release \
    && cp target/release/jfp /out/ \
    && cd /build && rm -rf jfp) || true

# ===== Stage 3: Final image =====
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    NEEDRESTART_MODE=a \
    TERM=xterm-256color \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    SHELL=/bin/zsh

# Configurable user and hostname (override via Railway env vars)
ENV ACFS_USER=dev \
    ACFS_HOSTNAME=acfs

# ============================================================
# Phase 1: Base system packages
# ============================================================
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git ca-certificates unzip tar xz-utils jq build-essential \
    gnupg wget sudo zsh locales procps htop vim nano tmux tree openssh-client openssh-server \
    libssl-dev pkg-config libsqlite3-dev \
    python3 python3-pip python3-venv \
    && locale-gen en_US.UTF-8 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ============================================================
# Phase 2: Go + Rust (needed for stack tools)
# ============================================================
RUN curl -fsSL "https://go.dev/dl/go1.26.1.linux-amd64.tar.gz" | tar -C /usr/local -xz
ENV PATH="/usr/local/go/bin:$PATH"

ENV RUSTUP_HOME="/opt/rustup" \
    CARGO_HOME="/opt/cargo"
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
ENV PATH="/opt/cargo/bin:$PATH"

ENV GOPATH="/opt/gopath"

# ============================================================
# Phase 3: Modern CLI tools
# ============================================================
RUN curl -fsSL "https://github.com/sharkdp/bat/releases/download/v0.24.0/bat-v0.24.0-x86_64-unknown-linux-gnu.tar.gz" \
    | tar -xz -C /tmp && mv /tmp/bat-v0.24.0-x86_64-unknown-linux-gnu/bat /usr/local/bin/ && rm -rf /tmp/bat-*

RUN curl -fsSL "https://github.com/sharkdp/fd/releases/download/v10.2.0/fd-v10.2.0-x86_64-unknown-linux-gnu.tar.gz" \
    | tar -xz -C /tmp && mv /tmp/fd-v10.2.0-x86_64-unknown-linux-gnu/fd /usr/local/bin/ && rm -rf /tmp/fd-*

RUN curl -fsSL "https://github.com/BurntSushi/ripgrep/releases/download/14.1.1/ripgrep-14.1.1-x86_64-unknown-linux-musl.tar.gz" \
    | tar -xz -C /tmp && mv /tmp/ripgrep-14.1.1-x86_64-unknown-linux-musl/rg /usr/local/bin/ && rm -rf /tmp/ripgrep-*

RUN curl -fsSL "https://github.com/eza-community/eza/releases/latest/download/eza_x86_64-unknown-linux-gnu.tar.gz" \
    | tar -xz -C /tmp && mv /tmp/eza /usr/local/bin/ && rm -rf /tmp/eza*

RUN curl -fsSL "https://github.com/dandavison/delta/releases/download/0.18.2/delta-0.18.2-x86_64-unknown-linux-gnu.tar.gz" \
    | tar -xz -C /tmp && mv /tmp/delta-0.18.2-x86_64-unknown-linux-gnu/delta /usr/local/bin/ && rm -rf /tmp/delta-*

RUN curl -fsSL "https://github.com/junegunn/fzf/releases/download/v0.57.0/fzf-0.57.0-linux_amd64.tar.gz" \
    | tar -xz -C /usr/local/bin/

RUN curl -fsSL "https://github.com/ajeetdsouza/zoxide/releases/download/v0.9.6/zoxide-0.9.6-x86_64-unknown-linux-musl.tar.gz" \
    | tar -xz -C /usr/local/bin/ zoxide

RUN curl -fsSL "https://github.com/jesseduffield/lazygit/releases/download/v0.44.1/lazygit_0.44.1_Linux_x86_64.tar.gz" \
    | tar -xz -C /usr/local/bin/ lazygit

# ast-grep built in rust-tools stage, binary copied via COPY --from

# atuin (shell history with search)
RUN curl -fsSL "https://github.com/atuinsh/atuin/releases/latest/download/atuin-x86_64-unknown-linux-musl.tar.gz" \
    | tar -xz -C /tmp && mv /tmp/atuin-*/atuin /usr/local/bin/ && rm -rf /tmp/atuin-* \
    || echo "atuin: install skipped"

# ============================================================
# Phase 4: Language runtimes
# ============================================================

# Bun
ENV BUN_INSTALL="/opt/bun"
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="$BUN_INSTALL/bin:$PATH"

# uv (Python)
RUN curl -LsSf https://astral.sh/uv/install.sh | CARGO_HOME=/opt/uv sh
RUN mv /root/.local/bin/uv /usr/local/bin/ 2>/dev/null || mv /opt/uv/bin/uv /usr/local/bin/ 2>/dev/null || true
RUN mv /root/.local/bin/uvx /usr/local/bin/ 2>/dev/null || true

# Node.js LTS (via n — installs to /usr/local)
RUN curl -fsSL https://raw.githubusercontent.com/tj/n/master/bin/n -o /usr/local/bin/n \
    && chmod +x /usr/local/bin/n \
    && n lts

# ============================================================
# Phase 5: AI Coding Agents
# ============================================================
RUN npm install -g @anthropic-ai/claude-code
RUN npm install -g @openai/codex 2>/dev/null || echo "codex: not yet available via npm"
RUN npm install -g @google/gemini-cli 2>/dev/null || echo "gemini: not yet available via npm"

# OpenCode (terminal AI agent) — anomalyco/opencode (the real one)
RUN curl -fsSL "https://github.com/anomalyco/opencode/releases/latest/download/opencode-linux-x64.tar.gz" \
    | tar -xz -C /usr/local/bin/ \
    || echo "opencode: install skipped"

# oh-my-openagent (OpenCode enhancer — multi-model agent harness)
RUN npm install -g oh-my-opencode 2>/dev/null || \
    (git clone --depth 1 -b dev https://github.com/code-yeongyu/oh-my-openagent.git /tmp/omo \
    && cd /tmp/omo && bun install && bun run build 2>/dev/null \
    && npm install -g . \
    && cd / && rm -rf /tmp/omo) \
    || echo "oh-my-openagent: install skipped"

# ============================================================
# Phase 5b: LSP servers (powers lsp_diagnostics, lsp_rename, etc.)
# ============================================================
RUN npm install -g typescript typescript-language-server 2>/dev/null || echo "ts-lsp: install skipped"
RUN npm install -g pyright 2>/dev/null || echo "pyright: install skipped"
RUN GOPATH=/opt/gopath go install golang.org/x/tools/gopls@latest 2>/dev/null \
    && cp /opt/gopath/bin/gopls /usr/local/bin/ 2>/dev/null \
    || echo "gopls: install skipped"
RUN curl -fsSL "https://github.com/rust-lang/rust-analyzer/releases/latest/download/rust-analyzer-x86_64-unknown-linux-gnu.gz" \
    | gunzip > /usr/local/bin/rust-analyzer && chmod +x /usr/local/bin/rust-analyzer \
    || echo "rust-analyzer: install skipped"

# ============================================================
# Phase 6: Cloud CLIs
# ============================================================

# GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y gh \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN npm install -g wrangler 2>/dev/null || echo "wrangler: install skipped"
RUN curl -fsSL "https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz" \
    | tar -xz -C /usr/local/bin supabase \
    || echo "supabase: install skipped"
RUN npm install -g vercel 2>/dev/null || echo "vercel: install skipped"

# HashiCorp Vault
RUN curl -fsSL "https://releases.hashicorp.com/vault/1.17.2/vault_1.17.2_linux_amd64.zip" -o /tmp/vault.zip \
    && unzip -q /tmp/vault.zip -d /usr/local/bin/ && rm /tmp/vault.zip \
    || echo "vault: install skipped"

# Railway CLI
RUN npm install -g @railway/cli 2>/dev/null || echo "railway: install skipped"

# ============================================================
# Phase 7+8: Dicklesworthstone Stack — Go + Rust tool binaries
# Built in separate stages (go-tools, rust-tools), only binaries copied here.
# This eliminates ~4GB of intermediate build layers.
# ============================================================
COPY --from=go-tools /out/ /usr/local/bin/
COPY --from=rust-tools /out/ /usr/local/bin/

# Copy any go-installed binaries from final-stage gopath
RUN cp /opt/gopath/bin/* /usr/local/bin/ 2>/dev/null || true

# ============================================================
# Phase 9: Dicklesworthstone Stack — Script/TS/Python tools
# ============================================================
RUN mkdir -p /opt/acfs

# ── Tools with install scripts (upstream-blessed method) ──
# Each repo's install.sh handles deps, builds, and PATH setup correctly.
# We run as root with --easy-mode/--yes and DEST=/usr/local/bin.

# MCP Agent Mail — inter-agent messaging
# Install script lives under scripts/; --no-start avoids launching the server
# at build time; --skip-beads/--skip-bv since those are built in earlier stages.
# After install, create an `am` wrapper so the command is on PATH.
RUN curl -fsSL "https://raw.githubusercontent.com/Dicklesworthstone/mcp_agent_mail/main/scripts/install.sh" \
    | bash -s -- --yes --no-start --skip-beads --skip-bv --dir /opt/acfs/mcp_agent_mail \
    && printf '#!/bin/sh\ncd /opt/acfs/mcp_agent_mail && exec scripts/run_server_with_token.sh "$@"\n' \
       > /usr/local/bin/am && chmod +x /usr/local/bin/am \
    || echo "mcp-agent-mail: install skipped"

# DCG — destructive command guard (install script is more reliable than cargo build)
RUN curl -fsSL https://raw.githubusercontent.com/Dicklesworthstone/destructive_command_guard/main/install.sh \
    | DEST=/usr/local/bin bash -s -- --easy-mode \
    || echo "dcg: install skipped (will use Rust-built binary)"

# Process Triage — zombie process finder
RUN curl -fsSL https://raw.githubusercontent.com/Dicklesworthstone/process_triage/main/install.sh \
    | DEST=/usr/local/bin bash -s -- --easy-mode \
    || echo "pt: install skipped (will use Rust-built binary)"

# APR — automated plan reviser
RUN curl -fsSL https://raw.githubusercontent.com/Dicklesworthstone/automated_plan_reviser_pro/main/install.sh \
    | DEST=/usr/local/bin bash -s -- --easy-mode \
    || echo "apr: install skipped"

# CM — CASS memory system (procedural memory for agents)
RUN curl -fsSL https://raw.githubusercontent.com/Dicklesworthstone/cass_memory_system/main/install.sh \
    | DEST=/usr/local/bin bash -s -- --yes \
    || echo "cm: install skipped"

# CAAM — coding agent account manager
RUN curl -fsSL https://raw.githubusercontent.com/Dicklesworthstone/coding_agent_account_manager/main/install.sh \
    | DEST=/usr/local/bin bash -s -- --yes \
    || echo "caam: install skipped"

# Brenner Bot — research session manager
RUN curl -fsSL https://raw.githubusercontent.com/Dicklesworthstone/brenner_bot/main/install.sh \
    | bash -s -- --system --easy-mode \
    || echo "brenner: install skipped"

# CSCTF — chat shared conversation to file
RUN curl -fsSL https://raw.githubusercontent.com/Dicklesworthstone/chat_shared_conversation_to_file/main/install.sh \
    | DEST=/usr/local/bin bash -s -- --yes \
    || echo "csctf: install skipped"

# MDWB — markdown web browser (Python/uv project; skip Playwright browsers & sys deps)
RUN curl -fsSL https://raw.githubusercontent.com/Dicklesworthstone/markdown_web_browser/main/install.sh \
    | bash -s -- --yes --no-deps --no-browsers --dir=/opt/acfs/mdwb \
    && ln -sf /opt/acfs/mdwb/mdwb /usr/local/bin/mdwb \
    || echo "mdwb: install skipped"

# S2P — source to prompt TUI
RUN curl -fsSL https://raw.githubusercontent.com/Dicklesworthstone/source_to_prompt_tui/main/install.sh \
    | DEST=/usr/local/bin bash -s -- --skip-cass \
    || echo "s2p: install skipped"

# ── Tools without install scripts (manual install) ──

# Ultimate Bug Scanner — AST-aware scanning (Bash, needs ast-grep)
RUN (git clone --depth 1 https://github.com/Dicklesworthstone/ultimate_bug_scanner.git /opt/acfs/ubs \
    && chmod +x /opt/acfs/ubs/ubs \
    && ln -sf /opt/acfs/ubs/ubs /usr/local/bin/ubs) \
    || echo "ubs: install skipped"

# Repo Updater — multi-repo sync + AI commits (Bash)
RUN (git clone --depth 1 https://github.com/Dicklesworthstone/repo_updater.git /opt/acfs/ru \
    && chmod +x /opt/acfs/ru/ru \
    && ln -sf /opt/acfs/ru/ru /usr/local/bin/ru) \
    || echo "ru: install skipped"

# GIIL — download images from URLs (Bash)
RUN (git clone --depth 1 https://github.com/Dicklesworthstone/giil.git /opt/acfs/giil \
    && chmod +x /opt/acfs/giil/giil \
    && ln -sf /opt/acfs/giil/giil /usr/local/bin/giil) \
    || echo "giil: install skipped"

# Go/Rust build caches no longer accumulate here (multi-stage build)
RUN rm -rf /tmp/*

# ============================================================
# Phase 10: Copy session manager and ACFS repo config files
# ============================================================
COPY session-manager /opt/acfs-session-manager
COPY acfs /opt/acfs-repo/acfs
COPY .claude /opt/acfs-repo/.claude

# ============================================================
# Phase 10b: code-server (VS Code in browser)
RUN curl -fsSL https://code-server.dev/install.sh | sh 2>/dev/null \
    || echo "code-server: install skipped"

# Phase 10c: ttyd (web terminal) — prebuilt binary
# ============================================================
RUN curl -fsSL "https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64" -o /usr/local/bin/ttyd \
    && chmod +x /usr/local/bin/ttyd

# ============================================================
# Phase 10d: Process supervision + OAuth authentication
# ============================================================

# supervisord — process manager for session-manager, code-server, oauth2-proxy
RUN pip3 install --break-system-packages supervisor

# oauth2-proxy — optional OAuth2 auth layer (GitHub/Google/OIDC)
# Only active when OAUTH2_CLIENT_ID env var is set at runtime
ARG OAUTH2_PROXY_VERSION=v7.14.3
RUN curl -fsSL "https://github.com/oauth2-proxy/oauth2-proxy/releases/download/${OAUTH2_PROXY_VERSION}/oauth2-proxy-${OAUTH2_PROXY_VERSION}.linux-amd64.tar.gz" \
    | tar -xz --strip-components=1 -C /usr/local/bin "oauth2-proxy-${OAUTH2_PROXY_VERSION}.linux-amd64/oauth2-proxy" \
    || echo "oauth2-proxy: install skipped"

# inotify-tools — file watcher for audit logging
RUN apt-get update && apt-get install -y --no-install-recommends inotify-tools \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ============================================================
# Phase 11: Create default non-root user
# ============================================================
RUN useradd -m -s /bin/zsh -G sudo dev \
    && echo 'dev ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/dev \
    && chmod 0440 /etc/sudoers.d/dev \
    && mkdir -p /data/projects \
    && chown dev:dev /data/projects

# Install Oh My Zsh + plugins for the default user
RUN su - dev -c 'sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended' \
    && git clone --depth 1 https://github.com/romkatv/powerlevel10k.git /home/dev/.oh-my-zsh/custom/themes/powerlevel10k \
    && git clone --depth 1 https://github.com/zsh-users/zsh-autosuggestions /home/dev/.oh-my-zsh/custom/plugins/zsh-autosuggestions \
    && git clone --depth 1 https://github.com/zsh-users/zsh-syntax-highlighting /home/dev/.oh-my-zsh/custom/plugins/zsh-syntax-highlighting \
    && chown -R dev:dev /home/dev/.oh-my-zsh

# (zshrc is set up in Phase 12 from ACFS config)

# ============================================================
# Phase 12: Multi-agent workflow config
# ============================================================

# AGENTS.md — the master instruction file for all AI agents
RUN cp /opt/acfs-repo/acfs/AGENTS.md /home/dev/AGENTS.md 2>/dev/null || true

# Claude Code hooks (UBS on-file-write)
RUN mkdir -p /home/dev/.claude/hooks \
    && cp -r /opt/acfs-repo/.claude/hooks/* /home/dev/.claude/hooks/ 2>/dev/null || true

# Claude Code settings
RUN mkdir -p /home/dev/.claude \
    && cp /opt/acfs-repo/acfs/claude/settings.json /home/dev/.claude/settings.json 2>/dev/null || true

# Codex CLI global AGENTS.md + MCP config
RUN mkdir -p /home/dev/.codex \
    && cp /opt/acfs-repo/acfs/AGENTS.md /home/dev/.codex/AGENTS.md 2>/dev/null || true \
    && cp /opt/acfs-repo/acfs/codex/config.toml /home/dev/.codex/config.toml 2>/dev/null || true

# Gemini CLI global instructions + MCP config
RUN mkdir -p /home/dev/.gemini \
    && cp /opt/acfs-repo/acfs/gemini/GEMINI.md /home/dev/.gemini/GEMINI.md 2>/dev/null || true \
    && cp /opt/acfs-repo/acfs/gemini/settings.json /home/dev/.gemini/settings.json 2>/dev/null || true

# tmux config optimized for NTM agent workflows
RUN cp /opt/acfs-repo/acfs/tmux/tmux.conf /home/dev/.tmux.conf 2>/dev/null || true

# Use ACFS's full zshrc (comprehensive aliases, tool integrations)
RUN cp /opt/acfs-repo/acfs/zsh/acfs.zshrc /home/dev/.zshrc 2>/dev/null || true
# Copy p10k config if available
RUN cp /opt/acfs-repo/acfs/zsh/p10k.zsh /home/dev/.p10k.zsh 2>/dev/null || true

# NTM config (agent commands, resilience, CASS integration)
RUN mkdir -p /home/dev/.config/ntm \
    && cp /opt/acfs-repo/acfs/ntm/config.toml /home/dev/.config/ntm/config.toml 2>/dev/null || true

# bat config (theme, pager, syntax mappings)
RUN mkdir -p /home/dev/.config/bat \
    && cp /opt/acfs-repo/acfs/bat/config /home/dev/.config/bat/config 2>/dev/null || true

# atuin config (local-only, no sync, fuzzy search)
RUN mkdir -p /home/dev/.config/atuin /home/dev/.local/share/atuin \
    && cp /opt/acfs-repo/acfs/atuin/config.toml /home/dev/.config/atuin/config.toml 2>/dev/null || true

# lazygit config (delta as pager)
RUN mkdir -p /home/dev/.config/lazygit \
    && cp /opt/acfs-repo/acfs/lazygit/config.yml /home/dev/.config/lazygit/config.yml 2>/dev/null || true

# RANO config (network observer for AI CLIs — persist to /data)
RUN mkdir -p /home/dev/.config/rano \
    && cp /opt/acfs-repo/acfs/rano/config.conf /home/dev/.config/rano/config.conf 2>/dev/null || true

# Meta Skill config (skill search, CASS/DCG integration)
RUN mkdir -p /home/dev/.config/ms \
    && cp /opt/acfs-repo/acfs/meta-skill/config.toml /home/dev/.config/ms/config.toml 2>/dev/null || true

# CASS config (agent session search — local source paths)
RUN mkdir -p /home/dev/.config/cass /home/dev/.coding-agent-search \
    && cp /opt/acfs-repo/acfs/cass/sources.toml /home/dev/.config/cass/sources.toml 2>/dev/null || true

# CAUT config (agent usage tracker — all providers enabled)
RUN mkdir -p /home/dev/.config/caut \
    && cp /opt/acfs-repo/acfs/caut/config.toml /home/dev/.config/caut/config.toml 2>/dev/null || true

# RU config (repo updater — /data/projects base, flat layout)
RUN mkdir -p /home/dev/.config/ru/repos.d /home/dev/.local/state/ru/logs /home/dev/.cache/ru \
    && cp /opt/acfs-repo/acfs/ru/config /home/dev/.config/ru/config 2>/dev/null || true

# acfs-update: update tools in-place without image rebuild
RUN cp /opt/acfs-repo/acfs/bin/acfs-update /usr/local/bin/acfs-update \
    && chmod +x /usr/local/bin/acfs-update 2>/dev/null || true

# OSC 52 clipboard helpers (clip, xclip, xsel shims for web terminals)
RUN for f in clip xclip xsel; do \
        cp "/opt/acfs-repo/acfs/bin/$f" "/usr/local/bin/$f" 2>/dev/null \
        && chmod +x "/usr/local/bin/$f"; \
    done || true

# Pro infrastructure scripts (audit, auto-push, resource limits, webhooks)
RUN for f in audit-log auto-push agent-limiter webhook-fire; do \
        cp "/opt/acfs-repo/acfs/bin/$f" "/usr/local/bin/$f" 2>/dev/null \
        && chmod +x "/usr/local/bin/$f"; \
    done || true

# Supervisor base config
RUN mkdir -p /etc/supervisor/conf.d /data/logs/supervisor \
    && cp /opt/acfs-repo/acfs/supervisor/supervisord.conf /etc/supervisor/supervisord.conf 2>/dev/null || true

# Ensure dev owns everything
RUN chown -R dev:dev /home/dev

# Save skeleton home so we can seed the volume on first boot
RUN cp -a /home/dev /etc/skel-dev

# ============================================================
# Entrypoint: setup user/hostname, generate supervisor configs, launch services
# ============================================================
COPY <<'ENTRYPOINT' /usr/local/bin/entrypoint.sh
#!/bin/bash
set -e

TARGET_USER="${ACFS_USER:-dev}"
TARGET_HOSTNAME="${ACFS_HOSTNAME:-acfs}"

echo "=== ACFS Entrypoint ==="

# Rename hostname
echo "$TARGET_HOSTNAME" > /etc/hostname
hostname "$TARGET_HOSTNAME" 2>/dev/null || true

# If user wants a different username than "dev", rename it
if [ "$TARGET_USER" != "dev" ] && id dev &>/dev/null; then
    usermod -l "$TARGET_USER" -d "/data/home/$TARGET_USER" -m dev 2>/dev/null || true
    groupmod -n "$TARGET_USER" dev 2>/dev/null || true
    sed -i "s/^dev /$TARGET_USER /" /etc/sudoers.d/dev 2>/dev/null || true
else
    # Update home directory to /data/home/dev (on the volume)
    usermod -d "/data/home/$TARGET_USER" "$TARGET_USER" 2>/dev/null || true
fi

TARGET_HOME="/data/home/$TARGET_USER"

# Create persistent directories on the volume
mkdir -p "$TARGET_HOME" /data/projects

# Seed home directory from skeleton if volume is empty (first boot)
if [ ! -f "$TARGET_HOME/.zshrc" ]; then
    echo "First boot: seeding home directory from skeleton..."
    cp -a /etc/skel-dev/. "$TARGET_HOME/" 2>/dev/null || true
fi

# Always sync tmux config (volume persists old versions across deploys)
if [ -f /etc/skel-dev/.tmux.conf ]; then
    cp /etc/skel-dev/.tmux.conf "$TARGET_HOME/.tmux.conf" 2>/dev/null || true
fi

# Fix git safe.directory for volume-mounted projects (different UID between build and runtime)
git config --global --add safe.directory '*'
su - "$TARGET_USER" -c "git config --global --add safe.directory '*'" 2>/dev/null || true

# Symlink /home/<user> -> /data/home/<user> for compatibility
mkdir -p /home
ln -sfn "$TARGET_HOME" "/home/$TARGET_USER" 2>/dev/null || true

# SSH key setup (from env vars)
SSH_DIR="$TARGET_HOME/.ssh"
mkdir -p "$SSH_DIR"
chmod 700 "$SSH_DIR"

if [ -n "${SSH_PRIVATE_KEY:-}" ]; then
    echo "$SSH_PRIVATE_KEY" > "$SSH_DIR/id_ed25519"
    chmod 600 "$SSH_DIR/id_ed25519"
    echo "SSH private key installed."
fi

if [ -n "${SSH_PUBLIC_KEY:-}" ]; then
    echo "$SSH_PUBLIC_KEY" > "$SSH_DIR/id_ed25519.pub"
    chmod 644 "$SSH_DIR/id_ed25519.pub"
    echo "SSH public key installed."
fi

# Default SSH config (persists in volume, only written on first boot)
if [ ! -f "$SSH_DIR/config" ]; then
    cat > "$SSH_DIR/config" <<'SSHCFG'
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519
    StrictHostKeyChecking accept-new

Host *
    IdentityFile ~/.ssh/id_ed25519
    StrictHostKeyChecking accept-new
SSHCFG
    chmod 600 "$SSH_DIR/config"
fi

# Git config from env vars
if [ -n "${GIT_USER_NAME:-}" ]; then
    su - "$TARGET_USER" -c "git config --global user.name '${GIT_USER_NAME}'"
fi
if [ -n "${GIT_USER_EMAIL:-}" ]; then
    su - "$TARGET_USER" -c "git config --global user.email '${GIT_USER_EMAIL}'"
fi

# Git credential caching for HTTPS repos
su - "$TARGET_USER" -c "git config --global credential.helper store" 2>/dev/null || true

# Git + delta integration (makes git diff/log/show use delta as pager)
if command -v delta &>/dev/null; then
    su - "$TARGET_USER" -c "git config --global core.pager delta"
    su - "$TARGET_USER" -c "git config --global interactive.diffFilter 'delta --color-only'"
    su - "$TARGET_USER" -c "git config --global delta.navigate true"
    su - "$TARGET_USER" -c "git config --global merge.conflictStyle zdiff3"
    su - "$TARGET_USER" -c "git config --global diff.colorMoved default"
fi

# GitHub CLI auth (enables agents to create PRs, manage issues)
if [ -n "${GH_TOKEN:-}" ]; then
    su - "$TARGET_USER" -c "echo '${GH_TOKEN}' | gh auth login --with-token" 2>/dev/null \
        && echo "GitHub CLI authenticated." \
        || echo "gh auth: login skipped"
fi

# Cloud CLI auth tokens
if [ -n "${RAILWAY_TOKEN:-}" ]; then
    echo "Railway CLI: token set via RAILWAY_TOKEN env var (auto-detected by CLI)"
fi
if [ -n "${VERCEL_TOKEN:-}" ]; then
    echo "Vercel CLI: token set via VERCEL_TOKEN env var (auto-detected by CLI)"
fi
if [ -n "${SUPABASE_ACCESS_TOKEN:-}" ]; then
    echo "Supabase CLI: token set via SUPABASE_ACCESS_TOKEN env var (auto-detected by CLI)"
fi
if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
    echo "Wrangler CLI: token set via CLOUDFLARE_API_TOKEN env var (auto-detected by CLI)"
fi

# Dotfiles repo support (first boot only)
if [ -n "${DOTFILES_REPO:-}" ] && [ ! -f "$TARGET_HOME/.dotfiles-installed" ]; then
    echo "Installing dotfiles from $DOTFILES_REPO..."
    su - "$TARGET_USER" -c "
        git clone '${DOTFILES_REPO}' '$TARGET_HOME/.dotfiles' 2>/dev/null || true
        if [ -f '$TARGET_HOME/.dotfiles/install.sh' ]; then
            cd '$TARGET_HOME/.dotfiles' && bash install.sh 2>/dev/null || true
        elif [ -f '$TARGET_HOME/.dotfiles/setup.sh' ]; then
            cd '$TARGET_HOME/.dotfiles' && bash setup.sh 2>/dev/null || true
        elif [ -f '$TARGET_HOME/.dotfiles/Makefile' ]; then
            cd '$TARGET_HOME/.dotfiles' && make 2>/dev/null || true
        fi
    " || true
    touch "$TARGET_HOME/.dotfiles-installed"
    echo "Dotfiles installed."
fi

# Apply oh-my-opencode plugin to OpenCode on first boot
# Flags are configurable via OMO_* env vars (see README)
if [ ! -f "$TARGET_HOME/.config/opencode/opencode.json" ] || ! grep -q "oh-my-opencode" "$TARGET_HOME/.config/opencode/opencode.json" 2>/dev/null; then
    echo "Configuring OpenCode with oh-my-opencode plugin..."
    su - "$TARGET_USER" -c "PATH=/opt/bun/bin:\$PATH bunx oh-my-opencode install --no-tui \
        --claude=${OMO_CLAUDE:-yes} \
        --openai=${OMO_OPENAI:-no} \
        --gemini=${OMO_GEMINI:-no} \
        --copilot=${OMO_COPILOT:-no} \
        --opencode-zen=${OMO_OPENCODE_ZEN:-no} \
        --zai-coding-plan=${OMO_ZAI_CODING_PLAN:-no} \
        --opencode-go=${OMO_OPENCODE_GO:-no}" 2>&1 || echo "oh-my-opencode: install skipped"
fi

# Create persistent directories for MCP Agent Mail and RANO
mkdir -p /data/mcp-agent-mail/mailbox /data/rano/logs
chown "$TARGET_USER:$(id -gn "$TARGET_USER")" /data/mcp-agent-mail /data/mcp-agent-mail/mailbox /data/rano /data/rano/logs 2>/dev/null || true

# Seed AGENTS.md into workspace if not present (multi-agent instructions)
if [ ! -f /data/projects/AGENTS.md ]; then
    cp /opt/acfs-repo/acfs/AGENTS.md /data/projects/AGENTS.md 2>/dev/null || true
fi

# Seed Gemini instructions into workspace
if [ ! -f /data/projects/GEMINI.md ]; then
    cp /opt/acfs-repo/acfs/gemini/GEMINI.md /data/projects/GEMINI.md 2>/dev/null || true
fi

# Ensure ownership
chown -R "$TARGET_USER:$(id -gn "$TARGET_USER")" "$TARGET_HOME" 2>/dev/null || true
chown "$TARGET_USER:$(id -gn "$TARGET_USER")" /data/projects 2>/dev/null || true
chown "$TARGET_USER:$(id -gn "$TARGET_USER")" /data/projects/AGENTS.md 2>/dev/null || true
chown "$TARGET_USER:$(id -gn "$TARGET_USER")" /data/projects/GEMINI.md 2>/dev/null || true

# code-server config (supervisor manages the process)
if command -v code-server &>/dev/null; then
    CS_CONFIG_DIR="$TARGET_HOME/.config/code-server"
    mkdir -p "$CS_CONFIG_DIR"
    cat > "$CS_CONFIG_DIR/config.yaml" << EOF
bind-addr: 0.0.0.0:18080
auth: password
password: ${TTYD_PASS:-changeme}
cert: false
app-name: ACFS Code
disable-telemetry: true
EOF
    chown -R "$TARGET_USER:$(id -gn "$TARGET_USER")" "$CS_CONFIG_DIR"
fi

# ── Generate supervisor program configs ─────────────────────────────────────
mkdir -p /etc/supervisor/conf.d /data/logs/supervisor

# Determine ports: SM_PORT env var overrides, otherwise 7681
# (PORT may be 2222 from TCP proxy for SSH, so don't use PORT for HTTP)
if [ -n "${OAUTH2_CLIENT_ID:-}" ]; then
    SM_PORT="${SM_PORT:-7682}"
    OAUTH_PORT="${OAUTH_PORT:-7681}"
else
    SM_PORT="${SM_PORT:-7681}"
fi

cat > /etc/supervisor/conf.d/session-manager.conf << EOF
[program:session-manager]
command=bun run /opt/acfs-session-manager/src/index.ts
environment=PORT="$SM_PORT"
autostart=true
autorestart=true
startsecs=3
startretries=5
stopsignal=TERM
stopwaitsecs=15
stopasgroup=true
killasgroup=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
priority=100
EOF

if command -v code-server &>/dev/null; then
cat > /etc/supervisor/conf.d/code-server.conf << EOF
[program:code-server]
command=su - $TARGET_USER -c "code-server /data/projects"
autostart=true
autorestart=true
startsecs=5
startretries=3
stopsignal=TERM
stopwaitsecs=10
stopasgroup=true
killasgroup=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
priority=200
EOF
fi

# OAuth proxy (only when credentials are configured)
if [ -n "${OAUTH2_CLIENT_ID:-}" ]; then
    echo "OAuth2 proxy enabled (provider: ${OAUTH2_PROVIDER:-github})"

    # Generate oauth2-proxy config from env vars
    cat > /etc/oauth2-proxy.cfg << EOF
provider = "${OAUTH2_PROVIDER:-github}"
http_address = "0.0.0.0:$OAUTH_PORT"
upstreams = ["http://127.0.0.1:$SM_PORT/"]
client_id = "${OAUTH2_CLIENT_ID}"
client_secret = "${OAUTH2_CLIENT_SECRET}"
cookie_secret = "${OAUTH2_COOKIE_SECRET}"
cookie_secure = true
reverse_proxy = true
email_domains = ["${OAUTH2_ALLOWED_EMAILS:-*}"]
EOF

    # GitHub org restriction (optional)
    if [ -n "${OAUTH2_GITHUB_ORG:-}" ]; then
        echo "github_org = \"${OAUTH2_GITHUB_ORG}\"" >> /etc/oauth2-proxy.cfg
    fi

    # Redirect URL (auto-detect from Railway or explicit)
    if [ -n "${OAUTH2_REDIRECT_URL:-}" ]; then
        echo "redirect_url = \"${OAUTH2_REDIRECT_URL}\"" >> /etc/oauth2-proxy.cfg
    fi

cat > /etc/supervisor/conf.d/oauth2-proxy.conf << EOF
[program:oauth2-proxy]
command=/usr/local/bin/oauth2-proxy --config=/etc/oauth2-proxy.cfg
autostart=true
autorestart=true
startsecs=3
startretries=3
stopsignal=TERM
stopwaitsecs=10
stopasgroup=true
killasgroup=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
priority=50
EOF
fi

# Audit file watcher (logs all file changes in /data/projects)
if command -v inotifywait &>/dev/null; then
cat > /etc/supervisor/conf.d/audit-watcher.conf << 'EOF'
[program:audit-watcher]
command=/bin/bash -c "inotifywait -m -r -e modify,create,delete,move --format '%%T %%e %%w%%f' --timefmt '%%Y-%%m-%%dT%%H:%%M:%%SZ' /data/projects 2>/dev/null | while read ts event path; do audit-log \"${event,,}\" \"$path\" unknown \"inotify: $event\"; done"
autostart=true
autorestart=unexpected
startsecs=1
startretries=3
stopsignal=TERM
stopwaitsecs=5
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
priority=300
EOF
fi

# ── SSH server setup ──────────────────────────────────────────────────────────
mkdir -p /run/sshd
echo "${TARGET_USER}:${TTYD_PASS:-changeme}" | chpasswd
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config
sed -i 's/KbdInteractiveAuthentication no/KbdInteractiveAuthentication yes/' /etc/ssh/sshd_config
echo "Port 2222" >> /etc/ssh/sshd_config
echo "AllowUsers ${TARGET_USER}" >> /etc/ssh/sshd_config

cat > /etc/supervisor/conf.d/sshd.conf << EOF
[program:sshd]
command=/usr/sbin/sshd -D -e -p 2222
autostart=true
autorestart=true
startsecs=1
startretries=5
stopsignal=TERM
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
priority=10
EOF

# Generate host keys if missing
ssh-keygen -A 2>/dev/null || true

echo "=== ACFS: Starting supervised services ==="
exec supervisord -n -c /etc/supervisor/supervisord.conf
ENTRYPOINT
RUN chmod +x /usr/local/bin/entrypoint.sh

# Final cleanup
RUN apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

WORKDIR /data/projects
EXPOSE 7681
EXPOSE 18080

ENV NODE_OPTIONS="--max-old-space-size=4096"

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:7681/ || exit 1

CMD ["/usr/local/bin/entrypoint.sh"]
