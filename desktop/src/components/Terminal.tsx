import { useEffect, useRef } from "react";
import { Terminal as XTerminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";

interface Props {
  tabId: string;
}

export function Terminal({ tabId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerminal | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'JetBrainsMono NF', 'MesloLGS NF', 'Hack Nerd Font', 'SF Mono', 'Menlo', monospace",
      theme: {
        background: "#0a0a0b",
        foreground: "#e4e4e7",
        cursor: "#3b82f6",
        selectionBackground: "#264f78",
        black: "#0a0a0b",
        red: "#ef4444",
        green: "#22c55e",
        yellow: "#eab308",
        blue: "#3b82f6",
        magenta: "#a855f7",
        cyan: "#06b6d4",
        white: "#e4e4e7",
        brightBlack: "#52525b",
        brightRed: "#f87171",
        brightGreen: "#4ade80",
        brightYellow: "#facc15",
        brightBlue: "#60a5fa",
        brightMagenta: "#c084fc",
        brightCyan: "#22d3ee",
        brightWhite: "#fafafa",
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fitAddon.fit();
    termRef.current = term;

    // Send initial size
    invoke("terminal_resize", { tabId, cols: term.cols, rows: term.rows });

    // User input -> backend
    const onData = term.onData((data) => {
      const encoded = Array.from(new TextEncoder().encode(data));
      invoke("terminal_write", { tabId, data: encoded });
    });

    // Backend -> terminal
    const unlistenPromise = listen<number[]>(`terminal-data-${tabId}`, (event) => {
      const payload = event.payload;
      if (payload instanceof ArrayBuffer) {
        term.write(new Uint8Array(payload));
      } else if (Array.isArray(payload)) {
        term.write(new Uint8Array(payload));
      } else if (typeof payload === "string") {
        term.write(payload);
      }
    });

    // Resize
    const observer = new ResizeObserver(() => {
      fitAddon.fit();
      invoke("terminal_resize", { tabId, cols: term.cols, rows: term.rows });
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      onData.dispose();
      unlistenPromise.then((fn) => fn());
      term.dispose();
    };
  }, [tabId]);

  return <div ref={containerRef} className="terminal-container" />;
}
