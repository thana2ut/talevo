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
const { hydrateCloudAccountToAppState } = require("../src/lib/supabase/cloud-hydration.ts");
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
  check(providerSource.includes("writeDeviceNotificationPreference(true)") && providerSource.includes("readDeviceNotificationPreference()"), "enabling device notifications must be written to the device and read back on launch");
  check(!providerSource.includes("browserNotifications: false"), "the permission sync must not erase a stored device notification request");
  check(providerSource.includes("pushRegistrationRef.current === userId"), "an enabled device must re-subscribe to push on launch, not only when the switch is flipped");
  const hydrationSource = fs.readFileSync(path.join(projectRoot, "src/lib/supabase/cloud-hydration.ts"), "utf8");
  check(!hydrationSource.includes("browserNotifications"), "cloud hydration must not overwrite the device notification switch");
  check(hydrationSource.includes('booleanValue(appSettingsRow, "daily_0700"'), "cloud hydration must read the daily brief from its real column");
  const pushClientSource = fs.readFileSync(path.join(projectRoot, "src/lib/push/client.ts"), "utf8");
  check(pushClientSource.includes("matchesVapidKey") && pushClientSource.includes("getSubscription()"), "re-registering a device must reuse its push subscription instead of minting a new endpoint each launch");
  check(!pushClientSource.includes("ignoreDuplicates: true"), "a queued reminder must pick up edits to the class or task it belongs to");
  const mutationSource = fs.readFileSync(path.join(projectRoot, "src/lib/supabase/cloud-mutations.ts"), "utf8");
  check(mutationSource.includes("persistAppSettings") && mutationSource.includes('from("app_settings")'), "notification preferences must be written back to Supabase");
  check(providerSource.includes("persistAppSettings(client, uid, updated)"), "changing a notification preference must persist it to the account");
  check(providerSource.includes("Promise.race<NotificationPermission>") && providerSource.includes("15_000") && providerSource.includes("10_000"), "permission and test delivery must recover instead of leaving the notification toggle stuck forever");
  verifyEnableOnceSurvivesRestart();
  verifyPreferencesSurviveCloudHydration();
  console.log(`Notification QA passed: ${checks} checks`);
}

/* The reported bug: turn device notifications on, close the installed app,
   open it again, and the switch is back off. It has to survive a reload with
   nothing but what the device itself kept. */
function verifyEnableOnceSurvivesRestart() {
  const store = new Map();
  global.window = {
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
  };
  try {
    const { readDeviceNotificationPreference, writeDeviceNotificationPreference } = require("../src/lib/push/device-preference.ts");
    check(readDeviceNotificationPreference() === false, "a device that was never asked starts with notifications off");
    writeDeviceNotificationPreference(true);
    check(readDeviceNotificationPreference() === true, "turning device notifications on must survive a relaunch of the app");
    writeDeviceNotificationPreference(false);
    check(readDeviceNotificationPreference() === false, "turning device notifications off must survive a relaunch of the app");
  } finally {
    delete global.window;
  }
}

/* The other half of the same bug: every launch rehydrates from Supabase, so a
   preference the cloud does not carry is silently reset to its default. */
function verifyPreferencesSurviveCloudHydration() {
  const hydrated = hydrateCloudAccountToAppState({
    app_settings: [{
      timezone: "Asia/Bangkok",
      date_format: "เดือน/วัน/ปี",
      year_system: "ค.ศ.",
      alerts_enabled: true,
      task_24h: false,
      task_12h: false,
      deadline_risk: false,
      morning_0600: true,
      daily_0700: false,
      class_30m: true,
      class_end_10m: true,
      exam_7d: true,
      exam_3d: true,
      exam_1d: true,
      exam_morning: true,
      weekly_radar: false,
    }],
  }, { email: "student@example.com" });

  const preferences = hydrated.settings.notificationPreferences;
  check(preferences.task24h === false && preferences.task12h === false && preferences.deadlineRisk === false, "alerts switched off in the account must stay off after a cloud hydration");
  check(preferences.daily0700 === false, "the daily brief must hydrate from its own column instead of falling back to the default");
  check(preferences.weeklyRadar === false, "the weekly radar switch must survive a cloud hydration");
  check(!("browserNotifications" in preferences), "the device switch must not travel through the account state");
  check(hydrated.settings.dateFormat === "เดือน/วัน/ปี" && hydrated.settings.yearSystem === "ค.ศ.", "date format and year system must hydrate from the account");
}

verifyDeviceDelivery().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
