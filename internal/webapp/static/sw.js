const notificationTitles = {
  "agent-responded": "Setta agent responded",
  "approval-requested": "Setta needs approval",
  "run-finished": "Setta run finished",
  test: "Setta push test",
};

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const payload = readPushPayload(event);
  const title = notificationTitles[payload.type] ?? "Setta";
  const url = notificationURL(payload);
  event.waitUntil(
    self.registration.showNotification(title, {
      badge: "/icons/setta-icon.svg",
      data: { url },
      icon: "/icons/setta-icon.svg",
      tag: notificationTag(payload),
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(openOrFocusClient(url));
});

function readPushPayload(event) {
  if (!event.data) {
    return { type: "test" };
  }
  try {
    const payload = event.data.json();
    return typeof payload === "object" && payload !== null ? payload : { type: "test" };
  } catch {
    return { type: "test" };
  }
}

function notificationURL(payload) {
  const url = new URL("/", self.location.origin);
  for (const key of ["workspaceId", "conversationId", "runId", "approvalId"]) {
    if (typeof payload[key] === "string" && payload[key] !== "") {
      url.searchParams.set(key, payload[key]);
    }
  }
  return url.toString();
}

function notificationTag(payload) {
  return [payload.type, payload.runId, payload.approvalId].filter(Boolean).join(":") || "setta";
}

async function openOrFocusClient(url) {
  const allClients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
  for (const client of allClients) {
    if ("focus" in client) {
      await client.focus();
      client.navigate(url);
      return;
    }
  }
  await self.clients.openWindow(url);
}
