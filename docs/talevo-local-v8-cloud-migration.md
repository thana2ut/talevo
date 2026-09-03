# TALEVO Local AppState v8 → Supabase atomic migration

เอกสารนี้อ้างอิง source จริงจาก `src/types/index.ts`,
`src/lib/persistence/app-state-storage.ts` และ migration ที่ deploy แล้วทั้ง 3 ไฟล์
โดยรอบนี้ยังไม่ deploy SQL และไม่อัปโหลดข้อมูลจริง

## Architecture และ safety gate

1. Client อ่าน snapshot ของ account namespace ที่ authenticated อยู่เท่านั้น
2. `inspectLocalMigrationOwnership` ต้องได้ `confirmed`; legacy canonical snapshot
   ต้องผ่านการเลือก “นำข้อมูลมาใช้” อย่างชัดเจนก่อน
3. `createLocalV8MigrationPlan` ทำ preview/validation โดยไม่มี network side effect
4. Production upload ถูกล็อกสองชั้นด้วย `CLOUD_IMPORT_RELEASE_ENABLED = false`
   และ `private.talevo_migration_control.import_enabled = false`
5. เมื่อผ่าน Live QA แล้วจึงเปิดทั้ง app gate และ database gate ตาม release review;
   Client เรียก `import_talevo_v8(payload)` เพียง RPC เดียว
6. RPC ใช้ transaction ของ PostgreSQL statement; error ใด ๆ rollback ทุกตาราง
7. RPC ใช้ `auth.uid()` เป็น owner จริงและปฏิเสธ `user_id` จาก payload
8. หลัง RPC ต้องอ่าน normalized tables กลับภายใต้ session/RLS ปกติและ verify
9. ส่งผล read-back เข้า `complete_talevo_v8_verification`; server ตรวจ counts และ
   Finance totals ที่บันทึกไว้ซ้ำก่อนเป็น `verified`; mismatch เป็น
   `verification_failed` และ Local v8/backup/IndexedDB ไม่ถูกลบ

## Local → Cloud mapping

`null` ด้านล่างหมายถึงเขียน SQL `NULL`; “default” หมายถึงใช้ค่าที่ AppState v8
normalize ไว้แล้ว ไม่พึ่ง default ที่อาจเปลี่ยน behavior

| Local field | Table | Column | Transformation | Null/default |
| --- | --- | --- | --- | --- |
| `profile.displayName/major/university` | `profiles` | `display_name/major/university` | ตรงตัว หลังตรวจ limit 80 | `''` คงเป็น `''` |
| `profile.email` | Auth only | — | ไม่ upload; `auth.users.email` canonical | — |
| `profile.avatarUrl` | Local only | — | object URL ไม่ upload | — |
| `academicTerm.*` | `academic_terms` | `level/term/academic_year/label` | ตรงตัว; year ต้องว่างหรือ 4 หลัก | `label → null` |
| `schedules[]` | `class_schedules` | ทุก field แบบ snake_case | stable `id`; เวลาเป็น `time` | `note → null` |
| `tasks[]` | `tasks` | ทุก field แบบ snake_case | stable `id`; local Bangkok datetime → ISO timestamptz | optional → `null` |
| `tasks[].subtasks[]` | `task_subtasks` | `task_id,id,title,completed,completed_at,position` | parent Task ID + array index | `completed_at → null` |
| `tasks[].attachments[]` | `task_attachments` | metadata columns | metadata เท่านั้น; validate `taskId`; binary ไม่ upload | ไม่มี binary column |
| `taskCompletionHistory[]` | `task_completion_history` | history columns | stable ID/timestamps | optional → `null` |
| `exams[]` | `exams` | exam columns | stable ID; Bangkok datetime → ISO | optional → `null` |
| `exams[].topics[]` | `exam_topics` | topic columns | parent Exam ID + array index | `completed_at → null` |
| `gradePlans[]` | `grade_plans` | `id,course_id,target_grade` | stable ID; unique course | `target_grade → null` |
| `components[]` | `grade_components` | score columns | numeric + parent plan + array index | optional → `null` |
| `thresholds[]` | `grade_thresholds` | `label,minimum_percent,position` | position เป็น immutable cloud identity | — |
| `courseNotes[]` | `course_notes` | note columns | tags เป็น `text[]`; timestamps → ISO | `class_date → null` |
| `financeCategories[]` | `finance_categories` | category columns | preserve stable ID/type/color/budget | optional → `null`; `is_default=false` |
| `financeTransactions[]` | `finance_transactions` | transaction columns | resolve local category name → stable `category_id`; validate same type | `note → null` |
| `savingGoals[]` | `saving_goals` | goal columns | เงินตรวจช่วง `numeric(14,2)` | — |
| `financeSettings.dailyBudget` | `finance_settings` | `daily_budget` | non-negative money | 0 คงเป็น 0 |
| `selectedFinanceMonth` | `finance_settings` | `selected_month` | validate `YYYY-MM` | — |
| `goals.*` | `learning_goals` | goal columns | numeric/non-negative | string ว่างคงไว้ |
| `notifications[]` | `notifications` | notification columns | preserve stable ID + `event_key`; metadata เป็น object | optional → `null` |
| `dismissedNotificationEventKeys[]` | `dismissed_notification_events` | `event_key` | unique tombstone | `dismissed_at=now()` |
| `settings` (account fields) | `app_settings` | timezone/date/year/alert flags | ตรงตัว ยกเว้น browser flag | AppState normalized defaults |
| `settings.notificationPreferences.browserNotifications` | Local only | — | device permission ไม่ upload | — |
| notification leader lease/runtime locks | Local only | — | ไม่อยู่ใน AppState payload | — |
| `chat[]` | `chat_messages` | `id,role,content,kind,position` | stable ID + array index | `kind → null` |
| `projects[]` | Local compatibility | — | ไม่ upload เพราะไม่มี active feature | warning ใน preview |
| `savedAt/writerId` | `app_state_sync` | `local_saved_at/local_writer_id` | metadata เท่านั้น | optional → `null` |

RPC เติม `user_id = auth.uid()` ทุก row เอง และคำนวณ SHA-256 `snapshot_hash`
จาก canonical `jsonb` ของ `schema_version + tables` ภายใน PostgreSQL จึงไม่เชื่อ
owner/hash จาก browser และไม่รวม `savedAt`, `writerId` หรือเวลาที่ server สร้างใหม่

## Preview validation

- v8, authenticated UUID และ local ownership
- invalid/duplicate stable IDs และ unique cloud keys
- parent/child ของ attachment/task, Task/Exam/Grade children
- schedule range, dates, timestamps และ Academic term bounds
- score ranges, money limits, saving goal bounds
- Finance category name, `category_id` mapping และ category/transaction type
- removed Academic GPS, Life Rescue และ Did I Submit fields
- notification `event_key` และ dismissed-event duplicates

Validation error ทำให้ `eligibleForUploadAfterDeployment=false` และ
`readyForUpload=false`; warning เช่น local-only `projects` ไม่ถูกเขียนขึ้น Cloud

## Settings classification

| กลุ่ม | สถานะ | เหตุผล |
| --- | --- | --- |
| timezone/date format/year system | CLOUD | พฤติกรรม account ข้ามอุปกรณ์ |
| Smart Alert rules | CLOUD | ต้องคง preference ของ account |
| browser notification permission | LOCAL | เป็น permission ของ browser/device |
| notification delivery leader lease/runtime locks | LOCAL | เป็น coordination ชั่วคราว |
| normalized Cloud rows + local cache metadata | HYBRID | Cloud canonical หลัง verify; Local เป็น offline/fallback |

## Finance guarantees

- FK ใช้ `(user_id, category_id, type)` ไม่ใช้ชื่อหมวดหมู่
- เงินอยู่ในช่วง `numeric(14,2)` และต้องไม่เป็น NaN/Infinity
- สูตรตรวจกลับคือ `remaining = income - expense - saving`
- category custom/default, color, budget, savings, date, note และ stable ID คงเดิม

## Attachments

รอบนี้ย้ายเฉพาะ metadata ไป `task_attachments` ไฟล์ binary ยังอยู่ใน IndexedDB
บนอุปกรณ์เดิม ไม่มีการลบ blob และยังไม่ถือว่าดาวน์โหลดไฟล์ได้จากอุปกรณ์ใหม่

## Post-migration source of truth

หลัง RPC + read-back verification ผ่าน:

- Supabase normalized tables = canonical account data
- Local AppState v8 = cache/offline/fallback ในช่วง compatibility
- `app_state_sync` = marker/hash/status เท่านั้น ไม่เก็บ full AppState blob
- Cloud load error ต้องคืนสถานะ `error` และห้าม hydrate Local ด้วย array ว่าง
- production cloud hydration ยังไม่เปิดในรอบ SQL preparation นี้

## Exact SQL run order

ตรวจ Project ให้ถูกต้องก่อน แล้วเปิด Supabase SQL Editor:

1. ยืนยันว่า 3 ไฟล์เดิม deploy แล้วตามลำดับ
   `20260901110000_talevo_v8_schema.sql`,
   `20260901111000_talevo_v8_rls.sql`,
   `20260901112000_talevo_auth_profile_trigger.sql`
2. Run `supabase/migrations/20260902120000_talevo_v8_atomic_import.sql`
3. Run static/local QA อีกครั้ง
4. แทน UUID เฉพาะในสำเนา test แล้ว Run
   `supabase/tests/talevo_atomic_import_contract.sql`
5. ตรวจว่า test แสดง `TALEVO ATOMIC IMPORT CONTRACT PASSED` และจบด้วย rollback
6. Test เปิด database gate เฉพาะภายใน transaction และ `ROLLBACK` คืนเป็นปิด
7. ยังไม่เปลี่ยน app/database release gates จนกว่า live plan ด้านล่างผ่าน

## Exact QA live test plan

ใช้ QA account เท่านั้น ห้ามใช้ข้อมูลจริง:

1. สร้าง QA Local v8 ที่มี parent/child, Exam/Grade, Finance และ notification
2. Login QA User A และยืนยัน owner preview/counts
3. ติ๊ก explicit confirmation แล้วเปิด upload เฉพาะ QA build
4. ตรวจ RPC ตอบ `imported` และไม่มี partial rows
5. Read-back ผ่าน authenticated/RLS แล้วตรวจ counts/IDs/relations/Finance totals
6. Mark verified และตรวจ `app_state_sync.verified_at`
7. Refresh แล้วข้อมูลต้องไม่หายหรือซ้ำ
8. Logout/login User A แล้ว Cloud hydration QA ต้องตรงเดิม
9. จำลอง browser/device ใหม่โดยไม่มี Local state และโหลด Cloud
10. เปรียบเทียบ Task status, schedules, exams, grades, profile/settings และ Finance
11. ส่ง payload เดิมซ้ำ ต้องได้ `already_imported` และ count ไม่เพิ่ม
12. Login User B บนอุปกรณ์เดิม ต้องไม่เห็น/ย้ายข้อมูลของ A
13. ทดสอบ offline/error ให้ Local เดิมยังอยู่และมี retry
14. Cleanup เฉพาะ QA account ด้วยขั้นตอนที่อนุมัติแยกต่างหาก

## Remaining release blockers

- ผู้ใช้ต้อง review/deploy additive SQL เอง
- ต้องรัน live atomic contract ด้วย QA User A/B และเก็บผล PASS
- ต้องทำ QA cloud hydration บนอุปกรณ์ใหม่ก่อนเปิด production switch
- ต้อง review SQL เปิด `private.talevo_migration_control` แยกต่างหากหลัง Live QA;
  การ deploy migration ไฟล์นี้เพียงอย่างเดียวยังไม่เปิด import จริง
- ต้องออกแบบ private Storage + `storage.objects` RLS สำหรับ attachment binary
- หลังทุกข้อผ่านจึงเปลี่ยน release gate และเชื่อม CTA กับ executor
