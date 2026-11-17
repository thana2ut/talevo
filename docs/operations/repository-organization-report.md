# ผลการจัดระเบียบโปรเจกต์ TALEVO

วันที่ 17 พฤศจิกายน 2026 ขอบเขตคือ `C:\Users\asus\talevo` และ GitHub repository ของโปรเจกต์.
ไม่จัดไฟล์ส่วนตัวนอกโปรเจกต์ และไม่รัน SQL, migration, seed หรือแก้ .env.local.

## รอบแรก — commit 62640c4

- ย้ายเอกสาร 5 ไฟล์เข้าหมวด docs/features, docs/operations และ docs/security.
- เพิ่มสารบัญจาก README หลักไปยัง docs/README.md และ scripts/README.md.
- เพิ่มคู่มือแยกหมวดฐานข้อมูลและผลงานส่งมอบ.
- เพิ่มกติกาใน AGENTS.md ให้ใช้แผนที่โฟลเดอร์ทุกครั้งที่เพิ่มหรือย้ายไฟล์.
- ignore สถานะเครื่องมือเฉพาะเครื่อง .claude และ supabase/.temp.
- lint/build/diff check ผ่าน และตรวจลิงก์ที่เกี่ยวข้อง 13 จุดไม่พบลิงก์เสีย.
- push ขึ้น branch security-hardening บน GitHub สำเร็จ.

## รอบต่อเนื่อง

| เดิม | ใหม่ | เหตุผล |
| --- | --- | --- |
| scripts/localize-ui.cjs | scripts/maintenance/localize-ui.cjs | แยกเครื่องมือเขียน catalogue ออกจาก QA และ deployment |
| scripts/render-talevo-promo.py | scripts/media/local/render-talevo-promo.py | แยกเครื่องมือสร้างสื่อเฉพาะเครื่อง |
| scripts/render-talevo-promo-reference.py | scripts/media/local/render-talevo-promo-reference.py | แยกเครื่องมือที่อ้างไฟล์แนบส่วนตัวและเครื่องมือในเครื่อง |

สคริปต์วิดีโอทั้งสองมีสำเนาก่อนย้ายใน `.cloudflare/organization-backup/`.
ปรับ ROOT จาก parents[1] เป็น parents[3] ตามระดับโฟลเดอร์ใหม่;
ที่อยู่ assets และผลลัพธ์ deliverables/talevo-promo คงเดิม.
ไม่ได้รัน renderer หรือ utility ที่เขียน catalogue เพื่อหลีกเลี่ยงการสร้าง/เปลี่ยนผลงานโดยไม่จำเป็น.

เพิ่ม scripts/maintenance/README.md และ scripts/media/README.md;
ปรับ scripts/README.md, docs/project-organization.md และ reference ในเอกสารภาษา.
สคริปต์วิดีโอเป็นไฟล์เฉพาะเครื่องที่ยังไม่เคย track และมี private paths จึง ignore scripts/media/local.
ไม่มีการเพิ่มสื่อจริง ไอคอนที่ค้างอยู่ หรือ SQL ที่รอ review เข้า commit งานจัดหมวด.

## แนวทางครั้งต่อไป

อ่าน [แผนที่โปรเจกต์](../project-organization.md) ก่อนเพิ่มไฟล์.
ใช้หมวดเดิมตามหน้าที่; เอกสารใหม่ต้องเพิ่มลิงก์ใน docs/README.md.
คง framework configs ที่ root และคง timestamp/ชื่อของ migration ที่ deploy แล้ว.
QA และ deploy entry points ที่ package.json/workflow เรียกยังคงตำแหน่งเดิม.
ก่อนจัด QA ลงโฟลเดอร์ย่อยในอนาคต ต้องตรวจ relative imports, projectRoot และ fixtures ทั้งหมดก่อน.

## ความปลอดภัยและการย้อนกลับ

`.env.local`, CLI cache และ local rendering scripts ไม่ขึ้น GitHub.
ตรวจ staged filenames ก่อน commit และเพิ่มไฟล์ตามรายการ ไม่ใช้ git add .
หากจะย้ายสคริปต์วิดีโอกลับ ให้สำรองไฟล์ล่าสุดก่อน แล้วคืนชื่อเดิมพร้อม ROOT เป็น parents[1].
สำเนาก่อนย้ายใช้เทียบได้ แต่ไม่ควรเขียนทับไฟล์ที่มีการแก้ใหม่.
ใช้ git revert สำหรับ commit งานจัดหมวดในสำเนาที่สะอาด;
อย่าใช้ reset --hard หรือ git clean เพราะยังมีงานอื่นค้างในเครื่อง.

ผล lint/build และการตรวจรอบต่อเนื่องบันทึกใน `.cloudflare/organization-phase2-*.log`.

- npm run lint: ผ่าน exit 0
- npm run build: ผ่าน exit 0
- git diff --check: ผ่าน; LF/CRLF เป็น warning ปกติบน Windows
- node --check ของ maintenance script และ Python AST ของ renderer ทั้งสอง: ผ่าน โดยไม่รันการสร้างไฟล์
- ลิงก์สารบัญและรายงานรอบต่อเนื่อง: ตรวจ 12 จุด ไม่พบลิงก์เสีย
