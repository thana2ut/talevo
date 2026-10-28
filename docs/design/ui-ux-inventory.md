# TALEVO UI/UX Route and Component Inventory

เอกสารนี้เป็น Inventory สำหรับการตรวจ Production UI/UX โดยไม่เปลี่ยน business logic, schema, RLS หรือข้อมูลผู้ใช้

## Route inventory

### Public และ Authentication

| Route | หน้าที่หลัก | State สำคัญ |
| --- | --- | --- |
| `/welcome` | แนะนำผลิตภัณฑ์และ CTA | responsive hero, navigation |
| `/login` | เข้าสู่ระบบ | validation, loading, auth error, confirmation notice |
| `/register` | สมัครสมาชิก 2 ขั้นตอน | progress, field errors, loading, email confirmation |
| `/forgot-password` | ขออีเมลกู้คืน | validation, loading, success, error |
| `/resend-confirmation` | ขออีเมลยืนยันใหม่ | validation, loading, success, cooldown |
| `/reset-password` | ตั้งรหัสผ่านใหม่ | invalid/expired link, loading, success, error |

### Authenticated user application

| Route | หน้าที่หลัก | UI หลัก |
| --- | --- | --- |
| `/today` | ภาพรวมวันนี้ | hero, schedule, urgent tasks, upcoming exams, finance summary, empty state |
| `/schedule` | ตารางเรียน | day/week/month tabs, date navigation, class cards, syllabus import, sheets |
| `/schedule/new` | เพิ่มหรือแก้ไขคาบเรียน | form, date/time, validation, submit feedback |
| `/tasks` | รายการงาน | filter tabs, search, task cards, empty state |
| `/tasks/new` | เพิ่มหรือแก้ไขงาน | form, priority, due date, subtasks, attachments |
| `/tasks/[id]` | รายละเอียดงาน | status, subtasks, attachments, edit/delete dialogs |
| `/exams` | รายการสอบ | upcoming/completed cards, date and course hierarchy |
| `/exams/new` | เพิ่มหรือแก้ไขการสอบ | form, date/time, topics, validation |
| `/exams/[id]` | รายละเอียดการสอบ | metadata, completion, edit/delete |
| `/grades` | ภาพรวมคะแนน | course cards, target state, empty state |
| `/grades/[courseId]` | วางแผนคะแนนรายวิชา | component cards, weights, target, what-if form |
| `/statistics` | สรุปการเรียน | period selector, KPI, charts, legends, zero state |
| `/finance` | Finance Pocket Dashboard V2 | month control, summary, pockets, recent transactions, sheets |
| `/finance/new` | เพิ่มรายการการเงิน | type/category/date form, validation |
| `/finance/[id]` | รายละเอียดรายการ | edit sheet, destructive confirmation |
| `/finance/budgets` | งบรายหมวด | responsive budget cards and numeric inputs |
| `/finance/savings` | เป้าหมายออมเงิน | progress cards, add/edit states |
| `/ai` | TALEVO AI | provider/quota status, chat, context selector, privacy, composer |
| `/notifications` | การแจ้งเตือน | read/unread, filter, mark read, dismiss, empty state |
| `/profile` | โปรไฟล์ | identity, academic summary, goal navigation |
| `/profile/personal` | ข้อมูลส่วนตัว | form and save feedback |
| `/profile/goals` | เป้าหมาย | form and save feedback |
| `/profile/edit` | compatibility redirect | redirect to personal profile |
| `/settings` | การตั้งค่า | account, profile, academic, notifications, appearance, privacy, data, danger zone |
| `/help` | ช่วยเหลือ | grouped guidance and disclosure controls |
| `/notes` | โน้ต | list, search, empty state |
| `/notes/new` | เพิ่มหรือแก้ไขโน้ต | form and save feedback |
| `/notes/[id]` | รายละเอียดโน้ต | content, edit/delete |
| `/calendar` | compatibility route | redirect to schedule |

### Admin Back Office

| Route | หน้าที่หลัก | ขอบเขตข้อมูล |
| --- | --- | --- |
| `/admin` | ภาพรวมบัญชี | account/profile directory metrics เท่านั้น |
| `/admin/users` | รายชื่อผู้ใช้ | search, responsive rows/cards, pagination |
| `/admin/users/[id]` | รายละเอียดบัญชี | account/profile/academic directory เท่านั้น |

### Development-only QA

| Route | Guard |
| --- | --- |
| `/qa/local-cloud-migration` | `NODE_ENV === "development"` ทั้ง Proxy และ Page |

## Shared UI inventory

- App shell: desktop sidebar, tablet compact sidebar, mobile bottom navigation, quick-add sheet, top bar
- Canonical primitives: `Card`, `IconButton`, `PageHeader`, `ProgressBar`, `StatusPill`, `Field`, `Input`, `Textarea`, `Select`, `BottomSheet`, `EmptyState`
- Interaction patterns: tablist, search, filters, pagination, dropdown/select, date/time inputs, toast/status, alert, loading screen, error boundary
- Overlay patterns: modal/bottom sheet, backdrop close, Escape close, focus trap, focus restoration, viewport-constrained scrolling
- Feedback patterns: loading/disabled submit, `role="status"`, field and request `role="alert"`, destructive confirmation
- Responsive priorities: 320–430 phone, 600–834 tablet, 1024–1920 desktop, 390×844 and 1366×768 critical viewports

## Canonical visual foundations

- Color: semantic background/surface/primary/text/border/success/warning/danger/info aliases
- Spacing: 4, 8, 12, 16, 20, 24, 32, 40, 48
- Radius: small, medium, large, extra-large, full
- Elevation: subtle, card, floating/dialog
- Controls: 52px form controls and primary buttons; 44px compact/mobile tap target
- Motion: 140–240ms with `prefers-reduced-motion` fallback
- Mobile browser: `svh`/`dvh`, safe-area top/bottom, 16px form text, no horizontal page overflow
