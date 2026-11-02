/*
 * ALKEVA service worker — browser notifications ONLY.
 * No offline caching on purpose: a money app must never show stale balances
 * or prices out of a cache.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const focused = windows.find((w) => w.focused && w.visibilityState === "visible");
      if (focused) {
        // The open tab shows its own toast; no system notification on top.
        focused.postMessage({ type: "alkeva:notification", data });
        return;
      }
      await self.registration.showNotification(data.title || "ALKEVA", {
        body: data.body || "",
        icon: "/brand/mark-256.png",
        badge: "/brand/mark-128.png",
        tag: data.id || undefined,
        data: { url: data.url || "/notifications" },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || "/";
  const url = new URL(path, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of windows) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) {
          await w.focus();
          if ("navigate" in w) await w.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
