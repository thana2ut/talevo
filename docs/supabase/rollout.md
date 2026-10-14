# TALEVO Supabase rollout checklist

ตอนนี้ repository อยู่ในสถานะ **pre-deploy review และยังไม่ upload AppState**

## 1. ตรวจ Auth configuration ใน Supabase

1. ตั้ง Site URL ให้ตรงกับ URL ที่ใช้งานจริง
2. เพิ่ม Redirect URLs สำหรับ local และ production โดยมีปลายทาง `/auth/confirm`
3. ถ้าแก้ Confirm signup email template ให้ใช้ token hash และส่งกลับมาที่
   `/auth/confirm?token_hash={{ .TokenHash }}&type=email`
4. อย่าใส่ secret key หรือ service role key ใน frontend หรือไฟล์ที่ commit

Auth callback รองรับทั้ง PKCE `code` และ `token_hash` เพื่อใช้ได้กับรูปแบบลิงก์ยืนยัน
ที่ Supabase รองรับ

## 2. ลำดับ SQL หลังผ่าน pre-deploy audit

เปิดและตรวจเนื้อหาแต่ละไฟล์ก่อน จากนั้นรันทีละไฟล์:

1. `supabase/migrations/20260901110000_talevo_v8_schema.sql`
2. `supabase/migrations/20260901111000_talevo_v8_rls.sql`
3. `supabase/migrations/20260901112000_talevo_auth_profile_trigger.sql`
4. `supabase/migrations/20260902120000_talevo_v8_atomic_import.sql`
5. รัน read-only test: `supabase/tests/talevo_rls_contract.sql`
6. แทน QA UUID ในสำเนาแล้วรัน rollback-only test:
   `supabase/tests/talevo_atomic_import_contract.sql`

Migration ทั้งสามไฟล์ไม่ถูกเรียกจากแอปโดยอัตโนมัติ งาน audit นี้ไม่ได้รัน SQL ให้กับ
Supabase Project และ static contract ไม่ใช่หลักฐานแทน live User A/B test

## 3. ตรวจ RLS แบบสองบัญชี ก่อนเปิด cloud migration

1. สมัครบัญชีทดสอบ A และ B
2. ยืนยันว่า trigger สร้าง `profiles` และ `academic_terms` ของแต่ละบัญชี
3. ด้วยบัญชี A ทดลอง CRUD row ที่มี `user_id` ของ A — ต้องสำเร็จ
4. ด้วยบัญชี A ทดลองอ่าน/แก้/ลบ row ของ B — ต้องได้ข้อมูลว่างหรือถูกปฏิเสธ
5. ยืนยันว่า anon อ่านหรือเขียนทุก user-owned table ไม่ได้
6. ทดสอบอย่างน้อย `profiles`, `tasks`, `class_schedules`, `exams`,
   `finance_transactions`, `notifications` และ child relation หนึ่งชุด
7. ทดลองให้ A ใส่ `user_id` ของ B และเปลี่ยน owner ของ row A เป็น B — ต้องถูกปฏิเสธ

## 4. Local v8 → Cloud

ห้ามเริ่ม upload จนกว่าข้อ 2–3 ผ่านทั้งหมด ปัจจุบัน
`src/lib/supabase/local-v8-migration.ts` สร้าง deterministic preview และ payload
สำหรับ atomic RPC แต่ production upload ยังถูกล็อก:

- ไม่อ่าน localStorage เอง
- ไม่ลบหรือแก้ `talevo-app-state`
- ไม่แตะ backup key หรือ IndexedDB
- ไม่มี Supabase insert/upsert/delete call
- `readyForUpload=false` และ `CLOUD_IMPORT_RELEASE_ENABLED=false` จนกว่า additive
  SQL กับ Live QA จะผ่าน

ขั้นถัดไปหลัง review คือสร้าง atomic import RPC หรือ server-side import endpoint พร้อม:

- owner marker ผูก local state กับ Supabase user UUID
- explicit owner confirmation สำหรับข้อมูล legacy ที่ยังไม่มี owner
- dry-run counts และ validation ทุกตาราง
- transaction เดียว; error ใด ๆ ต้อง rollback ทั้งชุด
- idempotency ด้วย `(user_id, snapshot_hash)`
- read-back verification ก่อนเปลี่ยน `app_state_sync` เป็น `imported`

เมื่อ logout แล้ว login ด้วย User B ใน browser เดิม ห้ามแสดงหรือ import local state ที่ผูก
กับ User A และห้ามลบ canonical v8/backup จนกว่าจะ import และตรวจกลับสำเร็จ

## 5. Release blockers ที่ไม่ใช่ schema deploy

- Password recovery ต้องมี callback แลก session และหน้าตั้งรหัสผ่านใหม่
- Account deletion ต้องเป็น secure server-side path ที่ถือสิทธิ์ admin; ห้ามมี service role ใน browser
- Binary attachment ต้องใช้ private Storage bucket + user folder + `storage.objects` RLS
- Local → Cloud upload ต้องยังปิดอยู่จนกว่า atomic RPC และ live User A/B tests ผ่าน
