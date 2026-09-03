import type { AcademicTerm, ClassSchedule, Course, Task } from "@/types";
import { getScheduleDisplayName } from "@/lib/schedule-utils";

const weekdayLabels = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."];

export interface ScheduleCourse extends Course {
  schedules: ClassSchedule[];
}

/**
 * The prototype keeps only the active term's schedule in AppState.  Courses
 * are therefore derived from that schedule and deduplicated by courseId.
 */
export function getCurrentTermCourses(schedules: ClassSchedule[], _academicTerm?: AcademicTerm): ScheduleCourse[] {
  void _academicTerm;
  const courses = new Map<string, ScheduleCourse>();
  schedules.forEach((schedule) => {
    const current = courses.get(schedule.courseId);
    if (current) {
      current.schedules.push(schedule);
      return;
    }
    courses.set(schedule.courseId, {
      id: schedule.courseId,
      name: getScheduleDisplayName(schedule),
      teacher: schedule.teacher,
      room: schedule.room,
      color: schedule.color,
      schedules: [schedule],
    });
  });
  return [...courses.values()].map((course) => ({ ...course, schedules: [...course.schedules].sort((first, second) => first.day - second.day || first.startTime.localeCompare(second.startTime)) }));
}

export function getCourseById(schedules: ClassSchedule[], courseId?: string) {
  return courseId ? getCurrentTermCourses(schedules).find((course) => course.id === courseId) : undefined;
}

export function getCourseScheduleSummary(course: Pick<ScheduleCourse, "schedules">) {
  const slots = course.schedules.slice(0, 2).map((schedule) => `${weekdayLabels[schedule.day]} ${schedule.startTime}${course.schedules.length === 1 ? `–${schedule.endTime} · ${schedule.room}` : ""}`);
  return `${slots.join(" · ")}${course.schedules.length > 2 ? ` · +${course.schedules.length - 2}` : ""}`;
}

export function getTaskCourseLabel(task: Pick<Task, "courseId">, schedules: ClassSchedule[]) {
  const course = getCourseById(schedules, task.courseId);
  if (course) return course.name;
  return task.courseId ? "วิชาถูกนำออกจากตารางเรียน" : "งานทั่วไป";
}
