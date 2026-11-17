# เอกสาร TALEVO

เริ่มที่ [แผนที่โปรเจกต์และกติกาจัดหมวด](project-organization.md) · [เครื่องมือและ QA](../scripts/README.md)

## คู่มือดูแลระบบ

- [Cloudflare และการ deploy](operations/cloudflare-deployment.md)

## ฟีเจอร์และการเปลี่ยนแปลง

- [ภาษาและตารางเรียน](features/interface-language-timetable-update.md)
- [ประวัติ learning tools](features/learning-tools-release.md)
- [การนำฟีเจอร์นำเข้า syllabus ออก](features/course-syllabus-removal.md)

## ความปลอดภัย

- [Threat model](security/threat-model.md)
- [ผลตรวจความปลอดภัย](security/security-review-2026-11-17.md)
- [รายงาน security release และ rollback](security/release-2026-11-17.md)
- [การเสริมความปลอดภัยข้อมูล](security/data-hardening-2026-11-17.md)

| โฟลเดอร์ | เนื้อหา |
|---|---|
| `operations/` | การเผยแพร่และดูแลระบบ |
| `features/` | ขอบเขตและประวัติการเปลี่ยนฟีเจอร์ |
| `supabase/` | ระบบฐานข้อมูล การยืนยันตัวตน และการย้ายข้อมูลขึ้นคลาวด์ |
| `qa/` | เช็กลิสต์และผลการทดสอบ |
| `security/` | Threat model และประเด็นความปลอดภัย |
| `design/` | รายการหน้าจอและคอมโพเนนต์ UI/UX |
