# ถอดระบบนำเข้าแผนรายวิชา

วันที่ 16 พฤศจิกายน 2569

## ขอบเขต

- ลบเมนูนำเข้าแผนรายวิชาจากรายการร่วมของคอมพิวเตอร์ แท็บเล็ต และมือถือ รวมปุ่มลัดในหน้าตารางเรียน
- ลบหน้า `/syllabus` และ API `/api/learning/syllabus/analyze`, `/api/learning/syllabus/import` ทั้งส่วนอ่านประวัติ วิเคราะห์ และยืนยันนำเข้า
- ลบตัวอ่าน PDF/DOCX/ภาพและโครงสร้างข้อมูลที่ใช้เฉพาะแผนรายวิชา รวมรูปแบบหน้าจอ คำแปล และแพ็กเกจ `fflate` ที่ไม่มีระบบอื่นใช้
- ปรับสคริปต์ตรวจสอบเดิมให้เหลือส่วน Rescue และนาฬิกาที่ใช้งานอยู่ โดยไม่ได้รันชุดทดสอบ
- คงระบบนำเข้าตารางเรียนจากเอกสาร นำงานเข้าจากภาพ คำนวณคะแนน และโหมดกู้สถานการณ์ไว้

## ไฟล์แอปที่แก้

- `src/components/app-shell.tsx`
- `src/features/schedule/schedule-pages.tsx`
- `src/features/learning/learning.css`
- `src/lib/security/api-guard.ts`
- `src/lib/security/payload.ts`
- `src/lib/supabase/proxy.ts`
- `src/lib/ui-translations.en.json`
- `package.json`, `package-lock.json`

## ไฟล์ที่ลบ

- `src/app/syllabus/page.tsx`
- `src/features/learning/syllabus-page.tsx`
- `src/app/api/learning/syllabus/analyze/route.ts`
- `src/app/api/learning/syllabus/import/route.ts`
- `src/lib/learning-syllabus.ts`
- `src/lib/learning-documents.ts`

## ฐานข้อมูล: ยังไม่ได้ดำเนินการ

เตรียม SQL แยกที่ `supabase/manual/remove-course-syllabus-import.sql` สำหรับให้ต้าตรวจสอบก่อนรันจริง ไม่มีการแก้ไฟล์ migration ที่เคยนำขึ้นระบบแล้ว

เมื่ออนุมัติและนำ SQL นี้ไปรัน จะลบฟังก์ชัน `import_learning_syllabus`, ตารางประวัติ `learning_syllabi` รวมข้อมูลหัวข้อและหลักฐานเอกสาร และการแจ้งเตือนที่ฟังก์ชันนี้สร้างไว้ การลบประวัติและเอกสารส่วนนี้เป็นการลบถาวร

SQL ไม่ลบคาบเรียน งาน การสอบ หรือข้อมูลคะแนนที่เคยนำเข้า และไม่เปลี่ยนตารางหรือสิทธิ์ของระบบอื่น ใช้ธุรกรรมเดียวและ `RESTRICT` เพื่อหยุดหากพบส่วนอื่นอ้างอิงสิ่งที่จะลบอยู่

จนกว่าจะอนุมัติ SQL ข้อมูลประวัติและฟังก์ชันในฐานข้อมูลจริงจะยังคงอยู่ แม้หน้าและ API ของแอปถูกลบแล้ว

## การนำขึ้นใช้งาน

ยังไม่ได้ commit, push หรือเผยแพร่ขึ้นเว็บจริง การเปิดเว็บระหว่างงานนี้เป็นการรันจากโค้ดในเครื่อง

## ผลตรวจและเว็บที่เปิด

- `npm run lint`: ผ่าน ไม่มีข้อผิดพลาดหรือคำเตือน
- `npm run build`: ผ่าน รวมการตรวจ TypeScript; รายการเส้นทางไม่มี `/syllabus` หรือ `/api/learning/syllabus/*`
- `git diff --check`: ผ่าน มีเพียงคำเตือน LF/CRLF ตามปกติบน Windows
- ตรวจ `git status`: งานเดิมของผู้ใช้ยังคงอยู่ ไม่มีการ commit หรือ push
- ไม่ได้รันชุดทดสอบ, migration หรือ seed และไม่ได้อ่านหรือแก้ค่าใน `.env.local`
- เปิดเซิร์ฟเวอร์ในเครื่องที่ `http://127.0.0.1:3000` และเปิดหน้า `/welcome` ใน Edge ไว้ให้ใช้งานต่อ
- ไม่เปลี่ยนระบบยืนยันตัวตนหรือสิทธิ์ฐานข้อมูลของฟีเจอร์อื่น ส่วนล้างฐานข้อมูลจริงยังรอการตรวจและอนุมัติ SQL
