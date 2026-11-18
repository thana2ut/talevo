# แผนที่ไฟล์และกติกาจัดหมวด

ขอบเขต: repository TALEVO บนเครื่องและ GitHub ไม่รวมไฟล์ส่วนตัวนอกโปรเจกต์.

## เริ่มจากประเภทงาน

| ประเภทงาน | เปิดที่นี่ก่อน | จุดที่เกี่ยวข้อง |
| --- | --- | --- |
| หน้าแรกและเมนู | [หน้าแรก](../src/features/today/) | [โครงแอปและแถบเมนู](../src/components/app-shell.tsx), [สไตล์มือถือและ iPad](../src/styles/mobile-app.css) |
| ตารางเรียนและสอบ | [ตารางเรียน](../src/features/schedule/), [การเรียนและสอบ](../src/features/academic/) | [API อ่านเอกสารตาราง](../src/app/api/ai/syllabus/) |
| งานและนำเข้าจากภาพ | [งาน](../src/features/tasks/), [นำเข้าจากภาพ](../src/features/vision/) | [API นำเข้าจากภาพ](../src/app/api/vision/) |
| แชตและสั่งงานด้วยเสียง | [หน้าจอ AI](../src/features/ai/) | [ตรรกะ AI](../src/lib/ai/), [API AI](../src/app/api/ai/) |
| คะแนนและเกณฑ์เกรด | [หน้าคำนวณคะแนน](../src/features/grade-lab/) | [API คะแนน](../src/app/api/grade-lab/) |
| กระดิ่งและแจ้งเตือนนอกแอป | [หน้าการแจ้งเตือน](../src/app/notifications/) | [ตรรกะแจ้งเตือน](../src/lib/alerts/), [Web Push](../src/lib/push/) |
| บัญชีและแอดมิน | [โปรไฟล์](../src/features/profile/), [แอดมิน](../src/features/admin/) | [Supabase](../src/lib/supabase/), [SQL สำหรับตรวจ](../supabase/manual/) |
| เผยแพร่และตรวจงาน | [คู่มือ Cloudflare](operations/cloudflare-deployment.md), [สารบัญเครื่องมือ](../scripts/README.md) | [Workflow](../.github/workflows/), [ผลการตรวจ](qa/) |

## ตำแหน่งไฟล์ตามหน้าที่

| ตำแหน่ง | เก็บอะไร |
| --- | --- |
| `src/app/` | URL, layouts, API และ server entry points |
| `src/features/<feature>/` | หน้าจอและ logic เฉพาะฟีเจอร์ |
| `src/components/` | ส่วนหน้าจอที่ใช้ร่วมกัน |
| `src/lib/security/` | validation และมาตรการรักษาความปลอดภัย |
| `src/lib/supabase/` | การเชื่อมต่อและ persistence ของบัญชี |
| `src/providers/`, `src/types/`, `src/styles/` | state ร่วม, types และ styles |
| `public/` | ไฟล์สาธารณะ ใครทราบ URL ก็เปิดได้ ห้ามเก็บข้อมูลลับ |
| `config/`, `workers/`, `.github/` | config ที่ไม่มี secret, Cloudflare entry points และ workflow |
| `scripts/` | เครื่องมือและ QA ดู scripts/README.md |
| `scripts/maintenance/` | เครื่องมือที่เขียน/บำรุงรักษา source ต้องตรวจ diff หลังรัน |
| `scripts/media/` | เครื่องมือสื่อ; local/ เป็นงานเฉพาะเครื่องที่ไม่เผยแพร่ |
| `supabase/migrations/` | ประวัติ migration ห้ามย้าย/เปลี่ยนชื่อไฟล์ที่ deploy แล้ว |
| `supabase/manual/` | SQL ที่เจ้าของต้องตรวจและอนุมัติก่อนรัน |
| `supabase/tests/` | SQL ทดสอบ ใช้ข้อมูลสมมติและสภาพแวดล้อมควบคุม |
| `docs/operations/` | คู่มือ deploy และดูแลโฮสต์ |
| `docs/features/` | บันทึกการเปลี่ยนฟีเจอร์และภาษา |
| `docs/security/` | threat model, security review และผลตรวจ release |
| `docs/design/`, `docs/qa/`, `docs/supabase/` | เอกสารเฉพาะด้าน |
| `deliverables/` | ผลงานส่งมอบ ตรวจข้อมูลส่วนบุคคลและขนาดก่อนเพิ่ม Git |
| `.cloudflare/`, `.next/`, `dist/`, `node_modules/` | build/cache/local checks ไม่ใช่ source และถูก ignore |

## เมื่อต้องเพิ่มหรือแก้ไฟล์

1. ใช้หมวดเดิมก่อนเพิ่มโฟลเดอร์ใหม่ ตั้งชื่อตามฟีเจอร์ให้ชัดเจน.
2. เอกสารใหม่ต้องอยู่ในหมวด และเพิ่มลิงก์จาก docs/README.md.
3. ไฟล์ config ที่ framework ต้องค้นหาที่ root ให้คงอยู่ที่ root.
4. ก่อนย้ายไฟล์ ค้นผู้เรียกด้วย rg แล้วแก้ imports, scripts และลิงก์ที่เกี่ยวข้อง.
5. ไม่เก็บ `.env.local`, tokens, credentials, database dump หรือข้อมูลผู้ใช้จริงใน Git/public/fixtures.
6. ไม่ใช้ `git add .`; ตรวจ diff และเพิ่มเฉพาะไฟล์ที่ต้องเผยแพร่.
7. ตรวจ lint/build/diff ก่อน commit และคง migration เดิมเพื่อให้ rollback ตรวจสอบได้.

### เก็บงานรอบถัดไป

- โค้ดของหน้าจอให้เพิ่มในหมวดฟีเจอร์ที่รับผิดชอบ ส่วนที่หลายหน้าต้องใช้ร่วมกันจึงเก็บในโฟลเดอร์ส่วนกลาง
- บันทึกการเปลี่ยนแปลงที่ต้องเก็บระยะยาวไว้ในหมวดเอกสารที่เกี่ยวข้องและลิงก์จากสารบัญ ส่วนไฟล์ชั่วคราวจาก build หรือ deploy ให้เก็บใน `.cloudflare/` บนเครื่อง
- ผลงานที่จะส่งมอบแยกโฟลเดอร์ตามชื่อชิ้นงานใน `deliverables/` และใช้ README ของชิ้นงานนั้นเป็นจุดเริ่มต้น
