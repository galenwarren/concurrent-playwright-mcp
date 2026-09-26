#!/usr/bin/env node
import { BrowserProvider } from "./browser-provider";
import { describeConfig, loadConfig } from "./config";
import { chromiumLauncher } from "./playwright-launcher";
import { start } from "./start";

async function main(): Promise<void> {
  const config = loadConfig();
  const provider = new BrowserProvider(chromiumLauncher(config.launch));
  const running = await start(config, provider);

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    try {
      await running.close();
    } finally {
      process.exit(0);
    }
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());

  // Keep a long-running server alive on a stray rejection (e.g. a context that
  // rejected during idle eviction); log to stderr rather than crashing.
  process.on("unhandledRejection", (reason: unknown) => {
    console.error("Unhandled rejection:", reason);
  });
  process.on("uncaughtException", (error: unknown) => {
    console.error("Uncaught exception:", error);
  });

  // stdout is the JSON-RPC channel (stdio mode); all logging goes to stderr.
  console.error(`concurrent-playwright-mcp running | ${describeConfig(config)}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
