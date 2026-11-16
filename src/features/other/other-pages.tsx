"use client";

import { Moon, Bell, CalendarDays, Check, CheckCircle2, ChevronRight, Clock3, Languages } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { BottomSheet, Card, PageHeader, Select } from "@/components/ui";

import { DeveloperSupport } from "@/components/developer-support";
import { AccountManagement } from "@/components/account-actions";
import { useAppState } from "@/providers/app-state-provider";
import { useLanguage } from "@/providers/language-provider";
import { languageLabels } from "@/lib/i18n";
import type { NotificationPreferences } from "@/types";
import { useUiText } from "@/providers/ui-language";


export { NotificationsPage } from "@/features/notifications/notifications-page";

function SettingRow({ icon, title, description, children }: { icon: ReactNode; title: string; description?: string; children: ReactNode }) {
  const uiText = useUiText();

  return <div className="setting-row"><span className="setting-icon">{icon}</span><div><strong>{uiText(title)}</strong>{description && <small>{uiText(description)}</small>}</div>{children}</div>;
}

function Toggle({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  const uiText = useUiText();

  return <button type="button" role="switch" aria-checked={checked} aria-label={uiText(label)} className={`toggle ${checked ? "on" : ""}`} onClick={() => onChange(!checked)} disabled={disabled}><span /></button>;
}

/* One switch per heading. The per-alert rows underneath said the same thing in
   more words - nobody turns off the 12-hour warning but keeps the 24-hour one -
   so each heading now writes every key it owns. */
const NOTIFICATION_GROUPS = [
  { titleKey: "settings.alertTasks", keys: ["task24h", "task12h", "deadlineRisk"] },
  { titleKey: "settings.alertClasses", keys: ["class30m", "classEnd10m"] },
] as const satisfies ReadonlyArray<{ titleKey: string; keys: ReadonlyArray<keyof NotificationPreferences> }>;

export function SettingsPage() {
  const uiText = useUiText();

  const [darkMode, setDarkMode] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDarkMode(document.documentElement.dataset.theme === "dark"));
    const syncTheme = () => setDarkMode(document.documentElement.dataset.theme === "dark");
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, []);
  const changeDarkMode = (enabled: boolean) => {
    document.documentElement.dataset.theme = enabled ? "dark" : "light";
    setDarkMode(enabled);
    try { localStorage.setItem("talevo-theme", enabled ? "dark" : "light"); } catch { /* Keep the current session theme when storage is unavailable. */ }
  };
  const { settings, updateSettings, updateNotificationPreferences, browserNotificationPermission, browserNotificationTestStatus, deviceNotificationsEnabled, pushRegistration, setBrowserNotificationsEnabled } = useAppState();
  const { language, setLanguage, t } = useLanguage();
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);
  const [testDialogOpen,setTestDialogOpen]=useState(false);

  const languageRowLabel = language === "th" ? `ภาษา ภาษาปัจจุบัน ${languageLabels[language]}` : `Language Current language ${languageLabels[language]}`;
  const preferences = settings.notificationPreferences;
  const disabled = !preferences.enabled;
  const groupIcons = [<CheckCircle2 key="tasks" />, <CalendarDays key="classes" />];
  // On when any alert in the group is on, so a mix inherited from the old
  // per-alert rows reads as on rather than silently off.
  const isGroupOn = (keys: ReadonlyArray<keyof NotificationPreferences>) => keys.some((key) => preferences[key]);
  const setGroup = (keys: ReadonlyArray<keyof NotificationPreferences>, value: boolean) =>
    updateNotificationPreferences(Object.fromEntries(keys.map((key) => [key, value])));
  return <div className="page settings-page"><PageHeader title={t("settings.title")} backHref="/profile" />
    <section><div className="section-header"><h2>{t("settings.general")}</h2></div><Card className="settings-card"><button className="setting-row language-setting-row" type="button" onClick={() => setLanguagePickerOpen(true)} aria-label={languageRowLabel}><span className="setting-icon"><Languages /></span><span className="language-setting-copy"><strong>{t("settings.language")}</strong><small>{t("settings.languageDescription")}</small></span><span className="language-setting-trailing"><strong className="setting-value language-setting-value">{uiText(languageLabels[language])}</strong><ChevronRight className="setting-chevron" aria-hidden="true" /></span></button><SettingRow icon={<Moon />} title={uiText("โหมดมืด")} description={uiText("ปรับสีหน้าจอให้อ่านสบายในที่แสงน้อย")}><Toggle label={uiText("โหมดมืด")} checked={darkMode} onChange={changeDarkMode} /></SettingRow><SettingRow icon={<Clock3 />} title={t("settings.timeZone")}><strong className="setting-value">Asia/Bangkok</strong></SettingRow><SettingRow icon={<CalendarDays />} title={t("settings.dateFormat")}><Select aria-label={t("settings.dateFormat")} value={settings.dateFormat} onChange={(event) => updateSettings({dateFormat:event.target.value as typeof settings.dateFormat})}><option value="วัน/เดือน/ปี">{language === "th" ? uiText("วัน/เดือน/ปี") : "Day / Month / Year"}</option><option value="เดือน/วัน/ปี">{language === "th" ? uiText("เดือน/วัน/ปี") : "Month / Day / Year"}</option></Select></SettingRow><SettingRow icon={<CalendarDays />} title={t("settings.yearDisplay")}><Select aria-label={t("settings.yearDisplay")} value={settings.yearSystem} onChange={(event) => updateSettings({yearSystem:event.target.value as typeof settings.yearSystem})}><option>{uiText("พ.ศ.")}</option><option>{uiText("ค.ศ.")}</option></Select></SettingRow></Card></section>
    <section><div className="section-header"><h2>{t("settings.notifications")}</h2></div><Card className="settings-card notification-settings">
      <SettingRow icon={<Bell />} title={t("settings.smartAlerts")}><Toggle label={t("settings.smartAlerts")} checked={preferences.enabled} onChange={(value) => updateNotificationPreferences({ enabled: value })} /></SettingRow>
      {NOTIFICATION_GROUPS.map((group, index) => <div className={`setting-row notification-preference-row ${disabled ? "is-disabled" : ""}`} key={group.titleKey}><span className="setting-icon">{groupIcons[index]}</span><strong>{t(group.titleKey)}</strong><Toggle label={t(group.titleKey)} checked={isGroupOn(group.keys)} disabled={disabled} onChange={(value) => setGroup(group.keys, value)} /></div>)}
      <SettingRow icon={<Clock3 />} title={uiText("สรุปตามเวลา")} description={uiText("รายวันและรายสัปดาห์")}><Toggle label={uiText("สรุปตามเวลา")} checked={preferences.morning0600||preferences.daily0700||preferences.weeklyRadar} disabled={disabled} onChange={value=>updateNotificationPreferences({morning0600:value,daily0700:false,weeklyRadar:value})}/></SettingRow>
      {(preferences.morning0600||preferences.daily0700||preferences.weeklyRadar)&&<details className="summary-schedule-details"><summary><span>{uiText("ตั้งค่าวันและเวลา")}</span><small>{uiText("ทุกวัน")}{preferences.dailySummaryTime??"06:00"} {uiText("· ทุกวัน")}{[uiText("อาทิตย์"),uiText("จันทร์"),uiText("อังคาร"),uiText("พุธ"),uiText("พฤหัสบดี"),uiText("ศุกร์"),uiText("เสาร์")][preferences.weeklySummaryDay??6]} {preferences.weeklySummaryTime??"06:00"}</small><ChevronRight className="summary-schedule-chevron" aria-hidden="true"/></summary><div className="summary-schedule-fields"><label>{uiText("สรุปรายวัน")}<input className="input" type="time" disabled={disabled} value={preferences.dailySummaryTime??"06:00"} onChange={event=>{if(event.target.value)updateNotificationPreferences({dailySummaryTime:event.target.value,morning0600:true,daily0700:false});}}/></label><label>{uiText("สรุปรายสัปดาห์")}<Select disabled={disabled} value={preferences.weeklySummaryDay??6} onChange={event=>updateNotificationPreferences({weeklySummaryDay:Number(event.target.value)})}>{[uiText("อาทิตย์"),uiText("จันทร์"),uiText("อังคาร"),uiText("พุธ"),uiText("พฤหัสบดี"),uiText("ศุกร์"),uiText("เสาร์")].map((day,index)=><option key={uiText(day)} value={index}>{uiText("ทุกวัน")}{uiText(day)}</option>)}</Select></label><label>{uiText("เวลารายสัปดาห์")}<input className="input" type="time" disabled={disabled} value={preferences.weeklySummaryTime??"06:00"} onChange={event=>{if(event.target.value)updateNotificationPreferences({weeklySummaryTime:event.target.value});}}/></label><small>{uiText("เวลาไทย · Asia/Bangkok")}</small></div></details>}
      <div className="setting-row notification-preference-row device-notification-row"><span className="setting-icon"><Bell /></span><strong>{t("settings.browserNotifications")}</strong><Toggle label={t("settings.browserNotifications")} checked={deviceNotificationsEnabled} disabled={browserNotificationPermission === "unsupported" || browserNotificationTestStatus === "sending"} onChange={(value) => void setBrowserNotificationsEnabled(value)} /></div>
      <div className="device-push-status"><p className={`notification-permission ${deviceNotificationsEnabled ? "is-ready" : "is-not-ready"}`} role="status">{deviceNotificationsEnabled ? t("settings.permissionGranted") : uiText("ปิดการแจ้งเตือน")}</p>{deviceNotificationsEnabled&&<><button type="button" className="secondary-button device-push-test" disabled={browserNotificationTestStatus==="sending"} onClick={()=>{setTestDialogOpen(true);void setBrowserNotificationsEnabled(true);}}>{browserNotificationTestStatus==="sending"?uiText("กำลังส่ง…"):uiText("ส่งทดสอบ")}</button></>}{!deviceNotificationsEnabled&&browserNotificationPermission==="denied"&&<small>{t("settings.permissionDenied")}</small>}{!deviceNotificationsEnabled&&browserNotificationPermission==="unsupported"&&<small>{t("settings.push_unsupported")}</small>}</div>
    </Card></section>
    <BottomSheet open={testDialogOpen} title={uiText("ส่งทดสอบ")} onClose={()=>setTestDialogOpen(false)} className="device-test-dialog"><p role="status">{browserNotificationTestStatus==="sending"?t("settings.notificationTestSending"):browserNotificationTestStatus==="failed"?t("settings.notificationTestFailed"):t("settings.notificationTestSent")}</p>{pushRegistration&&!pushRegistration.ok&&<p>{t(`settings.push_${pushRegistration.reason}`)}</p>}<button type="button" className="primary-button" onClick={()=>setTestDialogOpen(false)}>{uiText("ปิด")}</button></BottomSheet>
    <AccountManagement /><DeveloperSupport /><BottomSheet className="language-selector-sheet" open={languagePickerOpen} title={t("settings.chooseLanguage")} onClose={() => setLanguagePickerOpen(false)}><div className="language-selector-intro">{t("settings.chooseLanguageDescription")}</div><div className="language-options" role="radiogroup" aria-label={t("settings.chooseLanguage")}>{(["th", "en"] as const).map((option) => <button type="button" role="radio" aria-checked={language === option} className={language === option ? "selected" : ""} key={option} onClick={() => { setLanguage(option); setLanguagePickerOpen(false); }}><span><strong>{uiText(languageLabels[option])}</strong><small>{option === "th" ? "Thai" : "English"}</small></span>{language === option && <Check className="language-option-check" aria-hidden="true" />}</button>)}</div></BottomSheet></div>;
}
