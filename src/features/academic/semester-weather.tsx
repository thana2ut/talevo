"use client";

import { Cloud, CloudLightning, CloudSun, Coffee, Heart, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { BottomSheet } from "@/components/ui";
import {
  formatStudyDuration,
  getAcademicWeather,
  getStudyLoadSupportiveCopy,
  type AcademicWeatherDay,
  type AcademicWeatherState,
} from "@/lib/academic-planning";
import { formatThaiLongDate, sameScheduleDate } from "@/lib/schedule-date";
import { useAppState } from "@/providers/app-state-provider";

const stateCopy: Record<AcademicWeatherState, string> = {
  clear: "เบา",
  light: "เบา",
  moderate: "ปานกลาง",
  heavy: "หนัก",
  storm: "หนักมาก",
};

function WeatherIcon({ state }: { state: AcademicWeatherState }) {
  if (state === "clear" || state === "light") return <CloudSun />;
  if (state === "moderate") return <Cloud />;
  return <CloudLightning />;
}

function SupportiveInsightIcon({ state }: { state: AcademicWeatherState | "empty" }) {
  if (state === "storm" || state === "heavy") return <Heart aria-hidden="true" />;
  if (state === "moderate") return <Coffee aria-hidden="true" />;
  return <Sparkles aria-hidden="true" />;
}

const dayText = (date: Date) => new Intl.DateTimeFormat("th-TH", { weekday: "short" }).format(date);
const dateText = (date: Date) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric" }).format(date);

export function SemesterWeather() {
  const { now, schedules, tasks, exams } = useAppState();
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12));
  const [modalOpen, setModalOpen] = useState(false);

  const forecast = useMemo<AcademicWeatherDay[]>(
    () => Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + index, 12);
      return getAcademicWeather(schedules, tasks, exams, date);
    }),
    [exams, now, schedules, tasks],
  );

  const selectedWeather = useMemo<AcademicWeatherDay>(
    () => forecast.find((item) => sameScheduleDate(item.date, selectedDate)) ?? forecast[0],
    [forecast, selectedDate],
  );

  const isToday = sameScheduleDate(selectedWeather.date, now);
  const hasAcademicData = schedules.length + tasks.length + exams.length > 0;

  return (
    <section className="semester-weather" id="semester-weather" aria-labelledby="semester-weather-title">
      <header className="semester-weather-heading">
        <div>
          <span><CloudSun /></span>
          <div>
            <h2 id="semester-weather-title">สภาพการเรียน 7 วัน</h2>
            <p>คำนวณจากตาราง งาน และการสอบที่บันทึกไว้</p>
          </div>
        </div>
      </header>

      {hasAcademicData ? (
        <>
          <div className="academic-weather-strip" role="list" aria-label="พยากรณ์ภาระการเรียน 7 วัน">
            {forecast.map((item) => {
              const isCardSelected = sameScheduleDate(item.date, selectedWeather.date);
              return (
                <button
                  key={item.date.toISOString()}
                  type="button"
                  className={`academic-weather-day weather-${item.state}${isCardSelected ? " is-selected" : ""}`}
                  onClick={() => {
                    setSelectedDate(item.date);
                    setModalOpen(true);
                  }}
                  aria-label={`${dayText(item.date)} ${dateText(item.date)} ภาระ${stateCopy[item.state]}`}
                >
                  <span>{dayText(item.date)}</span>
                  <time className="academic-weather-date" dateTime={item.date.toISOString().slice(0, 10)}>
                    {dateText(item.date)}
                  </time>
                  <WeatherIcon state={item.state} />
                  <strong>{stateCopy[item.state]}</strong>
                </button>
              );
            })}
          </div>

          <div className={`academic-weather-insight insight-${selectedWeather.state}`}>
            <SupportiveInsightIcon state={selectedWeather.state} />
            <div className="academic-weather-insight-copy">
              {!isToday && (
                <small className="academic-weather-insight-date">
                  {formatThaiLongDate(selectedWeather.date)}
                </small>
              )}
              <strong>{getStudyLoadSupportiveCopy(selectedWeather.state, isToday)}</strong>
              <span>
                {selectedWeather.dailyLoad.totalMinutes > 0
                  ? formatStudyDuration(selectedWeather.dailyLoad.totalMinutes)
                  : "ไม่มีคาบเรียน"}
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className="academic-weather-empty">
          <CloudSun />
          <div>
            <strong>ยังมีข้อมูลไม่พอสำหรับสรุปสภาพการเรียน</strong>
            <span>เพิ่มตารางเรียน งาน หรือการสอบ เพื่อให้ TALEVO ประเมินสัปดาห์ของคุณได้</span>
          </div>
        </div>
      )}

      <BottomSheet
        open={modalOpen}
        title={isToday ? "ทำไมวันนี้เป็นแบบนี้?" : "รายละเอียดสภาพการเรียน"}
        onClose={() => setModalOpen(false)}
      >
        <div className="academic-sheet">
          <p className="academic-detail-date-label">{formatThaiLongDate(selectedWeather.date)}</p>
          <div className={`academic-detail-state weather-${selectedWeather.state}`}>
            <WeatherIcon state={selectedWeather.state} />
            <div className="academic-detail-state-info">
              <strong>{stateCopy[selectedWeather.state]}</strong>
              <span>
                {selectedWeather.dailyLoad.totalMinutes > 0
                  ? `${formatStudyDuration(selectedWeather.dailyLoad.totalMinutes)} · ${selectedWeather.dailyLoad.classCount} คาบ`
                  : "ไม่มีคาบเรียน"}
              </span>
            </div>
          </div>
          {selectedWeather.reasons.length ? (
            <ul>
              {selectedWeather.reasons.map((reason, index) => (
                <li key={`${reason.label}-${index}`}>
                  <strong>{reason.label}</strong>
                  {reason.value && <span>{reason.value}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p>ยังไม่มีคาบเรียน งาน หรือการสอบที่บันทึกไว้</p>
          )}
        </div>
      </BottomSheet>
    </section>
  );
}
