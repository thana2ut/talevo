"use client";
import Link from "next/link";
import {useEffect,useState,type KeyboardEvent} from "react";
import {ArrowLeft,Bell,CalendarDays,CalendarClock,ClipboardCheck,CheckCheck,CheckCircle2,ChevronRight,Timer,Trash2,TriangleAlert,FlaskConical,Sparkles} from "lucide-react";
import {BottomSheet} from "@/components/ui";
import {useAppState} from "@/providers/app-state-provider";
import {useLanguage} from "@/providers/language-provider";
import {getUnreadNotificationCount} from "@/lib/alerts/notification-utils";
import type {AppNotification} from "@/types";
import "./notifications-center.css";
import { useUiText } from "@/providers/ui-language";


type Category="all"|"tasks"|"classes"|"system";
function categoryOf(item:AppNotification):Exclude<Category,"all">{
 if(item.type==="class_upcoming"||item.type==="class_ending")return "classes";
 if(["task_deadline","deadline_risk","exam_today","exam_upcoming"].includes(item.type))return "tasks";
 return "system";
}
function dayKey(date:Date){return Number.isNaN(date.getTime())?"":new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).format(date);}
function timeLabel(value:string,now:Date,thai:boolean){
 const date=new Date(value);if(Number.isNaN(date.getTime()))return "";
 const time=new Intl.DateTimeFormat(thai?"th-TH":"en-GB",{timeZone:"Asia/Bangkok",hour:"2-digit",minute:"2-digit"}).format(date);
 if(dayKey(date)===dayKey(now))return time;
 if(dayKey(date)===dayKey(new Date(now.getTime()-86400000)))return `${thai?"เมื่อวาน":"Yesterday"} ${time}`;
 return new Intl.DateTimeFormat(thai?"th-TH":"en-GB",{timeZone:"Asia/Bangkok",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).format(date);
}
function minutesToClass(item:AppNotification,now:Date){
 if(item.type!=="class_upcoming")return null;
 const date=item.eventKey.match(/(\d{4}-\d{2}-\d{2})$/)?.[1]??item.href?.match(/[?&]date=(\d{4}-\d{2}-\d{2})/)?.[1];
 const time=item.message.match(/\b([0-2]\d:[0-5]\d)\s*[–-]/)?.[1];
 if(!date||!time)return null;
 const minutes=Math.ceil((new Date(`${date}T${time}:00+07:00`).getTime()-now.getTime())/60000);
 return minutes>0&&minutes<=180?minutes:null;
}
function AlertIcon({item}:{item:AppNotification}){
 if(item.readAt)return <CheckCircle2/>;
 if(item.metadata?.category==="grade_risk")return <FlaskConical/>;
 if(item.type.startsWith("class_"))return <CalendarDays/>;
 if(item.type.startsWith("exam_"))return <CalendarClock/>;
 if(["task_deadline","deadline_risk"].includes(item.type))return <ClipboardCheck/>;
 if(["daily_brief","morning_summary","weekly_radar"].includes(item.type))return <Sparkles/>;
 return <Bell/>;
}
export function NotificationsPage(){
  const uiText = useUiText();

 const {notifications,now,markNotificationRead,markAllNotificationsRead,deleteNotification,deleteReadNotifications}=useAppState();
 const {language,t}=useLanguage();const thai=language==="th";
 const [filter,setFilter]=useState<Category>("all"),[opened,setOpened]=useState<AppNotification|null>(null),[deleteRead,setDeleteRead]=useState(false),[deleteOne,setDeleteOne]=useState(false),[notice,setNotice]=useState("");
 const tabs:{id:Category;label:string}[]=[{id:"all",label:thai?"ทั้งหมด":"All"},{id:"tasks",label:thai?"งาน":"Tasks"},{id:"classes",label:thai?"คาบเรียน":"Classes"},{id:"system",label:thai?"ระบบ":"System"}];
 const labels={tasks:thai?"งาน":"Task",classes:thai?"คาบเรียน":"Class",system:thai?"ระบบ":"System"};
 const unread=getUnreadNotificationCount(notifications),readCount=notifications.length-unread;
 const sorted=[...notifications].filter(item=>filter==="all"||categoryOf(item)===filter).sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());
 const today=sorted.filter(item=>dayKey(new Date(item.createdAt))===dayKey(now)),previous=sorted.filter(item=>dayKey(new Date(item.createdAt))!==dayKey(now));
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(""),3500);return()=>clearTimeout(timer);},[notice]);
 const open=(item:AppNotification)=>{markNotificationRead(item.id);setOpened(item);};
 const navigateTab=(event:KeyboardEvent<HTMLButtonElement>,index:number)=>{
  let next=index;if(event.key==="ArrowRight")next=(index+1)%tabs.length;else if(event.key==="ArrowLeft")next=(index+tabs.length-1)%tabs.length;else if(event.key==="Home")next=0;else if(event.key==="End")next=tabs.length-1;else return;
  event.preventDefault();setFilter(tabs[next].id);document.getElementById(`notification-tab-${tabs[next].id}`)?.focus();
 };
 const row=(item:AppNotification)=>{
  const category=categoryOf(item),minutes=minutesToClass(item,now);
  const badge=item.type.startsWith("exam_")?(thai?"การสอบ":"Exam"):item.metadata?.category==="grade_risk"?(thai?"เกรด":"Grade"):labels[category];
  return <button type="button" className={`notif-row ${item.readAt?"is-read":"is-unread"} category-${category}`} key={item.id} onClick={()=>open(item)} aria-label={`${thai?uiText("เปิดอ่าน"):"Open"}: ${uiText(/talevo grade lab/i.test(item.title)?"คำนวณคะแนน":item.title)}${!item.readAt?(thai?uiText(" · ยังไม่อ่าน"):" · Unread"):""}`}>
   <span className="notif-icon" aria-hidden="true"><AlertIcon item={item}/>{!item.readAt&&item.priority==="high"&&<span className="notif-priority"><TriangleAlert/></span>}</span>
   <span className="notif-copy"><span className="notif-meta"><span className="notif-category">{badge}</span><time dateTime={item.createdAt}>{timeLabel(item.createdAt,now,thai)}</time></span><strong>{uiText(/talevo grade lab/i.test(item.title)?"คำนวณคะแนน":item.title)}</strong><span className="notif-description">{uiText(item.message)}</span>{minutes!==null&&<span className="notif-countdown"><Timer size={13} aria-hidden="true"/>{thai?uiText("อีก {0} นาที", [minutes]):`In ${minutes} min`}</span>}</span>
   <span className="notif-trailing">{!item.readAt&&<i aria-hidden="true"/>}<ChevronRight aria-hidden="true"/></span>
  </button>;
 };
 const related=opened?.href&&opened.href.startsWith("/")&&!opened.href.startsWith("//")?opened.href:null;
 return <div className="page notifications-page notif-center">
  <header className="notif-header"><Link href="/today" className="icon-button" aria-label={thai?uiText("กลับหน้าหลัก"):"Back to home"}><ArrowLeft/></Link><div><h1>{t("notifications.title")}</h1><p>{thai?uiText("สิ่งสำคัญของคุณ อยู่ในที่เดียว"):"Your important updates, in one place"}</p></div><span aria-hidden="true" className="notif-header-spacer"/></header>
  <div className="notif-toolbar"><p className="notif-unread"><i aria-hidden="true"/>{thai?uiText("{0} รายการที่ยังไม่อ่าน", [unread]):`${unread} unread notifications`}</p><div className="notif-toolbar-actions"><button type="button" disabled={!unread} onClick={()=>{markAllNotificationsRead();setNotice(t("notifications.markedAllRead"));}}><CheckCheck aria-hidden="true"/>{thai?uiText("อ่านทั้งหมด"):"Mark all as read"}</button><button type="button" disabled={!readCount} onClick={()=>setDeleteRead(true)}><Trash2 aria-hidden="true"/>{thai?uiText("ลบที่อ่านแล้วทั้งหมด"):"Delete read"}</button></div></div>
  <div className="notif-tabs" role="tablist" aria-label={thai?uiText("หมวดการแจ้งเตือน"):"Notification categories"}>{tabs.map((tab,index)=><button id={`notification-tab-${tab.id}`} key={tab.id} type="button" role="tab" aria-selected={filter===tab.id} aria-controls="notifications-content" tabIndex={filter===tab.id?0:-1} onClick={()=>setFilter(tab.id)} onKeyDown={event=>navigateTab(event,index)}>{uiText(tab.label)}</button>)}</div>
  {notice&&<p className="notif-notice" role="status">{uiText(notice)}</p>}
  <div id="notifications-content" role="tabpanel" aria-labelledby={`notification-tab-${filter}`} className="notif-groups" tabIndex={0}>
   {today.length>0&&<section className="notif-day"><h2>{thai?uiText("วันนี้"):"Today"}<span>{today.length}</span></h2><div className="notif-day-card">{today.map(row)}</div></section>}
   {previous.length>0&&<section className="notif-day"><h2>{thai?uiText("ก่อนหน้านี้"):"Earlier"}<span>{previous.length}</span></h2><div className="notif-day-card">{previous.map(row)}</div></section>}
   {!sorted.length&&<section className="notif-empty"><span><CheckCircle2 aria-hidden="true"/></span><h2>{notifications.length?(thai?uiText("ยังไม่มีการแจ้งเตือนในหมวดนี้"):"No notifications in this category"):t("notifications.emptyTitle")}</h2><p>{thai?uiText("เมื่อมีเรื่องสำคัญจากงาน ตารางเรียน หรือระบบ Talevo จะแจ้งให้ทราบที่นี่"):"Important updates from your tasks, schedule and Talevo will appear here."}</p>{notifications.length>0&&filter!=="all"&&<button type="button" onClick={()=>setFilter("all")}>{thai?uiText("ดูการแจ้งเตือนทั้งหมด"):"View all notifications"}</button>}</section>}
  </div>
  <BottomSheet open={Boolean(opened)&&!deleteOne} title={t("notifications.detailTitle")} onClose={()=>setOpened(null)} className="notif-detail-sheet">{opened&&<div className="notif-detail"><span className="notif-detail-icon" aria-hidden="true"><AlertIcon item={opened}/></span><span className="notif-category">{labels[categoryOf(opened)]}</span><h3>{uiText(opened.title)}</h3><p>{uiText(opened.message)}</p><time dateTime={opened.createdAt}>{timeLabel(opened.createdAt,now,thai)}</time><div className="notif-detail-actions">{related&&<Link href={related} className="primary-button" onClick={()=>setOpened(null)}>{t("notifications.openRelated")}<ChevronRight size={18}/></Link>}<button type="button" className="secondary-button" onClick={()=>setOpened(null)}>{t("common.close")}</button><button type="button" className="notif-delete-single" onClick={()=>setDeleteOne(true)}><Trash2 size={17}/>{t("notifications.deleteOne")}</button></div></div>}</BottomSheet>
  <BottomSheet open={deleteRead} title={t("notifications.deleteReadTitle")} onClose={()=>setDeleteRead(false)}><p className="notif-confirm-copy">{thai?uiText("ลบการแจ้งเตือนที่อ่านแล้ว {0} รายการใช่หรือไม่? งานและตารางเรียนยังคงอยู่", [readCount]) : t("notifications.deleteReadConfirm")}</p><div className="notif-confirm-actions"><button type="button" className="secondary-button" onClick={()=>setDeleteRead(false)}>{t("common.cancel")}</button><button type="button" className="danger-button" disabled={!readCount} onClick={()=>{deleteReadNotifications();setDeleteRead(false);setOpened(null);setNotice(t("notifications.deletedRead"));}}>{thai?uiText("ยืนยันลบที่อ่านแล้ว"):"Delete read"}</button></div></BottomSheet>
  <BottomSheet open={deleteOne} title={t("notifications.deleteOne")} onClose={()=>setDeleteOne(false)}><p className="notif-confirm-copy">{thai?uiText("ลบการแจ้งเตือน “{0}” ใช่หรือไม่?", [opened?.title??""]):"Delete this notification?"}</p><div className="notif-confirm-actions"><button type="button" className="secondary-button" onClick={()=>setDeleteOne(false)}>{t("common.cancel")}</button><button type="button" className="danger-button" onClick={()=>{if(opened)deleteNotification(opened.id);setDeleteOne(false);setOpened(null);setNotice(t("notifications.deleted"));}}>{thai?uiText("ยืนยันลบ"):"Delete"}</button></div></BottomSheet>
 </div>;
}
