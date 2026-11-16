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

ไฟล์สคริปต์ที่ปรับตามการลบฟีเจอร์: `scripts/qa-auth.cjs`, `scripts/qa-learning-tools.cjs`, `scripts/qa-learning-postgres.cjs`, `scripts/qa-learning-responsive.cjs` โดยไม่ได้รันสคริปต์เหล่านี้

เอกสารเดิมที่เพิ่มหมายเหตุ: `docs/learning-tools-release.md` และ Next.js ปรับระดับหัวข้อใน `AGENTS.md` ให้อัตโนมัติเมื่อเปิดเซิร์ฟเวอร์

ไฟล์ที่สร้าง: เอกสารฉบับนี้, `supabase/manual/remove-course-syllabus-import.sql` และ `supabase/migrations/20261116073903_remove_course_syllabus_import.sql`

## ไฟล์ที่ลบ

- `src/app/syllabus/page.tsx`
- `src/features/learning/syllabus-page.tsx`
- `src/app/api/learning/syllabus/analyze/route.ts`
- `src/app/api/learning/syllabus/import/route.ts`
- `src/lib/learning-syllabus.ts`
- `src/lib/learning-documents.ts`

## ฐานข้อมูล: ดำเนินการแล้ว

ต้าอนุมัติให้ดำเนินการหลังตรวจ SQL ที่ `supabase/manual/remove-course-syllabus-import.sql` และนำไปใช้กับฐานข้อมูลจริง `talevo-sg` แล้วในวันที่ 16 พฤศจิกายน 2569 ไม่มีการแก้ SQL ของ migration เดิมที่เคยนำขึ้นระบบ

ลบฟังก์ชัน `import_learning_syllabus` และตารางประวัติ `learning_syllabi` รวมข้อมูลหัวข้อและหลักฐานเอกสารแล้ว ก่อนลบตรวจพบประวัติ 0 รายการและการแจ้งเตือนของระบบนี้ 0 รายการ

SQL ไม่ลบคาบเรียน งาน การสอบ หรือข้อมูลคะแนนที่เคยนำเข้า และไม่เปลี่ยนตารางหรือสิทธิ์ของระบบอื่น ใช้ธุรกรรมเดียวและ `RESTRICT` เพื่อหยุดหากพบส่วนอื่นอ้างอิงสิ่งที่จะลบอยู่

ผลตรวจหลังดำเนินการ: ตารางและฟังก์ชันของแผนรายวิชาไม่เหลืออยู่ จำนวนข้อมูลระบบอื่นก่อนและหลังเท่าเดิม ได้แก่ คาบเรียน 22 รายการ งาน 1 รายการ การสอบ 7 รายการ และรายวิชาใน Grade Lab 9 รายการ ตารางและฟังก์ชัน Rescue ยังอยู่ และ RLS ของทุกตารางที่คงไว้ยังเปิดอยู่

Supabase บันทึก migration ชื่อ `remove_course_syllabus_import` เวอร์ชัน `20261116073903` ได้สำเร็จ สร้างไฟล์ด้วย CLI แล้วปรับชื่อไฟล์ให้ตรงกับเวอร์ชันที่เซิร์ฟเวอร์บันทึก โดยเนื้อหา SQL ตรงกับที่นำไปใช้จริง

## การนำขึ้นใช้งาน

เว็บจริง `https://talevoo.vercel.app` ใช้โค้ดที่ลบระบบแผนรายวิชาแล้ว Vercel แสดงสถานะ `READY` และผูกโดเมนกับ deployment `dpl_FBp2WJ4xtkNsX6AVRR6qBvdoBXDv` ของโปรเจกต์ `talevo` ในทีม `etcstream`

โค้ดที่เผยแพร่คือ commit `a87649b4054a77a30dc5c3bbb5b9f1a297e983d3` จาก branch `security-hardening` ตรงกับ HEAD ในเครื่องและรหัสบน GitHub ที่ตรวจพบในรอบนี้ ระบบเผยแพร่อัตโนมัติขึ้นโค้ดชุดนี้สำเร็จอยู่แล้ว จึงไม่มีการสร้าง deployment ซ้ำ ไม่มีการ commit หรือ push เพิ่มโดยผู้ช่วย

## ผลตรวจและเว็บที่เปิด

- `npm run lint`: ผ่าน ไม่มีข้อผิดพลาดหรือคำเตือน
- `npm run build`: ผ่าน รวมการตรวจ TypeScript; รายการเส้นทางไม่มี `/syllabus` หรือ `/api/learning/syllabus/*`
- `git diff --check`: ผ่าน มีเพียงคำเตือน LF/CRLF ตามปกติบน Windows
- ตรวจ `git status`: งานเดิมของผู้ใช้ยังคงอยู่ ไม่มีการ commit หรือ push
- ไม่ได้รันชุดทดสอบหรือ seed และไม่ได้อ่านหรือแก้ค่าใน `.env.local` รอบนี้รันเฉพาะ migration ลบระบบแผนรายวิชาที่ต้าอนุมัติ
- เปิดเซิร์ฟเวอร์ในเครื่องที่ `http://127.0.0.1:3000` และเปิดหน้า `/welcome` ใน Edge ไว้ให้ใช้งานต่อ
- เปิดเว็บจริงใน Edge แล้ว ได้หน้า `/welcome` ของ Talevo และคงแท็บไว้ให้ใช้งานต่อ
- Vercel build แสดง `Build Completed` และ `Deployment completed` ไม่มีการรันชุดทดสอบเพิ่มเติม
- ไม่เปลี่ยนระบบยืนยันตัวตนหรือสิทธิ์ฐานข้อมูลของฟีเจอร์อื่น ส่วนล้างฐานข้อมูลจริงเสร็จแล้ว
