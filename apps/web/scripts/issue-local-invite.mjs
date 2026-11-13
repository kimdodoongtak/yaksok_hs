import { config } from "dotenv";
config({ quiet: true });
try {
  const url = new URL(process.env.DATABASE_URL);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["db", "127.0.0.1", "localhost"].includes(url.hostname) ||
    url.pathname !== "/sdd" ||
    url.username !== "sdd" ||
    url.search
  )
    throw new Error();
  const { invitationService } = await import(
    "../src/lib/invitation/runtime.ts"
  );
  const { prisma } = await import("../src/lib/prisma.ts");
  try {
    const rows =
      await prisma.$queryRaw`SELECT current_database() AS db, current_user AS role`;
    if (rows[0].db !== "sdd" || rows[0].role !== "sdd") throw new Error();
    const link = await invitationService.issueInviteLink();
    console.log(`초대 경로: /p/${link.inviteToken}`);
  } finally {
    await prisma.$disconnect();
  }
} catch {
  console.error(
    "로컬 초대 발급 실패: 로컬 개발 DB와 마이그레이션을 확인해 주세요.",
  );
  process.exitCode = 1;
}
