"use client";

import { useRouter } from "next/navigation";
import { LogOut, TriangleAlert, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { BottomSheet, Card, Field, Input } from "@/components/ui";
import { useAppState } from "@/providers/app-state-provider";
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

  return <BottomSheet open={open} title={step === "warning" ? t("settings.deleteDialogTitle") : t("settings.deleteConfirmTitle")} onClose={close}>
    {step === "warning" ? <div className="delete-account-dialog"><span className="danger-icon"><TriangleAlert /></span><p>{t("settings.deleteWarning")}</p><p>{t("settings.deleteFutureWarning")}</p><p className="prototype-warning">{t("settings.deleteLocalWarning")}</p><div className="dialog-actions"><button className="secondary-button" type="button" onClick={close}>{t("common.cancel")}</button><button className="danger-button" type="button" onClick={() => setStep("confirm")}>{t("settings.continue")}</button></div></div> : <div className="delete-account-dialog"><span className="danger-icon"><TriangleAlert /></span><p>{t("settings.deleteConfirmDescription")}</p><ConfirmationPhraseInput value={phrase} onChange={setPhrase} />{error && <p className="form-error" role="alert">{error}</p>}<button className="danger-button button-block" type="button" disabled={phrase !== requiredPhrase || isSubmitting} onClick={() => void reset()}><Trash2 />{isSubmitting ? "กำลังดำเนินการ..." : t("settings.deletePermanently")}</button><button className="text-button" type="button" disabled={isSubmitting} onClick={() => setStep("warning")}>{t("common.back")}</button></div>}
  </BottomSheet>;
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
  return <BottomSheet open={open} title={t("settings.logoutDialogTitle")} onClose={onClose}><div className="logout-dialog"><span className="logout-dialog-icon"><LogOut /></span><p>{t("settings.logoutDialogDescription")}</p>{error && <p className="form-error" role="alert">{error}</p>}<div className="dialog-actions"><button className="secondary-button" type="button" disabled={isSubmitting} onClick={onClose}>{t("common.cancel")}</button><button className="logout-confirm-button" type="button" disabled={isSubmitting} onClick={() => void logout()}>{isSubmitting ? "กำลังออกจากระบบ..." : t("settings.logOut")}</button></div></div></BottomSheet>;
}

export function AccountManagement() {
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();
  return <section className="account-management"><div className="section-header"><h2>{t("settings.accountManagement")}</h2></div><Card className="account-management-card"><div className="account-action-row"><span className="logout-icon"><LogOut /></span><span><strong>{t("settings.logOut")}</strong><small>{t("settings.logoutDescription")}</small></span><button className="secondary-button compact-button" type="button" onClick={() => setLogoutOpen(true)}>{t("settings.logOut")}</button></div><div className="account-actions-divider" /><div className="account-action-row account-delete-row"><span className="danger-icon"><Trash2 /></span><span><strong>{t("settings.deleteAccount")}</strong><small>{t("settings.deleteAccountDescription")}</small></span><button className="text-danger-button" type="button" onClick={() => setOpen(true)}>{t("settings.deleteAccount")}</button></div></Card><LogoutDialog open={logoutOpen} onClose={() => setLogoutOpen(false)} /><DeleteAccountDialog open={open} onClose={() => setOpen(false)} /></section>;
}
