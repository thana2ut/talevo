# ตรวจความปลอดภัย Talevo — 17 พฤศจิกายน 2026

ขอบเขต: ตรวจโค้ด การตั้งค่าโฮสต์และสิทธิ์ฐานข้อมูลแบบอ่านอย่างเดียว
ไม่ได้เปิดทดสอบเว็บ ไม่ได้รัน migration, seed หรือแก้ `.env.local`
เอกสารนี้ไม่ใช่การรับรองว่าระบบไม่มีช่องโหว่ทุกประเภท

## ตั้งค่าที่ทำบน GitHub แล้ว

- เปิด vulnerability alerts สำเร็จ และอ่านกลับยืนยัน HTTP 204
- เพิ่ม branch protection ให้ `security-hardening`: ไม่อนุญาต force push และลบสาขา
  ผู้ดูแลยังมีสิทธิ์ bypass; ไม่ได้บังคับ PR หรือเปลี่ยนกระบวนการ push เดิม
- Secret scanning และ push protection เปิดอยู่เดิม; ไม่พบ open secret alerts ขณะตรวจ
- Actions มี default permission แบบ read และไม่สามารถอนุมัติ PR เอง
- ตรวจเฉพาะชื่อ GitHub Secrets: Cloudflare token และ Supabase public configuration สองรายการ

## โค้ดที่ปรับความปลอดภัย

- `.github/workflows/cloudflare-deploy.yml`: เอา Cloudflare token ออกจาก job environment
  ส่ง token เฉพาะขั้นตอน deploy; npm ci, lint และ build ไม่ได้รับ token
- `scripts/deploy-cloudflare.mjs`: เพิ่ม `--build-only` ให้ build โดยไม่ deploy
  และยังตั้ง public VAPID configuration ชุดเดิมครบ
- ใช้ Actions ที่ pin commit SHA และปิด persist-credentials อยู่แล้ว

## ผลตรวจโฮสต์และข้อมูล

- Cloudflare: admin/AI/private push keys เป็น `secret_text`; ไม่พบชื่อ private key ภายใต้ `NEXT_PUBLIC_`
- Vercel: GROQ_API_KEY, SUPABASE_SECRET_KEY, VAPID_PRIVATE_KEY และ PUSH_DISPATCH_SECRET เป็น sensitive
- public/storage: ไม่พบตารางปกติที่ปิด RLS จาก metadata ขณะตรวจ
- รูปโปรไฟล์เป็น public bucket ตามการใช้งานเดิม จำกัด JPEG/WebP และ 2 MiB
- อ่านฟังก์ชันตัวอย่าง admin access, admin user และ rate limit: ใช้ auth.uid()/สิทธิ์ admin จริง
  และตั้ง search_path ว่าง ไม่ใช่การตรวจ RPC ครบทุกฟังก์ชัน
- มี header/CSP, same-origin mutation checks, authenticated API guard, body size limits
  และ database rate limits ในโค้ดเดิม ไม่ได้ตรวจยืนยัน runtime ในรอบนี้
- `.env.local` ไม่ tracked และ `.env*` ถูก ignore ยกเว้น `.env.example`

## สิ่งที่ยังต้องจัดการ

1. SQL ที่เตรียมไว้ `supabase/manual/review_restrict_rls_auto_enable_execution_20261117.sql`
   ลดสิทธิ์ EXECUTE ของ public/anon/authenticated บนฟังก์ชัน event trigger ภายใน
   ไม่แตะข้อมูลผู้ใช้หรือ policy; ยังไม่ได้รัน ต้องให้เจ้าของตรวจและอนุมัติก่อน
   ฟังก์ชันนี้คืนค่า event_trigger จึงไม่ใช่หลักฐานว่าผู้ใช้เรียก RPC เพื่อยกระดับสิทธิ์ได้
2. Supabase advisor แจ้ง SECURITY DEFINER ที่ authenticated เรียกได้ 20 รายการ
   การเรียกได้ไม่ได้แปลว่าเป็นช่องโหว่ ต้องพิจารณาเงื่อนไขสิทธิ์ภายในทีละฟังก์ชัน
   และมี INFO RLS enabled/no policy 6 ตาราง ซึ่งไม่ได้หมายถึงข้อมูลเปิดสาธารณะ
3. npm audit: 12 moderate, 0 high, 0 critical ณ เวลาตรวจ
   กลุ่ม minimatch/TypeScript ESLint และ fflate ผ่าน satori/@vercel/og/vinext
   ไม่รัน audit fix --force เพราะข้อเสนอมีการเปลี่ยน vinext ไปเวอร์ชันเก่าและอาจทำให้ deploy เสีย
4. Leaked password protection ปิดอยู่ และ Supabase กำหนดให้ใช้ Pro ขึ้นไป
   คงแผนฟรีตามคำสั่งเจ้าของ: https://supabase.com/docs/guides/auth/password-security
5. ยังไม่ได้ตรวจ MFA ของบัญชีเจ้าของ, token expiry/scope ที่เจ้าของสร้าง,
   ประวัติ Git ทุก blob หรือทำ penetration test; อย่าอ้างว่าครอบคลุมสิ่งเหล่านี้

## แหล่งอ้างอิง

ผลตรวจไฟล์ที่แก้: lint, Next.js build, Cloudflare build-only และ git diff --check ผ่าน
มีคำเตือน source map จาก vinext และ LF/CRLF ปกติบน Windows; build จบด้วย exit code 0
เจ้าของอนุญาต commit/push เฉพาะ workflow, deploy script และรายงานฉบับนี้แล้ว
ติดตามผลเผยแพร่ที่ https://github.com/thana2ut/talevo/actions
SQL และไฟล์งานอื่นไม่รวมในการอนุญาตรอบนี้

- https://docs.github.com/en/code-security/concepts/secret-security/push-protection
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security
