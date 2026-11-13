import { config } from "dotenv";
import { spawnSync } from "node:child_process";
import { verifyTestDatabase } from "./test-database.mjs";
config({ path: ".env.test", quiet: true });
try {
  const url = await verifyTestDatabase(process.env.TEST_DATABASE_URL);
  const env = {
    ...process.env,
    DATABASE_URL: url,
    DIRECT_URL: url,
    TEST_DATABASE_URL: url,
  };
  const migration = spawnSync(
    "node_modules/.bin/prisma",
    ["migrate", "deploy"],
    { env, stdio: "inherit" },
  );
  if (migration.status !== 0) process.exit(migration.status ?? 1);
  const result = spawnSync(
    "node_modules/.bin/vitest",
    [
      "run",
      "--config",
      "vitest.integration.config.ts",
      ...process.argv.slice(2),
    ],
    { env, stdio: "inherit" },
  );
  process.exit(result.status ?? 1);
} catch {
  console.error("통합 검증 중단: 테스트 DB 연결·허용 대상 설정을 확인하세요.");
  process.exitCode = 1;
}
