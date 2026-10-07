"use client";

import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  CloudCheck,
  HardDrive,
  RotateCcw,
} from "lucide-react";
import { useState } from "react";
import { Card } from "@/components/ui";
import { hasLegacyLocalData } from "@/lib/persistence/local-account-storage";
import { readAppStateSnapshot } from "@/lib/persistence/app-state-storage";
import { createEmptyAccountAppState } from "@/lib/app-state-defaults";
import { useAuth } from "@/providers/auth-provider";
import { useAppState } from "@/providers/app-state-provider";

export function AccountDataSettingsPanel() {
  const { user } = useAuth();
  const {
    schedules,
    tasks,
    exams,
    financeTransactions,
    adoptExistingLocalData,
  } = useAppState();

  const [hasLegacyData, setHasLegacyData] = useState(() => {
    if (typeof window === "undefined") return false;
    return hasLegacyLocalData(window.localStorage, user?.id);
  });
  const [inspecting, setInspecting] = useState(false);
  const [legacySummary, setLegacySummary] = useState<{
    schedules: number;
    tasks: number;
    exams: number;
    transactions: number;
  } | null>(null);
  const [hasConflict, setHasConflict] = useState(false);
  const [migrated, setMigrated] = useState(false);
  const [actionError, setActionError] = useState("");

  const handleInspect = () => {
    try {
      setActionError("");
      const result = readAppStateSnapshot(window.localStorage, createEmptyAccountAppState());
      const state = result.state;
      const count = {
        schedules: state.schedules?.length ?? 0,
        tasks: state.tasks?.length ?? 0,
        exams: state.exams?.length ?? 0,
        transactions: state.financeTransactions?.length ?? 0,
      };
      setLegacySummary(count);

      const currentHasData =
        schedules.length > 0 ||
        tasks.length > 0 ||
        exams.length > 0 ||
        financeTransactions.length > 0;
      setHasConflict(currentHasData);
      setInspecting(true);
    } catch {
      setActionError("ตรวจสอบข้อมูลในอุปกรณ์ไม่สำเร็จ ข้อมูลเดิมยังไม่ถูกเปลี่ยนแปลง");
    }
  };

  const handleMigrate = () => {
    if (hasConflict) {
      setActionError("บัญชีนี้มีข้อมูลอยู่แล้ว เพื่อความปลอดภัยข้อมูลเดิมจะไม่ถูกเขียนทับ");
      return;
    }
    try {
      adoptExistingLocalData();
      setMigrated(true);
      setHasLegacyData(false);
      setInspecting(false);
    } catch {
      setActionError("ย้ายข้อมูลเข้าบัญชีไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    }
  };

  return (
    <section className="account-data-settings-section" aria-labelledby="account-data-title">
      <div className="section-header">
        <h2 id="account-data-title">ข้อมูลของบัญชี</h2>
      </div>

      <Card className="settings-card account-data-card">
        <div className="account-data-status-row">
          <span className="account-data-status-icon" aria-hidden="true">
            <CloudCheck />
          </span>
          <div className="account-data-status-copy">
            <div className="account-data-headline">
              <strong>บันทึกข้อมูลอัตโนมัติ</strong>
              <span className="account-data-badge">พร้อมใช้งาน</span>
            </div>
            <p>ตารางเรียน งาน และข้อมูลอื่นของคุณจะบันทึกไว้ในบัญชี TALEVO อัตโนมัติ</p>
          </div>
        </div>

        {hasLegacyData && !migrated && (
          <div className="legacy-data-utility-box">
            <div className="legacy-data-utility-header">
              <span className="legacy-data-icon" aria-hidden="true">
                <HardDrive />
              </span>
              <div>
                <strong>ข้อมูลเก่าในอุปกรณ์</strong>
                <p>พบข้อมูลจากการใช้งาน TALEVO ก่อนหน้านี้ คุณสามารถตรวจสอบและย้ายข้อมูลเข้าสู่บัญชีของคุณได้</p>
              </div>
            </div>

            {!inspecting ? (
              <button
                type="button"
                className="secondary-button legacy-inspect-button"
                onClick={handleInspect}
              >
                <span>ตรวจสอบข้อมูล</span>
                <ArrowRight aria-hidden="true" />
              </button>
            ) : (
              <div className="legacy-inspection-details">
                {legacySummary && (
                  <div className="legacy-summary-chips">
                    <span>ตารางเรียน {legacySummary.schedules} คาบ</span>
                    <span>งาน {legacySummary.tasks} ชิ้น</span>
                    <span>การสอบ {legacySummary.exams} รายการ</span>
                    <span>การเงิน {legacySummary.transactions} รายการ</span>
                  </div>
                )}

                {hasConflict ? (
                  <div className="legacy-conflict-alert" role="status">
                    <AlertCircle aria-hidden="true" />
                    <div>
                      <strong>บัญชีนี้มีข้อมูลอยู่แล้ว</strong>
                      <p>เพื่อความปลอดภัยของข้อมูล บัญชีปัจจุบันจะไม่ถูกเขียนทับด้วยข้อมูลเก่า</p>
                    </div>
                  </div>
                ) : (
                  <div className="legacy-ready-actions">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={handleMigrate}
                    >
                      <RotateCcw aria-hidden="true" />
                      ย้ายข้อมูลเข้าบัญชี
                    </button>
                  </div>
                )}

                {actionError && (
                  <p className="form-error" role="alert">
                    {actionError}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {migrated && (
          <div className="legacy-migrated-success" role="status">
            <CheckCircle2 aria-hidden="true" />
            <span>ย้ายข้อมูลเข้าสู่บัญชีของคุณเรียบร้อยแล้ว</span>
          </div>
        )}
      </Card>
    </section>
  );
}

// Retain alias for any existing imports
export { AccountDataSettingsPanel as LocalCloudMigrationPanel };
