import type { Recipe, WorkflowTemplate } from "../types.js";

export const PROCESS_LABELS: Record<string, string> = {
  claude: "Claude Code",
  codex: "Codex CLI",
  gemini: "Gemini CLI",
  opencode: "OpenCode",
  node: "Node.js",
  python: "Python",
  python3: "Python",
  vim: "Editor",
  nvim: "Editor",
  zsh: "Shell",
  bash: "Shell",
};

export const NTM_RECIPES: Recipe[] = [
  {
    id: "minimal",
    name: "Single Agent",
    desc: "One Claude agent for focused work",
    detail:
      "Best for single-file edits, quick fixes, and simple tasks. One agent means zero coordination overhead.",
    useCase: "Bug fixes, small features, config changes",
    agents: "1x Claude",
    cc: 1,
    cod: 0,
    gmi: 0,
  },
  {
    id: "quick-claude",
    name: "Quick Start",
    desc: "Two Claude agents for parallel tasks",
    detail:
      "Split work between two Claude agents. One can implement while the other reviews or works on a separate module.",
    useCase: "Parallel feature development, implement + review",
    agents: "2x Claude",
    cc: 2,
    cod: 0,
    gmi: 0,
  },
  {
    id: "full-stack",
    name: "Full Stack Team",
    desc: "Multi-model coverage for complex projects",
    detail:
      "Claude handles architecture and complex logic, Codex handles boilerplate and repetitive code, Gemini provides a different perspective for review.",
    useCase: "Full-stack apps, large refactors, new projects",
    agents: "3x Claude + 2x Codex + 1x Gemini",
    cc: 3,
    cod: 2,
    gmi: 1,
  },
  {
    id: "balanced",
    name: "Balanced Team",
    desc: "Equal representation across models",
    detail:
      "Each model brings unique strengths. Equal distribution maximizes diversity of approach and catches model-specific blind spots.",
    useCase: "Exploratory work, comparing approaches, diversified review",
    agents: "2x Claude + 2x Codex + 2x Gemini",
    cc: 2,
    cod: 2,
    gmi: 2,
  },
  {
    id: "codex-heavy",
    name: "Codex Focus",
    desc: "Codex-led team with Claude oversight",
    detail:
      "Codex excels at code generation speed. Claude provides oversight and handles architectural decisions. Good for high-volume code output.",
    useCase: "Rapid prototyping, boilerplate generation, test writing",
    agents: "1x Claude + 4x Codex",
    cc: 1,
    cod: 4,
    gmi: 0,
  },
  {
    id: "review-team",
    name: "Code Review",
    desc: "Dedicated reviewers with one implementer",
    detail:
      "One Codex implements while two Claudes review independently. Catches more bugs through redundant review.",
    useCase: "Critical code changes, security-sensitive work, production deploys",
    agents: "2x Claude + 1x Codex",
    cc: 2,
    cod: 1,
    gmi: 0,
  },
];

export const NTM_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "red-green",
    name: "TDD Red-Green",
    pattern: "ping-pong",
    desc: "Tester writes failing tests, implementer makes them pass",
    detail:
      "Agent A writes a failing test. Agent B writes minimal code to pass it. Agent A writes the next test. Continues until the feature is complete.",
    roles: [
      {
        name: "Tester",
        agent: "Claude",
        desc: "Writes failing tests that define expected behavior",
      },
      {
        name: "Implementer",
        agent: "Codex",
        desc: "Writes minimal code to make each test pass",
      },
    ],
    agents: { cc: 1, cod: 1, gmi: 0 },
  },
  {
    id: "review-pipeline",
    name: "Review Pipeline",
    pattern: "review-gate",
    desc: "Author implements, 2 reviewers must approve",
    detail:
      "One agent implements the change. Two independent reviewers analyze for bugs, style, and correctness. Both must approve before the change is accepted.",
    roles: [
      {
        name: "Author",
        agent: "Codex",
        desc: "Implements the feature or fix",
      },
      {
        name: "Reviewer 1",
        agent: "Claude",
        desc: "Reviews for correctness and architecture",
      },
      {
        name: "Reviewer 2",
        agent: "Claude",
        desc: "Reviews for edge cases and security",
      },
    ],
    agents: { cc: 2, cod: 1, gmi: 0 },
  },
  {
    id: "specialist-team",
    name: "Specialist Team",
    pattern: "pipeline",
    desc: "Architect > 2 Implementers > QA tester",
    detail:
      "Pipeline workflow: Architect designs the solution and defines interfaces, passes to implementers who build in parallel, then QA validates the integrated result.",
    roles: [
      {
        name: "Architect",
        agent: "Claude",
        desc: "Designs the solution and defines interfaces",
      },
      {
        name: "Implementer A",
        agent: "Codex",
        desc: "Builds frontend / module A",
      },
      {
        name: "Implementer B",
        agent: "Codex",
        desc: "Builds backend / module B",
      },
      {
        name: "QA",
        agent: "Gemini",
        desc: "Tests the integrated result",
      },
    ],
    agents: { cc: 1, cod: 2, gmi: 1 },
  },
  {
    id: "parallel-explore",
    name: "Parallel Exploration",
    pattern: "parallel",
    desc: "3 agents explore different approaches simultaneously",
    detail:
      "Three agents independently tackle the same problem using different strategies. Compare outputs to pick the best approach or combine insights.",
    roles: [
      {
        name: "Explorer A",
        agent: "Claude",
        desc: "Conventional/safe solution",
      },
      {
        name: "Explorer B",
        agent: "Codex",
        desc: "Performance-optimized solution",
      },
      {
        name: "Explorer C",
        agent: "Gemini",
        desc: "Alternative/creative solution",
      },
    ],
    agents: { cc: 1, cod: 1, gmi: 1 },
  },
];
