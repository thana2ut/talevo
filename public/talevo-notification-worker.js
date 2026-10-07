self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() ?? "" };
  }

  const title = typeof payload.title === "string" && payload.title.trim()
    ? payload.title.slice(0, 120)
    : "TALEVO";
  const body = typeof payload.body === "string" ? payload.body.slice(0, 300) : "มีรายการที่ควรตรวจสอบ";
  const requestedHref = typeof payload.href === "string" ? payload.href : "/notifications";
  const candidate = new URL(requestedHref, self.location.origin);
  const href = candidate.origin === self.location.origin ? `${candidate.pathname}${candidate.search}${candidate.hash}` : "/notifications";

  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/icon.png",
    badge: "/icon.png",
    tag: typeof payload.tag === "string" ? payload.tag.slice(0, 160) : undefined,
    data: { href },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const requestedHref = event.notification.data?.href;
  let targetUrl = new URL("/notifications", self.location.origin);
  if (typeof requestedHref === "string") {
    const candidate = new URL(requestedHref, self.location.origin);
    if (candidate.origin === self.location.origin) targetUrl = candidate;
  }

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.focus();
      existing.navigate(targetUrl.href);
      return;
    }
    await self.clients.openWindow(targetUrl.href);
  })());
});
