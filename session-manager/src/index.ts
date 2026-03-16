import { ensureTmuxSession } from "./services/sessions.js";
import { startTtydForSession } from "./services/ttyd.js";
import { startServer } from "./server.js";

ensureTmuxSession("main");
startTtydForSession("main");
startServer();
