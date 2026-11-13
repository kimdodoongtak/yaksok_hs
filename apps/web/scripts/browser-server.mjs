import { config } from "dotenv";
import { spawn } from "node:child_process";
import { verifyTestDatabase } from "./test-database.mjs";
config({ path: ".env.test", quiet: true });
const url = await verifyTestDatabase(process.env.TEST_DATABASE_URL);
const env = {
  ...process.env,
  DATABASE_URL: url,
  DIRECT_URL: url,
  INVITATION_BROWSER_TEST: "1",
};
const migrate = spawn(
  "node",
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { env, stdio: "inherit" },
);
if ((await new Promise((resolve) => migrate.on("exit", resolve))) !== 0)
  process.exit(1);
const server = spawn(
  "node",
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3100",
  ],
  { env, stdio: "inherit" },
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => server.kill(signal));
server.on("exit", (code) => process.exit(code ?? 1));
