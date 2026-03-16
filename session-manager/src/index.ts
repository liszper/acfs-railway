import { ensureTmuxSession, syncSessionState } from "./services/sessions.js";
import { startTtydForSession } from "./services/ttyd.js";
import { startServer } from "./server.js";
import { syncProjects } from "./services/pm.js";

ensureTmuxSession("main");
startTtydForSession("main");
startServer();

// Sync sessions and projects with DB on startup
try {
  syncSessionState();
  console.log("[sessions] Session sync complete");
} catch (err) {
  console.error("[sessions] Session sync failed:", err);
}

try {
  syncProjects();
  console.log("[pm] Project sync complete");
} catch (err) {
  console.error("[pm] Project sync failed:", err);
}
