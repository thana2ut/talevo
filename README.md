# TALEVO — Your Academic OS

ตัวช่วยจัดการการเรียนสำหรับนิสิต จัดตารางเรียน งาน และเป้าหมายไว้ในที่เดียว พร้อมผู้ช่วย AI

**เว็บใช้งานจริง:** https://talevoo.vercel.app

## Technology

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS 4, lucide-react
- Supabase — Auth และ Postgres (project `talevo-sg`, ap-southeast-1)
- Groq — ผู้ให้บริการ AI (สลับไป Gemini ได้ด้วย `TALEVO_AI_PROVIDER`)
- Vercel — deployment (region `sin1`)

## เริ่มพัฒนา

```bash
npm install
cp .env.example .env.local   # แล้วเติมค่าจริง
npm run dev
```

เปิด `http://localhost:3000`

> `npm run build` ต้องมีค่า `NEXT_PUBLIC_SUPABASE_*` ไม่งั้นจะล้มตอน prerender หน้า `/profile`

## Environment variables

| ตัวแปร | ฝั่ง | ใช้ทำอะไร |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | เบราว์เซอร์ | ที่อยู่โปรเจกต์ Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | เบราว์เซอร์ | คีย์สาธารณะ ปลอดภัยที่จะส่งไปกับหน้าเว็บ |
| `SUPABASE_SECRET_KEY` | เซิร์ฟเวอร์ | ใช้ตอนผู้ใช้ลบบัญชีตัวเองเท่านั้น **ห้ามหลุด** |
| `TALEVO_AI_PROVIDER` | เซิร์ฟเวอร์ | `groq` หรือ `gemini` |
| `GROQ_API_KEY` / `GEMINI_API_KEY` | เซิร์ฟเวอร์ | คีย์ของผู้ให้บริการที่เลือก **ห้ามหลุด** |
| `TALEVO_AI_MODEL` | เซิร์ฟเวอร์ | ทับชื่อโมเดลเริ่มต้น (ไม่ใส่ก็ได้) |

## ตรวจคุณภาพ

```bash
npm run lint
npm run typecheck
npm run build
npm run qa:auth        # และ qa:* ตัวอื่น ดูรายการใน package.json
```

ชุด `qa:*` เป็นสคริปต์ Node ที่อ่านซอร์สและจำลองตรรกะ ไม่ต้องต่อเน็ต

## โครงสร้างสำคัญ

- `src/app` — App Router pages และ API routes
- `src/components` — UI ที่ใช้ร่วมกัน และโครงหน้าจอ
- `src/features` — โมดูลระดับหน้า
- `src/lib` — ตรรกะโดเมน (`ai/`, `alerts/`, `supabase/`, `persistence/`, `timetable/`)
- `src/providers` — app state, auth, language
- `src/styles` — สไตล์ที่ใช้ร่วมกันและการจัดหน้าจอตามขนาดอุปกรณ์
- `supabase/migrations` — schema, RLS และฟังก์ชันฐานข้อมูล
- `docs/` — เอกสารแยกตามหมวด ดู `docs/README.md`

## สิ่งที่ควรรู้

- AppState schema v8 เก็บใน browser พร้อม snapshot สำรอง และซิงก์ขึ้น Supabase
- ทุกตารางเปิด Row Level Security ผู้ใช้เห็นเฉพาะข้อมูลตัวเอง
- โควตา AI จำกัด 20 คำตอบต่อ 24 ชั่วโมงต่อบัญชี บังคับที่ฐานข้อมูล
- ลืมรหัสผ่านใช้รหัส 8 หลักทางอีเมล ต้องตั้ง **Email OTP Length = 8** ใน Supabase ให้ตรงกัน
- เปิดการแจ้งเตือนบนอุปกรณ์ครั้งเดียวแล้วจำไว้ เก็บไว้ที่ `localStorage` ของเครื่องนั้น (คีย์ `talevo-device-notifications`) ไม่ขึ้น cloud เพราะสิทธิ์และ push subscription เป็นของเครื่อง
- ตั้งค่าแจ้งเตือน (เปิด/ปิดแต่ละหัวข้อ) เก็บในตาราง `app_settings` จึงตามไปทุกเครื่องที่ล็อกอินบัญชีเดียวกัน
- เตือนตอนปิดแอปได้ผ่าน Web Push ต้องตั้ง `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `PUSH_DISPATCH_SECRET` และ cron ที่ยิง `/api/push/dispatch` (ดู `supabase/migrations/20261029000000_talevo_push_notifications.sql`) ถ้าไม่ได้ตั้ง จะเหลือเฉพาะแจ้งเตือนขณะเปิดแอป
- มาสคอตอยู่ที่ `public/assets/mascot/` เรียกผ่านคอมโพเนนต์ `TalevoMascot`
