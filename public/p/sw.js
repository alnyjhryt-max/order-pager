// One registration per order, scoped to its page (/p/o/<token>): a push
// carries no data, so the worker asks the app for that order and shows it.
self.addEventListener("push", (event) => {
  const scope = new URL(self.registration.scope);
  const token = scope.pathname.split("/").filter(Boolean).pop();
  event.waitUntil(
    (async () => {
      let title = "Your order is ready";
      let body = "";
      try {
        await fetch(`/p/api/o/${token}/delivered`, { method: "POST" });
        const order = await (await fetch(`/p/api/o/${token}`)).json();
        title = `Order ${order.number} is ready`;
        body = order.venueName || "";
      } catch {}
      await self.registration.showNotification(title, {
        body,
        tag: token,
        renotify: true,
        requireInteraction: true,
        vibrate: [300, 150, 300, 150, 300],
        data: { url: scope.href },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window" });
      const open = windows.find((w) => w.url.startsWith(url));
      if (open) return open.focus();
      return self.clients.openWindow(url);
    })(),
  );
});
