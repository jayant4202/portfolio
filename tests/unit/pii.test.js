import { describe, it, expect, vi, afterEach } from "vitest";
import {
  redactPII, redactDeep, pseudonymize, loadKeyring, encryptPII, decryptPII, isPIIToken,
  PIIConfigError, PIIDecryptError,
} from "../../lib/edge/pii.js";
import { log } from "../../lib/edge/trace.js";

const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const randomKey = () => b64(crypto.getRandomValues(new Uint8Array(32)));
const keyringEnv = (keys, current) => ({ PII_KEYRING: JSON.stringify({ current, keys }) });

afterEach(() => vi.restoreAllMocks());

describe("redactPII", () => {
  it.each([
    ["contact me at jane.doe+cv@gmail.com today", "contact me at [email] today"],
    ["/work/a@b.co", "/work/[email]"],
    ["call +91 98765 43210", "call [phone]"],
    ["call 9876543210.", "call [phone]."],
    ["phone: 98765-43210", "phone: [phone]"],
    ["from 203.0.113.9 via proxy", "from [ip] via proxy"],
    ["v6 2001:db8:85a3::8a2e:370:7334 here", "v6 [ip] here"],
  ])("redacts %j", (input, output) => {
    expect(redactPII(input)).toBe(output);
  });

  it.each([
    "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
    "4bf92f3577b34da6a3ce929d0e0e4736",
    "a5f8eeb71c820bfb-SIN",
    "2026-11-26T10:15:03.120Z",
    "/case-studies/credit-line-on-upi",
    "script-src-elem",
    "15.6-month runway",
    "at 10:15:03 today",
    "ratio 3.6x over 1234567890.5 units",
    "script-src 'self' https://static.cloudflareinsights.com",
  ])("leaves non-PII alone: %j", (input) => {
    expect(redactPII(input)).toBe(input);
  });

  it("redacts nested values and keeps non-strings", () => {
    expect(redactDeep({ a: "x@y.io", b: [1, "8.8.8.8"], c: { d: null, e: true, f: 42 } }))
      .toEqual({ a: "[email]", b: [1, "[ip]"], c: { d: null, e: true, f: 42 } });
  });

  it("is applied to every log line", () => {
    const lines = [];
    vi.spyOn(console, "log").mockImplementation((l) => lines.push(l));
    log("info", "request", { path: "/hello/jane@corp.com", note: "from 198.51.100.7", status: 200 });
    expect(lines[0]).not.toContain("jane@corp.com");
    expect(lines[0]).not.toContain("198.51.100.7");
    expect(JSON.parse(lines[0])).toMatchObject({ path: "/hello/[email]", note: "from [ip]", status: 200 });
  });
});

describe("pseudonymize", () => {
  it("is stable for the same input and differs across inputs", async () => {
    const a1 = await pseudonymize("203.0.113.9");
    const a2 = await pseudonymize("203.0.113.9");
    const b = await pseudonymize("203.0.113.10");
    expect(a1).toMatch(/^[0-9a-f]{32}$/);
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
    expect(a1).not.toContain("203");
  });

  it("depends on the key", async () => {
    const k = await crypto.subtle.importKey("raw", crypto.getRandomValues(new Uint8Array(32)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    expect(await pseudonymize("x", k)).not.toBe(await pseudonymize("x"));
  });
});

describe("encryption layer", () => {
  it("round-trips and produces a well-formed token", async () => {
    const kr = await loadKeyring(keyringEnv({ k1: randomKey() }, "k1"));
    const token = await encryptPII("jane@example.org", kr, "trial:email");
    expect(isPIIToken(token)).toBe(true);
    expect(token).toMatch(/^pii\.v1\.k1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/);
    expect(token).not.toContain("jane");
    expect(await decryptPII(token, kr, "trial:email")).toBe("jane@example.org");
  });

  it("uses a fresh IV every time", async () => {
    const kr = await loadKeyring(keyringEnv({ k1: randomKey() }, "k1"));
    const tokens = new Set();
    for (let i = 0; i < 200; i++) tokens.add(await encryptPII("same", kr, "c"));
    expect(tokens.size).toBe(200);
  });

  it("refuses to decrypt under a different context", async () => {
    const kr = await loadKeyring(keyringEnv({ k1: randomKey() }, "k1"));
    const token = await encryptPII("secret", kr, "trial:email");
    await expect(decryptPII(token, kr, "billing:email")).rejects.toBeInstanceOf(PIIDecryptError);
  });

  it("detects tampering", async () => {
    const kr = await loadKeyring(keyringEnv({ k1: randomKey() }, "k1"));
    const token = await encryptPII("secret", kr, "c");
    const parts = token.split(".");
    const ct = parts[4];
    parts[4] = (ct[0] === "A" ? "B" : "A") + ct.slice(1);
    await expect(decryptPII(parts.join("."), kr, "c")).rejects.toBeInstanceOf(PIIDecryptError);
  });

  it("fails with the wrong key", async () => {
    const kr1 = await loadKeyring(keyringEnv({ k1: randomKey() }, "k1"));
    const kr2 = await loadKeyring(keyringEnv({ k1: randomKey() }, "k1"));
    const token = await encryptPII("secret", kr1, "c");
    await expect(decryptPII(token, kr2, "c")).rejects.toBeInstanceOf(PIIDecryptError);
  });

  it("supports key rotation: old data stays readable, new data uses the new key", async () => {
    const k1 = randomKey();
    const old = await loadKeyring(keyringEnv({ k1 }, "k1"));
    const oldToken = await encryptPII("before rotation", old, "c");
    const rotated = await loadKeyring(keyringEnv({ k1, k2: randomKey() }, "k2"));
    expect(await decryptPII(oldToken, rotated, "c")).toBe("before rotation");
    expect((await encryptPII("after", rotated, "c")).split(".")[2]).toBe("k2");
  });

  it.each([
    ["missing secret", {}],
    ["invalid JSON", { PII_KEYRING: "{nope" }],
    ["current key not in keys", keyringEnv({ k1: randomKey() }, "k9")],
    ["short key", keyringEnv({ k1: b64(new Uint8Array(16)) }, "k1")],
    ["non-base64 key", keyringEnv({ k1: "!!!not base64!!!" }, "k1")],
    ["bad key id", keyringEnv({ "k 1": randomKey() }, "k 1")],
  ])("fails closed on %s", async (_, env) => {
    await expect(loadKeyring(env)).rejects.toBeInstanceOf(PIIConfigError);
  });

  it.each(["", "plain@text.com", "pii.v1.k1.abc", "pii.v2.k1.AAAAAAAAAAAAAAAA.AAAA", "pii.v1.k1.!!!.AAAA"])(
    "rejects malformed token %j", async (bad) => {
      const kr = await loadKeyring(keyringEnv({ k1: randomKey() }, "k1"));
      await expect(decryptPII(bad, kr, "c")).rejects.toBeInstanceOf(PIIDecryptError);
    });

  it("requires a string and a context", async () => {
    const kr = await loadKeyring(keyringEnv({ k1: randomKey() }, "k1"));
    await expect(encryptPII(42, kr, "c")).rejects.toThrow(TypeError);
    await expect(encryptPII("x", kr, "")).rejects.toThrow(TypeError);
  });
});
