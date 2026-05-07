import bcrypt from "bcrypt";

async function gen() {
  const hash = await bcrypt.hash("password123", 10);
  console.log("HASH_START:" + hash + ":HASH_END");
}

gen();
