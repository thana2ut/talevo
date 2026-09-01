"use client";

import { useRouter } from "next/navigation";
import { LogOut, TriangleAlert, Trash2 } from "lucide-react";
import { useState } from "react";
import { BottomSheet, Card, Field, Input } from "@/components/ui";
import { useAppState } from "@/providers/app-state-provider";
import { useLanguage } from "@/providers/language-provider";

function ConfirmationPhraseInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useLanguage();
  return <Field label={t("settings.deletePhrase")}><Input value={value} onChange={(event) => onChange(event.target.value)} autoComplete="off" /></Field>;
}

export function DeleteAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { resetUserData } = useAppState();
  const { t, language } = useLanguage();
  const [step, setStep] = useState<"warning" | "confirm">("warning");
  const [phrase, setPhrase] = useState("");
  const close = () => { setStep("warning"); setPhrase(""); onClose(); };
  const reset = () => { resetUserData(); close(); router.push("/welcome"); };

  const requiredPhrase = language === "th" ? "ลบบัญชี" : "DELETE";

  return <BottomSheet open={open} title={step === "warning" ? t("settings.deleteDialogTitle") : t("settings.deleteConfirmTitle")} onClose={close}>
    {step === "warning" ? <div className="delete-account-dialog"><span className="danger-icon"><TriangleAlert /></span><p>{t("settings.deleteWarning")}</p><p>{t("settings.deleteFutureWarning")}</p><p className="prototype-warning">{t("settings.deleteLocalWarning")}</p><div className="dialog-actions"><button className="secondary-button" type="button" onClick={close}>{t("common.cancel")}</button><button className="danger-button" type="button" onClick={() => setStep("confirm")}>{t("settings.continue")}</button></div></div> : <div className="delete-account-dialog"><span className="danger-icon"><TriangleAlert /></span><p>{t("settings.deleteConfirmDescription")}</p><ConfirmationPhraseInput value={phrase} onChange={setPhrase} /><button className="danger-button button-block" type="button" disabled={phrase !== requiredPhrase} onClick={reset}><Trash2 />{t("settings.deletePermanently")}</button><button className="text-button" type="button" onClick={() => setStep("warning")}>{t("common.back")}</button></div>}
  </BottomSheet>;
}

function LogoutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { endSession } = useAppState();
  const { t } = useLanguage();
  const logout = () => { endSession(); onClose(); router.push("/welcome"); };
  return <BottomSheet open={open} title={t("settings.logoutDialogTitle")} onClose={onClose}><div className="logout-dialog"><span className="logout-dialog-icon"><LogOut /></span><p>{t("settings.logoutDialogDescription")}</p><div className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose}>{t("common.cancel")}</button><button className="logout-confirm-button" type="button" onClick={logout}>{t("settings.logOut")}</button></div></div></BottomSheet>;
}

export function AccountManagement() {
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();
  return <section className="account-management"><div className="section-header"><h2>{t("settings.accountManagement")}</h2></div><Card className="account-management-card"><div className="account-action-row"><span className="logout-icon"><LogOut /></span><span><strong>{t("settings.logOut")}</strong><small>{t("settings.logoutDescription")}</small></span><button className="secondary-button compact-button" type="button" onClick={() => setLogoutOpen(true)}>{t("settings.logOut")}</button></div><div className="account-actions-divider" /><div className="account-action-row account-delete-row"><span className="danger-icon"><Trash2 /></span><span><strong>{t("settings.deleteAccount")}</strong><small>{t("settings.deleteAccountDescription")}</small></span><button className="text-danger-button" type="button" onClick={() => setOpen(true)}>{t("settings.deleteAccount")}</button></div></Card><LogoutDialog open={logoutOpen} onClose={() => setLogoutOpen(false)} /><DeleteAccountDialog open={open} onClose={() => setOpen(false)} /></section>;
}
