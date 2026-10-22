"use client";

import { useSyncExternalStore } from "react";
import { THEMES, THEME_LABEL, THEME_STORAGE_KEY, resolveTheme, type Theme } from "@/lib/ui/theme";
import { setPageTheme } from "@/lib/ui/theme-dom";
import styles from "./theme-picker.module.css";

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

const currentTheme = (): Theme => resolveTheme(document.documentElement.dataset.theme);

/** Applies a theme to the page, remembers it on this device, and notifies pickers. */
function applyTheme(t: Theme) {
  setPageTheme(t);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, t);
  } catch {
    // Storage blocked (private mode): the theme still applies for this visit.
  }
  listeners.forEach((l) => l());
}

/** Dark / Espresso switch. The choice is per device (localStorage) and applies instantly. */
export function ThemePicker() {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "dark" as Theme);

  return (
    <div className={styles.group} role="radiogroup" aria-label="Theme">
      {THEMES.map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={theme === t}
          className={theme === t ? styles.on : styles.option}
          onClick={() => applyTheme(t)}
        >
          <span className={styles.swatch} data-theme={t} aria-hidden="true" />
          {THEME_LABEL[t]}
        </button>
      ))}
    </div>
  );
}
