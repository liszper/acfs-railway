export function getStyles(): string {
  return `
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', monospace;
    background: #0d1117;
    color: #c9d1d9;
    min-height: 100vh;
    padding: 2rem;
  }

  .header {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }

  h1 {
    color: #58a6ff;
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #3fb950;
    display: inline-block;
    flex-shrink: 0;
    position: relative;
    top: -1px;
    transition: background 0.3s ease;
  }
  .status-dot.disconnected {
    background: #f85149;
  }

  .subtitle {
    color: #8b949e;
    margin-bottom: 2rem;
    font-size: 0.85rem;
  }

  /* ---- Spawn panel ---- */
  .spawn-panel {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    margin-bottom: 2rem;
    overflow: hidden;
  }

  .spawn-tabs {
    display: flex;
    border-bottom: 1px solid #30363d;
    background: #0d1117;
  }
  .spawn-tab {
    padding: 0.6rem 1.25rem;
    font-size: 0.8rem;
    font-family: inherit;
    color: #8b949e;
    background: transparent;
    border: none;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: color 0.15s ease, border-color 0.15s ease;
    white-space: nowrap;
  }
  .spawn-tab:hover { color: #c9d1d9; }
  .spawn-tab.active {
    color: #58a6ff;
    border-bottom-color: #58a6ff;
  }

  .spawn-body {
    padding: 1.25rem;
  }
  .spawn-pane { display: none; }
  .spawn-pane.active { display: block; }

  /* Quick session */
  .quick-row {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    flex-wrap: wrap;
  }

  /* Recipe/template grid */
  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 0.75rem;
  }
  .card {
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    transition: border-color 0.15s ease;
    overflow: hidden;
  }
  .card:hover { border-color: #484f58; }
  .card.expanded { border-color: #58a6ff; }

  .card-summary {
    padding: 1rem;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .card-summary-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.5rem;
  }
  .card-summary-left { flex: 1; min-width: 0; }

  .card-chevron {
    width: 20px;
    height: 20px;
    color: #484f58;
    transition: transform 0.2s ease, color 0.15s ease;
    flex-shrink: 0;
    margin-top: 2px;
  }
  .card:hover .card-chevron { color: #8b949e; }
  .card.expanded .card-chevron { transform: rotate(180deg); color: #58a6ff; }

  .card-name {
    font-weight: 600;
    font-size: 0.9rem;
    color: #f0f6fc;
    margin-bottom: 0.25rem;
  }
  .card-desc {
    font-size: 0.75rem;
    color: #8b949e;
    margin-bottom: 0.5rem;
    line-height: 1.35;
  }
  .card-agents {
    display: flex;
    gap: 0.375rem;
    flex-wrap: wrap;
  }
  .card-pattern {
    display: inline-block;
    font-size: 0.65rem;
    color: #58a6ff;
    background: rgba(88, 166, 255, 0.1);
    padding: 2px 8px;
    border-radius: 10px;
    margin-bottom: 0.5rem;
    font-weight: 500;
    letter-spacing: 0.02em;
  }
  .card-agent-count {
    font-size: 0.7rem;
    color: #484f58;
    margin-left: auto;
    white-space: nowrap;
  }

  /* Expandable detail section */
  .card-detail {
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.3s ease;
  }
  .card.expanded .card-detail {
    max-height: 800px;
  }
  .card-detail-inner {
    padding: 0 1rem 1rem;
    border-top: 1px solid #21262d;
  }
  .card-detail-text {
    font-size: 0.75rem;
    color: #8b949e;
    line-height: 1.5;
    margin-top: 0.75rem;
    margin-bottom: 0.75rem;
  }
  .card-use-case {
    font-size: 0.7rem;
    color: #484f58;
    margin-bottom: 0.75rem;
  }
  .card-use-case strong {
    color: #8b949e;
    font-weight: 500;
  }

  /* Role breakdown */
  .card-roles {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }
  .card-roles-label {
    font-size: 0.7rem;
    font-weight: 600;
    color: #484f58;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 0.15rem;
  }
  .card-role {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.45rem 0.6rem;
    background: rgba(22, 27, 34, 0.5);
    border: 1px solid #21262d;
    border-radius: 4px;
  }
  .card-role-name {
    font-size: 0.7rem;
    font-weight: 600;
    color: #c9d1d9;
    white-space: nowrap;
    min-width: 80px;
  }
  .card-role-agent {
    font-size: 0.6rem;
    padding: 1px 6px;
    border-radius: 8px;
    font-weight: 500;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .card-role-agent.agent-claude { background: rgba(88, 166, 255, 0.15); color: #58a6ff; }
  .card-role-agent.agent-codex { background: rgba(63, 185, 80, 0.15); color: #3fb950; }
  .card-role-agent.agent-gemini { background: rgba(210, 153, 34, 0.15); color: #d29922; }
  .card-role-desc {
    font-size: 0.7rem;
    color: #8b949e;
    line-height: 1.35;
    flex: 1;
  }

  /* Spawn form inside cards */
  .card-spawn-form {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    padding-top: 0.75rem;
    border-top: 1px solid #21262d;
  }
  .card-spawn-agents {
    display: flex;
    gap: 1rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .card-spawn-agents .agent-counter { gap: 0.35rem; }
  .card-spawn-agents .agent-counter label { font-size: 0.75rem; min-width: 46px; }
  .card-spawn-agents .counter-btn { width: 24px; height: 24px; font-size: 0.8rem; }
  .card-spawn-agents .counter-val { width: 28px; height: 24px; line-height: 24px; font-size: 0.8rem; }
  .card-spawn-agents .counter-controls { border-radius: 3px; }

  .card-spawn-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .card-spawn-row input[type="text"] {
    background: #161b22;
    border: 1px solid #30363d;
    color: #c9d1d9;
    padding: 0.35rem 0.65rem;
    border-radius: 4px;
    font-family: inherit;
    font-size: 0.75rem;
    flex: 1;
    min-width: 0;
    outline: none;
    width: auto;
  }
  .card-spawn-row input[type="text"]:focus { border-color: #58a6ff; }
  .card-spawn-row input[type="text"]::placeholder { color: #484f58; }
  .card-spawn-textarea {
    width: 100%;
    background: #161b22;
    border: 1px solid #30363d;
    color: #c9d1d9;
    padding: 0.4rem 0.65rem;
    border-radius: 4px;
    font-family: inherit;
    font-size: 0.75rem;
    resize: vertical;
    min-height: 48px;
    outline: none;
    box-sizing: border-box;
  }
  .card-spawn-textarea:focus { border-color: #58a6ff; }
  .card-spawn-textarea::placeholder { color: #484f58; }

  .card-footer {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .card-footer input {
    background: #161b22;
    border: 1px solid #30363d;
    color: #c9d1d9;
    padding: 0.35rem 0.65rem;
    border-radius: 4px;
    font-family: inherit;
    font-size: 0.75rem;
    flex: 1;
    min-width: 0;
    outline: none;
  }
  .card-footer input:focus { border-color: #58a6ff; }
  .card-footer input::placeholder { color: #484f58; }

  /* Agent pills */
  .agent-pill {
    font-size: 0.65rem;
    padding: 2px 7px;
    border-radius: 10px;
    font-weight: 500;
    white-space: nowrap;
  }
  .pill-claude { background: rgba(88, 166, 255, 0.15); color: #58a6ff; }
  .pill-codex { background: rgba(63, 185, 80, 0.15); color: #3fb950; }
  .pill-gemini { background: rgba(210, 153, 34, 0.15); color: #d29922; }

  /* Custom spawn */
  .custom-form {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
  .custom-agents {
    display: flex;
    gap: 1.5rem;
    align-items: center;
    grid-column: 1 / -1;
  }
  .agent-counter {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .agent-counter label {
    font-size: 0.8rem;
    font-weight: 500;
    min-width: 52px;
  }
  .label-claude { color: #58a6ff; }
  .label-codex { color: #3fb950; }
  .label-gemini { color: #d29922; }

  .counter-controls {
    display: flex;
    align-items: center;
    gap: 0;
    border: 1px solid #30363d;
    border-radius: 4px;
    overflow: hidden;
  }
  .counter-btn {
    width: 28px;
    height: 28px;
    background: #21262d;
    border: none;
    color: #c9d1d9;
    font-size: 0.85rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: inherit;
    transition: background 0.1s ease;
  }
  .counter-btn:hover { background: #30363d; }
  .counter-val {
    width: 32px;
    text-align: center;
    font-size: 0.85rem;
    font-weight: 600;
    color: #f0f6fc;
    background: #0d1117;
    border-left: 1px solid #30363d;
    border-right: 1px solid #30363d;
    height: 28px;
    line-height: 28px;
  }

  .custom-prompt {
    grid-column: 1 / -1;
  }
  .custom-prompt textarea {
    width: 100%;
    background: #0d1117;
    border: 1px solid #30363d;
    color: #c9d1d9;
    padding: 0.5rem 0.75rem;
    border-radius: 4px;
    font-family: inherit;
    font-size: 0.8rem;
    resize: vertical;
    min-height: 60px;
    outline: none;
  }
  .custom-prompt textarea:focus { border-color: #58a6ff; }
  .custom-prompt textarea::placeholder { color: #484f58; }

  .custom-bottom {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    grid-column: 1 / -1;
  }

  /* ---- Buttons ---- */
  .toolbar {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 2rem;
    align-items: center;
    flex-wrap: wrap;
  }

  input[type="text"], .input {
    background: #161b22;
    border: 1px solid #30363d;
    color: #c9d1d9;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-family: inherit;
    font-size: 0.85rem;
    width: 240px;
    outline: none;
    transition: border-color 0.15s ease;
  }
  input[type="text"]:focus, .input:focus {
    border-color: #58a6ff;
  }
  input[type="text"]::placeholder, .input::placeholder { color: #484f58; }

  .btn {
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.8rem;
    font-family: inherit;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid #30363d;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    transition: all 0.15s ease;
    white-space: nowrap;
  }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-create { background: #238636; color: #fff; border-color: #238636; }
  .btn-create:hover:not(:disabled) { background: #2ea043; }
  .btn-open { background: #1f6feb; color: #fff; border-color: #1f6feb; }
  .btn-open:hover { background: #388bfd; }
  .btn-kill { background: transparent; color: #f85149; border-color: #f85149; }
  .btn-kill:hover { background: rgba(248, 81, 73, 0.12); }
  .btn-interrupt { background: transparent; color: #d29922; border-color: #d29922; font-size: 0.7rem; padding: 0.3rem 0.6rem; }
  .btn-interrupt:hover { background: rgba(210, 153, 34, 0.12); }
  .btn-send { background: #21262d; color: #c9d1d9; border-color: #30363d; font-size: 0.7rem; padding: 0.3rem 0.6rem; }
  .btn-send:hover { background: #30363d; color: #f0f6fc; }
  .btn-code { background: #21262d; color: #c9d1d9; border-color: #30363d; }
  .btn-code:hover { background: #30363d; color: #f0f6fc; }
  .btn-sm { font-size: 0.75rem; padding: 0.35rem 0.65rem; }

  /* ---- Sessions grid ---- */
  .section-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: #484f58;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 0.75rem;
  }

  .sessions {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 1rem;
  }

  .session {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 1.25rem;
    cursor: pointer;
    transition: border-color 0.15s ease, transform 0.15s ease, opacity 0.3s ease;
  }
  .session:hover {
    border-color: #58a6ff;
    transform: translateY(-1px);
  }
  .session.fade-in {
    animation: fadeIn 0.3s ease forwards;
  }
  .session.fade-out {
    animation: fadeOut 0.25s ease forwards;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadeOut {
    from { opacity: 1; transform: translateY(0); }
    to { opacity: 0; transform: translateY(-8px); }
  }

  .session-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
    gap: 0.5rem;
  }
  .session-name {
    font-weight: 600;
    font-size: 1.05rem;
    color: #f0f6fc;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .session-badges {
    display: flex;
    gap: 0.375rem;
    align-items: center;
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .badge {
    font-size: 0.7rem;
    padding: 2px 8px;
    border-radius: 12px;
    font-weight: 500;
    white-space: nowrap;
  }
  .badge-attached { background: rgba(63, 185, 80, 0.15); color: #3fb950; }
  .badge-detached { background: rgba(139, 148, 158, 0.15); color: #8b949e; }

  .badge-process { background: rgba(88, 166, 255, 0.12); color: #58a6ff; }
  .badge-process.agent {
    background: rgba(210, 153, 34, 0.15);
    color: #d29922;
  }
  .badge-process.shell {
    background: rgba(139, 148, 158, 0.1);
    color: #6e7681;
  }

  .session-agents {
    display: flex;
    gap: 0.375rem;
    flex-wrap: wrap;
    margin-bottom: 0.5rem;
  }

  .session-meta {
    color: #8b949e;
    font-size: 0.8rem;
    margin-bottom: 0.75rem;
  }
  .session-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 0.65rem;
  }

  /* Inline send prompt row on session card */
  .session-send {
    display: flex;
    gap: 0.35rem;
    align-items: center;
    padding-top: 0.65rem;
    border-top: 1px solid #21262d;
  }
  .session-send input {
    flex: 1;
    background: #0d1117;
    border: 1px solid #30363d;
    color: #c9d1d9;
    padding: 0.3rem 0.5rem;
    border-radius: 4px;
    font-family: inherit;
    font-size: 0.75rem;
    outline: none;
    min-width: 0;
  }
  .session-send input:focus { border-color: #58a6ff; }
  .session-send input::placeholder { color: #484f58; }

  .session-send select {
    background: #0d1117;
    border: 1px solid #30363d;
    color: #8b949e;
    padding: 0.3rem 0.35rem;
    border-radius: 4px;
    font-family: inherit;
    font-size: 0.7rem;
    outline: none;
    cursor: pointer;
  }

  .empty {
    text-align: center;
    padding: 4rem 2rem;
    color: #484f58;
    border: 1px dashed #30363d;
    border-radius: 8px;
    grid-column: 1 / -1;
  }
  .empty p { margin-bottom: 0.5rem; }
  .empty p:last-child { margin-bottom: 0; }

  /* Status toast */
  .toast {
    position: fixed;
    bottom: 1.5rem;
    right: 1.5rem;
    background: #161b22;
    border: 1px solid #30363d;
    color: #c9d1d9;
    padding: 0.65rem 1rem;
    border-radius: 6px;
    font-size: 0.8rem;
    font-family: inherit;
    opacity: 0;
    transform: translateY(8px);
    transition: opacity 0.2s ease, transform 0.2s ease;
    pointer-events: none;
    z-index: 999;
  }
  .toast.visible {
    opacity: 1;
    transform: translateY(0);
  }
  .toast.error { border-color: #f85149; color: #f85149; }
  .toast.success { border-color: #3fb950; color: #3fb950; }

  /* ---- Tools tab ---- */
  .tool-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }
  .tool-pill {
    font-size: 0.65rem;
    padding: 2px 9px;
    border-radius: 10px;
    font-weight: 500;
    white-space: nowrap;
    border: 1px solid;
    transition: opacity 0.15s ease;
  }
  .tool-pill.installed {
    background: rgba(63, 185, 80, 0.1);
    color: #3fb950;
    border-color: rgba(63, 185, 80, 0.3);
  }
  .tool-pill.missing {
    background: rgba(248, 81, 73, 0.06);
    color: #f85149;
    border-color: rgba(248, 81, 73, 0.2);
    opacity: 0.7;
  }
  .tools-section {
    margin-bottom: 1.25rem;
  }
  .tools-section:last-child { margin-bottom: 0; }
  .tools-section-header {
    font-size: 0.75rem;
    font-weight: 600;
    color: #8b949e;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 0.65rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .tools-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.25rem;
    margin-bottom: 1.25rem;
  }
  .tools-row:last-child { margin-bottom: 0; }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }
  .stat-card {
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 0.65rem;
    text-align: center;
  }
  .stat-value {
    font-size: 1.15rem;
    font-weight: 700;
    color: #58a6ff;
  }
  .stat-label {
    font-size: 0.65rem;
    color: #8b949e;
    margin-top: 0.2rem;
  }
  .env-grid {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .env-item {
    font-size: 0.8rem;
    padding: 0.35rem 0.7rem;
    border-radius: 6px;
    background: #0d1117;
    border: 1px solid #30363d;
  }
  .env-item.configured { color: #3fb950; }
  .env-item.missing { color: #f85149; opacity: 0.8; }
  .env-icon { font-weight: 700; margin-right: 0.15rem; }
  .search-row {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .search-row input {
    flex: 1;
    background: #0d1117;
    border: 1px solid #30363d;
    color: #c9d1d9;
    padding: 0.4rem 0.65rem;
    border-radius: 4px;
    font-family: inherit;
    font-size: 0.8rem;
    outline: none;
  }
  .search-row input:focus { border-color: #58a6ff; }
  .search-row input::placeholder { color: #484f58; }
  .results-list {
    max-height: 200px;
    min-height: 48px;
    overflow-y: auto;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 0.35rem;
  }
  .result-item {
    padding: 0.35rem 0.5rem;
    border-bottom: 1px solid #21262d;
  }
  .result-item:last-child { border-bottom: none; }
  .result-title {
    font-size: 0.78rem;
    color: #f0f6fc;
    font-weight: 500;
  }
  .result-snippet {
    font-size: 0.7rem;
    color: #8b949e;
    margin-top: 0.1rem;
    line-height: 1.35;
  }
  @media (max-width: 768px) {
    .tools-row { grid-template-columns: 1fr; }
    .stats-grid { grid-template-columns: repeat(3, 1fr); }
  }
  `;
}
