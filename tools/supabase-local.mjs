import { existsSync } from "node:fs";
import { delimiter, dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const env = { ...process.env };
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") || "Path";
const pathEntries = [];

if (process.platform === "win32") {
  const dockerCliPath = "C:\\Program Files\\Docker\\Docker\\resources\\bin";
  if (existsSync(dockerCliPath)) {
    pathEntries.push(dockerCliPath);
  }
}

pathEntries.push(resolve(projectRoot, "node_modules", ".bin"));

const currentPath = env[pathKey] || "";
const missingEntries = pathEntries.filter((entry) => {
  return existsSync(entry) && !currentPath.toLowerCase().includes(entry.toLowerCase());
});

if (missingEntries.length > 0) {
  env[pathKey] = `${missingEntries.join(delimiter)}${delimiter}${currentPath}`;
}

const command = process.platform === "win32" ? "cmd.exe" : "supabase";
const commandArgs = process.platform === "win32" ? ["/d", "/s", "/c", "supabase.cmd", ...args] : args;
const outputMayContainCredentials = ["start", "status"].includes(args[0]);

function sanitizeOutput(value) {
  return value
    .replace(
      /("(?:ANON_KEY|DB_URL|JWT_SECRET|PUBLISHABLE_KEY|SECRET_KEY|SERVICE_ROLE_KEY|S3_PROTOCOL_ACCESS_KEY_ID|S3_PROTOCOL_ACCESS_KEY_SECRET)"\s*:\s*)"[^"]*"/gi,
      '$1"[redacted]"'
    )
    .replace(
      /^(ANON_KEY|DB_URL|JWT_SECRET|PUBLISHABLE_KEY|SECRET_KEY|SERVICE_ROLE_KEY|S3_PROTOCOL_ACCESS_KEY_ID|S3_PROTOCOL_ACCESS_KEY_SECRET)=.*$/gim,
      "$1=[redacted]"
    )
    .replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, "postgresql://[redacted]@");
}

const child = spawn(command, commandArgs, {
  env,
  shell: false,
  stdio: outputMayContainCredentials ? ["inherit", "pipe", "pipe"] : "inherit"
});

let stdout = "";
let stderr = "";
if (outputMayContainCredentials) {
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
}

child.on("error", (error) => {
  console.error(`Failed to run Supabase CLI: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (outputMayContainCredentials) {
    const safeStdout = sanitizeOutput(stdout);
    const safeStderr = sanitizeOutput(stderr);
    if (safeStdout) process.stdout.write(safeStdout);
    if (safeStderr) process.stderr.write(safeStderr);
  }
  if (signal) {
    console.error(`Supabase CLI exited from signal ${signal}`);
    process.exit(1);
    return;
  }

  process.exit(code ?? 0);
});
