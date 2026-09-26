import { mkdtemp, rm, stat } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Browser } from "playwright";
import { BrowserProvider } from "../src/browser-provider";
import type { AppConfig } from "../src/config";
import { start } from "../src/start";

/** A fake browser that records when it is closed. */
class FakeBrowser {
  closed = false;
  isConnected(): boolean {
    return !this.closed;
  }
  async close(): Promise<void> {
    this.closed = true;
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createNetServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      srv.close(() => {
        resolve(port);
      });
    });
  });
}

function configFor(port: number, outputDir: string): AppConfig {
  return {
    launch: {},
    manager: {
      maxSessions: 50,
      idleTimeoutMs: 0,
      maxTabs: 20,
      maxCaptureEntries: 1000,
      actionTimeoutMs: 15000,
      defaultViewport: { width: 1440, height: 900 },
    },
    security: { outputDir, allowFileUrls: false },
    transport: { mode: "http", host: "127.0.0.1", port },
  };
}

describe("start", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "cpm-start-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("creates the output directory before serving", async () => {
    const outputDir = path.join(tempDir, "nested", "output");
    const provider = new BrowserProvider(async () => new FakeBrowser() as unknown as Browser);
    const running = await start(configFor(await freePort(), outputDir), provider);
    try {
      expect((await stat(outputDir)).isDirectory()).toBe(true);
    } finally {
      await running.close();
    }
  });

  it("close() stops the transport and closes the provider's browser", async () => {
    const port = await freePort();
    const browser = new FakeBrowser();
    const provider = new BrowserProvider(async () => browser as unknown as Browser);
    const running = await start(configFor(port, tempDir), provider);
    await provider.acquire();

    await running.close();

    expect(browser.closed).toBe(true);
    await expect(fetch(`http://127.0.0.1:${String(port)}/`)).rejects.toThrow();
  });
});
