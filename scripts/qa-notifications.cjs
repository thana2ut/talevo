/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const projectRoot = path.resolve(__dirname, "..");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveTalevoAlias(request, parent, isMain, options) {
  const resolvedRequest = request.startsWith("@/") ? path.join(projectRoot, "src", request.slice(2)) : request;
  return originalResolveFilename.call(this, resolvedRequest, parent, isMain, options);
};
require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename });
  module._compile(output.outputText, filename);
};

const { removeAllReadNotifications, removeReadNotification } = require("../src/lib/alerts/notification-deletion.ts");
const { deliverBrowserNotificationTest, deliverNewBrowserNotifications } = require("../src/lib/alerts/notification-delivery.ts");
const notifications = [
  { id: "unread", eventKey: "task-12h:task", createdAt: "2026-08-31T08:00:00.000Z", title: "Unread", message: "Keep", type: "task_deadline", priority: "high" },
  { id: "read-a", eventKey: "task-24h:task", createdAt: "2026-08-31T07:00:00.000Z", readAt: "2026-08-31T07:05:00.000Z", title: "Read A", message: "Delete", type: "task_deadline", priority: "medium" },
  { id: "read-b", eventKey: "weekly-radar:2026-W35", createdAt: "2026-08-30T07:00:00.000Z", readAt: "2026-08-30T07:05:00.000Z", title: "Read B", message: "Delete", type: "weekly_radar", priority: "normal" },
];

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };
const single = removeReadNotification(notifications, "read-a", []);
check(single.removed && single.notifications.length === 2 && single.dismissedEventKeys.includes("task-24h:task"), "individual deletion removes only a read notification and retains its event key");
const unreadAttempt = removeReadNotification(notifications, "unread", []);
check(!unreadAttempt.removed && unreadAttempt.notifications.length === 3, "unread notifications must not be deletable through the read-delete action");
const bulk = removeAllReadNotifications(notifications, ["task-24h:task"]);
check(bulk.removed === 2 && bulk.notifications.length === 1 && bulk.notifications[0].id === "unread", "bulk deletion keeps unread notifications only");
check(bulk.dismissedEventKeys.length === 2 && bulk.dismissedEventKeys.includes("weekly-radar:2026-W35"), "bulk deletion preserves unique tombstones for every removed event");

async function verifyDeviceDelivery() {
  const delivered = [];
  const channel = { isSupported: () => true, deliver: (notification) => { delivered.push(notification); } };
  await deliverNewBrowserNotifications([notifications[0], { ...notifications[0], id: "system", type: "system", eventKey: "system" }], channel);
  check(delivered.length === 1 && delivered[0].id === "unread", "device delivery must include actionable alerts and skip internal system records");

  const tests = [];
  const testChannel = { isSupported: () => true, deliver: (notification) => { tests.push(notification); } };
  check(await deliverBrowserNotificationTest("th", testChannel), "enabling device notifications must send a real test notification");
  check(tests[0]?.href === "/notifications" && tests[0]?.title.includes("TALEVO"), "test notification must open the notification center and use safe copy");

  const worker = fs.readFileSync(path.join(projectRoot, "public/talevo-notification-worker.js"), "utf8");
  check(worker.includes('notificationclick') && worker.includes('candidate.origin === self.location.origin'), "notification worker must handle clicks and reject external destinations");
  const deliverySource = fs.readFileSync(path.join(projectRoot, "src/lib/alerts/notification-delivery.ts"), "utf8");
  check(deliverySource.includes("await navigator.serviceWorker.ready"), "device delivery must wait for an active Service Worker before showing a notification");
  const providerSource = fs.readFileSync(path.join(projectRoot, "src/providers/app-state-provider.tsx"), "utf8");
  check(providerSource.includes('window.addEventListener("focus", syncPermission)') && providerSource.includes('status.addEventListener("change", syncPermission)'), "notification permission state must refresh after browser permission changes");
  check(providerSource.includes("browserNotifications: delivered") && providerSource.includes('setBrowserNotificationTestStatus(delivered ? "sent"'), "device notification toggle must remain enabled only after a successful test delivery");
  check(providerSource.includes("Promise.race<NotificationPermission>") && providerSource.includes("15_000") && providerSource.includes("10_000"), "permission and test delivery must recover instead of leaving the notification toggle stuck forever");
  console.log(`Notification QA passed: ${checks} checks`);
}

verifyDeviceDelivery().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
