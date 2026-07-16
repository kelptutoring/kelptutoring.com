import { existsSync } from "node:fs";
import { delimiter } from "node:path";
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const env = { ...process.env };

if (process.platform === "win32") {
  const dockerCliPath = "C:\\Program Files\\Docker\\Docker\\resources\\bin";
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") || "Path";
  const currentPath = env[pathKey] || "";

  if (existsSync(dockerCliPath) && !currentPath.toLowerCase().includes(dockerCliPath.toLowerCase())) {
    env[pathKey] = `${dockerCliPath}${delimiter}${currentPath}`;
  }
}

const command = process.platform === "win32" ? "cmd.exe" : "supabase";
const commandArgs = process.platform === "win32" ? ["/d", "/s", "/c", "supabase.cmd", ...args] : args;
const child = spawn(command, commandArgs, {
  env,
  shell: false,
  stdio: "inherit"
});

child.on("error", (error) => {
  console.error(`Failed to run Supabase CLI: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Supabase CLI exited from signal ${signal}`);
    process.exit(1);
    return;
  }

  process.exit(code ?? 0);
});
