# TALEVO Threat Model

ปรับปรุงล่าสุด: 2 กันยายน 2026

เอกสารนี้กำหนดขอบเขตความเสี่ยงก่อนเปิดใช้งานจริง ไม่ได้อ้างว่าแอปปลอดภัย 100% แต่ใช้เป็นหลักฐานว่า Critical/High findings ที่รู้จักถูกตรวจและควบคุมตามขอบเขตการทดสอบ

## Actors และ trust boundary

| Actor | สิ่งที่ทำได้ | Trust level |
| --- | --- | --- |
| Anonymous visitor | เปิด public/auth pages และเรียก public endpoint | ไม่เชื่อถือ |
| Authenticated user | จัดการข้อมูลของบัญชีตนเองผ่าน RLS | เชื่อเฉพาะ identity จาก Supabase server/session |
| Malicious user | เปลี่ยน ID/payload และเรียก API ตรง | ไม่เชื่อถือ |
| Admin | อ่าน account/profile directory ตาม RPC ที่จำกัดไว้ | เชื่อหลัง server + database membership check เท่านั้น |
| Compromised browser/session | ทำสิ่งที่ session เจ้าของบัญชีทำได้ | มีความเสี่ยงสูง ต้องจำกัดอายุ session และไม่เก็บ secret |
| Malicious document | ส่ง PDF/ภาพที่ปลอม MIME หรือมี prompt injection | ไม่เชื่อถือ |
| External AI provider | ประมวลผลเฉพาะ prompt/context ที่ผู้ใช้เลือก | ระบบภายนอก ไม่ส่งข้อมูลเกินจำเป็น |
| Direct API attacker | ส่ง cross-origin, oversized หรือ malformed request | ไม่เชื่อถือ |
| Multiple tabs/devices | เขียนข้อมูลพร้อมกันหรือ retry ซ้ำ | เชื่อ identity แต่ไม่เชื่อลำดับเหตุการณ์ |

## Assets

Account/email, academic profile, schedule, tasks/subtasks, exams/topics, grades, finance, notifications, AI conversations, AppState v8, cloud rows, admin metadata, auth session และ server secrets

## Threats, severity และ controls

| Threat | Severity | Primary controls |
| --- | --- | --- |
| Authentication bypass/session spoofing | Critical | Supabase Auth, server `getUser()`/claims refresh, protected-route proxy |
| IDOR/cross-user read or write | Critical | `auth.uid()` RLS, owner-derived server identity, composite owner FKs |
| Admin privilege escalation | Critical | private admin membership, server RPC check before query, revoked grants |
| Secret leakage | Critical | server-only modules, no `NEXT_PUBLIC_*` secret, production bundle scan |
| Silent data loss/account cache crossover | Critical | account namespaces, primary+backup v8, validation before hydration |
| XSS from user/AI content | High | React text rendering, no dynamic HTML/eval, restrictive base/object CSP |
| CSRF on browser mutations | High | same-origin validation, Fetch Metadata fallback, explicit account-delete header |
| Malicious/oversized upload | High | MIME+extension+magic bytes, non-empty and size limits, no binary persistence |
| AI prompt injection/data over-sharing | High | context defaults OFF, fixed allowlist, read-only/no tools, preview before import |
| Unsafe public/admin cache | High | private no-store API/admin headers, authorization per request |
| Open redirect | High | internal-path normalization and callback allowlist |
| Duplicate/race mutation | Medium | submit locks, AI quota lease, atomic AppState mutation, stable IDs/signatures |
| Corrupt/old AppState | Medium | v8 migration and normalization, backup fallback, unknown-field compatibility |
| Provider/network failure | Medium | timeout/cancel, safe errors, retry UI, release quota lease on failure |
| Clickjacking/MIME confusion | Medium | frame-ancestors/X-Frame-Options, nosniff |
| Sensitive logging | Medium | production-safe errors; no prompt, token, credential or raw provider logging |
| Dependency vulnerability | Variable | production/full `npm audit`, review before upgrades; no forced remediation |

## Important invariants

- Client-supplied `user_id` never grants ownership.
- Service/secret keys never enter browser code or responses.
- AI has no database/admin/finance mutation tools.
- Syllabus content is untrusted and cannot directly write AppState or database; normalized preview and explicit confirmation are required.
- Local v8 primary/backup and IndexedDB are not globally cleared during logout, failure or account switching.
- Production QA/probe routes are unavailable by server/build guard, not hidden with CSS.

## Residual validation

Static and mocked tests cannot prove live session expiry, real two-account device switching, deployed RLS state, physical mobile keyboard behavior, or external provider availability. These remain in `docs/talevo-final-live-qa.md` and require an authenticated, non-destructive final run.
