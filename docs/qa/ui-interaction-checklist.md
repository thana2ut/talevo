# UI และ Interaction QA Checklist

ใช้รายการนี้ก่อนส่งงาน UI ที่กระทบหน้าหลักหรือฟอร์ม เพื่อให้ตรวจได้กับข้อมูลจริงโดยไม่ต้องสร้างข้อมูลทดสอบใหม่

## ทุก route

- เปิดแต่ละ route หลัก: Welcome, Auth, Today, Schedule, Tasks, Exams, Grades, Statistics, Finance, AI, Notifications, Profile, Settings, Help และ Notes
- ตรวจว่ามีหัวข้อที่สื่อความหมาย, ไม่มีหน้า 404 หรือหน้าว่าง, และไม่มี console error
- ตรวจ viewport 320px, 768px และ desktop ว่า `document.documentElement.scrollWidth` ไม่เกิน `clientWidth`
- ตรวจลำดับ Tab, focus ที่เห็นชัด, ปุ่ม icon มี accessible name และข้อความสำคัญไม่พึ่งสีอย่างเดียว

## ปุ่มและลิงก์

- ทุก CTA ต้องนำทาง, เปิด dialog/BottomSheet หรือเปลี่ยน state พร้อม feedback ที่เห็นได้
- ปุ่มที่ยังใช้ไม่ได้ตามเงื่อนไขต้อง `disabled` และสื่อเหตุผลด้วย label หรือข้อความใกล้เคียง
- ปุ่มทำลายข้อมูลต้องขอการยืนยันก่อนลบ และปุ่มยกเลิกต้องปิด dialog โดยไม่เปลี่ยนข้อมูล
- ลิงก์ใน Quick Add, empty state, Welcome, sidebar และ card ที่คลิกได้ต้องชี้ไป route ที่มีอยู่จริง

## ฟอร์ม

- ข้อมูลจำเป็นต้องมี `required` หรือ error แบบ inline ที่ผูกกับฟิลด์/ฟอร์ม
- ตรวจกรณีข้อมูลว่าง, รูปแบบไม่ถูกต้อง, จำนวนติดลบ/ศูนย์ และช่วงวันเวลาที่ไม่สมเหตุผล
- เมื่อบันทึกสำเร็จ ต้องนำทางหรือแสดงสถานะสำเร็จอย่างชัดเจน; เมื่อผิดพลาดต้องไม่เงียบ
- ตรวจ mobile keyboard, select, datetime-local, file picker และการปิด BottomSheet ด้วย Escape/ปุ่มปิด

## ข้อมูลและ responsive

- ใช้ข้อมูลจาก AppState จริงและสีรายวิชาจาก source of truth เดิม
- ตรวจ empty state, loading state และรายการยาว
- ตรวจ card/grid, progress bar, chart และ dialog ไม่ล้นหรือชนกันที่ 320px, 768px และ desktop
- หลังเปลี่ยนข้อมูลที่อนุญาต ให้ refresh เพื่อตรวจ persistence และตรวจว่าการยกเลิกไม่บันทึกข้อมูล

## คำสั่งก่อนส่งงาน

```powershell
npm run lint
npm run typecheck
npm run qa:alerts
npm run qa:persistence
npm run qa:notifications
npm run qa:academic
npm run qa:exam-date-time
npm run qa:statistics
npm run qa:submission
npm run qa:submission:e2e
npm run build
git diff --check
git status
```
