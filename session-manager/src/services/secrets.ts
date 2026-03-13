import { ACFS_USER, ACFS_HOSTNAME, TTYD_USER, TTYD_PASS } from "../config.js";
import {
  shellEscape,
  execAsUserSafe,
  execAsUserAsync,
} from "../utils/shell.js";
import type {
  SecretsStatus,
  CliAuthInfo,
  SshKeyInfo,
  GitConfigInput,
  SshGenerateResult,
} from "../types.js";

// ---------------------------------------------------------------------------
// CLI auth cache
// ---------------------------------------------------------------------------

interface CliAuthCache {
  railway: CliAuthInfo;
  vercel: CliAuthInfo;
  supabase: CliAuthInfo;
  cloudflare: CliAuthInfo;
  ghSshKey: boolean;
}

let cliAuthCache: CliAuthCache | null = null;
let cliAuthCacheTime = 0;
let cliAuthRefreshing = false;

// ---------------------------------------------------------------------------
// SSH key generation mutex
// ---------------------------------------------------------------------------

let sshKeygenInProgress = false;

// ---------------------------------------------------------------------------
// Instant status (env vars + file checks, synchronous)
// ---------------------------------------------------------------------------

function getSshKeyInfo(): SshKeyInfo {
  const hasPriv =
    execAsUserSafe("test -f ~/.ssh/id_ed25519 && echo yes || echo no")
      ?.trim() === "yes";
  const hasPub =
    execAsUserSafe("test -f ~/.ssh/id_ed25519.pub && echo yes || echo no")
      ?.trim() === "yes";

  let publicKey: string | null = null;
  let fingerprint: string | null = null;

  if (hasPub) {
    publicKey = execAsUserSafe("cat ~/.ssh/id_ed25519.pub")?.trim() || null;
    const fpOut = execAsUserSafe(
      "ssh-keygen -lf ~/.ssh/id_ed25519.pub -E sha256 2>/dev/null"
    );
    fingerprint = fpOut?.trim() || null;
  }

  let source: SshKeyInfo["source"] = "none";
  if (hasPriv || hasPub) {
    source = process.env.SSH_PRIVATE_KEY ? "environment" : "generated";
  }

  return { hasPrivateKey: hasPriv, hasPublicKey: hasPub, publicKey, fingerprint, source };
}

function getInstantStatus(): Omit<SecretsStatus, "cloudCLIs" | "cliAuthCacheAge"> & {
  cloudCLIs: Omit<SecretsStatus["cloudCLIs"], "railway" | "vercel" | "supabase" | "cloudflare"> & {
    vault: { configured: boolean };
  };
  github: SecretsStatus["github"];
} {
  const gitName =
    execAsUserSafe("git config --global user.name")?.trim() || null;
  const gitEmail =
    execAsUserSafe("git config --global user.email")?.trim() || null;

  const dotfilesRepo = process.env.DOTFILES_REPO || null;
  const dotfilesLoaded = dotfilesRepo
    ? execAsUserSafe("test -d ~/dotfiles && echo yes || echo no")?.trim() === "yes"
    : false;

  const omoKeys = [
    "OMO_CLAUDE",
    "OMO_OPENAI",
    "OMO_GEMINI",
    "OMO_COPILOT",
    "OMO_OPENCODE_ZEN",
    "OMO_ZAI_CODING_PLAN",
    "OMO_OPENCODE_GO",
  ];
  const opencode: Record<string, string> = {};
  for (const k of omoKeys) {
    if (process.env[k]) {
      opencode[k] = process.env[k] as string;
    }
  }

  return {
    aiKeys: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
      gemini: !!process.env.GEMINI_API_KEY,
    },
    github: {
      token: !!process.env.GH_TOKEN,
      sshKey: false,
      gitName,
      gitEmail,
    },
    cloudCLIs: {
      vault: {
        configured: !!(process.env.VAULT_ADDR && process.env.VAULT_TOKEN),
      },
    },
    ssh: getSshKeyInfo(),
    terminal: {
      user: TTYD_USER,
      passwordDefault: TTYD_PASS === "changeme",
    },
    container: {
      user: ACFS_USER,
      hostname: ACFS_HOSTNAME,
    },
    dotfiles: {
      repo: dotfilesRepo,
      loaded: dotfilesLoaded,
    },
    webhooks: {
      url: !!process.env.WEBHOOK_URL,
      secret: !!process.env.WEBHOOK_SECRET,
    },
    agentLimits: {
      memLimit: process.env.AGENT_MEM_LIMIT || null,
      nproc: process.env.AGENT_NPROC || null,
    },
    opencode,
  };
}

// ---------------------------------------------------------------------------
// CLI auth status (async, cached, parallel)
// ---------------------------------------------------------------------------

async function checkGhAuth(): Promise<{ cli: CliAuthInfo; sshKey: boolean }> {
  const result = await execAsUserAsync("gh auth status 2>&1", 8000);
  const authed = result.exitCode === 0;
  let user: string | undefined;
  if (authed) {
    const match = result.stdout.match(/Logged in to [^ ]+ as ([^\s(]+)/);
    user = match?.[1];
  }
  const sshCheck = await execAsUserAsync(
    "gh ssh-key list 2>/dev/null | head -1",
    5000
  );
  const sshKey = sshCheck.exitCode === 0 && sshCheck.stdout.trim().length > 0;

  return {
    cli: { configured: !!process.env.GH_TOKEN, authenticated: authed, user },
    sshKey,
  };
}

async function checkRailwayAuth(): Promise<CliAuthInfo> {
  const configured = !!process.env.RAILWAY_TOKEN;
  if (!configured) return { configured, authenticated: false };
  const result = await execAsUserAsync("railway whoami --json 2>&1", 8000);
  let user: string | undefined;
  if (result.exitCode === 0) {
    try {
      const data = JSON.parse(result.stdout.trim());
      user = data.name || data.email || data.username;
    } catch {
      /* noop */
    }
  }
  return { configured, authenticated: result.exitCode === 0, user };
}

async function checkVercelAuth(): Promise<CliAuthInfo> {
  const configured = !!process.env.VERCEL_TOKEN;
  if (!configured) return { configured, authenticated: false };
  const result = await execAsUserAsync("vercel whoami 2>&1", 8000);
  const user =
    result.exitCode === 0 ? result.stdout.trim() || undefined : undefined;
  return { configured, authenticated: result.exitCode === 0, user };
}

async function checkWranglerAuth(): Promise<CliAuthInfo> {
  const configured = !!process.env.CLOUDFLARE_API_TOKEN;
  if (!configured) return { configured, authenticated: false };
  const result = await execAsUserAsync("wrangler whoami 2>&1", 8000);
  let user: string | undefined;
  if (result.exitCode === 0) {
    const match = result.stdout.match(
      /(?:email|account).*?[\s:]+([^\s]+@[^\s]+)/i
    );
    user = match?.[1];
  }
  return { configured, authenticated: result.exitCode === 0, user };
}

async function checkSupabaseAuth(): Promise<CliAuthInfo> {
  const configured = !!process.env.SUPABASE_ACCESS_TOKEN;
  if (!configured) return { configured, authenticated: false };
  const result = await execAsUserAsync("supabase projects list 2>&1", 8000);
  return { configured, authenticated: result.exitCode === 0 };
}

async function refreshCliAuthCache(): Promise<CliAuthCache> {
  const [gh, railway, vercel, cloudflare, supabase] =
    await Promise.allSettled([
      checkGhAuth(),
      checkRailwayAuth(),
      checkVercelAuth(),
      checkWranglerAuth(),
      checkSupabaseAuth(),
    ]);

  const ghResult =
    gh.status === "fulfilled"
      ? gh.value
      : { cli: { configured: false, authenticated: false }, sshKey: false };

  return {
    railway:
      railway.status === "fulfilled"
        ? railway.value
        : { configured: false, authenticated: false },
    vercel:
      vercel.status === "fulfilled"
        ? vercel.value
        : { configured: false, authenticated: false },
    supabase:
      supabase.status === "fulfilled"
        ? supabase.value
        : { configured: false, authenticated: false },
    cloudflare:
      cloudflare.status === "fulfilled"
        ? cloudflare.value
        : { configured: false, authenticated: false },
    ghSshKey: ghResult.sshKey,
  };
}

async function getCliAuth(): Promise<{
  cache: CliAuthCache;
  age: number | null;
}> {
  const now = Date.now();
  const stale = !cliAuthCache || now - cliAuthCacheTime > 60000;

  if (stale && !cliAuthRefreshing) {
    cliAuthRefreshing = true;
    try {
      cliAuthCache = await refreshCliAuthCache();
      cliAuthCacheTime = Date.now();
    } finally {
      cliAuthRefreshing = false;
    }
  }

  if (cliAuthCache) {
    return { cache: cliAuthCache, age: Date.now() - cliAuthCacheTime };
  }

  if (cliAuthRefreshing) {
    return {
      cache: {
        railway: { configured: false, authenticated: false },
        vercel: { configured: false, authenticated: false },
        supabase: { configured: false, authenticated: false },
        cloudflare: { configured: false, authenticated: false },
        ghSshKey: false,
      },
      age: null,
    };
  }

  return {
    cache: {
      railway: { configured: false, authenticated: false },
      vercel: { configured: false, authenticated: false },
      supabase: { configured: false, authenticated: false },
      cloudflare: { configured: false, authenticated: false },
      ghSshKey: false,
    },
    age: null,
  };
}

// ---------------------------------------------------------------------------
// Combined status
// ---------------------------------------------------------------------------

export async function getSecretsStatus(): Promise<SecretsStatus> {
  const instant = getInstantStatus();
  const { cache: cli, age } = await getCliAuth();

  return {
    ...instant,
    github: {
      ...instant.github,
      sshKey: cli.ghSshKey,
    },
    cloudCLIs: {
      railway: cli.railway,
      vercel: cli.vercel,
      supabase: cli.supabase,
      cloudflare: cli.cloudflare,
      vault: instant.cloudCLIs.vault,
    },
    cliAuthCacheAge: age,
  };
}

// ---------------------------------------------------------------------------
// SSH key generation
// ---------------------------------------------------------------------------

export async function generateSshKey(
  force = false
): Promise<SshGenerateResult | { error: string }> {
  if (sshKeygenInProgress) {
    return { error: "Key generation already in progress" };
  }

  const existing = execAsUserSafe(
    "test -f ~/.ssh/id_ed25519.pub && echo yes || echo no"
  )?.trim();

  if (existing === "yes" && !force) {
    const publicKey =
      execAsUserSafe("cat ~/.ssh/id_ed25519.pub")?.trim() || "";
    const fpOut = execAsUserSafe(
      "ssh-keygen -lf ~/.ssh/id_ed25519.pub -E sha256 2>/dev/null"
    );
    return {
      publicKey,
      fingerprint: fpOut?.trim() || "",
      created: false,
    };
  }

  sshKeygenInProgress = true;
  try {
    if (force) {
      await execAsUserAsync(
        "rm -f ~/.ssh/id_ed25519 ~/.ssh/id_ed25519.pub",
        3000
      );
    }

    const comment = `acfs@${ACFS_HOSTNAME}`;
    const genResult = await execAsUserAsync(
      `mkdir -p ~/.ssh && chmod 700 ~/.ssh && ssh-keygen -t ed25519 -C ${shellEscape(comment)} -f ~/.ssh/id_ed25519 -N "" -q`,
      10000
    );

    if (genResult.exitCode !== 0) {
      return {
        error: `ssh-keygen failed: ${genResult.stderr.trim() || genResult.stdout.trim()}`,
      };
    }

    await execAsUserAsync(
      "chmod 600 ~/.ssh/id_ed25519 && chmod 644 ~/.ssh/id_ed25519.pub",
      3000
    );

    const pubResult = await execAsUserAsync("cat ~/.ssh/id_ed25519.pub", 3000);
    const fpResult = await execAsUserAsync(
      "ssh-keygen -lf ~/.ssh/id_ed25519.pub -E sha256",
      3000
    );

    return {
      publicKey: pubResult.stdout.trim(),
      fingerprint: fpResult.stdout.trim(),
      created: true,
    };
  } finally {
    sshKeygenInProgress = false;
  }
}

// ---------------------------------------------------------------------------
// Upload SSH key to GitHub
// ---------------------------------------------------------------------------

export async function uploadSshKeyToGithub(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const authCheck = await execAsUserAsync("gh auth status 2>&1", 5000);
  if (authCheck.exitCode !== 0) {
    return { ok: false, error: "GitHub CLI not authenticated. Set GH_TOKEN." };
  }

  const keyExists = execAsUserSafe(
    "test -f ~/.ssh/id_ed25519.pub && echo yes || echo no"
  )?.trim();
  if (keyExists !== "yes") {
    return { ok: false, error: "No SSH public key found. Generate one first." };
  }

  const upload = await execAsUserAsync(
    'gh ssh-key add ~/.ssh/id_ed25519.pub --title "acfs-container" 2>&1',
    10000
  );
  if (upload.exitCode !== 0) {
    const alreadyExists =
      upload.stderr.includes("already in use") ||
      upload.stdout.includes("already in use");
    if (!alreadyExists) {
      return {
        ok: false,
        error: `Upload failed: ${upload.stderr.trim() || upload.stdout.trim()}`,
      };
    }
  }

  await execAsUserAsync(
    "gh config set git_protocol ssh --host github.com 2>&1",
    5000
  );

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Git config
// ---------------------------------------------------------------------------

function validateGitInput(
  value: string,
  field: string
): string | null {
  if (value.length > 256) {
    return `${field} must be 256 characters or less`;
  }
  if (/[\n\r\0]/.test(value)) {
    return `${field} contains invalid characters`;
  }
  return null;
}

export async function setGitConfig(
  input: GitConfigInput
): Promise<{ ok: boolean; name?: string; email?: string; error?: string }> {
  if (!input.name && !input.email) {
    return { ok: false, error: "Provide name or email" };
  }

  if (input.name) {
    const err = validateGitInput(input.name, "Name");
    if (err) return { ok: false, error: err };
  }

  if (input.email) {
    const err = validateGitInput(input.email, "Email");
    if (err) return { ok: false, error: err };
    if (!input.email.includes("@")) {
      return { ok: false, error: "Email must contain @" };
    }
  }

  if (input.name) {
    const result = await execAsUserAsync(
      `git config --global user.name ${shellEscape(input.name)}`,
      5000
    );
    if (result.exitCode !== 0) {
      return { ok: false, error: "Failed to set user.name" };
    }
  }

  if (input.email) {
    const result = await execAsUserAsync(
      `git config --global user.email ${shellEscape(input.email)}`,
      5000
    );
    if (result.exitCode !== 0) {
      return { ok: false, error: "Failed to set user.email" };
    }
  }

  return {
    ok: true,
    name: input.name || undefined,
    email: input.email || undefined,
  };
}
