/// <reference types="vite/client" />

/**
 * Prefix public files with Vite's relative base.
 * The polah proxy rewrites a root-absolute `/assets/` string inside JavaScript
 * to `/balls/assets/` before the browser runs it. Strip that injected prefix
 * so the runtime URL stays `./assets/…` on both hosts.
 */
export function asset(path: string): string {
  const normalized = path.replace(/^\/+/, "").replace(/^balls\//, "");
  return `${import.meta.env.BASE_URL}${normalized}`;
}
