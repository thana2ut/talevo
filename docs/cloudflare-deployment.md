# Talevo บน Cloudflare

เว็บหลักชื่อสั้น: https://talevo.pages.dev

Cloudflare Pages โปรเจกต์ `talevo` ใช้ `workers/pages-entry.js` ส่งคำขอผ่าน service binding `TALEVO_APP` ไปยัง Worker เดิม โดยคง URL, method, body และ origin สำหรับการตรวจสิทธิ์เดิม ใช้โดเมน pages.dev ฟรีโดยไม่ซื้อโดเมน

URL เดิมยังเปิดได้: https://talevo.talevo-thana2ut.workers.dev

## การตั้งค่าปัจจุบัน

- Worker หลักชื่อ `talevo` ใช้ vinext และ Cloudflare Vite plugin รุ่น RC ที่รองรับ Build Output v1
- ใช้ Supabase โปรเจกต์เดิม `talevo-sg` ไม่ย้ายข้อมูลและไม่รัน SQL หรือ migration
- Supabase Site URL เป็น `https://talevo.pages.dev` และอนุญาต redirect ทั้ง `https://talevo.pages.dev` และ `https://talevo.pages.dev/**` โดยเก็บรายการ Workers และ Vercel เดิม
- กุญแจฝั่งเซิร์ฟเวอร์เก็บเป็น Worker secrets ไม่อยู่ในไฟล์หน้าเว็บ
- ใช้งาน Cron เดิมใน Supabase `talevo-push-dispatch` ซึ่งเรียก Vercel ทุกนาที (`* * * * *`) เพียงตัวเดียว เพราะทั้งสองเว็บใช้คิวและ subscription ร่วมกัน
- ปิดตาราง Cron ของ Worker `talevo-push-dispatch` ที่เพิ่มบน Cloudflare แล้ว เพื่อไม่ดึงคิวซ้ำกัน
- Cloudflare ใช้กุญแจสาธารณะ VAPID ชุดเดียวกับ Vercel จาก `config/cloudflare-deployment.json` โดยไม่มี private key ในไฟล์นี้ และไม่มีการหมุนกุญแจลับของ Vercel
- `TALEVO_PUSH_DELIVERY=external` ทำให้ Cloudflare ปฏิเสธการ drain คิวเอง ตัวส่งบน Vercel เดิมยังทำงานตามเดิม
- เปิด logs และ traces พร้อมปกปิด query string ใน Worker หลัก
- compatibility date ใช้ 2026-11-16 ซึ่งเป็นวันที่ล่าสุดที่ runtime ที่ติดตั้งรองรับ

## อัปเดตเว็บ

รันใน PowerShell โดยตรวจว่าอยู่ที่ `C:\Users\asus\talevo` ก่อน:

```powershell
npm run lint
npm run typecheck
npm run build
npm run deploy:vinext
```

หากยังไม่ได้เข้าสู่ Cloudflare ให้รัน `npx cf auth login` และยืนยันบัญชีในเบราว์เซอร์ก่อน deploy
เครื่องมือ `cf` ระบุว่าต้องใช้ Node.js `^22.23.0 || ^24.22.0 || ^26.12.0` ควรใช้รุ่นที่ตรงเงื่อนไขสำหรับการติดตั้งครั้งถัดไป

สคริปต์ deploy อ่าน `.env.local` โดยไม่แก้ไฟล์ และใช้ public VAPID key เดิมจากไฟล์ config โดยไม่สร้างคู่กุญแจใหม่
ไฟล์ `.cloudflare/deploy/push.json` จากการตั้งค่ารอบแรกไม่ถูกใช้ในโหมด external แล้ว ไม่ต้องนำขึ้น Git หรือแจกจ่าย
ไฟล์ JSON สำหรับอัปโหลด secrets จะถูกลบใน `finally` หลังส่งคำสั่งเสร็จ

อย่าเปิด Cron บน Cloudflare ซ้ำ ตราบใดที่ Supabase ยังเรียกตัวส่งเดิมบน Vercel และอย่าเปลี่ยนกุญแจแจ้งเตือนเดิมโดยไม่มีแผนย้ายอุปกรณ์

## GitHub Actions

เตรียม `.github/workflows/cloudflare-deploy.yml` ให้ deploy เมื่อ push สาขา `security-hardening` ซึ่งตรงกับสาขาของ Vercel production ที่ตรวจพบ ไม่ใช่สาขาเริ่มต้น `master`
workflow ทำเฉพาะติดตั้ง dependency, lint, build และ deploy ไม่มีการรันชุดทดสอบหรือ migration

ก่อนเปิดใช้งาน ต้องตั้ง Repository Actions secrets ใน GitHub:

- `CLOUDFLARE_API_TOKEN`: token จำกัดบัญชีสำหรับ Workers deployment และ assets เท่านั้น
- `NEXT_PUBLIC_SUPABASE_URL`: URL ของโปรเจกต์เดิม
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: publishable key ของโปรเจกต์เดิม

ไม่ต้องนำ Supabase admin key, Groq key หรือ VAPID private key ไปใส่ GitHub: โหมด `--ci` ใช้ Worker secrets ที่ตั้งไว้แล้ว และไม่สุ่มกุญแจใหม่
workflow ใช้ Actions ที่ตรึง commit SHA, Node 24.22.0, สิทธิ์ `contents: read`, ไม่เก็บ checkout credentials และไม่ deploy จาก pull request ของผู้อื่น

ผู้ใช้อนุญาตให้ Commit/Push เฉพาะงาน Cloudflare ไปสาขา `security-hardening` แล้ว ส่วน workflow จะเผยแพร่ได้เมื่อ Actions secrets ครบ
การเชื่อม GitHub แบบ Workers Builds โดยตรงติดที่บัญชียังไม่ได้อนุญาต Cloudflare GitHub App (API code 8000008) จึงใช้ workflow ที่เตรียมไว้เป็นทางเลือกได้โดยไม่ต้องติดตั้ง App นี้

Next.js และ vinext สร้าง `.next/types/routes.d.ts` ต่างรูปแบบกัน จึงให้ `npm run typecheck` เรียก `next typegen` ก่อนตรวจ TypeScript เสมอ

## การตรวจสอบและข้อจำกัด

- ผ่าน Next.js build และ Workers build
- หน้า `/login`, `/register`, `/api/time` ของเว็บจริงตอบ 200
- API ข้อมูลส่วนตัวตอบ 401 เมื่อไม่มี session พร้อม CSP และ `Cache-Control: no-store, private`
- ตรวจผ่านเบราว์เซอร์แล้วว่าหน้าเข้าสู่ระบบโหลดจนแสดงฟอร์มครบ
- ไม่พบ server secret หรือ AI key ใน JavaScript ของหน้าเว็บ
- ยังไม่ได้ทดสอบด้วยบัญชีผู้ใช้จริง: การเข้าสู่ระบบ อ่าน/เขียนข้อมูล AI และการรับ Web Push บนอุปกรณ์
- ตรวจพบ logs ของตัวเรียก Cloudflare รอบก่อนที่ตอบ 200 แต่ปิดตารางงานซ้ำหลังตรวจพบ Cron ของ Supabase เดิมแล้ว การตอบ 200 ไม่ใช่หลักฐานว่าอุปกรณ์ได้รับ Push จริง
- Workers Free มีโควตา CPU 10 ms ต่อ HTTP request และ 100,000 requests ต่อวัน จึงควรติดตาม errors เมื่อใช้งานจริงมากขึ้น
- ใช้โดเมนย่อย workers.dev ฟรี ไม่ใช่การจดโดเมนส่วนตัว บริการ AI และ Supabase ยังคงใช้โควตาของผู้ให้บริการเดิม
- ชื่อหลักใหม่ใช้ pages.dev ฟรีเช่นกัน ไม่มีการเปิดบริการเสียเงินเพิ่ม แต่การตรวจ subscription ผ่าน Cloudflare OAuth ไม่รองรับ Billing API จึงยังไม่ได้ยืนยันรายการเรียกเก็บเงินทั้งหมดของบัญชีเดิม
- เมื่อเปลี่ยนโดเมน ต้องเข้าสู่ระบบและอนุญาตแจ้งเตือนใหม่ เนื่องจาก browser แยก cookies และ Web Push ตามโดเมน
- การอัปเดตแอปด้วย `npm run deploy:vinext` จะปรากฏบน pages.dev ด้วยทันที เพราะ Pages ส่งคำขอไปยัง Worker เดิม หากแก้ `workers/pages-entry.js` ต้องอัปโหลด Pages deployment ใหม่ด้วย
- ยังมี npm audit ระดับ moderate 12 รายการ ไม่ได้ใช้ `audit fix --force`
- Git auto-deploy ต้องตั้ง Actions secrets ให้ครบก่อนจึงจะเผยแพร่สำเร็จ การ Push ไฟล์ workflow อย่างเดียวไม่ได้ทำให้สิทธิ์เผยแพร่พร้อมใช้งาน

## ผลตรวจการเชื่อมต่อจากโค้ดและการตั้งค่า

- Supabase URL และ publishable key ที่ใช้ build ตรงกับ Vercel โดยเปรียบเทียบเฉพาะผล true/false ไม่แสดงค่ากุญแจ
- AI provider และโมเดลที่ตั้งไว้ตรงกับ Vercel default
- ชื่อ runtime secrets หลักของ Cloudflare ครอบคลุมรายการที่ Vercel ใช้ ไม่ดึงหรือแสดงค่ากุญแจ sensitive ของ Vercel
- Vercel production ที่ตรวจพบใช้ commit `52c7abe` บน `security-hardening`; local และ GitHub สาขาเดียวกันอยู่ที่ `aad7d6f` ส่วนไฟล์ตั้งค่า Cloudflare ยังเป็นงานที่ไม่ได้ Commit
- ไม่เปลี่ยน RLS ไม่รัน Migration ไม่แก้ `.env.local` และไม่เปลี่ยนแพ็กเกจบริการเป็นแบบเสียเงิน
- หยุดการทดสอบผ่านเว็บและชุด QA เพิ่มตามคำสั่งผู้ใช้ ตรวจต่อเฉพาะ source, settings, lint และ build จึงยังไม่รับรองผลการใช้งานหลัง login แบบ end-to-end
- ก่อนคำสั่งหยุดการทดสอบ ชุด QA เดิมมีรายการไม่ผ่าน: auth ตรวจหา `getClaims()` แต่ source ปัจจุบันใช้ `getUser()`; cloud-persistence ยังถือว่า Exams ถูกเลิกใช้; learning-tools อ้างถึง `src/lib/rescue.ts` ที่ไม่มีแล้ว; notifications ตรวจหา reading-view contract ในไฟล์เดิมไม่พบ ยังไม่ได้แก้ชุด QA เหล่านี้และไม่ถือว่า test suite ทั้งหมดผ่าน

อ้างอิง: https://developers.cloudflare.com/workers/platform/limits/
