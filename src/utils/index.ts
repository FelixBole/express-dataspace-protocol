/**
 * Generates a new UUID v4.
 * Used throughout the DSP implementation to create provider/consumer PIDs.
 */
export function generateId(): string {
  // Uses the built-in crypto module available in Node.js 14.17+
  return crypto.randomUUID();
}

/**
 * Returns the current UTC timestamp in ISO 8601 format.
 */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Safely joins a base URL with a path, handling trailing slashes.
 */
export function buildUrl(base: string, path: string): string {
  return base.replace(/\/$/, '') + path;
}
