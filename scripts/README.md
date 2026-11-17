# เครื่องมือของ TALEVO

เรียกคำสั่งผ่าน `npm run` จากโฟลเดอร์โปรเจกต์ก่อนเสมอ ดูรายการจริงใน `package.json`.

| หมวด | ไฟล์ |
| --- | --- |
| เผยแพร่ | `deploy-cloudflare.mjs` |
| ความปลอดภัย | `qa-security*`, `qa-public-secrets.mjs`, `qa-auth.cjs`, `qa-ai-quota.cjs` |
| ข้อมูลและฐานข้อมูล | `qa-persistence.cjs`, `qa-cloud-persistence.cjs`, `qa-local-cloud-migration.cjs`, `qa-supabase-schema.cjs`, `*-postgres.cjs` |
| ฟีเจอร์ | `qa-academic*`, `qa-grade-lab*`, `qa-vision*`, `qa-notifications.cjs` และ `qa-*` ตามชื่อฟีเจอร์ |
| ภาษาและหน้าจอ | `localize-ui.cjs`, `qa-ui-ux.cjs`, `qa-learning-responsive.cjs` |
| สื่อประชาสัมพันธ์ | `render-talevo-promo*.py` |
| ข้อมูลทดสอบ | `fixtures/` ใช้ข้อมูลสมมติเท่านั้น |

รักษาตำแหน่ง entry point ที่ package.json, workflow และเครื่องมืออื่นอ้างอิง.
ก่อนย้ายสคริปต์ต้องตรวจ `__dirname`, relative imports, fixtures และแก้ผู้เรียกทั้งหมด.
ห้ามใส่ secret, ข้อมูลผู้ใช้จริง หรือไฟล์ export ฐานข้อมูลลงใน fixtures.
