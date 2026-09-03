"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  completeLocalV8VerificationForQa, getQaMigrationAccess, importLocalV8ForQa,
  loadCloudAccountV8, loadOwnMigrationMarker, verifyCloudReadBack,
  type CloudLoadResult, type CloudMigrationMarker, type ImportRpcResult, type QaMigrationAccess,
} from "@/lib/supabase/cloud-v8-repository";
import { CLOUD_IMPORT_RELEASE_ENABLED, createLocalV8MigrationPlan, LOCAL_V8_TABLE_ORDER, type LocalV8MigrationPlan } from "@/lib/supabase/local-v8-migration";
import { inspectLocalMigrationOwnership } from "@/lib/persistence/local-account-storage";
import { type PersistedAppState } from "@/lib/persistence/app-state-storage";
import {
  getQaFixtureContractChecks, isExactQaFixturePlan, isQaDomainEmpty, QA_EXPECTED_FINANCE_TOTALS,
  QA_MIGRATION_CONFIRMATION, seedQaLocalV8Fixture,
} from "@/lib/supabase/qa-local-v8-fixture";
import { hydrateCloudTablesToAppState, persistQaHydratedState, QA_HYDRATION_CONFIRMATION } from "@/lib/supabase/qa-cloud-hydration";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/providers/auth-provider";
import { useAppState } from "@/providers/app-state-provider";
import styles from "./qa-local-cloud-migration-panel.module.css";

type Operation = {
  kind: "idle" | "working" | "success" | "error";
  phase: "Idle" | "Preparing" | "Importing" | "Reading back" | "Verifying" | "Success" | "Stopped";
  message: string;
};

const idleOperation: Operation = { kind: "idle", phase: "Idle", message: "ยังไม่มีการเขียนข้อมูล" };

function friendlyError(error: unknown) {
  const code = error instanceof Error ? error.message : "unknown";
  const messages: Record<string, string> = {
    qa_account_not_allowlisted: "บัญชีนี้ยังไม่ได้อยู่ใน QA allowlist จึงไม่สามารถเขียนข้อมูลทดสอบได้",
    qa_access_check_failed: "ตรวจสิทธิ์ QA ไม่สำเร็จ กรุณาตรวจว่า deploy migration แล้ว",
    qa_atomic_import_failed: "Import ไม่สำเร็จ ข้อมูลในอุปกรณ์ยังอยู่ครบและไม่มีการล้างข้อมูล",
    qa_migration_plan_not_eligible: "ข้อมูลในอุปกรณ์ยังไม่ผ่าน Preflight หรือยืนยันเจ้าของข้อมูลไม่ได้",
    qa_fixture_requires_empty_local_domain: "บัญชีนี้มีข้อมูลอยู่แล้ว จึงไม่สามารถสร้าง QA fixture ทับได้",
    qa_fixture_confirmation_required: `กรุณาพิมพ์ ${QA_MIGRATION_CONFIRMATION} ให้ตรงทุกตัวอักษร`,
    qa_hydration_requires_empty_local_domain: "อุปกรณ์นี้มีข้อมูลของบัญชีอยู่แล้ว จึงไม่เขียนข้อมูล Cloud ทับ",
    qa_hydration_confirmation_required: "กรุณาพิมพ์ข้อความยืนยัน Hydration ให้ตรงทุกตัวอักษร",
    qa_cloud_finance_relation_invalid: "ความสัมพันธ์ข้อมูล Finance บน Cloud ไม่ถูกต้อง จึงหยุด Hydration",
    qa_cloud_is_empty: "ยังไม่มีข้อมูล QA บน Cloud สำหรับ Hydration",
    qa_cloud_read_failed: "อ่านข้อมูล Cloud ไม่สำเร็จ โดยข้อมูลในอุปกรณ์ยังอยู่ครบ",
    qa_marker_read_failed: "อ่านสถานะ Import ไม่สำเร็จ กรุณาลองสร้าง Preview ใหม่",
    qa_fixture_not_exact: "ข้อมูลในอุปกรณ์ไม่ตรงกับ deterministic QA fixture จึงไม่อนุญาตให้ Import",
    qa_cloud_account_not_empty: "บัญชี Cloud มี domain data อยู่แล้ว จึงไม่ Import ทับ",
    qa_read_back_not_verified: "ตรวจข้อมูลที่อ่านกลับไม่ผ่าน จึงไม่บันทึกสถานะ Verified",
  };
  return messages[code] ?? "ระบบหยุดการทำงานอย่างปลอดภัย กรุณาลองใหม่ โดยข้อมูลเดิมยังอยู่ครบ";
}

export function QaLocalCloudMigrationPanel() {
  const { user } = useAuth();
  const { createMigrationSnapshot, isHydrated, refreshCurrentAccountFromStorage } = useAppState();
  const [client] = useState(createClient);
  const [access, setAccess] = useState<QaMigrationAccess>({ status: "error", message: "กำลังตรวจสิทธิ์" });
  const [plan, setPlan] = useState<LocalV8MigrationPlan | null>(null);
  const [cloudStatus, setCloudStatus] = useState<CloudLoadResult["status"]>("error");
  const [marker, setMarker] = useState<CloudMigrationMarker | null>(null);
  const [fixtureConfirmation, setFixtureConfirmation] = useState("");
  const [hydrationConfirmation, setHydrationConfirmation] = useState("");
  const [operation, setOperation] = useState<Operation>(idleOperation);
  const [importResult, setImportResult] = useState<ImportRpcResult | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const importInFlight = useRef(false);
  const busy = operation.kind === "working";

  const refreshAccess = useCallback(async () => setAccess(await getQaMigrationAccess(client)), [client]);
  useEffect(() => {
    const timer = window.setTimeout(() => void refreshAccess(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshAccess]);

  const refreshPreview = useCallback(async (snapshotOverride?: PersistedAppState) => {
    if (!user || !isHydrated) return;
    setPreviewBusy(true);
    try {
      const snapshot = snapshotOverride ?? createMigrationSnapshot();
      const ownership = inspectLocalMigrationOwnership(window.localStorage, user.id);
      setPlan(createLocalV8MigrationPlan(snapshot, user.id, ownership));
      const [cloud, ownMarker] = await Promise.all([loadCloudAccountV8(client), loadOwnMigrationMarker(client)]);
      setCloudStatus(cloud.status);
      setMarker(ownMarker);
    } finally {
      setPreviewBusy(false);
    }
  }, [client, createMigrationSnapshot, isHydrated, user]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshPreview().catch((error) => setOperation({ kind: "error", phase: "Stopped", message: friendlyError(error) }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshPreview]);

  const currentIsEmpty = useMemo(() => isHydrated && isQaDomainEmpty(createMigrationSnapshot()), [createMigrationSnapshot, isHydrated]);
  const fixtureContractChecks = useMemo(() => plan ? getQaFixtureContractChecks(plan) : [], [plan]);
  const exactFixture = Boolean(plan && isExactQaFixturePlan(plan));
  const markerMatchesPlan = Boolean(plan && marker
    && marker.local_schema_version === 8
    && marker.import_id === plan.payload.import_id
    && marker.expected_counts
    && LOCAL_V8_TABLE_ORDER.every((table) => Number(marker.expected_counts?.[table]) === plan.counts[table])
    && marker.expected_finance_totals
    && Object.entries(plan.financeTotals).every(([key, amount]) => Number(marker.expected_finance_totals?.[key]) === amount));
  const firstImportReady = access.status === "allowed"
    && exactFixture
    && Boolean(plan?.eligibleForUploadAfterDeployment)
    && cloudStatus === "empty"
    && marker === null;
  const idempotentRetryReady = access.status === "allowed"
    && exactFixture
    && Boolean(plan?.eligibleForUploadAfterDeployment)
    && cloudStatus === "loaded"
    && markerMatchesPlan;
  const importReady = firstImportReady || idempotentRetryReady;

  const requestPreviewRefresh = async () => {
    if (previewBusy || busy) return;
    setOperation({ kind: "working", phase: "Preparing", message: "กำลังอ่าน AppState ปัจจุบันและตรวจ Cloud…" });
    try {
      await refreshPreview();
      setOperation({ kind: "success", phase: "Success", message: "สร้าง Preview ใหม่จาก AppState ปัจจุบันแล้ว" });
    } catch (error) {
      setOperation({ kind: "error", phase: "Stopped", message: friendlyError(error) });
    }
  };

  const seedFixture = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user?.id || !user.email || busy) return;
    setOperation({ kind: "working", phase: "Preparing", message: "กำลังตรวจสิทธิ์และพื้นที่ข้อมูลของบัญชีนี้…" });
    try {
      const fixture = await seedQaLocalV8Fixture(
        window.localStorage, user.id, user.email, createMigrationSnapshot(), fixtureConfirmation,
        { qaAccessAllowed: access.status === "allowed" },
      );
      refreshCurrentAccountFromStorage();
      setFixtureConfirmation("");
      await refreshPreview(fixture);
      setOperation({ kind: "success", phase: "Success", message: "สร้าง QA TEST DATA และอัปเดต AppState v8 กับ Preview แล้ว" });
    } catch (error) {
      setOperation({ kind: "error", phase: "Stopped", message: friendlyError(error) });
    }
  };

  const runImport = async () => {
    if (!user || !plan || importInFlight.current || !importReady) return;
    importInFlight.current = true;
    setOperation({ kind: "working", phase: "Preparing", message: "กำลังตรวจ deterministic fixture, Preflight และ Cloud ว่าง…" });
    try {
      if (!isExactQaFixturePlan(plan)) throw new Error("qa_fixture_not_exact");
      if (!firstImportReady && !idempotentRetryReady) throw new Error("qa_cloud_account_not_empty");
      setOperation({ kind: "working", phase: "Importing", message: "กำลัง Import ผ่าน Atomic RPC ที่บังคับสิทธิ์ด้วย RLS…" });
      const result = await importLocalV8ForQa(client, plan);
      setOperation({ kind: "working", phase: "Reading back", message: "กำลังอ่านข้อมูลกลับผ่าน session ของผู้ใช้ปัจจุบัน…" });
      const verification = await verifyCloudReadBack(client, plan);
      setOperation({ kind: "working", phase: "Verifying", message: "กำลังตรวจจำนวนแถว ความสัมพันธ์ ID และยอด Finance…" });
      if (!verification.verified) throw new Error("qa_read_back_not_verified");
      await completeLocalV8VerificationForQa(client, result, verification);
      setImportResult(result);
      setMarker(await loadOwnMigrationMarker(client));
      setCloudStatus("loaded");
      setOperation({
        kind: "success", phase: "Success",
        message: result.status === "already_imported"
          ? "ข้อมูลชุดนี้ถูก Import แล้ว ระบบยืนยันผลเดิมโดยไม่สร้างข้อมูลซ้ำ"
          : "Import, Read-back และ Verification ผ่านครบทุกตาราง",
      });
    } catch (error) {
      setOperation({ kind: "error", phase: "Stopped", message: friendlyError(error) });
    } finally {
      importInFlight.current = false;
    }
  };

  const hydrateFromCloud = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user?.id || !user.email || busy) return;
    setOperation({ kind: "working", phase: "Preparing", message: "กำลังตรวจพื้นที่บัญชีในอุปกรณ์ก่อน Hydration…" });
    try {
      if (access.status !== "allowed") throw new Error("qa_account_not_allowlisted");
      const loaded = await loadCloudAccountV8(client);
      if (loaded.status !== "loaded") throw new Error(loaded.status === "empty" ? "qa_cloud_is_empty" : "qa_cloud_read_failed");
      setOperation({ kind: "working", phase: "Reading back", message: "กำลังอ่าน Cloud ผ่าน RLS และแปลงเป็น AppState v8…" });
      const hydrated = hydrateCloudTablesToAppState(loaded.tables, { email: user.email });
      persistQaHydratedState(window.localStorage, user.id, createMigrationSnapshot(), hydrated, hydrationConfirmation);
      refreshCurrentAccountFromStorage();
      setHydrationConfirmation("");
      await refreshPreview(hydrated);
      setOperation({ kind: "success", phase: "Success", message: "Hydration สำเร็จและอัปเดต AppState v8 แล้ว โดยไม่ล้างข้อมูลอื่นในอุปกรณ์" });
    } catch (error) {
      setOperation({ kind: "error", phase: "Stopped", message: friendlyError(error) });
    }
  };

  if (!user) return <main className={styles.page}><section className={styles.shell}><div className={styles.card}>กรุณาเข้าสู่ระบบด้วย QA user ก่อนใช้งานหน้านี้</div></section></main>;

  const accessText = access.status === "allowed" ? "QA account: ALLOWED" : access.status === "denied" ? "QA account: DENIED — ยังไม่อยู่ใน allowlist" : access.message;
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <span className={styles.badge}>DEVELOPMENT · QA TEST DATA</span>
          <h1>Local v8 → Supabase QA</h1>
          <p>ทดสอบแบบจำกัดบัญชี Global import gate ยังคงปิด และทุกขั้นตอนปฏิเสธการเขียนทับข้อมูลเดิม</p>
        </header>

        <section className={styles.card} aria-labelledby="qa-access-title">
          <h2 id="qa-access-title">1. Security gate</h2>
          <div className={`${styles.status} ${access.status === "allowed" ? styles.success : styles.warning}`}>{accessText}</div>
          <div className={`${styles.status} ${CLOUD_IMPORT_RELEASE_ENABLED ? styles.danger : styles.warning}`}>Global production import: {CLOUD_IMPORT_RELEASE_ENABLED ? "ON" : "OFF"}</div>
          <div className={styles.actions}><button type="button" className={`${styles.button} ${styles.buttonSecondary}`} disabled={busy} onClick={() => void refreshAccess()}>ตรวจ allowlist อีกครั้ง</button></div>
        </section>

        <section className={styles.card} aria-labelledby="qa-fixture-title">
          <h2 id="qa-fixture-title">2. สร้าง deterministic fixture</h2>
          <p>ใช้ได้เฉพาะ Development, บัญชีที่อยู่ใน DB allowlist และ account namespace ที่ยังไม่มี domain data เท่านั้น</p>
          <form className={styles.form} onSubmit={seedFixture}>
            <label htmlFor="qa-fixture-confirmation">พิมพ์ <strong>{QA_MIGRATION_CONFIRMATION}</strong> เพื่อยืนยัน</label>
            <input id="qa-fixture-confirmation" className={styles.input} value={fixtureConfirmation} onChange={(event) => setFixtureConfirmation(event.target.value)} autoComplete="off" spellCheck={false} />
            <button type="submit" className={styles.button} disabled={busy || access.status !== "allowed" || !currentIsEmpty || fixtureConfirmation !== QA_MIGRATION_CONFIRMATION}>สร้าง QA fixture</button>
          </form>
          {!currentIsEmpty ? <div className={`${styles.status} ${styles.warning}`}>บัญชีนี้มีข้อมูลอยู่แล้ว จึงไม่สามารถสร้าง QA fixture ทับได้</div> : null}
        </section>

        <section className={styles.card} aria-labelledby="qa-preview-title">
          <div className={styles.sectionHeading}><div><h2 id="qa-preview-title">3. Migration Preview</h2><p>Preview จะตรวจ AppState ปัจจุบันทุกครั้งก่อนเปิด Import</p></div><button type="button" className={`${styles.button} ${styles.buttonSecondary}`} disabled={busy || previewBusy} onClick={() => void requestPreviewRefresh()}>{previewBusy ? "กำลังตรวจ…" : "สร้าง Preview ใหม่"}</button></div>
          {plan ? <>
            <div className={styles.grid}>
              <div className={styles.metric}>Schema<strong>v{plan.sourceVersion}</strong></div>
              <div className={styles.metric}>Validation errors<strong>{plan.issues.filter((issue) => issue.severity === "error").length}</strong></div>
              <div className={styles.metric}>Tasks<strong>{plan.counts.tasks}</strong></div>
              <div className={styles.metric}>Finance remaining<strong>{plan.financeTotals.remaining.toLocaleString("th-TH")}</strong></div>
              <div className={styles.metric}>Fixture ตรงสัญญา<strong>{exactFixture ? "YES" : "NO"}</strong></div>
              <div className={styles.metric}>Cloud domain<strong>{cloudStatus}</strong></div>
              <div className={styles.metric}>Local domain<strong>{currentIsEmpty ? "empty" : "populated"}</strong></div>
              <div className={styles.metric}>QA ready<strong>{importReady ? "YES" : "NO"}</strong></div>
            </div>
            <div className={styles.tableWrap}><table className={styles.table}><caption>จำนวนแถวที่จะ Import</caption><thead><tr><th scope="col">Table</th><th scope="col">Rows</th></tr></thead><tbody>{LOCAL_V8_TABLE_ORDER.map((table) => <tr key={table}><td>{table}</td><td>{plan.counts[table]}</td></tr>)}</tbody></table></div>
            {process.env.NODE_ENV === "development" ? <div className={styles.tableWrap}><table className={styles.table}><caption>Development fixture contract — Expected → Actual</caption><thead><tr><th scope="col">Condition</th><th scope="col">Expected</th><th scope="col">Actual</th><th scope="col">Result</th></tr></thead><tbody>{fixtureContractChecks.map((check) => <tr key={check.key}><td>{check.label}</td><td>{check.expected}</td><td>{check.actual}</td><td>{check.passed ? "PASS" : "FAIL"}</td></tr>)}</tbody></table></div> : null}
            <div className={styles.financeGrid}>{Object.entries(QA_EXPECTED_FINANCE_TOTALS).map(([key, expected]) => <div className={styles.metric} key={key}>{key}<strong>{plan.financeTotals[key as keyof typeof plan.financeTotals].toLocaleString("th-TH")}</strong><small>คาดหวัง {expected.toLocaleString("th-TH")}</small></div>)}</div>
          </> : <p>กำลังรอ AppState hydration…</p>}
        </section>

        <section className={styles.card} aria-labelledby="qa-import-title">
          <h2 id="qa-import-title">4. Atomic Import</h2>
          <p>เปิดได้เมื่อ fixture ตรงทุกจำนวน, Validation ผ่าน, QA allowlist ผ่าน และ Cloud domain ว่างเท่านั้น</p>
          <div className={styles.actions}><button type="button" className={styles.button} disabled={busy || !importReady} onClick={() => void runImport()}>{idempotentRetryReady ? "ทดสอบ Import ซ้ำ" : "Import + Verify"}</button></div>
          {marker ? <div className={`${styles.status} ${styles.success}`}>พบบันทึก Import เดิมสถานะ {marker.migration_status}{markerMatchesPlan ? " และตรงกับ payload นี้ จึงพร้อมทดสอบ already_imported" : " แต่ไม่ตรงกับ payload ปัจจุบัน จึงปิดการ Import"}</div> : null}
        </section>

        <section className={styles.card} aria-live="polite">
          <h2>5. Read-back Verification</h2>
          <div className={`${styles.status} ${operation.kind === "success" ? styles.success : operation.kind === "error" ? styles.danger : ""}`}><strong>{operation.phase}</strong><span>{operation.message}</span></div>
          {importResult ? <><div className={styles.passGrid}><div>Import<strong>PASS · {importResult.status}</strong></div><div>Read-back<strong>PASS</strong></div><div>Verification<strong>PASS</strong></div></div><ul className={styles.list}><li>Import ID: <span className={styles.code}>{importResult.import_id}</span></li><li>ตารางที่ตอบกลับ: {Object.keys(importResult.counts).length}</li><li>Finance: Income 10,000 · Expense 1,250 · Saving 2,000 · Remaining 6,750</li></ul></> : null}
        </section>

        <section className={styles.card} aria-labelledby="qa-hydrate-title">
          <h2 id="qa-hydrate-title">6. Cloud Hydration</h2>
          <p>อ่านข้อมูลของผู้ใช้ปัจจุบันผ่าน RLS และเขียนเฉพาะ account namespace ที่ว่าง ไม่ใช้ Admin client</p>
          <form className={styles.form} onSubmit={hydrateFromCloud}>
            <label htmlFor="qa-hydration-confirmation">พิมพ์ <strong>{QA_HYDRATION_CONFIRMATION}</strong> เพื่อยืนยัน</label>
            <input id="qa-hydration-confirmation" className={styles.input} value={hydrationConfirmation} onChange={(event) => setHydrationConfirmation(event.target.value)} autoComplete="off" spellCheck={false} />
            <button type="submit" className={styles.button} disabled={busy || access.status !== "allowed" || !currentIsEmpty || hydrationConfirmation !== QA_HYDRATION_CONFIRMATION}>Hydrate จาก Cloud</button>
          </form>
        </section>

        <section className={styles.card} aria-labelledby="qa-safety-title">
          <h2 id="qa-safety-title">7. QA Test Checklist</h2>
          <ul className={styles.list}><li>ไม่ล้าง localStorage หรือ IndexedDB</li><li>ไม่เขียนทับ account namespace หรือ Cloud domain ที่มีข้อมูล</li><li>ไม่ใช้ service role และไม่เปิด Global import gate</li><li>Production route ยังคงตอบ 404</li></ul>
        </section>
      </div>
    </main>
  );
}
