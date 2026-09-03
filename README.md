# TALEVO — Your Academic OS

ตัวช่วยจัดการการเรียนที่เข้าใจนิสิตที่สุด โปรเจกต์นี้เป็น UI/UX foundation ที่ทำงานด้วย typed local state ภายใน browser session โดยยังไม่เชื่อม authentication, database, Supabase หรือ AI API จริง

## Technology

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS 4
- lucide-react

## เริ่มใช้งาน

ตรวจว่า PowerShell อยู่ที่โฟลเดอร์ `C:\Users\asus\talevo` แล้วรันทีละบรรทัด:

```powershell
npm install
npm run dev
```

เปิด `http://localhost:3000`

## ตรวจคุณภาพ

```powershell
npm run lint
npm run typecheck
npm run build
git diff --check
```

## โครงสร้างสำคัญ

- `src/app` — App Router pages
- `src/components` — reusable UI, navigation และ domain cards
- `src/features` — page-level feature modules
- `src/lib/app-state-defaults.ts` — production clean-slate defaults และ system configuration
- `src/providers/app-state-provider.tsx` — state abstraction สำหรับ UI
- `src/styles` — shared responsive feature styles
- `src/types` — shared data types

## ข้อจำกัดของระยะนี้

- state ถูกบันทึกใน browser ด้วย AppState schema v8 และมี primary/backup snapshot
- login/register ใช้ Supabase Auth และแยก AppState ในอุปกรณ์ตามบัญชี
- AI ใช้คำตอบแบบ rule-based จากข้อมูลที่ผู้ใช้บันทึกในอุปกรณ์ ยังไม่เชื่อมบริการ AI ภายนอก
- มาสคอต canonical อยู่ที่ `public/assets/mascot/` และเรียกผ่าน shared `TalevoMascot` component
