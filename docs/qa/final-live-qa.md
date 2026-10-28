# TALEVO Final Authenticated Live QA

ใช้ checklist นี้หลังผู้ใช้พร้อม Login เท่านั้น งานทั้งหมดเป็น non-destructive: ห้ามลบข้อมูล, seed/import fixture, deploy SQL หรือเปิด Global Import

## เตรียมทดสอบ

- [ ] เปิด production-like build ของ source ล่าสุด
- [ ] ใช้บัญชี QA ที่ผู้ใช้อนุญาต ไม่ใช้บัญชีจริงที่มีข้อมูลสำคัญ
- [ ] ตรวจ Desktop `1366x768` และ Mobile `390x844`
- [ ] บันทึก console error, network error และ horizontal overflow โดยไม่บันทึก token/ข้อมูลส่วนตัว

## Authentication และ isolation

- [ ] Logged out เปิด `/today` แล้วไป `/login` พร้อมข้อความ session ที่เข้าใจง่าย ไม่มี redirect loop
- [ ] Login สำเร็จและ session restore หลัง refresh
- [ ] Logout แล้วหน้า protected ไม่แสดงข้อมูลบัญชีเดิมระหว่าง redirect
- [ ] สลับ QA A → QA B แล้ว B ไม่เห็น tasks, finance, AI history หรือ notifications ของ A
- [ ] Session expiry แสดง “เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง” และไม่ล้าง local v8/backup

## Routes (ทั้ง Mobile และ Desktop)

- [ ] `/today`
- [ ] `/schedule`
- [ ] `/tasks`
- [ ] `/exams`
- [ ] `/grades`
- [ ] `/statistics`
- [ ] `/finance`
- [ ] `/ai`
- [ ] `/notifications`
- [ ] `/profile`
- [ ] `/settings`
- [ ] `/help`
- [ ] `/admin` (normal user ถูกปฏิเสธ; admin เท่านั้น)
- [ ] `/admin/users` (admin เท่านั้น ไม่มี domain data)

ทุก route ตรวจ: ไม่มี runtime/hydration error, ไม่มี asset 404, ไม่มี overflow, focus มองเห็น, touch target ใช้ได้, long Thai/English content ไม่ดัน action หลุดจอ และ back navigation ไม่เป็น dead end

## Non-destructive interactions

- [ ] Navigation, tabs และ back ทำงาน
- [ ] เปิด/ปิด Add/Edit dialog โดยไม่กด Save
- [ ] Bottom Sheet เปิด ปิดด้วยปุ่ม/Escape และคืน focus
- [ ] Search/filter/pagination ด้วยข้อความที่ไม่มีข้อมูลส่วนตัว
- [ ] Toggle ที่ reversible แล้วคืนค่าเดิม
- [ ] Date/time controls เปิดและ Cancel ได้
- [ ] AI composer: ทดสอบ empty/disabled/error UI เท่านั้น เว้นแต่ผู้ใช้อนุญาต provider call
- [ ] Finance Pocket: อ่าน summary และเปิด form แบบ Cancel เท่านั้น; สูตร `income - expense - savings` ตรงข้อมูลเดิม
- [ ] Syllabus modal: เปิดแล้ว Cancel; ไม่เลือกไฟล์และไม่ Import

## Failure/recovery

- [ ] Offline/slow network หยุด loading และมี Retry โดย local data ไม่หาย
- [ ] 401/expired session ไม่วน redirect
- [ ] 500/route error ใช้ข้อความไทยปลอดภัย ไม่มี stack/SQL/provider detail
- [ ] Toast ไม่บัง bottom navigation/composer และ critical error ไม่หายเร็วเกินไป

## Admin scope

- [ ] Anonymous ถูกปฏิเสธก่อน payload
- [ ] Normal user ได้ 404/denied และไม่เห็น admin payload ใน Network
- [ ] Admin เห็นเฉพาะ account/profile directory; ไม่มี tasks, exams, schedule, grades, finance, notes, notifications, AI chat, attachments, passwords หรือ tokens
- [ ] Admin search/pagination ทำงานและ response เป็น `private, no-store`

## Pass gate

- [ ] Known Critical Security = 0
- [ ] Known High Security = 0
- [ ] Known Critical/High Functional = 0
- [ ] Known Critical/High UX = 0
- [ ] เก็บหลักฐาน route/viewport ที่เปิดจริง โดยไม่เปิดเผยข้อมูลส่วนตัว
