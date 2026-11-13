import pg from "pg";
export async function verifyTestDatabase(connectionString) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("TEST_DATABASE_URL이 필요합니다.");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["db", "localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/sdd_test" ||
    url.username !== "sdd_test" ||
    url.search
  )
    throw new Error("허용된 로컬 테스트 DB만 사용할 수 있습니다.");
  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
    const { rows } = await client.query(
      "SELECT current_database() AS db, current_user AS role",
    );
    if (rows[0].db !== "sdd_test" || rows[0].role !== "sdd_test")
      throw new Error("테스트 DB 대상이 다릅니다.");
  } finally {
    await client.end();
  }
  return connectionString;
}
