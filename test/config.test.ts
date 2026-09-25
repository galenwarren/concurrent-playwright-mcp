import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { describeConfig, loadConfig } from "../src/config";

/** Silence (and capture) the stderr warnings loadConfig emits for bad input. */
function muteWarnings() {
  return vi.spyOn(console, "error").mockImplementation(() => undefined);
}

describe("loadConfig", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses safe defaults for an empty environment", () => {
    const config = loadConfig({});
    expect(config.manager).toEqual({
      maxSessions: 50,
      idleTimeoutMs: 0,
      maxTabs: 20,
      maxCaptureEntries: 1000,
      actionTimeoutMs: 15000,
      defaultViewport: { width: 1440, height: 900 },
    });
    expect(config.launch.headless).toBe(true);
    expect(config.launch.proxy).toBeUndefined();
    expect(config.security.allowFileUrls).toBe(false);
    expect(config.security.allowedOrigins).toBeUndefined();
    expect(config.security.uploadDir).toBeUndefined();
    expect(config.security.outputDir).toBe(path.resolve("output"));
    expect(config.transport).toEqual({ mode: "stdio", host: "127.0.0.1", port: 3000 });
  });

  it("parses the http transport vars", () => {
    const config = loadConfig({
      PW_TRANSPORT: "http",
      PW_HOST: "0.0.0.0",
      PW_PORT: "8080",
      PW_ALLOWED_HOSTS: "example.com:8080, app.internal:8080",
      PW_ACTION_TIMEOUT_MS: "5000",
    });
    expect(config.transport).toEqual({
      mode: "http",
      host: "0.0.0.0",
      port: 8080,
      allowedHosts: ["example.com:8080", "app.internal:8080"],
    });
    expect(config.manager.actionTimeoutMs).toBe(5000);
  });

  it("warns on an unrecognized transport and falls back to stdio", () => {
    const warn = muteWarnings();
    expect(loadConfig({ PW_TRANSPORT: "carrier-pigeon" }).transport.mode).toBe("stdio");
    expect(warn).toHaveBeenCalled();
  });

  it("parses valid values", () => {
    const config = loadConfig({
      PW_HEADLESS: "false",
      PW_MAX_SESSIONS: "5",
      PW_IDLE_TIMEOUT_MS: "1000",
      PW_MAX_TABS: "3",
      PW_MAX_CAPTURE: "10",
      PW_ALLOW_FILE_URLS: "true",
      PW_ALLOWED_ORIGINS: "https://a.com, https://b.com/path",
      PW_OUTPUT_DIR: "shots",
      PW_UPLOAD_DIR: "uploads",
    });
    expect(config.launch.headless).toBe(false);
    expect(config.manager.maxSessions).toBe(5);
    expect(config.manager.maxTabs).toBe(3);
    expect(config.manager.maxCaptureEntries).toBe(10);
    expect(config.security.allowFileUrls).toBe(true);
    expect(config.security.allowedOrigins).toEqual(["https://a.com", "https://b.com"]);
    expect(config.security.outputDir).toBe(path.resolve("shots"));
    expect(config.security.uploadDir).toBe(path.resolve("uploads"));
  });

  it("falls back and warns on non-positive or non-numeric maxSessions", () => {
    const warn = muteWarnings();
    expect(loadConfig({ PW_MAX_SESSIONS: "0" }).manager.maxSessions).toBe(50);
    expect(loadConfig({ PW_MAX_SESSIONS: "-5" }).manager.maxSessions).toBe(50);
    expect(loadConfig({ PW_MAX_SESSIONS: "abc" }).manager.maxSessions).toBe(50);
    expect(loadConfig({ PW_MAX_SESSIONS: "12.5" }).manager.maxSessions).toBe(50);
    expect(warn).toHaveBeenCalled();
  });

  it("reads scientific notation as its real value, unlike parseInt", () => {
    expect(loadConfig({ PW_MAX_SESSIONS: "1e3" }).manager.maxSessions).toBe(1000);
  });

  it("warns on an unrecognized boolean and keeps the default", () => {
    const warn = muteWarnings();
    expect(loadConfig({ PW_HEADLESS: "maybe" }).launch.headless).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it("drops invalid origins from the allowlist", () => {
    const warn = muteWarnings();
    const config = loadConfig({ PW_ALLOWED_ORIGINS: "https://ok.com, not-a-url" });
    expect(config.security.allowedOrigins).toEqual(["https://ok.com"]);
    expect(warn).toHaveBeenCalled();
  });

  describe("viewport", () => {
    it("parses WIDTHxHEIGHT", () => {
      expect(loadConfig({ PW_VIEWPORT: " 1920X1080 " }).manager.defaultViewport).toEqual({
        width: 1920,
        height: 1080,
      });
    });

    it("parses 'none' as no viewport emulation", () => {
      expect(loadConfig({ PW_VIEWPORT: "None" }).manager.defaultViewport).toBeNull();
    });

    it("warns on an invalid value and keeps the default", () => {
      const warn = muteWarnings();
      for (const value of ["", "1920", "0x1080", "1920x-1", "1.5x2", "big"]) {
        expect(loadConfig({ PW_VIEWPORT: value }).manager.defaultViewport).toEqual({
          width: 1440,
          height: 900,
        });
      }
      expect(warn).toHaveBeenCalledTimes(6);
    });

    it("is included in the config summary", () => {
      expect(describeConfig(loadConfig({ PW_VIEWPORT: "none" }))).toContain("viewport=none");
      expect(describeConfig(loadConfig({}))).toContain("viewport=1440x900");
    });
  });

  describe("proxy", () => {
    it("passes a proxy server with credentials through to the launch options", () => {
      const config = loadConfig({
        PW_PROXY_URL: "http://proxy.internal:3128",
        PW_PROXY_USERNAME: "alice",
        PW_PROXY_PASSWORD: "s3cret",
      });
      expect(config.launch.proxy).toEqual({
        server: "http://proxy.internal:3128",
        username: "alice",
        password: "s3cret",
      });
    });

    it("accepts a server without credentials, or without a scheme", () => {
      expect(loadConfig({ PW_PROXY_URL: "socks5://proxy:1080" }).launch.proxy).toEqual({
        server: "socks5://proxy:1080",
      });
      expect(loadConfig({ PW_PROXY_URL: " proxy.internal:3128 " }).launch.proxy).toEqual({
        server: "proxy.internal:3128",
      });
    });

    it("treats an empty server as unset", () => {
      expect(loadConfig({ PW_PROXY_URL: "  " }).launch.proxy).toBeUndefined();
    });

    it("warns when credentials are set without a server", () => {
      const warn = muteWarnings();
      const config = loadConfig({ PW_PROXY_USERNAME: "alice", PW_PROXY_PASSWORD: "s3cret" });
      expect(config.launch.proxy).toBeUndefined();
      expect(warn).toHaveBeenCalled();
    });

    it("never logs the proxy credentials", () => {
      const summary = describeConfig(
        loadConfig({
          PW_PROXY_URL: "http://proxy:3128",
          PW_PROXY_USERNAME: "alice",
          PW_PROXY_PASSWORD: "s3cret",
        }),
      );
      expect(summary).toContain("proxy=http://proxy:3128");
      expect(summary).not.toContain("alice");
      expect(summary).not.toContain("s3cret");
      expect(describeConfig(loadConfig({}))).toContain("proxy=(none)");
    });
  });
});
