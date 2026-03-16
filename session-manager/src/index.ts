import { ensureTmuxSession } from "./services/sessions.js";
import { startTtydForSession } from "./services/ttyd.js";
import { startServer } from "./server.js";
import { syncProjects } from "./services/pm.js";

ensureTmuxSession("main");
startTtydForSession("main");
startServer();

// Sync filesystem projects with DB on startup
try {
  syncProjects();
  console.log("[pm] Project sync complete");
} catch (err) {
  console.error("[pm] Project sync failed:", err);
}
