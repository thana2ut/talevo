# TALEVO AppState v8 → Supabase audit

เอกสารนี้อ้างอิงชนิดข้อมูลจริงจาก `src/types/index.ts`, snapshot จาก
`src/lib/persistence/app-state-storage.ts` และ active runtime ก่อน deploy schema

## การตัดสินใจ 25 ตาราง

| # | ตาราง | สถานะ | เหตุผล |
| ---: | --- | --- | --- |
| 1 | `profiles` | MODIFY / ACTIVE | เก็บโปรไฟล์ แต่ใช้ Auth เป็นแหล่งอีเมลหลักและไม่เก็บ local object URL |
| 2 | `academic_terms` | KEEP / ACTIVE | Register Step 2 และโปรไฟล์ใช้งานจริง |
| 3 | `class_schedules` | KEEP / ACTIVE | Schedule/Today ใช้งานจริง |
| 4 | `tasks` | KEEP / ACTIVE | Tasks/Today/Statistics ใช้งานจริง |
| 5 | `task_subtasks` | KEEP / ACTIVE | เป็น child ของ task และมี CRUD จริง |
| 6 | `task_attachments` | MODIFY / ACTIVE | เก็บ metadata เท่านั้น; binary ยังอยู่ IndexedDB |
| 7 | `task_completion_history` | KEEP / COMPATIBILITY | รักษาประวัติ v8 หลัง task หมดอายุ แม้ไม่มีหน้าจอ CRUD โดยตรง |
| 8 | `exams` | KEEP / ACTIVE | Exams/Today/Notifications ใช้งานจริง |
| 9 | `exam_topics` | KEEP / ACTIVE | เป็น child ของ exam และใช้งานจริง |
| 10 | `grade_plans` | KEEP / ACTIVE | Grades ใช้งานจริง |
| 11 | `grade_components` | KEEP / ACTIVE | เป็น child ของ grade plan |
| 12 | `grade_thresholds` | MODIFY / ACTIVE | ใช้ `position` เป็น identity แทน label ที่แก้ได้ |
| 13 | `course_notes` | KEEP / ACTIVE | Notes มี create/read/update/delete/pin |
| 15 | `finance_categories` | MODIFY / ACTIVE | ใช้ owner-scoped stable ID และชื่อไม่ซ้ำแบบ case-insensitive |
| 16 | `finance_transactions` | MODIFY / ACTIVE | อ้าง category ด้วย `(user_id, category_id)` |
| 17 | `saving_goals` | KEEP / ACTIVE | Finance Pocket ใช้งานจริง |
| 18 | `finance_settings` | KEEP / ACTIVE | งบรายวันและเดือนที่เลือกใช้งานจริง |
| 19 | `learning_goals` | KEEP / ACTIVE | Profile ใช้งานจริง |
| 20 | `notifications` | KEEP / ACTIVE | Notification Center ใช้งานจริง |
| 21 | `dismissed_notification_events` | KEEP / ACTIVE | ป้องกันสร้าง event ที่ผู้ใช้ dismiss แล้วซ้ำ |
| 22 | `app_settings` | MODIFY / ACTIVE | sync เฉพาะ account settings; ไม่ sync browser permission |
| 23 | `projects` | REMOVE BEFORE DEPLOY | มีเพียง type/mock/local compatibility ไม่มี active feature flow |
| 24 | `chat_messages` | KEEP / ACTIVE | AI chat ใช้งานจริง |
| 25 | `app_state_sync` | MODIFY / COMPATIBILITY | เป็น migration marker เท่านั้น ไม่ใช่ AppState blob และ client อ่านได้อย่างเดียว |

ผลคือ deploy 24 ตาราง และคง `projects` ไว้เฉพาะ local AppState v8 เพื่อไม่ทำลายข้อมูลเดิม

## ความสัมพันธ์และชนิดข้อมูลสำคัญ

- ทุกตารางที่ deploy มี `user_id` อ้าง `auth.users(id) on delete cascade`
- child rows ใช้ composite foreign key ที่มี `user_id` เพื่อบังคับ parent/child ให้เป็นเจ้าของเดียวกัน
- Task/Exam/Grade child ใช้ `on delete cascade` เพราะไม่มีความหมายเมื่อ parent ถูกลบ
- Finance transaction ใช้ `(user_id, category_id, type)` อ้าง category และ `on delete restrict`
  เพื่อบังคับทั้งเจ้าของ/ประเภทให้ตรงกันและไม่ให้การลบหมวดหมู่ทำลายประวัติการเงิน
- เงินใช้ `numeric(14,2)` ไม่ใช้ floating point ใน PostgreSQL
- schedule ใช้ `time`, วันที่ล้วนใช้ `date`, และเหตุการณ์เป็นเวลาใช้ `timestamptz`
- datetime แบบ `datetime-local` ของ TALEVO ถูกตีความเป็น `Asia/Bangkok` ก่อนแปลงเป็น ISO

## ขอบเขต local และ cloud

- Local persistence v8, `talevo-app-state`, backup key และ IndexedDB ไม่ถูกลบหรือแก้
- Supabase Auth เป็น canonical source ของ email; `profiles` ไม่ทำสำเนา email
- `avatarUrl` เป็น object URL ใน session จึงไม่ถูกเก็บในฐานข้อมูล
- `browserNotifications` และ leader lease เป็นสถานะของอุปกรณ์ จึงไม่ส่งขึ้น cloud
- `task_attachments` เป็น metadata เท่านั้น; ยังไม่อ้างว่า binary อยู่บน cloud
- ไม่มี column/table สำหรับ Academic GPS, Life Rescue หรือ Did I Submit
- `app_state_sync` เก็บสถานะการ import/snapshot hash เท่านั้น ไม่เก็บ AppState ทั้งก้อน

## สถานะการย้ายข้อมูล

`createLocalV8MigrationPlan` สร้าง deterministic preview/payload ในหน่วยความจำ
โดยไม่มี network side effect และ `readyForUpload` ยังเป็น `false` เพราะ production
release gate จะเปิดได้หลัง:

1. owner marker ที่ผูก local state กับ Supabase user UUID
2. deploy additive atomic import RPC ที่ทำงานใน transaction เดียว
3. ยืนยัน idempotency ด้วย server-side snapshot hash
4. read-back verification ก่อน mark `verified`
5. live RLS/atomic contract ด้วย User A/B

ไฟล์ออกแบบและ runbook ปัจจุบันอยู่ที่
`docs/talevo-local-v8-cloud-migration.md`

Finance Pocket Dashboard V2 ยังใช้ business logic เดิมครบ และ local transaction name
จะถูก resolve เป็น stable category ID ใน preview โดยหยุดทันทีถ้าหมวดหมู่หายหรือชื่อซ้ำ
