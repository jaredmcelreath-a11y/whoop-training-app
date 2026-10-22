import { THEME_STORAGE_KEY, resolveTheme, themeColor, type Theme } from "./theme";

/** Puts a theme on the page: the data-theme attribute and the browser bar color. */
export function setPageTheme(t: Theme): void {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor(t));
}

/**
 * Re-applies the stored theme. The inline head script does this before first paint;
 * in development React's Strict Mode remount clears the attribute, so the client
 * applies it again. Blocked storage leaves the page as it is.
 */
export function applyStoredTheme(): void {
  let stored: string | null;
  try {
    stored = localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return;
  }
  if (stored === null) return;
  setPageTheme(resolveTheme(stored));
}
