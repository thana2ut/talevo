"use client";

import { Bell, CalendarDays, Check, CheckCheck, CheckCircle2, ChevronRight, Clock3, Languages, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BottomSheet, Card, PageHeader, Select } from "@/components/ui";
import Link from "next/link";
import { NotificationCard, NotificationIcon } from "@/components/domain";
import { AccountManagement } from "@/components/account-actions";
import { useAppState } from "@/providers/app-state-provider";
import { useLanguage } from "@/providers/language-provider";
import { languageLabels } from "@/lib/i18n";
import { formatNotificationTime, getNotificationTone, getUnreadNotificationCount, groupNotifications, type NotificationGroupKey } from "@/lib/alerts/notification-utils";
import type { AppNotification, NotificationPreferences } from "@/types";

export function NotificationsPage() {
  const { notifications, markNotificationRead, markAllNotificationsRead, deleteNotification, deleteReadNotifications } = useAppState();
  const { language, t } = useLanguage();
  const [deleteReadDialogOpen, setDeleteReadDialogOpen] = useState(false);
  const [openedNotification, setOpenedNotification] = useState<AppNotification | null>(null);
  const [notice, setNotice] = useState("");
  const unread = getUnreadNotificationCount(notifications);
  const readCount = notifications.length - unread;
  const groups = useMemo(() => groupNotifications(notifications, new Date()), [notifications]);
  const groupOrder: NotificationGroupKey[] = ["important", "today", "thisWeek", "previous"];
  const unreadBadge = language === "th" ? `${unread > 99 ? "99+" : unread} ยังไม่อ่าน` : `${unread > 99 ? "99+" : unread} unread`;

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const openNotification = (item: AppNotification) => {
    markNotificationRead(item.id);
    setOpenedNotification(item);
  };
  const handleDeleteNotification = (id: string) => {
    deleteNotification(id);
    setNotice(t("notifications.deleted"));
  };
  const handleMarkAllRead = () => {
    if (!unread) return;
    markAllNotificationsRead();
    setNotice(t("notifications.markedAllRead"));
  };
  const handleDeleteRead = () => {
    deleteReadNotifications();
    setDeleteReadDialogOpen(false);
    setNotice(t("notifications.deletedRead"));
  };

  return <div className="page notifications-page">
    <PageHeader title={t("notifications.title")} backHref="/today" />
    {notifications.length ? (
      <>
        <section className="notification-summary-card" aria-labelledby="notification-summary-title">
          <span className="notification-summary-icon" aria-hidden="true"><Bell /></span>
          <div className="notification-summary-copy">
            <div><h2 id="notification-summary-title">{t("notifications.centerTitle")}</h2>{unread > 0 && <span className="notification-unread-badge">{unreadBadge}</span>}</div>
            <p>{unread > 0 ? t("notifications.unreadSummary").replace("{count}", String(unread)) : t("notifications.allCaughtUp")}</p>
          </div>
          <div className="notification-summary-actions" aria-label={t("notifications.actionsLabel")}>
            <button className="secondary-button notification-mark-read-button" type="button" onClick={handleMarkAllRead} disabled={unread === 0}><CheckCheck aria-hidden="true" />{t("notifications.markAllRead")}</button>
            {readCount > 0 && <button className="notification-delete-read-button" type="button" onClick={() => setDeleteReadDialogOpen(true)}><Trash2 aria-hidden="true" />{t("notifications.deleteRead")}</button>}
          </div>
        </section>
        {notice && <p className="notification-action-notice" role="status">{notice}</p>}
        <div className="notification-groups">
          {groupOrder.map((group) => groups[group].length > 0 && (
            <section className="notification-group" key={group} aria-labelledby={`notification-group-${group}`}>
              <h2 id={`notification-group-${group}`}>{t(`notifications.groups.${group}`)}</h2>
              <div className="notification-list">
                {groups[group].map((item) => (
                  <NotificationCard key={item.id} item={item} onClick={() => markNotificationRead(item.id)} onOpen={() => openNotification(item)} onDelete={item.readAt ? () => handleDeleteNotification(item.id) : undefined} deleteLabel={t("notifications.deleteOne")} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </>
    ) : (
      <Card className="notification-empty-unified-card">
        <div className="notification-empty-card-header">
          <span className="notification-summary-icon" aria-hidden="true"><Bell /></span>
          <div className="notification-summary-copy">
            <h2>{t("notifications.centerTitle")}</h2>
            <p>{language === "th" ? "อัปเดตสิ่งสำคัญจาก TALEVO" : "Important updates from TALEVO"}</p>
          </div>
        </div>
        <div className="notification-empty-card-divider" />
        <div className="notification-empty-card-body">
          <span className="notification-empty-check-badge" aria-hidden="true">
            <CheckCircle2 size={36} />
          </span>
          <h2>{t("notifications.emptyTitle")}</h2>
          <p>{language === "th" ? "TALEVO จะแจ้งเตือนจากงานและตารางเรียนของคุณเมื่อมีสิ่งที่ต้องรู้" : "TALEVO will alert you from your tasks and class schedule when there is something to know."}</p>
        </div>
      </Card>
    )}
    <BottomSheet open={Boolean(openedNotification)} title={t("notifications.detailTitle")} onClose={() => setOpenedNotification(null)} closeLabel={t("common.close")} className="notification-detail-sheet">
      {openedNotification && <div className="notification-detail">
        <span className={`notification-detail-icon notification-${getNotificationTone(openedNotification)}`}><NotificationIcon type={openedNotification.type} /></span>
        <h3>{openedNotification.title}</h3>
        <p>{openedNotification.message}</p>
        <small>{formatNotificationTime(openedNotification.createdAt, language)}</small>
        <div className="notification-detail-actions">
          {openedNotification.href && <Link className="primary-button" href={openedNotification.href} onClick={() => setOpenedNotification(null)}>{t("notifications.openRelated")}</Link>}
          <button className="secondary-button" type="button" onClick={() => setOpenedNotification(null)}>{t("common.close")}</button>
        </div>
      </div>}
    </BottomSheet>
    <BottomSheet open={deleteReadDialogOpen} title={t("notifications.deleteReadTitle")} onClose={() => setDeleteReadDialogOpen(false)} closeLabel={t("common.close")} className="notification-delete-dialog"><p>{t("notifications.deleteReadConfirm")}</p><div className="notification-dialog-actions"><button className="secondary-button" type="button" onClick={() => setDeleteReadDialogOpen(false)}>{t("common.cancel")}</button><button className="notification-delete-confirm-button" type="button" onClick={handleDeleteRead}>{t("notifications.deleteRead")}</button></div></BottomSheet>
  </div>;
}

function SettingRow({ icon, title, description, children }: { icon: ReactNode; title: string; description?: string; children: ReactNode }) {
  return <div className="setting-row"><span className="setting-icon">{icon}</span><div><strong>{title}</strong>{description && <small>{description}</small>}</div>{children}</div>;
}

function Toggle({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`toggle ${checked ? "on" : ""}`} onClick={() => onChange(!checked)} disabled={disabled}><span /></button>;
}

/* One switch per heading. The per-alert rows underneath said the same thing in
   more words - nobody turns off the 12-hour warning but keeps the 24-hour one -
   so each heading now writes every key it owns. */
const NOTIFICATION_GROUPS = [
  { titleKey: "settings.alertTasks", keys: ["task24h", "task12h", "deadlineRisk"] },
  { titleKey: "settings.alertDaily", keys: ["morning0600", "daily0700"] },
  { titleKey: "settings.alertClasses", keys: ["class30m", "classEnd10m"] },
  { titleKey: "settings.alertWeekly", keys: ["weeklyRadar"] },
] as const satisfies ReadonlyArray<{ titleKey: string; keys: ReadonlyArray<keyof NotificationPreferences> }>;

export function SettingsPage() {
  const { settings, updateSettings, updateNotificationPreferences, browserNotificationPermission, browserNotificationTestStatus, deviceNotificationsEnabled, pushRegistration, setBrowserNotificationsEnabled } = useAppState();
  const { language, setLanguage, t } = useLanguage();
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);
  const languageRowLabel = language === "th" ? `ภาษา ภาษาปัจจุบัน ${languageLabels[language]}` : `Language Current language ${languageLabels[language]}`;
  const preferences = settings.notificationPreferences;
  const disabled = !preferences.enabled;
  const groupIcons = [<CheckCircle2 key="tasks" />, <Clock3 key="daily" />, <CalendarDays key="classes" />, <Sparkles key="weekly" />];
  // On when any alert in the group is on, so a mix inherited from the old
  // per-alert rows reads as on rather than silently off.
  const isGroupOn = (keys: ReadonlyArray<keyof NotificationPreferences>) => keys.some((key) => preferences[key]);
  const setGroup = (keys: ReadonlyArray<keyof NotificationPreferences>, value: boolean) =>
    updateNotificationPreferences(Object.fromEntries(keys.map((key) => [key, value])));
  return <div className="page settings-page"><PageHeader title={t("settings.title")} backHref="/profile" />
    <section><div className="section-header"><h2>{t("settings.general")}</h2></div><Card className="settings-card"><button className="setting-row language-setting-row" type="button" onClick={() => setLanguagePickerOpen(true)} aria-label={languageRowLabel}><span className="setting-icon"><Languages /></span><span className="language-setting-copy"><strong>{t("settings.language")}</strong><small>{t("settings.languageDescription")}</small></span><span className="language-setting-trailing"><strong className="setting-value language-setting-value">{languageLabels[language]}</strong><ChevronRight className="setting-chevron" aria-hidden="true" /></span></button><SettingRow icon={<Clock3 />} title={t("settings.timeZone")}><strong className="setting-value">Asia/Bangkok</strong></SettingRow><SettingRow icon={<CalendarDays />} title={t("settings.dateFormat")}><Select aria-label={t("settings.dateFormat")} value={settings.dateFormat} onChange={(event) => updateSettings({dateFormat:event.target.value as typeof settings.dateFormat})}><option value="วัน/เดือน/ปี">{language === "th" ? "วัน/เดือน/ปี" : "Day / Month / Year"}</option><option value="เดือน/วัน/ปี">{language === "th" ? "เดือน/วัน/ปี" : "Month / Day / Year"}</option></Select></SettingRow><SettingRow icon={<CalendarDays />} title={t("settings.yearDisplay")}><Select aria-label={t("settings.yearDisplay")} value={settings.yearSystem} onChange={(event) => updateSettings({yearSystem:event.target.value as typeof settings.yearSystem})}><option>พ.ศ.</option><option>ค.ศ.</option></Select></SettingRow></Card></section>
    <section><div className="section-header"><h2>{t("settings.notifications")}</h2></div><Card className="settings-card notification-settings">
      <SettingRow icon={<Bell />} title={t("settings.smartAlerts")}><Toggle label={t("settings.smartAlerts")} checked={preferences.enabled} onChange={(value) => updateNotificationPreferences({ enabled: value })} /></SettingRow>
      {NOTIFICATION_GROUPS.map((group, index) => <div className={`setting-row notification-preference-row ${disabled ? "is-disabled" : ""}`} key={group.titleKey}><span className="setting-icon">{groupIcons[index]}</span><strong>{t(group.titleKey)}</strong><Toggle label={t(group.titleKey)} checked={isGroupOn(group.keys)} disabled={disabled} onChange={(value) => setGroup(group.keys, value)} /></div>)}
      <div className="setting-row notification-preference-row device-notification-row"><span className="setting-icon"><Bell /></span><strong>{t("settings.browserNotifications")}</strong><Toggle label={t("settings.browserNotifications")} checked={deviceNotificationsEnabled} disabled={browserNotificationPermission === "unsupported" || browserNotificationTestStatus === "sending"} onChange={(value) => void setBrowserNotificationsEnabled(value)} /></div>
      <p className={`notification-permission permission-${browserNotificationPermission} ${pushRegistration && !pushRegistration.ok ? "is-warning" : ""}`} role="status">{browserNotificationTestStatus === "sending" ? t("settings.notificationTestSending") : browserNotificationPermission === "unsupported" ? t("settings.permissionUnsupported") : browserNotificationPermission === "denied" ? t("settings.permissionDenied") : !deviceNotificationsEnabled ? t("settings.permissionDefault") : pushRegistration && !pushRegistration.ok ? t(`settings.push_${pushRegistration.reason}`) : pushRegistration?.ok ? t("settings.pushReady") : t("settings.deviceNotificationsOn")}</p>
    </Card></section>
    <AccountManagement /><BottomSheet className="language-selector-sheet" open={languagePickerOpen} title={t("settings.chooseLanguage")} onClose={() => setLanguagePickerOpen(false)}><div className="language-selector-intro">{t("settings.chooseLanguageDescription")}</div><div className="language-options" role="radiogroup" aria-label={t("settings.chooseLanguage")}>{(["th", "en"] as const).map((option) => <button type="button" role="radio" aria-checked={language === option} className={language === option ? "selected" : ""} key={option} onClick={() => { setLanguage(option); setLanguagePickerOpen(false); }}><span><strong>{languageLabels[option]}</strong><small>{option === "th" ? "Thai" : "English"}</small></span>{language === option && <Check className="language-option-check" aria-hidden="true" />}</button>)}</div></BottomSheet></div>;
}
