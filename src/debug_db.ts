import { createClient } from "@libsql/client";
const client = createClient({ url: "file:../../sqlite.db" });

async function main() {
  try {
    const rs = await client.execute("PRAGMA table_info(appointments)");
    console.log(JSON.stringify(rs.rows, null, 2));
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}
main();
