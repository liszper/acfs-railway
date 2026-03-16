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
      fontFamily: "'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
      theme: {
        background: "#0d1117",
        foreground: "#c9d1d9",
        cursor: "#58a6ff",
        selectionBackground: "#264f78",
        black: "#0d1117",
        red: "#ff7b72",
        green: "#3fb950",
        yellow: "#d29922",
        blue: "#58a6ff",
        magenta: "#bc8cff",
        cyan: "#39c5cf",
        white: "#c9d1d9",
        brightBlack: "#484f58",
        brightRed: "#ffa198",
        brightGreen: "#56d364",
        brightYellow: "#e3b341",
        brightBlue: "#79c0ff",
        brightMagenta: "#d2a8ff",
        brightCyan: "#56d4dd",
        brightWhite: "#f0f6fc",
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
      term.write(new Uint8Array(event.payload));
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
