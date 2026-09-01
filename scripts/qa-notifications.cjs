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
console.log(`Notification deletion QA passed: ${checks} checks`);
