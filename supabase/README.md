# ไฟล์ฐานข้อมูล

| โฟลเดอร์ | วิธีใช้ |
| --- | --- |
| `migrations/` | ประวัติ schema เรียงตาม timestamp ห้ามเปลี่ยนชื่อหรือแก้ migration ที่ deploy แล้ว |
| `manual/` | SQL รอเจ้าของตรวจ ไม่ใช่รายการที่อนุมัติให้รันอัตโนมัติ |
| `tests/` | SQL ทดสอบ ต้องตรวจ environment และใช้ข้อมูลทดสอบก่อนเสมอ |
| `.temp/` | สถานะ CLI เฉพาะเครื่อง ถูก ignore และไม่ขึ้น GitHub |

อ่าน [เอกสารฐานข้อมูล](../docs/supabase/) และ [เอกสาร security](../docs/security/) ก่อนเปลี่ยนสิทธิ์.
การจัดโฟลเดอร์ไม่ใช่การอนุมัติให้รัน SQL, migration หรือ seed.
ห้ามเก็บ database dump, รหัสผ่าน, token หรือ service-role key ไว้ใน repository.
