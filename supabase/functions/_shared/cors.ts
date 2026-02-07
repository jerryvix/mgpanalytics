// Shared CORS utility for all edge functions.
// Restricts Access-Control-Allow-Origin to known domains instead of wildcard "*".
//
// Set ALLOWED_ORIGINS env var as comma-separated list of domains:
//   e.g. "https://mgpanalytics.vercel.app,https://www.mgpanalytics.com"
//
// In development, localhost origins are always permitted.

const VERCEL_PREVIEW_PATTERN = /^https:\/\/[\w-]+-ipeek-cpus-projects\.vercel\.app$/;
const LOCALHOST_PATTERN = /^https?:\/\/localhost(:\d+)?$/;

function getAllowedOrigins(): string[] {
  const envOrigins = Deno.env.get("ALLOWED_ORIGINS") || "";
  return envOrigins
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;

  // Always allow localhost in any environment
  if (LOCALHOST_PATTERN.test(origin)) return true;

  // Allow Vercel preview deployments
  if (VERCEL_PREVIEW_PATTERN.test(origin)) return true;

  // Check explicit allowlist from env
  const allowed = getAllowedOrigins();
  if (allowed.length > 0) {
    return allowed.includes(origin);
  }

  // If no ALLOWED_ORIGINS is set, allow any vercel.app subdomain (dev/staging convenience)
  if (origin.endsWith(".vercel.app")) return true;

  return false;
}

/**
 * Build CORS headers for a given request.
 * Returns the matched origin (not "*") or omits Access-Control-Allow-Origin if disallowed.
 */
export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };

  if (isOriginAllowed(origin)) {
    headers["Access-Control-Allow-Origin"] = origin!;
    headers["Vary"] = "Origin";
  }

  return headers;
}

/**
 * Legacy CORS headers for functions that haven't migrated yet.
 * Identical to the old wildcard behavior — use getCorsHeaders(req) instead.
 */
export const legacyCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
