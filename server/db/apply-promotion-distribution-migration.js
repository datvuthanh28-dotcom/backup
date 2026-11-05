import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { connectDB,getPool } from "../config/db.js";

const directory=path.dirname(fileURLToPath(import.meta.url));
await connectDB();
const pool=getPool();
try{
  const source=fs.readFileSync(path.join(directory,"migrations","015_promotion_code_distribution.sql"),"utf8");
  for(const batch of source.split(/^\s*GO\s*$/gim).map((item)=>item.trim()).filter(Boolean)) await pool.request().query(batch);
  console.log("Đã áp dụng cấu trúc phân phối mã khuyến mãi.");
}finally{await pool.close();}
