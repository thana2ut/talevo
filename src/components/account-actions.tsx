"use client";

import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  CloudCheck,
  HardDrive,
  LogOut,
  RotateCcw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useRef, useState } from "react";
import { BottomSheet, Card, Field, Input } from "@/components/ui";
import { createEmptyAccountAppState } from "@/lib/app-state-defaults";
import { hasLegacyLocalData } from "@/lib/persistence/local-account-storage";
import { readAppStateSnapshot } from "@/lib/persistence/app-state-storage";
import { useAppState } from "@/providers/app-state-provider";
import { useAuth } from "@/providers/auth-provider";
import { useLanguage } from "@/providers/language-provider";

function ConfirmationPhraseInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useLanguage();
  return <Field label={t("settings.deletePhrase")}><Input value={value} onChange={(event) => onChange(event.target.value)} autoComplete="off" /></Field>;
}

export function DeleteAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { deleteUserAccount } = useAppState();
  const { t, language } = useLanguage();
  const [step, setStep] = useState<"warning" | "confirm">("warning");
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const operationLockRef = useRef(false);
  const close = () => { setStep("warning"); setPhrase(""); setError(""); onClose(); };
  const reset = async () => {
    if (operationLockRef.current) return;
    operationLockRef.current = true;
    setIsSubmitting(true);
    let nextError: string | null;
    try {
      nextError = await deleteUserAccount();
    } catch {
      nextError = "เชื่อมต่อไม่สำเร็จ ข้อมูลในอุปกรณ์ยังไม่ได้ถูกลบ";
    } finally {
      setIsSubmitting(false);
      operationLockRef.current = false;
    }
    if (nextError) { setError(nextError); return; }
    close();
    router.push("/welcome");
    router.refresh();
  };

  const requiredPhrase = language === "th" ? "ลบบัญชี" : "DELETE";

  return (
    <BottomSheet open={open} title={step === "warning" ? t("settings.deleteDialogTitle") : t("settings.deleteConfirmTitle")} onClose={close}>
      {step === "warning" ? (
        <div className="delete-account-dialog">
          <span className="danger-icon"><TriangleAlert /></span>
          <p>{t("settings.deleteWarning")}</p>
          <p>{t("settings.deleteFutureWarning")}</p>
          <p className="prototype-warning">{t("settings.deleteLocalWarning")}</p>
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={close}>{t("common.cancel")}</button>
            <button className="danger-button" type="button" onClick={() => setStep("confirm")}>{t("settings.continue")}</button>
          </div>
        </div>
      ) : (
        <div className="delete-account-dialog">
          <span className="danger-icon"><TriangleAlert /></span>
          <p>{t("settings.deleteConfirmDescription")}</p>
          <ConfirmationPhraseInput value={phrase} onChange={setPhrase} />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="danger-button button-block" type="button" disabled={phrase !== requiredPhrase || isSubmitting} onClick={() => void reset()}>
            <Trash2 />
            {isSubmitting ? "กำลังดำเนินการ..." : t("settings.deletePermanently")}
          </button>
          <button className="text-button" type="button" disabled={isSubmitting} onClick={() => setStep("warning")}>{t("common.back")}</button>
        </div>
      )}
    </BottomSheet>
  );
}

function LogoutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { endSession } = useAppState();
  const { t } = useLanguage();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const operationLockRef = useRef(false);
  const logout = async () => {
    if (operationLockRef.current) return;
    operationLockRef.current = true;
    setIsSubmitting(true);
    let nextError: string | null;
    try {
      nextError = await endSession();
    } catch {
      nextError = "ออกจากระบบไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่";
    } finally {
      setIsSubmitting(false);
      operationLockRef.current = false;
    }
    if (nextError) { setError(nextError); return; }
    setError("");
    onClose();
    router.push("/welcome");
    router.refresh();
  };
  return (
    <BottomSheet open={open} title={t("settings.logoutDialogTitle")} onClose={onClose}>
      <div className="logout-dialog">
        <span className="logout-dialog-icon"><LogOut /></span>
        <p>{t("settings.logoutDialogDescription")}</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button className="secondary-button" type="button" disabled={isSubmitting} onClick={onClose}>{t("common.cancel")}</button>
          <button className="logout-confirm-button" type="button" disabled={isSubmitting} onClick={() => void logout()}>{isSubmitting ? "กำลังออกจากระบบ..." : t("settings.logOut")}</button>
        </div>
      </div>
    </BottomSheet>
  );
}

export function AccountManagement() {
  const { user } = useAuth();
  const {
    schedules,
    tasks,
    exams,
    financeTransactions,
    adoptExistingLocalData,
  } = useAppState();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();

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
      setLegacySummary({
        schedules: state.schedules?.length ?? 0,
        tasks: state.tasks?.length ?? 0,
        exams: state.exams?.length ?? 0,
        transactions: state.financeTransactions?.length ?? 0,
      });
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
    <section className="account-management" aria-labelledby="account-management-heading">
      <div className="section-header">
        <h2 id="account-management-heading">{t("settings.accountManagement")}</h2>
      </div>
      <Card className="account-management-card">
        {/* Row 1: Cloud Auto-persistence */}
        <div className="account-action-row account-data-row">
          <span className="cloud-icon" aria-hidden="true">
            <CloudCheck />
          </span>
          <span>
            <strong>บันทึกข้อมูลอัตโนมัติ</strong>
            <small>ตารางเรียน งาน การสอบ คะแนน และข้อมูลอื่นจะบันทึกไว้ในบัญชี TALEVO อัตโนมัติ</small>
          </span>
          <span className="account-data-badge">พร้อมใช้งาน</span>
        </div>

        {/* Optional Legacy Data Recovery if legacy local data is detected */}
        {hasLegacyData && !migrated && (
          <>
            <div className="account-actions-divider" />
            <div className="legacy-data-utility-box" style={{ margin: "16px" }}>
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
          </>
        )}

        {migrated && (
          <>
            <div className="account-actions-divider" />
            <div className="legacy-migrated-success" role="status" style={{ margin: "16px" }}>
              <CheckCircle2 aria-hidden="true" />
              <span>ย้ายข้อมูลเข้าสู่บัญชีของคุณเรียบร้อยแล้ว</span>
            </div>
          </>
        )}

        <div className="account-actions-divider" />

        {/* Row 2: Logout */}
        <div className="account-action-row">
          <span className="logout-icon" aria-hidden="true">
            <LogOut />
          </span>
          <span>
            <strong>{t("settings.logOut")}</strong>
            <small>{t("settings.logoutDescription")}</small>
          </span>
          <button
            className="secondary-button compact-button"
            type="button"
            onClick={() => setLogoutOpen(true)}
          >
            {t("settings.logOut")}
          </button>
        </div>

        <div className="account-actions-divider" />

        {/* Row 3: Delete Account */}
        <div className="account-action-row account-delete-row">
          <span className="danger-icon" aria-hidden="true">
            <Trash2 />
          </span>
          <span>
            <strong>{t("settings.deleteAccount")}</strong>
            <small>{t("settings.deleteAccountDescription")}</small>
          </span>
          <button
            className="text-danger-button"
            type="button"
            onClick={() => setOpen(true)}
          >
            {t("settings.deleteAccount")}
          </button>
        </div>
      </Card>

      <LogoutDialog open={logoutOpen} onClose={() => setLogoutOpen(false)} />
      <DeleteAccountDialog open={open} onClose={() => setOpen(false)} />
    </section>
  );
}
