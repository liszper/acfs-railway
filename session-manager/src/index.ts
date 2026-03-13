import { PORT } from "./config.js";
import { ensureTmuxSession } from "./services/sessions.js";
import { startTtydForSession } from "./services/ttyd.js";
import { isNtmAvailable } from "./services/ntm.js";
import { createServer } from "./server.js";

ensureTmuxSession("main");
startTtydForSession("main");

const server = createServer();

server.listen(PORT, () => {
  console.log(`ACFS Session Manager running on port ${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}/`);
  console.log(`Main terminal: http://localhost:${PORT}/s/main/`);
  console.log(`NTM available: ${isNtmAvailable()}`);
});
