"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Copy, GraduationCap, MapPin, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { TalevoColorPicker } from "@/components/talevo-color-picker";
import { AcademicEndTimeInput } from "@/components/academic-end-time-input";
import { BottomSheet, Card, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { SyllabusScanner } from "@/features/academic/syllabus-scanner";
import { SubjectIcon } from "@/components/domain";
import { addScheduleDays, createScheduleDate, formatThaiDay, formatThaiLongDate, formatThaiMonth, formatThaiWeekday, formatThaiWeekRange, getMonthDates, getScheduleWeekDates, mondayIndex, sameScheduleDate, startOfScheduleWeek } from "@/lib/schedule-date";
import { findScheduleConflict, formatScheduleDuration, getClassDurationMinutes, getFreeTimeGaps, getHorizontalEventPosition, getHorizontalTimelinePercent, getHorizontalTimetableRange, getScheduleDisplayName, layoutHorizontalDay, timeToMinutes } from "@/lib/schedule-utils";
import { isValidAcademicTimeRange } from "@/lib/academic-time";
import { defaultTalevoColor, getContrastTextColor, normalizeTalevoColor } from "@/lib/talevo-color-utils";
import { useAppState } from "@/providers/app-state-provider";
import { useLanguage } from "@/providers/language-provider";
import type { AcademicTerm, ClassSchedule, NewClassInput } from "@/types";

const days = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."];
const referenceToday = createScheduleDate(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
type ScheduleView = "วัน" | "สัปดาห์" | "เดือน";

function formatAcademicTermSummary(academicTerm: AcademicTerm) {
  const parts = [academicTerm.level.trim(), academicTerm.term.trim(), academicTerm.academicYear.trim() ? `ปีการศึกษา ${academicTerm.academicYear.trim()}` : ""].filter(Boolean);
  return parts.length ? parts.join(" · ") : "ยังไม่ได้ตั้งค่าภาคเรียน";
}

const courseColorStyle = (color: string) => {
  const courseColor = normalizeTalevoColor(color);
  return { "--course-color": courseColor, "--course-color-contrast": getContrastTextColor(courseColor) } as CSSProperties;
};

function parseScheduleDateParam(value: string | null) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return referenceToday;
  const date = createScheduleDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? referenceToday : date;
}

export function AcademicTermEditor({ open, onClose }: { open: boolean; onClose: () => void; title?: string }) {
  const { academicTerm, updateAcademicTerm } = useAppState(); const [form, setForm] = useState<AcademicTerm>(academicTerm); const [error, setError] = useState("");
  const save = (event: FormEvent) => { event.preventDefault(); const next = { ...form, level: form.level.trim(), term: form.term.trim(), academicYear: form.academicYear.trim(), label: form.label?.trim() }; if (!next.level || next.level.length > 60 || !next.term || next.term.length > 60 || !/^\d{4}$/.test(next.academicYear)) { setError("กรุณากรอกชั้นปีและภาคเรียนให้ครบ และระบุปีการศึกษา 4 หลัก"); return; } updateAcademicTerm(next); onClose(); };
  return <BottomSheet open={open} title="ข้อมูลภาคเรียน" onClose={onClose}><form className="form-grid" onSubmit={save}><Field label="ชั้น / ชั้นปี"><Input required maxLength={60} value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value })} placeholder="เช่น ชั้นปีที่ 2" /></Field><Field label="ภาคเรียน"><Input required maxLength={60} value={form.term} onChange={(event) => setForm({ ...form, term: event.target.value })} placeholder="เช่น ภาคเรียนที่ 1" /></Field><Field label="ปีการศึกษา"><Input required inputMode="numeric" maxLength={4} value={form.academicYear} onChange={(event) => setForm({ ...form, academicYear: event.target.value.replace(/\D/g, "") })} placeholder="2569" /></Field><Field label="ชื่อภาคเรียน (ไม่บังคับ)"><Input maxLength={60} value={form.label ?? ""} onChange={(event) => setForm({ ...form, label: event.target.value })} placeholder="เช่น ภาคต้น" /></Field>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button button-block" type="submit">บันทึกข้อมูลภาคเรียน</button></form></BottomSheet>;
}

function getCurrentMinute() { const now = new Date(); return now.getHours() * 60 + now.getMinutes(); }
function getScheduleForDate(schedules: ClassSchedule[], date: Date) { return schedules.filter((item) => item.day === mondayIndex(date)).sort((first, second) => first.startTime.localeCompare(second.startTime)); }
function getNextClass(schedules: ClassSchedule[], selectedDate: Date, currentMinute: number) {
  const selectedSchedules = getScheduleForDate(schedules, selectedDate);
  const isToday = sameScheduleDate(selectedDate, referenceToday);
  const nextToday = selectedSchedules.find((item) => timeToMinutes(item.startTime) > currentMinute);
  if (!isToday || nextToday) return { item: nextToday ?? selectedSchedules[0], dayOffset: 0 };
  for (let dayOffset = 1; dayOffset <= 7; dayOffset += 1) { const nextDay = getScheduleForDate(schedules, addScheduleDays(selectedDate, dayOffset))[0]; if (nextDay) return { item: nextDay, dayOffset }; }
  return { item: undefined, dayOffset: 0 };
}

function DateStrip({ selectedDate, onSelect }: { selectedDate: Date; onSelect: (date: Date) => void }) {
  const weekStart = startOfScheduleWeek(selectedDate);
  return <div className="schedule-date-strip" aria-label="เลือกวันในสัปดาห์">{Array.from({ length: 7 }, (_, index) => {
    const date = addScheduleDays(weekStart, index); const selected = sameScheduleDate(date, selectedDate); const today = sameScheduleDate(date, referenceToday);
    return <button key={date.toISOString()} type="button" className={`${selected ? "selected" : ""} ${today ? "today" : ""}`} aria-pressed={selected} onClick={() => onSelect(date)}><span>{formatThaiDay(date)}</span><strong>{date.getDate()}</strong></button>;
  })}</div>;
}

function EventCard({ item, onClick, compact = false, current = false }: { item: ClassSchedule; onClick: () => void; compact?: boolean; current?: boolean }) {
  return <button type="button" className={`schedule-event-card schedule-custom ${compact ? "compact" : ""} ${current ? "is-current" : ""}`} onClick={onClick} style={courseColorStyle(item.color)}>
    <SubjectIcon color={item.color}><GraduationCap /></SubjectIcon><span className="schedule-event-copy"><strong>{getScheduleDisplayName(item)}</strong><small>{item.startTime} – {item.endTime}</small><small><MapPin />{item.room}</small>{current && <em>กำลังเรียน</em>}</span>{!compact && <ChevronRight className="schedule-event-arrow" />}
  </button>;
}

function EmptySchedule({ title = "วันนี้ไม่มีคาบเรียน" }: { title?: string }) {
  return <Card className="schedule-empty"><span><GraduationCap /></span><h2>{title}</h2><p>เพิ่มคาบเรียนแรกเพื่อเริ่มจัดตารางของคุณ</p><Link className="primary-button" href="/schedule/new"><Plus />เพิ่มตารางเรียน</Link></Card>;
}

function FreeTime({ startTime, endTime, duration }: { startTime: string; endTime: string; duration: number }) {
  return <div className="free-time-gap"><Clock3 /><span><strong>ว่าง {formatScheduleDuration(duration)}</strong><small>{startTime} – {endTime}</small></span></div>;
}

function ScheduleSummary({ schedules, selectedDate, currentMinute }: { schedules: ClassSchedule[]; selectedDate: Date; currentMinute: number }) {
  const daySchedules = getScheduleForDate(schedules, selectedDate);
  const totalMinutes = daySchedules.reduce((total, item) => total + getClassDurationMinutes(item), 0);
  const next = getNextClass(schedules, selectedDate, currentMinute);
  const firstGap = getFreeTimeGaps(daySchedules)[0];
  const weekMinutes = schedules.reduce((total, item) => total + getClassDurationMinutes(item), 0);
  const busyDay = Array.from({ length: 7 }, (_, day) => ({ day, minutes: schedules.filter((item) => item.day === day).reduce((total, item) => total + getClassDurationMinutes(item), 0) })).sort((first, second) => second.minutes - first.minutes)[0];
  const nextText = next.item ? next.dayOffset === 1 ? `พรุ่งนี้ ${next.item.startTime}` : next.dayOffset > 1 ? `${formatThaiDay(addScheduleDays(selectedDate, next.dayOffset))} ${next.item.startTime}` : next.item.startTime : "—";
  return <aside className="schedule-summary"><Card><span className="schedule-summary-icon"><CalendarDays /></span><h2>สรุปวันนี้</h2><div><span><strong>{daySchedules.length}</strong> คาบเรียน</span><span><strong>{formatScheduleDuration(totalMinutes)}</strong> เวลาเรียนรวม</span><span><strong>{nextText}</strong> คาบถัดไป</span>{firstGap && <span><strong>{firstGap.startTime} – {firstGap.endTime}</strong> เวลาว่างถัดไป</span>}</div></Card><Card className="week-summary"><h2>สัปดาห์นี้</h2><p><strong>{schedules.length}</strong> คาบ · <strong>{formatScheduleDuration(weekMinutes)}</strong></p>{schedules.length ? <small>วันที่เรียนหนักที่สุด: <strong>{formatThaiWeekday(addScheduleDays(startOfScheduleWeek(referenceToday), busyDay.day))}</strong></small> : <small>ยังไม่มีตารางเรียนสำหรับสรุป</small>}</Card></aside>;
}

function ScheduleDayView({ selectedDate, schedules, onSelectDate, onSelectItem }: { selectedDate: Date; schedules: ClassSchedule[]; onSelectDate: (date: Date) => void; onSelectItem: (item: ClassSchedule) => void }) {
  const { language } = useLanguage();
  const [currentMinute, setCurrentMinute] = useState(getCurrentMinute);
  useEffect(() => { const interval = window.setInterval(() => setCurrentMinute(getCurrentMinute()), 60_000); return () => window.clearInterval(interval); }, []);
  const daySchedules = getScheduleForDate(schedules, selectedDate); const gaps = getFreeTimeGaps(daySchedules); const isToday = sameScheduleDate(selectedDate, referenceToday); const next = getNextClass(schedules, selectedDate, currentMinute);
  const hasCurrent = (item: ClassSchedule) => isToday && timeToMinutes(item.startTime) <= currentMinute && currentMinute < timeToMinutes(item.endTime);
  const currentLine = <div className="current-time-indicator" role="status" aria-label={language === "th" ? `เวลาปัจจุบัน ${String(Math.floor(currentMinute / 60)).padStart(2, "0")}:${String(currentMinute % 60).padStart(2, "0")}` : `Current time ${String(Math.floor(currentMinute / 60)).padStart(2, "0")}:${String(currentMinute % 60).padStart(2, "0")}`}><span><b>{language === "th" ? "ตอนนี้" : "Now"}</b> · {String(Math.floor(currentMinute / 60)).padStart(2, "0")}:{String(currentMinute % 60).padStart(2, "0")}</span><i /></div>;
  return <section className="schedule-day-view"><Card className="schedule-day-controls"><div className="schedule-date-title"><button type="button" aria-label="ก่อนหน้า" onClick={() => onSelectDate(addScheduleDays(selectedDate, -1))}><ChevronLeft /></button><strong>{formatThaiLongDate(selectedDate)}</strong><button type="button" aria-label="ถัดไป" onClick={() => onSelectDate(addScheduleDays(selectedDate, 1))}><ChevronRight /></button>{!isToday && <button className="schedule-today-button" type="button" aria-label="กลับไปวันนี้" onClick={() => onSelectDate(referenceToday)}>วันนี้</button>}</div><DateStrip selectedDate={selectedDate} onSelect={onSelectDate} /></Card><div className="schedule-day-layout"><div className="schedule-timeline" aria-label={`คาบเรียน ${formatThaiLongDate(selectedDate)}`}>{daySchedules.length ? daySchedules.map((item, index) => <div key={item.id}>{isToday && index === 0 && currentMinute < timeToMinutes(item.startTime) && currentLine}<div className="timeline-item"><time>{item.startTime}</time><span className="timeline-line schedule-custom" style={courseColorStyle(item.color)} /><EventCard item={item} current={hasCurrent(item)} onClick={() => onSelectItem(item)} /></div>{isToday && hasCurrent(item) && currentLine}{gaps.filter((gap) => gap.afterId === item.id).map((gap) => <FreeTime {...gap} key={gap.afterId} />)}{isToday && index === daySchedules.length - 1 && currentMinute >= timeToMinutes(item.endTime) && currentLine}</div>) : <EmptySchedule />}{isToday && !daySchedules.length && currentLine}</div><div className="day-next-card"><Card><small>คาบถัดไป</small>{next.item ? <><strong>{getScheduleDisplayName(next.item)}</strong><span>{next.dayOffset ? `คาบถัดไป${next.dayOffset === 1 ? "พรุ่งนี้" : formatThaiDay(addScheduleDays(selectedDate, next.dayOffset))}` : `${next.item.startTime} · ${next.item.room}`}</span>{next.dayOffset === 0 && timeToMinutes(next.item.startTime) > currentMinute && <em>อีก {formatScheduleDuration(timeToMinutes(next.item.startTime) - currentMinute)}</em>}</> : <strong>วันนี้ไม่มีคาบเรียนแล้ว</strong>}</Card></div><ScheduleSummary schedules={schedules} selectedDate={selectedDate} currentMinute={currentMinute} /></div></section>;
}

function ScheduleWeekView({ selectedDate, schedules, onSelectDate, onSelectItem }: { selectedDate: Date; schedules: ClassSchedule[]; onSelectDate: (date: Date) => void; onSelectItem: (item: ClassSchedule) => void }) {
  const [currentMinute, setCurrentMinute] = useState(getCurrentMinute);
  useEffect(() => { const timer = window.setInterval(() => setCurrentMinute(getCurrentMinute()), 60_000); return () => window.clearInterval(timer); }, []);
  const weekDates = getScheduleWeekDates(selectedDate);
  const isCurrentWeek = sameScheduleDate(startOfScheduleWeek(selectedDate), startOfScheduleWeek(referenceToday));
  const totalMinutes = schedules.reduce((sum, item) => sum + getClassDurationMinutes(item), 0);

  // Horizontal timeline range: 08:00 to 24:00 at minimum
  const range = getHorizontalTimetableRange(schedules);
  const totalRangeMinutes = Math.max(60, range.endMinutes - range.startMinutes);
  const hourMarkers = Array.from(
    { length: Math.floor(totalRangeMinutes / 60) + 1 },
    (_, index) => range.startMinutes + index * 60
  );

  return (
    <section className="schedule-week-view">
      <header className="schedule-week-controls">
        <button type="button" aria-label="ก่อนหน้า" onClick={() => onSelectDate(addScheduleDays(selectedDate, -7))}>
          <ChevronLeft />
        </button>
        <strong>{formatThaiWeekRange(selectedDate)}</strong>
        <button type="button" aria-label="ถัดไป" onClick={() => onSelectDate(addScheduleDays(selectedDate, 7))}>
          <ChevronRight />
        </button>
        <button
          type="button"
          className="schedule-today-button"
          aria-label="กลับไปวันนี้"
          onClick={() => onSelectDate(referenceToday)}
        >
          วันนี้
        </button>
        <small>สัปดาห์นี้ {schedules.length} คาบ · {formatScheduleDuration(totalMinutes)}</small>
      </header>

      <Card className="week-timetable-card">
        <div className="timetable-scroll-container">
          <div className="academic-timetable">
            {/* Sticky Header: Corner + Horizontal Time Axis */}
            <div className="timetable-header-row">
              <div className="timetable-corner-cell">
                <span>วัน \ เวลา</span>
              </div>
              <div className="timetable-time-axis">
                {hourMarkers.map((minute) => (
                  <span
                    key={minute}
                    className="timetable-time-marker"
                    style={{ left: `${getHorizontalTimelinePercent(minute, range)}%` }}
                  >
                    <span className="timetable-time-label">
                      {minute === 1440 ? "24:00" : `${String(Math.floor(minute / 60)).padStart(2, "0")}:00`}
                    </span>
                  </span>
                ))}
              </div>
            </div>

            {/* Canonical Day Rows: Monday (0) to Sunday (6) */}
            {weekDates.map((date, day) => {
              const daySchedules = schedules.filter((item) => item.day === day);
              const dayEvents = layoutHorizontalDay(daySchedules);
              const isToday = isCurrentWeek && sameScheduleDate(date, referenceToday);
              const isSelected = sameScheduleDate(date, selectedDate);
              const isWeekend = day === 5 || day === 6;
              const maxLanes = dayEvents.length ? Math.max(...dayEvents.map((e) => e.lanes)) : 1;
              const rowHeightStyle = maxLanes > 1 ? { minHeight: `${Math.max(76, maxLanes * 44)}px` } : undefined;

              return (
                <div
                  key={date.toISOString()}
                  className={`timetable-day-row ${isToday ? "is-today" : ""} ${isWeekend ? "is-weekend" : ""}`}
                  style={rowHeightStyle}
                >
                  {/* Sticky Day Header Cell */}
                  <button
                    type="button"
                    className={`timetable-day-header ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""}`}
                    onClick={() => onSelectDate(date)}
                    aria-label={`${formatThaiWeekday(date)}ที่ ${date.getDate()}`}
                    aria-pressed={isSelected}
                  >
                    <span className="day-name">{formatThaiWeekday(date)}</span>
                    <strong className="day-date">{date.getDate()}</strong>
                  </button>

                  {/* Horizontal Timeline Track */}
                  <div className="timetable-day-track">
                    {/* Background hour grid guides */}
                    <div className="timetable-grid-guides">
                      {hourMarkers.map((minute) => (
                        <span
                          key={minute}
                          className="timetable-grid-guide-line"
                          style={{ left: `${getHorizontalTimelinePercent(minute, range)}%` }}
                        />
                      ))}
                    </div>

                    {/* Current Time Indicator Line (if today) */}
                    {isToday && currentMinute >= range.startMinutes && currentMinute <= range.endMinutes && (
                      <span
                        className="timetable-current-time-line"
                        style={{ left: `${((currentMinute - range.startMinutes) / totalRangeMinutes) * 100}%` }}
                      />
                    )}

                    {/* Class Blocks */}
                    {dayEvents.map(({ item, lane, lanes }) => {
                      const pos = getHorizontalEventPosition(item, range);
                      const isCurrent = isToday && timeToMinutes(item.startTime) <= currentMinute && currentMinute < timeToMinutes(item.endTime);
                      const compact = pos.widthPercent < 12;

                      return (
                        <button
                          type="button"
                          key={item.id}
                          className={`timetable-class-block schedule-custom ${compact ? "is-compact" : ""} ${isCurrent ? "is-current" : ""}`}
                          aria-label={`${getScheduleDisplayName(item)} ${formatThaiLongDate(date)} ${item.startTime} ถึง ${item.endTime} ${item.room ?? ""}`}
                          onClick={() => onSelectItem(item)}
                          style={{
                            ...courseColorStyle(item.color),
                            left: pos.left,
                            width: pos.width,
                            top: lanes > 1 ? `calc(${lane * 100 / lanes}% + 3px)` : "4px",
                            height: lanes > 1 ? `calc(${100 / lanes}% - 6px)` : "calc(100% - 8px)",
                          }}
                        >
                          <div className="class-block-content">
                            <strong className="class-block-title">{getScheduleDisplayName(item)}</strong>
                            <div className="class-block-meta">
                              <span>{item.startTime}–{item.endTime}</span>
                              {item.room && !compact && <small>· {item.room}</small>}
                            </div>
                            {isCurrent && <span className="class-block-badge">กำลังเรียน</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {schedules.length === 0 && (
          <div className="week-empty-overlay">
            สัปดาห์นี้ยังไม่มีคาบเรียน <Link href="/schedule/new">เพิ่มคาบเรียน</Link>
          </div>
        )}
      </Card>
    </section>
  );
}


function ScheduleMonthView({ selectedDate, schedules, onSelectDate, onSelectItem }: { selectedDate: Date; schedules: ClassSchedule[]; onSelectDate: (date: Date) => void; onSelectItem: (item: ClassSchedule) => void }) {
  const [monthDate, setMonthDate] = useState(createScheduleDate(selectedDate.getFullYear(), selectedDate.getMonth(), 1)); const [filter, setFilter] = useState<string | null>(null); const [filterOpen, setFilterOpen] = useState(false);
  const dates = getMonthDates(monthDate); const subjects = Array.from(new Set(schedules.map((item) => getScheduleDisplayName(item)))); const selectedSchedules = getScheduleForDate(schedules, selectedDate).filter((item) => !filter || getScheduleDisplayName(item) === filter);
  const chooseDate = (date: Date) => { onSelectDate(date); if (date.getMonth() !== monthDate.getMonth()) setMonthDate(createScheduleDate(date.getFullYear(), date.getMonth(), 1)); };
  return <section className="schedule-month-view"><div className="month-view-heading"><button type="button" aria-label="ก่อนหน้า" onClick={() => setMonthDate(createScheduleDate(monthDate.getFullYear(), monthDate.getMonth() - 1, 1))}><ChevronLeft /></button><h2>{formatThaiMonth(monthDate)}</h2><button type="button" aria-label="ถัดไป" onClick={() => setMonthDate(createScheduleDate(monthDate.getFullYear(), monthDate.getMonth() + 1, 1))}><ChevronRight /></button><button type="button" className="month-today" aria-label="กลับไปวันนี้" onClick={() => chooseDate(referenceToday)}>วันนี้</button></div><button type="button" className="subject-filter-button" onClick={() => setFilterOpen(true)}>กรองรายวิชา{filter && <span>{filter}</span>}</button><Card className="schedule-month-grid"><div className="month-weekdays">{days.map((day) => <span key={day}>{day}</span>)}</div><div className="month-days">{dates.map((date) => { const isCurrentMonth = date.getMonth() === monthDate.getMonth(); const isToday = sameScheduleDate(date, referenceToday); const isSelected = sameScheduleDate(date, selectedDate); const events = getScheduleForDate(schedules, date).filter((item) => !filter || getScheduleDisplayName(item) === filter); return <button key={date.toISOString()} type="button" onClick={() => chooseDate(date)} className={`${isCurrentMonth ? "" : "outside-month"} ${isToday ? "today" : ""} ${isSelected ? "selected" : ""}`} aria-label={formatThaiLongDate(date)} aria-pressed={isSelected}><span className="month-date-number">{date.getDate()}</span><span className="month-event-dots">{events.slice(0, 3).map((item) => <i className="schedule-custom" style={courseColorStyle(item.color)} key={item.id} title={getScheduleDisplayName(item)} />)}{events.length > 3 && <b>+{events.length - 3}</b>}</span><span className="month-event-names">{events.slice(0, 2).map((item) => <small className="schedule-custom" style={courseColorStyle(item.color)} key={item.id}>{getScheduleDisplayName(item)}</small>)}</span></button>; })}</div></Card><section className="selected-date-agenda"><header><p>{formatThaiLongDate(selectedDate)}</p><small>{selectedSchedules.length} คาบเรียน</small></header>{selectedSchedules.length ? <div>{selectedSchedules.map((item) => <EventCard key={item.id} item={item} compact onClick={() => onSelectItem(item)} />)}</div> : <EmptySchedule />}</section><BottomSheet open={filterOpen} title="กรองรายวิชา" onClose={() => setFilterOpen(false)}><div className="subject-filter-list"><button type="button" className={!filter ? "selected" : ""} onClick={() => { setFilter(null); setFilterOpen(false); }}>ทั้งหมด</button>{subjects.map((subject) => <button type="button" key={subject} className={filter === subject ? "selected" : ""} onClick={() => { setFilter(subject); setFilterOpen(false); }}>{subject}</button>)}{filter && <button type="button" className="filter-clear" onClick={() => { setFilter(null); setFilterOpen(false); }}>ล้างตัวกรอง</button>}</div></BottomSheet></section>;
}

function ClassDetail({ item, selectedDate, onClose, onEdit, onDuplicate, onDelete }: { item: ClassSchedule; selectedDate: Date; onClose: () => void; onEdit: () => void; onDuplicate: () => void; onDelete: () => void }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  return <div className="class-detail"><span className="class-detail-icon schedule-custom" style={courseColorStyle(item.color)}><CalendarDays /></span><h3>{getScheduleDisplayName(item)}</h3>{item.courseCode && <p className="class-detail-code">รหัสวิชา: <strong>{item.courseCode}</strong></p>}<p>{item.note || "ยังไม่มีหมายเหตุเพิ่มเติม"}</p><div><span><Clock3 />{item.startTime}–{item.endTime} · {formatScheduleDuration(getClassDurationMinutes(item))}</span><span><MapPin />{item.room}</span><span><UserRound />{item.teacher}</span><span><CalendarDays />{formatThaiLongDate(selectedDate)}</span>{item.section && <span>Section {item.section}</span>}{typeof item.credits === "number" && <span>{item.credits} หน่วยกิต</span>}</div>{confirmingDelete ? <div className="delete-confirm"><p>ต้องการลบคาบเรียนนี้หรือไม่?</p><button className="secondary-button" type="button" onClick={() => setConfirmingDelete(false)}>ยกเลิก</button><button className="danger-button" type="button" onClick={onDelete}>ลบคาบเรียน</button></div> : <div className="class-detail-actions"><button className="secondary-button" type="button" onClick={onEdit}><Pencil />แก้ไข</button><button className="secondary-button" type="button" onClick={onDuplicate}><Copy />คัดลอกคาบเรียน</button><button className="text-danger-button" type="button" onClick={() => setConfirmingDelete(true)}><Trash2 />ลบคาบเรียน</button></div>}<button className="primary-button button-block" type="button" onClick={onClose}>รับทราบ</button></div>;
}

export function SchedulePage() {
  const router = useRouter(); const params = useSearchParams(); const initialDate = parseScheduleDateParam(params.get("date")); const { schedules, addSchedule, deleteSchedule, academicTerm } = useAppState(); const [view, setView] = useState<ScheduleView>("วัน"); const [selectedDate, setSelectedDate] = useState(initialDate); const [selectedItem, setSelectedItem] = useState<ClassSchedule | null>(null); const [quickAddOpen, setQuickAddOpen] = useState(false); const [termOpen, setTermOpen] = useState(false); const [quickForm, setQuickForm] = useState({ name: "", room: "", day: mondayIndex(initialDate), startTime: "08:30", endTime: "10:00" }); const [quickError, setQuickError] = useState("");
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.info("[TALEVO Stored Schedules Diagnostic]", {
        origin: "existing-stored-schedule-records",
        count: schedules.length,
        records: schedules.map((s) => ({
          courseCode: s.courseCode ?? null,
          day: s.day,
          time: `${s.startTime}–${s.endTime}`,
          room: s.room,
        })),
      });
    }
  }, [schedules]);
  const saveQuickClass = () => { if (!quickForm.name.trim()) { setQuickError("กรุณากรอกชื่อวิชา"); return; } if (!isValidAcademicTimeRange(quickForm.startTime, quickForm.endTime)) { setQuickError("เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม และใช้ 24:00 ได้เฉพาะเวลาสิ้นสุด"); return; } const conflict = findScheduleConflict(schedules, quickForm); if (conflict) { setQuickError(`เวลานี้ชนกับคาบ ${conflict.name} ${conflict.startTime}–${conflict.endTime}`); return; } addSchedule({ ...quickForm, teacher: "ยังไม่ระบุ", room: quickForm.room.trim() || "ยังไม่ระบุ", color: "purple", note: "" }); setQuickAddOpen(false); setQuickError(""); };
  return <div className={`page schedule-page schedule-page-${view}`}><div className="schedule-heading"><div className="page-intro"><h1>ตารางเรียน</h1><p>จัดการเวลาเรียนของคุณให้เป็นระบบ</p><button type="button" className="academic-term-summary" onClick={() => setTermOpen(true)}>{formatAcademicTermSummary(academicTerm)}<span>แก้ไขข้อมูลภาคเรียน</span></button></div><div className="schedule-heading-actions"><SyllabusScanner /><Link className="desktop-add-button primary-button" href="/schedule/new"><Plus /> เพิ่มคาบเรียน</Link></div></div><div className="segmented-control schedule-view-switcher" role="tablist" aria-label="เลือกรูปแบบตาราง">{(["วัน", "สัปดาห์", "เดือน"] as const).map((label) => <button key={label} role="tab" aria-selected={view === label} className={view === label ? "active" : ""} onClick={() => setView(label)}>{label}</button>)}</div>{view === "วัน" ? <ScheduleDayView selectedDate={selectedDate} schedules={schedules} onSelectDate={setSelectedDate} onSelectItem={setSelectedItem} /> : view === "สัปดาห์" ? <ScheduleWeekView selectedDate={selectedDate} schedules={schedules} onSelectDate={setSelectedDate} onSelectItem={setSelectedItem} /> : <ScheduleMonthView selectedDate={selectedDate} schedules={schedules} onSelectDate={setSelectedDate} onSelectItem={setSelectedItem} />}<button type="button" className="floating-add" aria-label="เพิ่มคาบเรียน" onClick={() => setQuickAddOpen(true)}><Plus /></button><AcademicTermEditor open={termOpen} title="รายละเอียดคาบเรียน" onClose={() => setTermOpen(false)} /><BottomSheet open={selectedItem !== null} title="รายละเอียดคาบเรียน" onClose={() => setSelectedItem(null)}>{selectedItem && <ClassDetail item={selectedItem} selectedDate={selectedDate} onClose={() => setSelectedItem(null)} onEdit={() => router.push(`/schedule/new?edit=${selectedItem.id}`)} onDuplicate={() => router.push(`/schedule/new?duplicate=${selectedItem.id}`)} onDelete={() => { deleteSchedule(selectedItem.id); setSelectedItem(null); }} />}</BottomSheet><BottomSheet open={quickAddOpen} title="เพิ่มคาบเรียน" onClose={() => setQuickAddOpen(false)}><div className="quick-class-form"><p>เพิ่มแบบรวดเร็ว</p><Field label="ชื่อวิชา"><Input value={quickForm.name} onChange={(event) => setQuickForm({ ...quickForm, name: event.target.value })} /></Field><Field label="ห้อง (ไม่บังคับ)"><Input value={quickForm.room} onChange={(event) => setQuickForm({ ...quickForm, room: event.target.value })} /></Field><Field label="วัน"><div className="day-picker" role="radiogroup">{days.map((day, index) => <button type="button" role="radio" aria-checked={quickForm.day === index} className={quickForm.day === index ? "selected" : ""} key={day} onClick={() => setQuickForm({ ...quickForm, day: index })}>{day}</button>)}</div></Field><div className="form-two"><Field label="เวลาเริ่ม"><Input type="time" value={quickForm.startTime} onChange={(event) => setQuickForm({ ...quickForm, startTime: event.target.value })} /></Field><Field label="เวลาสิ้นสุด"><AcademicEndTimeInput value={quickForm.endTime} onChange={(endTime) => setQuickForm({ ...quickForm, endTime })} /></Field></div>{quickError && <p className="form-error" role="alert">{quickError}</p>}<button className="primary-button button-block" type="button" onClick={saveQuickClass}>บันทึกคาบเรียน</button><Link href="/schedule/new" onClick={() => setQuickAddOpen(false)}>กรอกรายละเอียดเพิ่มเติม</Link></div></BottomSheet></div>;
}

function createFormFromSchedule(source?: ClassSchedule): NewClassInput {
  return source
    ? {
        name: source.name || (source.courseCode ?? ""),
        courseCode: source.courseCode ?? "",
        teacher: source.teacher,
        room: source.room,
        day: source.day,
        startTime: source.startTime,
        endTime: source.endTime,
        color: normalizeTalevoColor(source.color),
        note: source.note ?? "",
        section: source.section ?? "",
        credits: source.credits,
      }
    : {
        name: "",
        courseCode: "",
        teacher: "",
        room: "",
        day: 0,
        startTime: "08:30",
        endTime: "10:00",
        color: defaultTalevoColor,
        note: "",
        section: "",
        credits: undefined,
      };
}

export function AddClassPage() {
  const router = useRouter(); const params = useSearchParams(); const { schedules, addSchedule, updateSchedule, academicTerm } = useAppState(); const { t } = useLanguage(); const editId = params.get("edit"); const sourceId = editId ?? params.get("duplicate"); const source = schedules.find((item) => item.id === sourceId); const [form, setForm] = useState<NewClassInput>(() => createFormFromSchedule(source)); const formRef = useRef(form); const [error, setError] = useState(""); const [conflict, setConflict] = useState<ClassSchedule | null>(null); const [allowConflict, setAllowConflict] = useState(false); const [termOpen, setTermOpen] = useState(false);
  const changeForm = (value: NewClassInput) => { formRef.current = value; setForm(value); setConflict(null); setAllowConflict(false); };
  const updateForm = (value: Partial<NewClassInput>) => changeForm({ ...formRef.current, ...value });
  const save = (event?: FormEvent) => { event?.preventDefault(); const currentForm = formRef.current; if (!currentForm.name.trim() || !currentForm.teacher.trim() || !currentForm.room.trim()) { setError("กรุณากรอกชื่อวิชา อาจารย์ผู้สอน และห้องเรียนให้ครบ"); return; } if (!isValidAcademicTimeRange(currentForm.startTime, currentForm.endTime)) { setError("เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม และใช้ 24:00 ได้เฉพาะเวลาสิ้นสุด"); return; } const overlapping = findScheduleConflict(schedules, currentForm, editId ?? undefined); if (overlapping && !allowConflict) { setConflict(overlapping); setError(""); return; } if (editId) updateSchedule(editId, currentForm); else addSchedule(currentForm); router.push("/schedule"); };
  return <div className="page form-page"><PageHeader title={editId ? "แก้ไขคาบเรียน" : "เพิ่มคาบเรียน"} backHref="/schedule" action="บันทึก" onAction={() => save()} /><Card className="term-form-context"><div><small>ภาคเรียนปัจจุบัน</small><strong>{formatAcademicTermSummary(academicTerm)}</strong></div><button type="button" className="secondary-button" onClick={() => setTermOpen(true)}>แก้ไข</button></Card><Card className="form-card"><div className="form-decor"><CalendarDays /><div><strong>{editId ? "ปรับรายละเอียดคาบเรียน" : "สร้างจังหวะการเรียน"}</strong><span>{params.get("duplicate") ? "ตรวจวันและเวลาใหม่ก่อนบันทึก" : "เพิ่มข้อมูลคาบเรียนให้ครบในครั้งเดียว"}</span></div></div><form className="form-grid" onSubmit={save}><Field label="ชื่อวิชา"><Input value={form.name} onChange={(event) => updateForm({ name: event.target.value })} placeholder="เช่น การออกแบบการเรียนรู้" /></Field><Field label="รหัสวิชา (ไม่บังคับ)"><Input value={form.courseCode ?? ""} onChange={(event) => updateForm({ courseCode: event.target.value })} placeholder="เช่น 0537212" /></Field><Field label="อาจารย์ผู้สอน"><Input value={form.teacher} onChange={(event) => updateForm({ teacher: event.target.value })} placeholder="ชื่ออาจารย์" /></Field><Field label="ห้องเรียน"><Input value={form.room} onChange={(event) => updateForm({ room: event.target.value })} placeholder="เช่น ห้อง 320" /></Field><div className="form-two"><Field label="Section (ไม่บังคับ)"><Input value={form.section ?? ""} onChange={(event) => updateForm({ section: event.target.value })} placeholder="เช่น 1" /></Field><Field label="หน่วยกิต (ไม่บังคับ)"><Input type="number" min="0" value={form.credits ?? ""} onChange={(event) => updateForm({ credits: event.target.value === "" ? undefined : Number(event.target.value) })} placeholder="เช่น 3" /></Field></div><Field label="วัน"><div className="day-picker" role="radiogroup">{days.map((day, index) => <button type="button" role="radio" aria-checked={form.day === index} className={form.day === index ? "selected" : ""} key={day} onClick={() => updateForm({ day: index })}>{day}</button>)}</div></Field><div className="form-two"><Field label="เวลาเริ่ม"><Input type="time" value={form.startTime} onChange={(event) => updateForm({ startTime: event.target.value })} /></Field><Field label="เวลาสิ้นสุด"><AcademicEndTimeInput value={form.endTime} onChange={(endTime) => updateForm({ endTime })} /></Field></div><Field label={t("schedule.courseColor")}><TalevoColorPicker value={form.color} onChange={(color) => updateForm({ color })} title={t("schedule.chooseCourseColor")} previewLabel={t("schedule.courseColor")} triggerLabel={t("schedule.changeColor")} /></Field><Field label="เพิ่มเติม (ไม่บังคับ)"><Textarea value={form.note} onChange={(event) => updateForm({ note: event.target.value })} placeholder="รายละเอียดที่อยากจำ เช่น เอกสารที่ต้องเตรียม" /></Field>{error && <p className="form-error" role="alert">{error}</p>}{conflict && <div className="schedule-conflict" role="alert"><strong>เวลานี้ชนกับคาบ {conflict.name} {conflict.startTime}–{conflict.endTime}</strong><span>แนะนำให้แก้เวลาเพื่อให้ตารางเรียนชัดเจน</span><button type="button" onClick={() => setAllowConflict(true)}>บันทึกต่อไป</button></div>}<button className="primary-button button-block" type="submit">{editId ? "บันทึกการแก้ไข" : "บันทึกคาบเรียน"}</button></form></Card><AcademicTermEditor open={termOpen} onClose={() => setTermOpen(false)} /></div>;
}
