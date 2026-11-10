"use client";

import { useEffect } from "react";

const RELOAD_FLAG = "wirelab.reloaded-for-chunk";

function isChunkError(error: unknown) {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /ChunkLoadError|Loading chunk|dynamically imported module|Failed to fetch|Importing a module script failed/i.test(text);
}

/**
 * Last-resort error screen. After a new deploy, a cached page can ask for script
 * chunks that no longer exist; reload once to fetch the fresh page.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    try {
      if (isChunkError(error) && !sessionStorage.getItem(RELOAD_FLAG)) {
        sessionStorage.setItem(RELOAD_FLAG, "1");
        location.reload();
      }
    } catch {
      /* storage blocked: show the screen instead */
    }
  }, [error]);

  const message = error instanceof Error ? error.message : String(error);
  const resetProject = () => {
    try {
      localStorage.removeItem("wirelab.editor.v1");
      const cur = localStorage.getItem("wirelab.current.v1");
      if (cur) localStorage.removeItem(`wirelab.project.${cur}`);
      sessionStorage.removeItem(RELOAD_FLAG);
    } catch {
      /* ignore */
    }
    location.reload();
  };

  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#08111b", color: "#e2e8f0", fontFamily: "system-ui, sans-serif" }}>
        <title>WireLab PH — something went wrong</title>
        <div style={{ maxWidth: 560, margin: "15vh auto", padding: 24 }}>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>WireLab couldn’t start</h1>
          <p style={{ color: "#94a3b8", margin: "0 0 16px" }}>
            Usually this is an old copy of the page left in your browser after an update. Reload first; if it keeps
            happening, reset the saved project.
          </p>
          <pre
            style={{
              background: "#0f1b29",
              border: "1px solid #1e293b",
              borderRadius: 8,
              padding: 12,
              whiteSpace: "pre-wrap",
              fontSize: 12,
              color: "#fca5a5",
            }}
          >
            {message}
          </pre>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={() => location.reload()} style={btn("#f5b942", "#0f172a")}>
              Reload
            </button>
            <button onClick={() => retry()} style={btn("#1e293b", "#e2e8f0")}>
              Try again
            </button>
            <button onClick={resetProject} style={btn("#1e293b", "#fca5a5")}>
              Reset saved project
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

const btn = (bg: string, fg: string): React.CSSProperties => ({
  background: bg,
  color: fg,
  border: "none",
  borderRadius: 6,
  padding: "8px 14px",
  fontWeight: 600,
  cursor: "pointer",
});
