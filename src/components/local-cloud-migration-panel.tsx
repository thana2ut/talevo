"use client";

import {
  ArrowRight,
  Check,
  CloudUpload,
  Database,
  HardDrive,
  Info,
  LockKeyhole,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { useState } from "react";
import { Card } from "@/components/ui";
import { inspectLocalMigrationOwnership } from "@/lib/persistence/local-account-storage";
import {
  CLOUD_IMPORT_RELEASE_ENABLED,
  createLocalV8MigrationPlan,
  type LocalV8MigrationPlan,
} from "@/lib/supabase/local-v8-migration";
import { useAuth } from "@/providers/auth-provider";
import { useAppState } from "@/providers/app-state-provider";

const countGroups = [
  ["ตารางเรียน", "class_schedules"],
  ["งาน", "tasks"],
  ["งานย่อย", "task_subtasks"],
  ["ไฟล์แนบ (metadata)", "task_attachments"],
  ["การสอบ", "exams"],
  ["หัวข้อสอบ", "exam_topics"],
  ["แผนคะแนน", "grade_plans"],
  ["องค์ประกอบคะแนน", "grade_components"],
  ["หมวดการเงิน", "finance_categories"],
  ["รายการการเงิน", "finance_transactions"],
  ["เป้าหมายออม", "saving_goals"],
  ["การแจ้งเตือน", "notifications"],
] as const;

export function LocalCloudMigrationPanel() {
  const { user } = useAuth();
  const { createMigrationSnapshot } = useAppState();
  const [plan, setPlan] = useState<LocalV8MigrationPlan | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [previewError, setPreviewError] = useState("");

  const preview = () => {
    if (!user) {
      setPreviewError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      return;
    }

    try {
      const ownership = inspectLocalMigrationOwnership(window.localStorage, user.id);
      setPlan(createLocalV8MigrationPlan(createMigrationSnapshot(), user.id, ownership));
      setConfirmed(false);
      setPreviewError("");
    } catch {
      setPreviewError("ตรวจข้อมูลในอุปกรณ์ไม่สำเร็จ ข้อมูลเดิมยังไม่ได้ถูกเปลี่ยนแปลง");
    }
  };

  const errors = plan?.issues.filter((issue) => issue.severity === "error") ?? [];
  const warnings = plan?.issues.filter((issue) => issue.severity === "warning") ?? [];
  const canUpload = Boolean(CLOUD_IMPORT_RELEASE_ENABLED && plan?.readyForUpload && confirmed);
  const totalRecords = plan
    ? countGroups.reduce((total, [, table]) => total + plan.counts[table], 0)
    : 0;

  return (
    <section className="local-cloud-migration-section" aria-labelledby="local-cloud-migration-title">
      <div className="local-cloud-section-header">
        <div>
          <span className="local-cloud-eyebrow">LOCAL → CLOUD</span>
          <h2>ข้อมูลในอุปกรณ์และ Cloud</h2>
          <p>ตรวจสอบข้อมูลให้พร้อม ก่อนเชื่อมต่อกับบัญชีของคุณอย่างปลอดภัย</p>
        </div>
        <span className="local-cloud-version"><Database aria-hidden="true" /> AppState v8</span>
      </div>

      <Card className="local-cloud-migration-card">
        <div className="local-cloud-migration-heading">
          <span className="local-cloud-device-icon"><HardDrive aria-hidden="true" /></span>
          <div>
            <span className="local-cloud-source-label">ข้อมูลในอุปกรณ์เครื่องนี้</span>
            <h3 id="local-cloud-migration-title">พบข้อมูล TALEVO พร้อมตรวจสอบ</h3>
            <p>ดูรายการทั้งหมดก่อนเชื่อมกับบัญชี Supabase โดย AppState v8 และ IndexedDB จะยังอยู่ในอุปกรณ์นี้</p>
          </div>
          <span className="local-cloud-safe-badge"><ShieldCheck aria-hidden="true" /> ยังไม่มีการอัปโหลด</span>
        </div>

        <button className="migration-preview-button" type="button" onClick={preview}>
          <span className="migration-preview-button-icon"><Database aria-hidden="true" /></span>
          <span>
            <strong>ตรวจและดูตัวอย่างข้อมูล</strong>
            <small>ใช้เวลาเพียงครู่เดียว และจะไม่เปลี่ยนแปลงข้อมูลเดิม</small>
          </span>
          <ArrowRight aria-hidden="true" />
        </button>

        {previewError && <p className="form-error migration-preview-error" role="alert">{previewError}</p>}

        {plan && (
          <div className="migration-preview" aria-live="polite">
            <div className={`migration-preview-status${errors.length === 0 ? " is-ready" : " is-blocked"}`}>
              <span><ShieldCheck aria-hidden="true" /></span>
              <div>
                <small>ผลการตรวจสอบโครงสร้าง</small>
                <strong>{errors.length === 0 ? "ข้อมูล Local พร้อมสำหรับขั้นตอนถัดไป" : `พบ ${errors.length} จุดที่ต้องแก้ก่อนย้าย`}</strong>
                <p>การอัปโหลดจริงยังปิดอยู่จนกว่า SQL และ Live QA จะผ่านครบถ้วน</p>
              </div>
              <span className="migration-status-badge">{errors.length === 0 ? "ผ่านเบื้องต้น" : "ต้องตรวจสอบ"}</span>
            </div>

            <div className="migration-data-heading">
              <div>
                <span>รายละเอียดข้อมูล</span>
                <h4>รายการที่พบในอุปกรณ์</h4>
              </div>
              <strong>{totalRecords.toLocaleString("th-TH")} รายการ</strong>
            </div>

            <dl className="migration-count-grid">
              {countGroups.map(([label, table]) => (
                <div key={table}>
                  <dt>{label}</dt>
                  <dd>{plan.counts[table].toLocaleString("th-TH")}</dd>
                </div>
              ))}
            </dl>

            <div className="migration-finance-section">
              <div className="migration-finance-heading">
                <span><WalletCards aria-hidden="true" /></span>
                <div><small>Finance Pocket</small><strong>สรุปภาพรวมการเงิน</strong></div>
              </div>
              <div className="migration-finance-summary">
                <span><small>รายรับ</small><strong>{plan.financeTotals.income.toLocaleString("th-TH")}</strong></span>
                <span><small>รายจ่าย</small><strong>{plan.financeTotals.expense.toLocaleString("th-TH")}</strong></span>
                <span><small>ออม</small><strong>{plan.financeTotals.saving.toLocaleString("th-TH")}</strong></span>
                <span className="is-balance"><small>คงเหลือ</small><strong>{plan.financeTotals.remaining.toLocaleString("th-TH")}</strong></span>
              </div>
            </div>

            {errors.length > 0 && (
              <ul className="migration-issues">
                {errors.map((issue, index) => <li key={`${issue.code}-${issue.path}-${index}`}><strong>{issue.path}</strong> — {issue.message}</li>)}
              </ul>
            )}
            {warnings.length > 0 && (
              <ul className="migration-warnings">
                {warnings.map((issue, index) => <li key={`${issue.code}-${issue.path}-${index}`}>{issue.message}</li>)}
              </ul>
            )}

            <div className="migration-upload-zone">
              <label className="migration-confirm">
                <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                <span className="migration-confirm-check"><Check aria-hidden="true" /></span>
                <span><strong>ยืนยันความเป็นเจ้าของข้อมูล</strong><small>ข้อมูลตัวอย่างนี้เป็นของบัญชีที่กำลังเข้าสู่ระบบ</small></span>
              </label>

              <button className="primary-button button-block migration-upload-button" type="button" disabled={!canUpload}>
                {canUpload ? <CloudUpload aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}
                {canUpload ? "ย้ายข้อมูลขึ้นบัญชีของฉัน" : "ระบบย้ายขึ้น Cloud ยังไม่เปิดใช้งาน"}
              </button>

              <small className="migration-release-note"><Info aria-hidden="true" /> ปุ่มจะเปิดหลังติดตั้ง Atomic RPC และทดสอบ RLS ด้วยบัญชี QA สองบัญชีแล้วเท่านั้น รุ่นปัจจุบันยังไม่มีการอัปโหลดข้อมูลจากหน้านี้</small>
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}
