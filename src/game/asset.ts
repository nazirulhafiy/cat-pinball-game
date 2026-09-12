/// <reference types="vite/client" />

/** Prefix public files so the game can live at `/balls/` as well as `/`. */
export function asset(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
}
