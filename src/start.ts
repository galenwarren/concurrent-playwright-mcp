import { mkdir } from "node:fs/promises";
import type { BrowserProvider } from "./browser-provider";
import type { AppConfig } from "./config";
import { runHttp } from "./transport/http";
import { runStdio, type RunningTransport } from "./transport/stdio";

/**
 * Start the MCP server on the configured transport, backed by the given
 * {@link BrowserProvider}. The library entrypoint: callers supply their own
 * provider (e.g. one whose launcher connects to a remote browser over CDP) and
 * own process concerns (signals, exit). Closing the result stops the transport,
 * then closes the provider's browser.
 */
export async function start(
  config: AppConfig,
  provider: BrowserProvider,
): Promise<RunningTransport> {
  // Ensure the output directory (screenshots, storage-state) exists up front.
  await mkdir(config.security.outputDir, { recursive: true });

  const transport =
    config.transport.mode === "http"
      ? await runHttp(config, provider)
      : await runStdio(config, provider);

  return {
    async close() {
      await transport.close();
      await provider.close();
    },
  };
}
