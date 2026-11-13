import { spawnSync } from "node:child_process";
import process from "node:process";
import sql from "mssql";
import dotenv from "dotenv";

dotenv.config({ override: true });

if (process.env.CONFIRM_DEMO_RESET !== "MAISON_RUE") {
  throw new Error("Lệnh này xóa toàn bộ database demo cục bộ. Chạy: $env:CONFIRM_DEMO_RESET='MAISON_RUE'; npm run db:reset-demo");
}

const database = process.env.DB_NAME || "MaisonRueDB";
if (!/^[A-Za-z0-9_]+$/.test(database)) throw new Error("DB_NAME không hợp lệ.");

const master = await sql.connect({
  user: process.env.DB_USER || "sa", password: process.env.DB_PASSWORD, database: "master",
  server: process.env.DB_SERVER || "127.0.0.1", port: Number(process.env.DB_PORT || 1433),
  options: { encrypt: process.env.DB_ENCRYPT === "true", trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== "false" },
});
try {
  const found = await master.request().input("name", sql.NVarChar, database).query("SELECT 1 AS found FROM sys.databases WHERE name=@name");
  if (found.recordset.length) {
    await master.request().query(`ALTER DATABASE [${database}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${database}];`);
    console.log(`[Demo reset] Đã xóa ${database}.`);
  }
} finally {
  await master.close();
}

const setup = spawnSync("npm", ["run", "setup"], { stdio: "inherit", shell: true });
process.exit(setup.status || 0);
