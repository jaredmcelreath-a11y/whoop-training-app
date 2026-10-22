"use client";

import { useLayoutEffect } from "react";
import { applyStoredTheme } from "@/lib/ui/theme-dom";

/** Re-applies the stored theme after React's dev remount resets <html>. No-op in production. */
export function ThemeSync() {
  useLayoutEffect(() => {
    applyStoredTheme();
  }, []);
  return null;
}
