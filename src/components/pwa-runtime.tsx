"use client";

import { useEffect } from "react";

const workerPath = "/talevo-notification-worker.js";

export function PwaRuntime() {
  useEffect(() => {
    const preventLongPressMenu = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('a,button,[role="button"],[role="link"],img,[draggable="true"]')) return;
      event.preventDefault();
    };
    let origin: { x: number; y: number; target: EventTarget | null } | null = null;
    const preventZoom = (event: Event) => {
      if (event.cancelable) event.preventDefault();
    };
    const startTouch = (event: TouchEvent) => {
      if (event.touches.length > 1) { origin = null; preventZoom(event); return; }
      const touch = event.touches[0];
      origin = touch ? { x: touch.clientX, y: touch.clientY, target: event.target } : null;
    };
    const moveTouch = (event: TouchEvent) => {
      if (event.touches.length > 1) { preventZoom(event); return; }
      const touch = event.touches[0];
      if (!origin || !touch) return;
      const dx = touch.clientX - origin.x;
      if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(touch.clientY - origin.y)) return;
      // Keep intentional horizontal scrolling inside tables and timetable panels.
      let element = origin.target instanceof Element ? origin.target : null;
      while (element && element !== document.body && element !== document.documentElement) {
        const style = getComputedStyle(element);
        if (/(auto|scroll)/.test(style.overflowX) && element.scrollWidth > element.clientWidth + 1) {
          const remaining = element.scrollWidth - element.clientWidth - element.scrollLeft;
          if ((dx < 0 && remaining > 1) || (dx > 0 && element.scrollLeft > 1)) return;
        }
        element = element.parentElement;
      }
      preventZoom(event);
    };
    const endTouch = () => { origin = null; };
    const preventTouchpadZoom = (event: WheelEvent) => {
      if (event.ctrlKey && navigator.maxTouchPoints > 0) preventZoom(event);
    };
    const options = { passive: false };
    document.addEventListener("contextmenu", preventLongPressMenu, true);
    document.addEventListener("touchstart", startTouch, options);
    document.addEventListener("touchmove", moveTouch, options);
    document.addEventListener("touchend", endTouch);
    document.addEventListener("touchcancel", endTouch);
    document.addEventListener("gesturestart", preventZoom, options);
    document.addEventListener("gesturechange", preventZoom, options);
    document.addEventListener("wheel", preventTouchpadZoom, options);
    return () => {
      document.removeEventListener("contextmenu", preventLongPressMenu, true);
      document.removeEventListener("touchstart", startTouch);
      document.removeEventListener("touchmove", moveTouch);
      document.removeEventListener("touchend", endTouch);
      document.removeEventListener("touchcancel", endTouch);
      document.removeEventListener("gesturestart", preventZoom);
      document.removeEventListener("gesturechange", preventZoom);
      document.removeEventListener("wheel", preventTouchpadZoom);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
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

    const updateBrowserTheme = () => {
      const isDark = root.dataset.theme === "dark";
      const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      if (themeMeta) themeMeta.content = isDark ? "#11111b" : "#6843ee";
    };
    const syncStoredTheme = (event: StorageEvent) => {
      if (event.key !== "talevo-theme") return;
      root.dataset.theme = event.newValue === "dark" ? "dark" : "light";
    };
    const themeObserver = new MutationObserver(updateBrowserTheme);
    themeObserver.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    window.addEventListener("storage", syncStoredTheme);
    updateBrowserTheme();

    if ("serviceWorker" in navigator && window.isSecureContext) {
      const registerWorker = () => {
        void navigator.serviceWorker.register(workerPath, { scope: "/" }).catch(() => {
          // The app remains usable when a browser or private mode rejects Service Workers.
        });
      };
      if (document.readyState === "complete") registerWorker();
      else window.addEventListener("load", registerWorker, { once: true });
    }

    return () => {
      standaloneQuery.removeEventListener("change", updateDisplayMode);
      themeObserver.disconnect();
      window.removeEventListener("storage", syncStoredTheme);
    };
  }, []);

  return null;
}
