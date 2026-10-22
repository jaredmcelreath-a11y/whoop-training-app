"use client";

import { useEffect } from "react";

/**
 * Lands on `#id` once streamed content has mounted (the browser's own jump runs before it
 * exists). If a filter hid that element, reload without filters so the link still lands.
 */
export function ScrollToHash() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ block: "start" });
      return;
    }
    if (window.location.search) window.location.replace(`${window.location.pathname}#${encodeURIComponent(id)}`);
  }, []);
  return null;
}
