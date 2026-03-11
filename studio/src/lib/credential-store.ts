/**
 * Credential Store — Encrypted in-memory credential storage.
 *
 * Stores API keys, OAuth tokens, and MCP URLs per session using
 * AES-256-GCM encryption. In production this would back to DynamoDB
 * or AWS Secrets Manager; for now it's in-memory with real encryption.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { StoredCredential } from "./types";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Derive a 32-byte key from the env var or generate a random one for dev.
 */
function getEncryptionKey(): Buffer {
  const envKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (envKey) {
    // If the key is hex-encoded (64 chars = 32 bytes)
    if (envKey.length === 64 && /^[0-9a-fA-F]+$/.test(envKey)) {
      return Buffer.from(envKey, "hex");
    }
    // Otherwise hash it to 32 bytes
    const { createHash } = require("crypto");
    return createHash("sha256").update(envKey).digest();
  }
  // Dev fallback: deterministic key from a fixed seed so restarts don't lose data
  // (In-memory store is lost on restart anyway, but this keeps encrypt/decrypt consistent within a process)
  if (!_devKey) {
    _devKey = randomBytes(32);
  }
  return _devKey;
}

let _devKey: Buffer | null = null;

function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  // Pack: iv + authTag + ciphertext, all hex-encoded
  return Buffer.concat([iv, authTag, encrypted]).toString("hex");
}

function decrypt(packed: string): string {
  const key = getEncryptionKey();
  const buf = Buffer.from(packed, "hex");
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}

/** Internal storage entry. */
interface InternalEntry {
  service: string;
  type: "oauth_token" | "api_key" | "mcp_url";
  encryptedValue: string;
  connectedAt: string;
  expiresAt?: string;
  metadata?: Record<string, string>;
}

/**
 * In-memory store keyed by `${sessionId}:${service}`.
 */
const store = new Map<string, InternalEntry>();

function storeKey(sessionId: string, service: string): string {
  return `${sessionId}:${service}`;
}

/**
 * Store a credential for a service in a session.
 */
export function storeCredential(
  sessionId: string,
  service: string,
  credential: {
    type: "oauth_token" | "api_key" | "mcp_url";
    value: string;
    expiresAt?: string;
    metadata?: Record<string, string>;
  }
): void {
  store.set(storeKey(sessionId, service), {
    service,
    type: credential.type,
    encryptedValue: encrypt(credential.value),
    connectedAt: new Date().toISOString(),
    expiresAt: credential.expiresAt,
    metadata: credential.metadata,
  });
}

/**
 * Get a stored credential. Returns null if not found or expired.
 */
export function getCredential(
  sessionId: string,
  service: string
): StoredCredential | null {
  const entry = store.get(storeKey(sessionId, service));
  if (!entry) return null;

  // Check expiry
  if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
    store.delete(storeKey(sessionId, service));
    return null;
  }

  return {
    service: entry.service,
    type: entry.type,
    connected: true,
    connectedAt: entry.connectedAt,
    expiresAt: entry.expiresAt,
    metadata: entry.metadata,
  };
}

/**
 * Get the raw (decrypted) value of a credential. Use with care.
 */
export function getCredentialValue(
  sessionId: string,
  service: string
): string | null {
  const entry = store.get(storeKey(sessionId, service));
  if (!entry) return null;

  if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
    store.delete(storeKey(sessionId, service));
    return null;
  }

  return decrypt(entry.encryptedValue);
}

/**
 * List all credentials for a session.
 */
export function listCredentials(sessionId: string): StoredCredential[] {
  const prefix = `${sessionId}:`;
  const results: StoredCredential[] = [];

  for (const [key, entry] of store.entries()) {
    if (!key.startsWith(prefix)) continue;

    // Skip expired
    if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
      store.delete(key);
      continue;
    }

    results.push({
      service: entry.service,
      type: entry.type,
      connected: true,
      connectedAt: entry.connectedAt,
      expiresAt: entry.expiresAt,
      metadata: entry.metadata,
    });
  }

  return results;
}

/**
 * Delete a credential for a service in a session.
 */
export function deleteCredential(sessionId: string, service: string): void {
  store.delete(storeKey(sessionId, service));
}
