# TALEVO QA-only Local v8 → Cloud runbook

เอกสารนี้ใช้กับ QA User A/B เท่านั้น ห้ามใช้ AppState ของผู้ใช้จริง และห้ามเปิด `private.talevo_migration_control.import_enabled` เพื่อทดสอบ

## สถาปัตยกรรม gate

- Production client gate: `CLOUD_IMPORT_RELEASE_ENABLED = false`
- Database global gate: ต้องคง `false`
- QA database gate: `auth.uid()` ต้องมีแถว `enabled = true` ใน `private.talevo_migration_qa_allowlist`
- Browser ตรวจได้เพียง boolean ผ่าน `get_talevo_migration_qa_access()` และไม่สามารถอ่าน/เขียนตาราง private โดยตรง
- หน้า `/qa/local-cloud-migration` ทำงานเฉพาะ `NODE_ENV=development`; production ตอบ 404

## ขั้น SQL ที่ผู้ใช้ต้องทำเอง

1. เปิด Supabase SQL Editor ของโปรเจกต์ `talevo-sg`
2. เปิดไฟล์ `supabase/migrations/20260902130000_talevo_migration_qa_allowlist.sql` วางทั้งไฟล์แล้ว Run หนึ่งครั้ง
3. เปิด `supabase/tests/talevo_qa_allowlist_contract.sql` แทน `QA_USER_A_UUID` และ `QA_USER_B_UUID` ด้วย UUID ของ QA users แล้ว Run ทั้งไฟล์
4. ต้องเห็น `TALEVO QA ALLOWLIST CONTRACT PASSED`; contract จบด้วย `ROLLBACK`
5. เปิด `supabase/runbooks/talevo_qa_allowlist_setup.sql` แทน placeholders เดิม แล้ว Run ทั้งไฟล์
6. ผลต้องแสดง `enabled_qa_accounts = 2` และ `global_import_enabled = false`

ห้ามใส่ UUID จริงลง repository และห้ามแก้ migration atomic ที่ deploy ไปแล้ว

## Live test: QA User A

1. ตรวจว่า PowerShell อยู่ที่ `C:\Users\asus\talevo`
2. รัน `npm run dev`
3. Login ด้วย QA User A แล้วเปิด `http://127.0.0.1:3000/qa/local-cloud-migration`
4. Security gate ต้องแสดงว่าอนุญาตบัญชีนี้
5. ถ้า account namespace ว่าง ให้พิมพ์ `QA TEST DATA` แล้วกดสร้าง fixture
6. ตรวจ Preview: schema v8, validation error 0, Tasks 3, Finance remaining 6,750
7. กด `Import + Verify` หนึ่งครั้ง ต้องได้ `imported` และ verified
8. Refresh: local fixture ต้องยังอยู่ และไม่มี import อัตโนมัติ
9. กด `Import + Verify` ซ้ำ ต้องได้ `already_imported`; counts/Finance ต้องไม่เพิ่ม
10. กดปุ่มเร็วซ้ำไม่ได้เพราะ UI lock; RPC ยังมี advisory lock/idempotency เป็นชั้นบังคับจริง

## User B isolation

1. Logout User A และ Login QA User B
2. User B ต้องเห็น namespace local ของตัวเองเท่านั้น
3. ถ้า User B ยังว่าง หน้า Today/Schedule/Tasks/Finance ต้องไม่มีข้อมูลของ A
4. User B อ่านตารางและ `app_state_sync` ผ่าน RLS แล้วต้องไม่เห็นแถวของ A
5. Contract SQL ยืนยันว่า non-allowlisted/disabled B import ไม่ได้และ verify ของ A ไม่ได้

หมายเหตุ: runbook setup ตั้ง A/B เป็น allowlisted เพื่อทดสอบ fixture แยกบัญชี หลัง contract isolation ผ่านแล้ว ถ้าจะทดสอบ B แบบไม่ allowlisted ให้ตั้ง `enabled=false` ของ B ด้วย SQL ที่ owner ของระบบตรวจแล้ว ไม่ใช้ browser

## New browser / device simulation

1. ใช้ Chrome profile/Incognito ใหม่ ห้ามนำ localStorage จาก browser แรกไป
2. Login QA User A และเปิดหน้า QA
3. ตรวจว่า local domain ว่าง
4. พิมพ์ `เขียน Cloud QA ลงอุปกรณ์นี้` แล้วกด Hydrate
5. ตรวจ Today, Schedule, Tasks, Exams, Grades, Statistics, Finance, Notifications และ AI history
6. Expected fixture: Schedule 2, Tasks 3, Exams 2, Finance income 10,000 / expense 1,250 / saving 2,000 / remaining 6,750
7. Attachment metadata ต้องอยู่ แต่ binary จะไม่มีใน browser ใหม่ UI ต้องใช้สถานะไฟล์ไม่พร้อมบนอุปกรณ์นี้ตาม flow เดิม

## Failure/offline safety

- ตัด network ก่อน Import: UI ต้องแสดง retry และ local primary/backup ยังคงอยู่
- ตัด networkระหว่าง read-back: ห้ามเรียก verification marker
- Cloud response แบบ empty/error ห้ามเขียนทับ local
- Fixture/Hydration ปฏิเสธการเขียนเมื่อ account namespace มี domain data แล้ว
- ไม่มี flow ใดเรียก `localStorage.clear()` หรือ `IndexedDB.clear()`

## Data equality exceptions

- `user_id`: มาจาก `auth.uid()` ฝั่งฐานข้อมูล
- Auth email: มาจาก Supabase Auth ไม่ทำซ้ำใน `profiles`
- timestamps/update fields ฝั่ง server: อาจ normalize รูปแบบแต่ต้องแทนเวลาเดียวกัน
- `browserNotifications`: device-only และไม่ขึ้น Cloud
- `projects`: compatibility/local-only และไม่ขึ้น Cloud
- attachment binary: IndexedDB ของ browser เดิมเท่านั้น; Cloud เก็บ metadata

## Cleanup หลัง QA

อย่าลบอัตโนมัติ วิธีที่แนะนำคือใช้ Account Deletion flow ของ QA A/B เพื่อให้ foreign-key cascade ลบข้อมูลของ QA users เท่านั้น จากนั้นรัน `supabase/runbooks/talevo_qa_allowlist_cleanup.sql` หลังแทน UUID ของ QA users เพื่อลบ capability rows หากยังเหลืออยู่ ห้ามใช้ UUID ของผู้ใช้จริง

## Release rule

หลัง QA รอบนี้ production gate และ global database gate ต้องยังเป็น `false` การเปิด production import เป็นงาน release แยกต่างหากหลังมีหลักฐาน live QA ครบเท่านั้น
