import { config } from "dotenv";
import pg from "pg";
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { verifyTestDatabase } from "./test-database.mjs";
config({ quiet: true });
try {
  if (existsSync(".env.test")) {
    config({ path: ".env.test", quiet: true });
    await verifyTestDatabase(process.env.TEST_DATABASE_URL);
    console.log("기존 테스트 DB 연결을 확인했습니다.");
  } else {
    const url = new URL(process.env.DIRECT_URL);
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !["db", "127.0.0.1", "localhost"].includes(url.hostname) ||
      url.pathname !== "/sdd" ||
      url.username !== "sdd" ||
      url.search
    )
      throw new Error();
    const admin = new pg.Client({ connectionString: url.toString() });
    await admin.connect();
    try {
      const identity = await admin.query(
        "SELECT current_database() AS db, current_user AS role",
      );
      if (identity.rows[0].db !== "sdd" || identity.rows[0].role !== "sdd")
        throw new Error();
      const existing = await admin.query(
        "SELECT 1 FROM pg_database WHERE datname='sdd_test' UNION ALL SELECT 1 FROM pg_roles WHERE rolname='sdd_test'",
      );
      if (existing.rowCount) throw new Error();
      const password = randomBytes(32).toString("base64url");
      await admin.query(
        `CREATE ROLE sdd_test LOGIN PASSWORD ${admin.escapeLiteral(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE`,
      );
      await admin.query("CREATE DATABASE sdd_test OWNER sdd_test");
      url.username = "sdd_test";
      url.password = password;
      url.pathname = "/sdd_test";
      await verifyTestDatabase(url.toString());
      writeFileSync(".env.test", `TEST_DATABASE_URL=${url.toString()}\n`, {
        flag: "wx",
        mode: 0o600,
      });
      console.log("별도 테스트 DB와 .env.test를 생성했습니다.");
    } finally {
      await admin.end();
    }
  }
} catch {
  console.error(
    "테스트 DB 준비 실패: 로컬 연결을 확인하세요. 기존 DB·역할·환경 파일은 덮어쓰지 않습니다.",
  );
  process.exitCode = 1;
}
