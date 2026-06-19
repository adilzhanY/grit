"use client";

import { useEffect } from "react";

/**
 * Registers the offline service worker (see public/sw.js). Renders nothing.
 * Runs only in the browser; failures are swallowed so a SW-less environment
 * (e.g. a non-secure origin) still works, just without offline caching.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
