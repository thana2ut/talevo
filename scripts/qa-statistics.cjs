/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
let checks = 0;
const check = (value, message) => {
  assert.ok(value, message);
  checks += 1;
};

// 1. Verify deleted files no longer exist
const deletedFiles = [
  "src/features/statistics-page.tsx",
  "src/lib/statistics-utils.ts",
  "src/styles/statistics.css",
];
for (const relPath of deletedFiles) {
  const fullPath = path.join(projectRoot, relPath);
  check(!fs.existsSync(fullPath), `Deleted file must not exist: ${relPath}`);
}

// 2. Verify route /statistics redirects to /today
const statisticsPageRoute = fs.readFileSync(path.join(projectRoot, "src/app/statistics/page.tsx"), "utf8");
check(statisticsPageRoute.includes('redirect("/today")'), "Route /statistics must redirect to /today");
check(!statisticsPageRoute.includes("StatisticsPage"), "Route /statistics must not reference StatisticsPage");

// 3. Verify globals.css does not import statistics.css or contain dead statistics styles
const globalsCss = fs.readFileSync(path.join(projectRoot, "src/app/globals.css"), "utf8");
check(!globalsCss.includes("statistics.css"), "globals.css must not import statistics.css");
check(!globalsCss.includes(".statistics-periods"), "globals.css must not contain .statistics-periods");
check(!globalsCss.includes(".learning-period-select"), "globals.css must not contain .learning-period-select");

// 4. Verify navigation in app-shell.tsx has no statistics items
const appShell = fs.readFileSync(path.join(projectRoot, "src/components/app-shell.tsx"), "utf8");
check(!appShell.includes('"/statistics"'), "app-shell.tsx must not contain /statistics route");
check(!appShell.includes('"nav.statistics"'), "app-shell.tsx must not reference nav.statistics");
check(!appShell.includes("สรุปการเรียน"), "app-shell.tsx must not reference 'สรุปการเรียน'");
check(!appShell.includes("ChartNoAxesColumnIncreasing"), "app-shell.tsx must not import ChartNoAxesColumnIncreasing");

// 5. Verify i18n has no statistics navigation keys or translations
const i18n = fs.readFileSync(path.join(projectRoot, "src/lib/i18n.ts"), "utf8");
check(!i18n.includes('statistics: "สรุปการเรียน"'), "i18n must not contain Thai statistics nav key");
check(!i18n.includes('statistics: "Learning Summary"'), "i18n must not contain English statistics nav key");
check(!i18n.includes('"statistics.'), "i18n must not contain statistics translation entries");

// 6. Verify public pages (welcome page) has no statistics cards
const publicPages = fs.readFileSync(path.join(projectRoot, "src/features/public/public-pages.tsx"), "utf8");
check(!publicPages.includes("สรุปการเรียน"), "Welcome page must not reference 'สรุปการเรียน'");
check(!publicPages.includes("ChartNoAxesColumnIncreasing"), "Welcome page must not use ChartNoAxesColumnIncreasing");

// 7. Verify core academic features are unharmed
check(fs.existsSync(path.join(projectRoot, "src/features/academic/academic-pages.tsx")), "academic-pages.tsx must exist");
check(fs.existsSync(path.join(projectRoot, "src/features/schedule/schedule-pages.tsx")), "schedule-pages.tsx must exist");
check(fs.existsSync(path.join(projectRoot, "src/features/today/today-page.tsx")), "today-page.tsx must exist");
check(fs.existsSync(path.join(projectRoot, "src/features/tasks/task-pages.tsx")), "task-pages.tsx must exist");
check(fs.existsSync(path.join(projectRoot, "src/features/ai/ai-page.tsx")), "ai-page.tsx must exist");

console.log(`Statistics Removal QA passed: ${checks} checks`);
