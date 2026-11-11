import { spawn } from "child_process";
import fs from "fs";
import process from "node:process";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendWatchTargets = [
  "server/config",
  "server/controllers",
  "server/middleware",
  "server/routes",
  "server/services",
  "server/index.js",
  ".env",
]
  .filter((target) => fs.existsSync(path.join(root, target)))
  .map((target) => `--watch-path=${target}`);

const processes = [
  {
    name: "Backend",
    nodeArgs: [...backendWatchTargets, "--watch-preserve-output"],
    script: path.join(root, "server", "index.js"),
    args: [],
  },
  {
    name: "Frontend",
    nodeArgs: [],
    script: path.join(root, "node_modules", "vite", "bin", "vite.js"),
    args: ["--host"],
  },
].map(({ name, nodeArgs = [], script, args = [] }) => ({
  name,
  process: spawn(process.execPath, [...nodeArgs, script, ...args], {
    cwd: root,
    stdio: "inherit",
  }),
}));

let isShuttingDown = false;

function shutdown(exitCode) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  process.exitCode = exitCode;
  for (const child of processes) {
    if (child.process.exitCode === null) child.process.kill();
  }
}

for (const child of processes) {
  child.process.on("error", (error) => {
    console.error(`[Dev] Failed to start ${child.name}:`, error);
    shutdown(1);
  });
  child.process.on("exit", (code, signal) => {
    if (!isShuttingDown) {
      console.error(
        `[Dev] ${child.name} stopped${signal ? ` (${signal})` : ""}.`
      );
      shutdown(code || 1);
    }
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
