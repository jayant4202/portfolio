// Personal data (PII) protection for edge code. Three tools, from weakest to strongest guarantee:
//
//   redactPII(text)     Removes emails, phone numbers and IP addresses from free text. Applied to
//                       every log line as a last line of defence (see trace.js → log()).
//   pseudonymize(v)     One-way keyed hash (HMAC-SHA-256). For values that must be compared but never
//                       read back, e.g. rate-limit keys derived from IP addresses.
//   encryptPII / decryptPII
//                       Reversible, authenticated encryption (AES-256-GCM) for PII that must be stored
//                       and read back later, e.g. trial-account emails in roadmap v2.0.
//
// Today the site stores no PII at all. The encryption layer is in place, tested and documented
// (SECURITY.md → "Personal data") so any future feature that needs PII uses it from day one.
//
// Encryption keys never live in the repository. They come from a Cloudflare secret, PII_KEYRING:
//   {"current":"k1","keys":{"k1":"<base64 of 32 random bytes>"}}
// Several keys can be listed so old data stays readable after rotation; new data always uses
// `current`. Every function fails closed: no valid key, no encryption, and no plaintext fallback.

const TOKEN_PREFIX = "pii.v1";
const AAD_PREFIX = "jayantgoswami.com|";
const enc = new TextEncoder();
const dec = new TextDecoder();

export class PIIConfigError extends Error {
  constructor(message) { super(message); this.name = "PIIConfigError"; }
}
export class PIIDecryptError extends Error {
  constructor(message) { super(message); this.name = "PIIDecryptError"; }
}

// ---------- base64url ----------
function toB64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(str) {
  if (!/^[A-Za-z0-9_-]*$/.test(str)) throw new PIIDecryptError("malformed token");
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function fromB64(str) {
  try {
    const bin = atob(String(str));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    throw new PIIConfigError("key is not valid base64");
  }
}

// ---------- Redaction ----------
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
// Phone numbers: optional country code, then 10 digits, allowing spaces/dashes in common spots.
// Not followed by a letter/digit or by ".<digit>" (a decimal), but a full stop ending a sentence is fine.
const PHONE = /(?<![\w/.])(?:\+\d{1,3}[\s-]?)?(?:\d[\s-]?){9}\d(?!\w)(?!\.\d)/g;
// IPv4 not preceded by "/" or "." (so browser versions such as "Chrome/131.0.0.0" are kept).
const IPV4 = /(?<![\w/.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![\w.])/g;
// IPv6 candidates (full or "::"-compressed). Only redacted if they contain "::" or a hex letter, so
// clock times such as "10:15:03" are left alone.
const IPV6 = /(?<![\w:])(?:[0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}(?![\w:])/g;
const ipv6OrKeep = (m) => ((m.includes("::") || /[a-f]/i.test(m)) && /[0-9a-f]/i.test(m) ? "[ip]" : m);

/** Replaces emails, phone numbers and IP addresses in a string with placeholders. */
export function redactPII(text) {
  if (typeof text !== "string" || text.length === 0) return text;
  return text
    .replace(EMAIL, "[email]")
    .replace(IPV6, ipv6OrKeep)
    .replace(IPV4, "[ip]")
    .replace(PHONE, "[phone]");
}

/** Deep-redacts every string inside a plain object or array (numbers, booleans and null pass through). */
export function redactDeep(value) {
  if (typeof value === "string") return redactPII(value);
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = redactDeep(v);
    return out;
  }
  return value;
}

// ---------- Pseudonymisation ----------
let isolateKey = null;

/**
 * A random HMAC key that lives only in this isolate's memory. It is never logged or stored, and
 * rotates whenever Cloudflare recycles the isolate. That is right for short-lived uses such as rate
 * limiting, where pseudonyms only need to match within a few minutes.
 */
async function ephemeralKey() {
  if (!isolateKey) {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    isolateKey = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  }
  return isolateKey;
}

/** One-way keyed hash of a value: same input → same 32-hex pseudonym (per key); not reversible. */
export async function pseudonymize(value, key) {
  const k = key || (await ephemeralKey());
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(String(value))));
  let hex = "";
  for (const b of mac.subarray(0, 16)) hex += b.toString(16).padStart(2, "0");
  return hex;
}

// ---------- Encryption (AES-256-GCM) ----------
/**
 * Parses and imports the PII_KEYRING secret. Throws PIIConfigError if missing or invalid.
 * Returns { current, keys: Map<kid, CryptoKey> }.
 */
export async function loadKeyring(env) {
  const raw = env && env.PII_KEYRING;
  if (!raw) throw new PIIConfigError("PII_KEYRING secret is not set");
  let parsed;
  try { parsed = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { throw new PIIConfigError("PII_KEYRING is not valid JSON"); }
  const { current, keys } = parsed || {};
  if (!current || !keys || typeof keys !== "object" || !keys[current]) {
    throw new PIIConfigError("PII_KEYRING must name a `current` key that exists in `keys`");
  }
  const imported = new Map();
  for (const [kid, b64] of Object.entries(keys)) {
    if (!/^[A-Za-z0-9]{1,16}$/.test(kid)) throw new PIIConfigError(`invalid key id "${kid}"`);
    const bytes = fromB64(b64);
    if (bytes.length !== 32) throw new PIIConfigError(`key "${kid}" must be exactly 32 bytes`);
    imported.set(kid, await crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]));
  }
  return { current, keys: imported };
}

/**
 * Encrypts a string with the current key. `context` (for example "trial:email") is bound to the
 * ciphertext as associated data, so a value encrypted for one purpose can't be decrypted as another.
 * Returns a compact token: pii.v1.<kid>.<iv>.<ciphertext+tag> (base64url).
 */
export async function encryptPII(plaintext, keyring, context) {
  if (typeof plaintext !== "string") throw new TypeError("plaintext must be a string");
  if (!context) throw new TypeError("context is required");
  const key = keyring && keyring.keys.get(keyring.current);
  if (!key) throw new PIIConfigError("no current encryption key");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(AAD_PREFIX + context) }, key, enc.encode(plaintext)));
  return `${TOKEN_PREFIX}.${keyring.current}.${toB64url(iv)}.${toB64url(ct)}`;
}

/** Decrypts a token produced by encryptPII. Throws PIIDecryptError on any tampering or mismatch. */
export async function decryptPII(token, keyring, context) {
  const parts = typeof token === "string" ? token.split(".") : [];
  if (parts.length !== 5 || `${parts[0]}.${parts[1]}` !== TOKEN_PREFIX) throw new PIIDecryptError("not a PII token");
  const [, , kid, ivB64, ctB64] = parts;
  const key = keyring && keyring.keys.get(kid);
  if (!key) throw new PIIDecryptError("unknown key id");
  const iv = fromB64url(ivB64);
  if (iv.length !== 12) throw new PIIDecryptError("malformed token");
  try {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: enc.encode(AAD_PREFIX + context) }, key, fromB64url(ctB64));
    return dec.decode(pt);
  } catch {
    throw new PIIDecryptError("decryption failed (wrong key, wrong context, or tampered data)");
  }
}

/** True if a value looks like an encrypted PII token (useful for guarding storage writes). */
export function isPIIToken(value) {
  return typeof value === "string" && value.startsWith(TOKEN_PREFIX + ".") && value.split(".").length === 5;
}
