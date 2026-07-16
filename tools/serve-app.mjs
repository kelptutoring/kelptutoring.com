import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const preferredPort = Number(process.env.PORT || 3000);
const shouldOpen = process.argv.includes("--open");
const shouldSelfTest = process.argv.includes("--self-test");
let activePort = preferredPort;
let activeServer = null;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp"
};

async function handleRequest(request, response) {
  try {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(url.pathname);
    const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
    const filePath = normalize(join(projectRoot, relativePath));

    if (!filePath.startsWith(projectRoot) || !existsSync(filePath)) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const body = await readFile(filePath);
    response.writeHead(200, {
      "content-type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store"
    });
    response.end(body);
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end("Server error");
  }
}

start(preferredPort);

function start(port) {
  activePort = port;
  activeServer = createServer(handleRequest);

  activeServer.on("error", (error) => {
    if (error.code === "EADDRINUSE" && activePort < preferredPort + 20) {
      start(activePort + 1);
      return;
    }

    console.error(error);
    process.exit(1);
  });

  activeServer.listen(port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${port}/src/app/signUp/login.html`;
    console.log(`Kelp app is running at ${url}`);

    if (shouldSelfTest) {
      runSelfTest(url);
      return;
    }

    console.log("Keep this window open while using the local app.");

    if (shouldOpen) {
      openBrowser(url);
    }
  });
}

async function runSelfTest(url) {
  try {
    const response = await fetch(url);
    const body = await response.text();

    if (!response.ok || !body.includes("Login")) {
      throw new Error(`Unexpected response: ${response.status}`);
    }

    console.log("Self-test passed: app page served successfully.");
  } catch (error) {
    console.error(`Self-test failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    activeServer.close(() => {
      process.exit(process.exitCode || 0);
    });
  }
}

function openBrowser(url) {
  let child = null;

  if (process.platform === "win32") {
    child = spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" });
  } else if (process.platform === "darwin") {
    child = spawn("open", [url], { detached: true, stdio: "ignore" });
  } else {
    child = spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
  }

  child.on("error", () => {
    console.log(`Open this URL in your browser: ${url}`);
  });

  child.unref();
}
