/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn, spawnSync } = require("node:child_process");

const testScript = process.argv[2];
if (!testScript) throw new Error("Pass the npm test script to run.");

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("npm_execpath is unavailable.");
const healthUrl = process.env.WIKI_URL || "http://127.0.0.1:3000";
let server;

function stopServer() {
  if (!server || server.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  } else {
    server.kill("SIGTERM");
  }
}

async function waitForServer() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw new Error(`The development server exited with ${server.exitCode}.`);
    try {
      const response = await fetch(healthUrl);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`The development server did not respond at ${healthUrl}.`);
}

async function main() {
  server = spawn(process.execPath, [npmCli, "run", "dev"], {
    stdio: "inherit",
  });
  await waitForServer();
  const tests = spawn(process.execPath, [npmCli, "run", testScript], {
    stdio: "inherit",
  });
  const exitCode = await new Promise((resolve, reject) => {
    tests.once("error", reject);
    tests.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
  if (exitCode !== 0) process.exitCode = exitCode;
}

process.once("SIGINT", () => {
  stopServer();
  process.exitCode = 130;
});
process.once("SIGTERM", () => {
  stopServer();
  process.exitCode = 143;
});

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(stopServer);
