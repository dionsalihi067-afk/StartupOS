/** Header carrying the requested locale-free path, used by server layouts to build `?next=`. */
export const PATH_HEADER = "x-startupos-path";

export const APP_HOME = "/dashboard";

export function isAppPath(path: string): boolean {
  return path === APP_HOME || path.startsWith(`${APP_HOME}/`);
}

/**
 * Resolves `.` / `..` segments. Returns null when the path would escape above `/`
 * or contains empty segments from double slashes after decode.
 */
function resolvePathSegments(pathOnly: string): string | null {
  const parts = pathOnly.split("/");
  if (parts[0] !== "") return null; // must be absolute
  const resolved: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]!;
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (resolved.length === 0) return null;
      resolved.pop();
      continue;
    }
    // Protocol / credential tricks in a path segment (e.g. `https:`, `user@host`).
    if (part.includes(":") || part.includes("@")) return null;
    resolved.push(part);
  }
  return "/" + resolved.join("/");
}

/**
 * Accepts only locale-free in-app paths as a post-login destination, which rules out open redirects.
 * Encoded traversal (`%2e%2e`) and relative segments (`..`) are normalized or rejected.
 */
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string" || value.length > 500) return APP_HOME;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return APP_HOME;

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return APP_HOME;
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.includes("\\")) return APP_HOME;

  const pathOnly = decoded.split(/[?#]/)[0] ?? "";
  const suffix = decoded.slice(pathOnly.length);
  if (suffix.includes("\\") || suffix.includes("//")) return APP_HOME;
  const normalized = resolvePathSegments(pathOnly);
  if (!normalized || !isAppPath(normalized)) return APP_HOME;
  return normalized + suffix;
}
