import sql from "mssql";
import dotenv from "dotenv";

// Keep create/setup on the same project-local connection as the application.
dotenv.config({ override: true });

const database = process.env.DB_NAME || "MaisonRueDB";
if (!/^[A-Za-z0-9_]+$/.test(database)) {
  throw new Error("DB_NAME may contain only letters, numbers, and underscores.");
}
if (!process.env.DB_PASSWORD) {
  throw new Error("DB_PASSWORD is missing. Copy .env.example to .env and enter your local SQL Server password.");
}

const pool = await sql.connect({
  user: process.env.DB_USER || "sa",
  password: process.env.DB_PASSWORD,
  database: "master",
  server: process.env.DB_SERVER || "127.0.0.1",
  port: Number(process.env.DB_PORT || 1433),
  options: {
    encrypt: process.env.DB_ENCRYPT === "true",
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== "false",
  },
});

try {
  const exists = await pool.request()
    .input("database", sql.NVarChar(128), database)
    .query("SELECT 1 AS found FROM sys.databases WHERE name = @database");
  if (!exists.recordset.length) {
    await pool.request().query(`CREATE DATABASE [${database}]`);
    console.log(`[Database] Created ${database}.`);
  } else {
    console.log(`[Database] ${database} already exists.`);
  }
} finally {
  await pool.close();
}
