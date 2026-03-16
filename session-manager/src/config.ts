export const PORT = parseInt(process.env.PORT || "7681");
export const TTYD_USER = process.env.TTYD_USER || "admin";
export const TTYD_PASS = process.env.TTYD_PASS || "changeme";
export const ACFS_USER = process.env.ACFS_USER || "dev";
export const ACFS_HOSTNAME = process.env.ACFS_HOSTNAME || "acfs";
export const BASE_TTYD_PORT = 17681;
const CODE_SERVER_PORT = 18080;
export const CODE_SERVER_URL = process.env.CODE_SERVER_URL || "#";

export const CODE_SERVER_AVAILABLE =
  CODE_SERVER_URL !== "#" && CODE_SERVER_URL !== "";
