/** Returns the Smart Today greeting for a date in the browser's local timezone. */
export function getGreetingByLocalTime(date: Date): string {
  const hour = date.getHours();

  if (hour >= 5 && hour < 12) return "อรุณสวัสดิ์";
  if (hour >= 12 && hour < 17) return "สวัสดีตอนบ่าย";
  if (hour >= 17 && hour < 22) return "สวัสดีตอนเย็น";
  return "สวัสดี";
}
