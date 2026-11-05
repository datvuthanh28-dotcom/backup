import { spawnSync } from "node:child_process";
import process from "node:process";

const steps = [
  ["db:migrate", []],
  ["db:seed-metrics", []],
  ["db:costs", []],
  ["db:seed-analytics", []],
  ["db:metrics", ["--", "90"]],
  ["db:promotion-distribution", []],
];

for (const [script,args] of steps) {
  console.log(`\n[Setup] Running npm run ${script} ${args.join(" ")}`);
  const result=spawnSync("npm",["run",script,...args],{stdio:"inherit",shell:true});
  if(result.status!==0){
    console.error(`[Setup] Failed at ${script}. Fix the reported error, then run npm run setup again.`);
    process.exit(result.status||1);
  }
}
console.log("\n[Setup] Maison Rue is ready. Run npm run dev to start the website.");

