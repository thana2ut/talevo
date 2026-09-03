import { normalizeTimetableText } from "@/lib/timetable/text-normalizer";

const WEEKDAYS: Array<[RegExp, number]> = [
  [/^(?:วัน)?(?:จันทร์|จนทร์)$|^จ\.?$|^mon(?:day)?$/iu, 0],
  [/^(?:วัน)?(?:อังคาร|องัคาร)$|^อ\.?$|^tue(?:sday)?$/iu, 1],
  [/^(?:วัน)?พุธ$|^พ\.?$|^wed(?:nesday)?$/iu, 2],
  [/^(?:วัน)?(?:พฤหัสบดี|พฤหัส|พฤห\.?)$|^พฤ\.?$|^thu(?:rsday)?$/iu, 3],
  [/^(?:วัน)?ศุกร์$|^ศ\.?$|^fri(?:day)?$/iu, 4],
  [/^(?:วัน)?เสาร์$|^ส\.?$|^sat(?:urday)?$/iu, 5],
  [/^(?:วัน)?อาทิตย์$|^อา\.?$|^sun(?:day)?$/iu, 6],
];

export function parseWeekday(value: string) {
  const text = normalizeTimetableText(value);
  return WEEKDAYS.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

export function countWeekdays(values: string[]) {
  return new Set(values.map(parseWeekday).filter((day): day is number => day !== null)).size;
}
