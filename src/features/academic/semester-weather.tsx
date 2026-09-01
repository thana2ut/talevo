"use client";

import { Cloud, CloudLightning, CloudSun, Sun, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { BottomSheet } from "@/components/ui";
import { getAcademicWeather } from "@/lib/academic-planning";
import { useAppState } from "@/providers/app-state-provider";

const stateCopy = { clear: "โล่ง", light: "เบา", moderate: "ปานกลาง", heavy: "หนัก", storm: "หนักมาก" } as const;

function WeatherIcon({ state }: { state: keyof typeof stateCopy }) {
  if (state === "clear") return <Sun />;
  if (state === "light") return <CloudSun />;
  if (state === "moderate") return <Cloud />;
  return <CloudLightning />;
}

const dayText = (date: Date) => new Intl.DateTimeFormat("th-TH", { weekday: "short" }).format(date);
const dateText = (date: Date) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric" }).format(date);

export function SemesterWeather() {
  const { now, schedules, tasks, exams } = useAppState();
  const [detailDate, setDetailDate] = useState<Date | null>(null);
  const forecast = useMemo(
    () => Array.from({ length: 7 }, (_, index) => getAcademicWeather(schedules, tasks, exams, new Date(now.getFullYear(), now.getMonth(), now.getDate() + index, 12))),
    [exams, now, schedules, tasks],
  );
  const selectedWeather = detailDate ? forecast.find((item) => item.date.toDateString() === detailDate.toDateString()) : undefined;
  const insight = forecast.find((item) => item.state === "storm" || item.state === "heavy");
  const hasAcademicData = schedules.length + tasks.length + exams.length > 0;
  const isRiskInsight = Boolean(insight);

  return <section className="semester-weather" id="semester-weather" aria-labelledby="semester-weather-title">
    <header className="semester-weather-heading"><div><span><CloudSun /></span><div><h2 id="semester-weather-title">สภาพการเรียน 7 วัน</h2><p>คำนวณจากตาราง งาน และการสอบที่บันทึกไว้</p></div></div></header>
    {hasAcademicData ? <>
      <div className="academic-weather-strip" role="list" aria-label="พยากรณ์ภาระการเรียน 7 วัน">{forecast.map((item) => <button key={item.date.toISOString()} type="button" className={`academic-weather-day weather-${item.state}`} onClick={() => setDetailDate(item.date)} aria-label={`${dayText(item.date)} ${dateText(item.date)} ภาระ${stateCopy[item.state]}`}><span>{dayText(item.date)}</span><time className="academic-weather-date" dateTime={item.date.toISOString().slice(0, 10)}>{dateText(item.date)}</time><WeatherIcon state={item.state} /><strong>{stateCopy[item.state]}</strong></button>)}</div>
      <div className={`academic-weather-insight ${isRiskInsight ? "is-risk" : "is-calm"}`}>{isRiskInsight ? <TriangleAlert /> : <CloudSun />}<div><strong>{insight?.state === "storm" ? "ภาระหนักกำลังมา" : isRiskInsight ? "วันที่ควรวางแผนล่วงหน้า" : "ภาพรวมที่ควรรู้"}</strong><span>{insight?.reasons[0]?.label ?? "สัปดาห์นี้ค่อนข้างโล่ง ยังไม่มีงานหรือการสอบจำนวนมาก"}</span></div></div>
    </> : <div className="academic-weather-empty"><CloudSun /><div><strong>ยังมีข้อมูลไม่พอสำหรับสรุปสภาพการเรียน</strong><span>เพิ่มตารางเรียน งาน หรือการสอบ เพื่อให้ TALEVO ประเมินสัปดาห์ของคุณได้</span></div></div>}
    <BottomSheet open={detailDate !== null} title="ทำไมวันนี้เป็นแบบนี้?" onClose={() => setDetailDate(null)}><div className="academic-sheet">{selectedWeather && <><div className={`academic-detail-state weather-${selectedWeather.state}`}><WeatherIcon state={selectedWeather.state} /><strong>{stateCopy[selectedWeather.state]}</strong></div>{selectedWeather.reasons.length ? <ul>{selectedWeather.reasons.map((reason, index) => <li key={`${reason.label}-${index}`}><strong>{reason.label}</strong>{reason.value && <span>{reason.value}</span>}</li>)}</ul> : <p>ยังไม่มีคาบเรียน งาน หรือการสอบที่บันทึกไว้</p>}</>}</div></BottomSheet>
  </section>;
}
