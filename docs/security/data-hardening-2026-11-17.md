# ตรวจสิทธิ์ข้อมูลและเตรียมเพิ่มการป้องกัน — 17 พฤศจิกายน 2026

## ผลนำขึ้นใช้หลังได้รับอนุมัติจากเจ้าของ

- Commit โค้ด `22dea201b281898a6a629ec4ef11d7595f972198` ขึ้น security-hardening แล้ว
- Cloudflare workflow 44020478009 ผ่านครบ รวม lint, security gates, build,
  scan browser assets และ deploy: https://github.com/thana2ut/talevo/actions/runs/44020478009
- Vercel production `dpl_2gu8sgf7Evy3UzBxrEmbib7FswyP` READY จาก commit เดียวกัน
  และ alias talevoo.vercel.app ชี้มาที่ deployment นี้ก่อนใช้ SQL
- master อัปเดตเฉพาะ package.json/package-lock.json ด้วย commit
  `73f9f54fbf729d1263bc21804fe84af7953e0340`; อ่าน GitHub Dependabot กลับแล้ว open alerts = 0
- เจ้าของเปิด Cloudflare 2FA และ API ยืนยัน true
- ใช้ SQL ที่เจ้าของตรวจและอนุมัติครบ หลังทั้งสองโฮสต์พร้อมแล้ว:
  20261117045930_private_profile_avatars,
  20261117045935_admin_mfa_enforcement,
  20261117045941_restrict_rls_auto_enable_execution
- ไฟล์ migration สร้างด้วย CLI แล้วปรับชื่อ version ให้ตรงประวัติที่ Supabase บันทึกจริง
  เนื้อหาคือ SQL ที่ได้รับอนุมัติ ไม่มีการใช้ migration cleanup ของงานอื่น
- อ่าน metadata ยืนยัน bucket public=false, รูปเดิมคงอยู่ 2 รายการ,
  admin 1 บัญชี, public tables without RLS=0, ทั้งสอง admin helper มี aal2 guard,
  anon/authenticated EXECUTE rls_auto_enable=false
- scanner ตรวจ browser assets 165 ไฟล์ ไม่พบค่าลับที่ตรวจได้
  (ค่าที่มีให้เทียบในเครื่องคือ SUPABASE_SECRET_KEY/GROQ_API_KEY) และไม่พบ source maps
- Supabase advisor: คำเตือน anon internal function หายแล้ว;
  ยังคงมี 19 authenticated SECURITY DEFINER notices, 6 RLS/no-policy INFO,
  และ leaked-password-protection ปิดตามข้อจำกัดแผนฟรี
- เจ้าของสมัครและยืนยัน TOTP ที่ /profile/security เรียบร้อยแล้ว
  อ่านกลับยืนยัน admin_verified_totp_factors=1; support_admin_count=1
  จึงเข้าเงื่อนไขบังคับ aal2 ของ admin helper ที่ติดตั้งแล้ว
- รอบบันทึก migration 2a76ea5 เผยแพร่ Cloudflare ผ่าน workflow 44021109572 ครบ:
  https://github.com/thana2ut/talevo/actions/runs/44021109572
- สถานะ 2FA บัญชีเจ้าของ GitHub/Supabase/Vercel ยังไม่มีหลักฐานยืนยันจาก API รอบนี้
  เจ้าของควรตรวจในหน้า account security ของแต่ละบริการ; ไม่ได้ปิดหรือเปิดแทนเจ้าของ

รายละเอียดถัดไปเป็นบันทึกก่อนนำขึ้นใช้ ให้ยึดผลข้างต้นเป็นสถานะล่าสุด

## สถานะจริง

- Cloudflare owner 2FA: ตอนเริ่มตรวจปิดอยู่ เจ้าของเปิดแล้ว และอ่านกลับผ่าน API เป็น true
- GitHub default branch `master`: ยังมี open Dependabot alerts 17 รายการ
  (3 critical, 4 high, 9 medium, 1 low) จนกว่าจะนำชุดแก้ขึ้น master และ GitHub วิเคราะห์ใหม่
- สาขา `security-hardening` ปัจจุบัน: npm audit 0 vulnerabilities
- เตรียมแก้ master แบบแยกที่ `.cloudflare/master-security` สาขา
  `codex/security-master-dependencies`: audit เหลือ 0 หลังปรับ dependencies
  ยังไม่ commit/push/merge; แก้เฉพาะ package.json และ package-lock.json
- การแก้โค้ดและ SQL ในรายงานนี้ยังไม่ใช่การเปลี่ยน production
  ไม่รัน migration, seed, SQL เปลี่ยนข้อมูล หรือแก้ .env.local

## สิ่งที่ตรวจจากระบบจริง

- public มี 36 ตาราง เปิด RLS ครบ ไม่พบ policy SELECT/ALL ของ anon/public
- policy ของ developer_profile เปิดให้อ่านได้สำหรับ authenticated ตามหน้าข้อมูลผู้พัฒนาเดิม
  ตารางข้อมูลส่วนบุคคลใช้ auth.uid()/owner และกลุ่ม support ใช้สิทธิ์ admin
- private schema: anon/authenticated ไม่มี USAGE; private.is_talevo_admin ไม่มี EXECUTE ให้ client
- ไม่พบ view/materialized view ใน public ที่ต้องตรวจ security_invoker เพิ่ม
- ตรวจเงื่อนไขสิทธิ์ของ SECURITY DEFINER: admin RPC ตรวจสมาชิก admin;
  grade/learning/migration/quota RPC ผูกกับ auth.uid() และ ownership
  การตรวจโค้ดเงื่อนไขไม่ใช่การจำลองทุก business flow
- support admin มี 1 บัญชี และยังไม่มี verified MFA factor ณ เวลาตรวจ
- public.rls_auto_enable() ยังมี EXECUTE ให้ anon/authenticated เป็น event-trigger function
  ไม่ใช่หลักฐานว่าใช้ RPC ยกระดับสิทธิ์ได้; ควรลดสิทธิ์ที่ไม่จำเป็นตาม SQL เดิม
- profile-avatars ยัง public อยู่; จำกัด JPEG/WebP, 2 MiB และ RLS เขียนเฉพาะ folder ของเจ้าของ
- Cloudflare มี API_BURST_LIMITER 300/60s, keys เป็น secret_text และ redact_query_string=true
- GitHub secret scanning/push protection เปิดอยู่ ไม่มี open secret alerts ขณะตรวจ
  default workflow permissions=read, approve PR=false, security-hardening ป้องกัน force push/delete
- ทดลองขอเปิด generic-pattern/validity scanning แล้ว API ตอบ 200 แต่ค่าที่อ่านกลับยัง disabled
  จึงไม่อ้างว่าเปิดได้ และไม่ได้เปิดบริการเสียเงิน
- GitHub repository ยัง public จึงอ่าน source ได้; ไม่เปลี่ยน visibility โดยอัตโนมัติ
- GitHub owner 2FA: API ไม่ส่ง field ที่ยืนยันได้ ไม่สรุปว่าปิดหรือเปิด
- Vercel production ที่อ่านได้ล่าสุดมาจาก security-hardening commit 52c7abe
  Next.js 16.4.6; แยกจาก preview 2ea9478 ที่ผ่าน READY
  จึงต้อง deploy/promote production ให้ตรงกันก่อนเปลี่ยน private bucket

## โค้ดที่เตรียมไว้

### รูปโปรไฟล์

- เพิ่ม GET /api/profile/avatar: getUser + owner path + Storage RLS ด้วย session ของผู้ใช้
  ไม่ใช้ admin key, จำกัด MIME/ขนาด, private/no-store, CORP same-origin
- ตัวแปลง reference ยอมรับเฉพาะ URL ของ bucket เดิมจาก Supabase origin ที่กำหนด
  หรือ internal avatar URL และรูปแบบ owner UUID/ชื่อไฟล์ upload ของระบบ
  ไม่รับ arbitrary external URL, traversal หรือรูป SVG
- UI อ่าน reference เดิมผ่าน route ใหม่โดยไม่ rewrite ข้อมูลเก่า
  รูปใหม่เก็บ internal URL และ cleanup รูปเก่าจำกัดอยู่ใน folder เจ้าของ
- **ยังปิด public URL ไม่ได้จนกว่า SQL จะได้รับอนุมัติและถูกนำไปใช้**
  รูปที่เคยดาวน์โหลดหรืออยู่ใน cache ภายนอกไม่สามารถเรียกคืนได้

### แอดมินและ MFA

- เพิ่ม /profile/security สำหรับตั้งค่า/ยืนยันรหัส TOTP 6 หลักผ่าน Supabase Auth
- QR อยู่ใน memory ของหน้าเท่านั้น ไม่ลง localStorage, log หรือ Git
- ผู้ใช้ต้องสแกนและยืนยันเอง; ไม่มีการสร้าง factor จริงในรอบพัฒนา
- หลังสมัคร factor ครั้งแรก Supabase จะให้อุปกรณ์อื่น sign in ใหม่ตามพฤติกรรม Auth
- /admin ตรวจ assurance level เมื่อบัญชีมี verified factor และส่งไปยืนยันก่อนแสดงหน้า
- API ลบบัญชีตรวจ assurance ก่อนตรวจ admin เพื่อไม่ให้การจำกัด admin RPC ตาม MFA
  ทำให้ password-only session หลบการป้องกันลบบัญชีแอดมินได้
- การบังคับ RPC/RLS ฝั่ง DB ต้องใช้ SQL ที่เตรียมไว้ด้วย ไม่ใช่อาศัยการซ่อนหน้า
- SQL ใช้เงื่อนไข: admin ที่มี verified factor ต้องเป็น aal2; admin ที่ยังไม่สมัคร
  ยังสมัครได้ จึงยังไม่ใช่นโยบายบังคับ enrollment ทุกบัญชี
- MFA ชุดนี้เน้นสิทธิ์ admin; ไม่อ้างว่าบังคับ aal2 กับข้อมูลส่วนตัวทุกตารางของผู้ใช้ทั่วไป

### แพ็กเกจของ master

- Next.js/eslint-config-next 16.3.3 → 16.4.6
- Pin Supabase สองแพ็กเกจตรงรุ่นที่ใช้งานอยู่
- Override minimatch เฉพาะสาย typescript-estree เป็น 11.0.1
- Update brace-expansion, source-map-js และ zod ตามช่วงรุ่นที่รองรับใน lockfile
- ไม่เปลี่ยน source ของแอป ไม่ force-update ไม่รวมฟีเจอร์/SQL ของ security-hardening ไป master

## ไฟล์ในงานนี้

แก้: src/app/admin/page.tsx, src/app/api/account/route.ts,
src/components/developer-support.tsx, src/features/profile/profile-pages.tsx,
src/lib/security/api-guard.ts, src/lib/ui-translations.en.json,
src/providers/auth-provider.tsx

สร้าง: src/app/api/profile/avatar/route.ts, src/lib/security/profile-avatar.ts,
src/app/profile/security/page.tsx, src/features/profile/account-security.tsx,
src/features/profile/account-security.css และรายงานนี้

SQL review ใหม่: review_private_profile_avatars_20261117.sql,
review_admin_mfa_enforcement_20261117.sql
SQL review เดิมที่เกี่ยวข้อง: review_restrict_rls_auto_enable_execution_20261117.sql
ไม่รวม SQL cleanup ข้อความ/notification, สื่อ, .claude หรือ admin CSS จากงานอื่น

## ผลตรวจและลำดับนำขึ้นใช้

- main: lint, TypeScript, Next.js build และ Cloudflare build ผ่าน
- master worktree: lint exit 0 มี warning ตัวแปร t ไม่ถูกใช้ 1 รายการในโค้ดเดิม;
  build ผ่านและ npm audit เหลือ 0
- git diff --check ทั้งสองสำเนาผ่าน; LF/CRLF เป็น warning ปกติบน Windows
- ตรวจไฟล์ browser build ด้วย scanner ที่แสดงเฉพาะชื่อ secret/เส้นทาง ไม่แสดงค่า
- ไม่เปิดทดสอบเว็บ ไม่สร้างบัญชี ไม่ยิงคำขอโจมตี production ไม่ enroll factor แทนเจ้าของ

1. เจ้าของอนุญาต commit/push งานนี้ และชุดแพ็กเกจ master แยกตามรายการที่ตรวจแล้ว
2. deploy โค้ดใหม่ทั้ง Cloudflare และ Vercel production ก่อน ตรวจผล CI จนจบ
   Vercel preview ที่ READY ยังไม่เท่ากับ production ถูก promote
3. เจ้าของตรวจและอนุมัติ SQL สามไฟล์ จากนั้นจึงใช้ SQL และอ่าน metadata ยืนยัน
4. เจ้าของตั้ง TOTP ที่ /profile/security และยืนยันด้วยรหัสจากอุปกรณ์ของตน
5. ตรวจ GitHub/Supabase/Vercel owner 2FA และสำรอง recovery codes ด้วยตนเอง
   ไม่ส่ง code, QR, token, password หรือ recovery code ลงแชต

ข้อจำกัดคงอยู่: Supabase leaked password protection ต้อง Pro จึงไม่เปิดตามเงื่อนไขฟรี;
client Supabase session อ่านได้ด้วย JavaScript จึงยังพึ่ง CSP และการป้องกัน XSS;
ยังไม่ได้ทดสอบจริงด้วยบัญชีสองบัญชี/รหัส MFA ตามข้อกำหนดไม่เปิดเทส
ไม่มีระบบใดรับรองว่าจะไม่มีการบุกรุกได้ทุกกรณี

## อ้างอิง

- https://supabase.com/docs/guides/storage/buckets/fundamentals
- https://supabase.com/docs/guides/auth/auth-mfa
- https://supabase.com/docs/reference/javascript/auth-mfa-enroll
- https://developers.cloudflare.com/fundamentals/user-profiles/2fa/
- https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa/configuring-two-factor-authentication
