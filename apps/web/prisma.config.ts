import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Neon CLI는 .env.local에 연결 정보를 저장한다. 주입된 환경 변수는 우선한다.
config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DIRECT_URL || env("DATABASE_URL_UNPOOLED") },
});
