import { chromium } from "playwright";
import type { LaunchOptions as PlaywrightLaunchOptions } from "playwright";
import type { BrowserLauncher } from "./browser-provider";

/** An upstream proxy every browser request is routed through. */
export interface ProxyOptions {
  /** Proxy URL, e.g. `http://proxy:3128` or `socks5://proxy:1080` (scheme defaults to http). */
  server: string;
  /** Username for proxies that require HTTP authentication. */
  username?: string;
  /** Password for proxies that require HTTP authentication. */
  password?: string;
}

export interface LaunchOptions {
  /** Run without a visible window. Defaults to true (right for servers/CI). */
  headless?: boolean;
  /** Path to a specific Chromium build, if not using Playwright's bundled one. */
  executablePath?: string;
  /** Route all browser traffic through this proxy. */
  proxy?: ProxyOptions;
}

/**
 * Production {@link BrowserLauncher} backed by Playwright's bundled Chromium.
 * Returned as a factory so launch options are captured once at startup.
 */
export function chromiumLauncher(options: LaunchOptions = {}): BrowserLauncher {
  const { headless = true, executablePath, proxy } = options;
  return () => {
    const launchOptions: PlaywrightLaunchOptions = { headless };
    if (executablePath !== undefined) {
      launchOptions.executablePath = executablePath;
    }
    if (proxy !== undefined) {
      launchOptions.proxy = proxy;
    }
    return chromium.launch(launchOptions);
  };
}
