"use client";

import { useEffect } from "react";

const workerPath = "/talevo-notification-worker.js";

export function PwaRuntime() {
  useEffect(() => {
    const standaloneQuery = window.matchMedia("(display-mode: standalone)");
    const updateDisplayMode = () => {
      const isIosStandalone = "standalone" in window.navigator
        && (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
      document.documentElement.dataset.displayMode = standaloneQuery.matches || isIosStandalone
        ? "standalone"
        : "browser";
    };

    updateDisplayMode();
    standaloneQuery.addEventListener("change", updateDisplayMode);

    if ("serviceWorker" in navigator && window.isSecureContext) {
      const registerWorker = () => {
        void navigator.serviceWorker.register(workerPath, { scope: "/" }).catch(() => {
          // The app remains usable when a browser or private mode rejects Service Workers.
        });
      };
      if (document.readyState === "complete") registerWorker();
      else window.addEventListener("load", registerWorker, { once: true });
    }

    return () => standaloneQuery.removeEventListener("change", updateDisplayMode);
  }, []);

  return null;
}
