# เครื่องมือบำรุงรักษา

รันจากโฟลเดอร์โปรเจกต์ TALEVO ใน PowerShell:

```powershell
node scripts/maintenance/localize-ui.cjs
```

คำสั่งนี้เขียน catalogue ภาษาใน source จึงควรเก็บงานค้างและตรวจ diff หลังรัน.
ไม่ได้รันคำสั่งสร้าง catalogue ในการจัดโฟลเดอร์ครั้งนี้.
สคริปต์อ้างเส้นทางจาก working directory ของโปรเจกต์ ไม่ใช่จากโฟลเดอร์ scripts.
