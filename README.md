# FireCheck — ระบบตรวจเช็คถังดับเพลิง

ระบบเว็บแอปสำหรับตรวจเช็คถังดับเพลิง รองรับมือถือและคอมพิวเตอร์ พร้อม Dashboard, QR Code, GPS, ลายเซ็นดิจิทัล, ถ่ายรูปประกอบ และรายงาน PDF/Excel

## ไฟล์ในชุดนี้

| ไฟล์ | หน้าที่ |
|---|---|
| `index.html` | เว็บแอปฝั่งหน้าบ้านทั้งหมด (Login, Dashboard, จัดการถังดับเพลิง, สแกน QR, แบบฟอร์มตรวจเช็ค, ประวัติ, รายงาน, Admin) |
| `Code.gs` | โค้ด Backend สำหรับ Google Apps Script เชื่อมกับ Google Sheets / Google Drive / Gmail |
| `README.md` | เอกสารนี้ |

---

## 1. ทดลองใช้งานทันที (Demo Mode)

เปิด `index.html` ในเบราว์เซอร์ได้เลย ระบบจะสร้างข้อมูลจำลอง (ถังดับเพลิง 24 จุด ใน 3 อาคาร พร้อมประวัติการตรวจ) ไว้ในหน่วยความจำเบราว์เซอร์ให้ทดลองทุกฟีเจอร์:

- บัญชีทดลอง: `admin/admin123`, `inspector/insp123`, `supervisor/sup123`, `exec/exec123`
- **ข้อจำกัดของโหมดเดโม:** ข้อมูลจะหายเมื่อรีเฟรชหน้า เพราะไม่ได้เชื่อมฐานข้อมูลจริง (ตามข้อกำหนดของสภาพแวดล้อมสาธิตนี้ ห้ามใช้ localStorage) — สำหรับใช้งานจริงให้เชื่อมกับ Backend ตามขั้นตอนด้านล่าง
- กล้องสำหรับสแกน QR อาจถูกจำกัดสิทธิ์ในบางสภาพแวดล้อม ระบบมีช่องค้นหาด้วยรหัสถังและปุ่มเลือกจากรายการเป็นทางเลือกสำรอง

---

## 2. ติดตั้งใช้งานจริงด้วย Google Apps Script + Google Sheets

### ขั้นตอนที่ 1 — สร้าง Google Sheet
1. สร้าง Google Sheet ใหม่ ตั้งชื่อ `FireCheck_DB`
2. เปิดเมนู **ส่วนขยาย (Extensions) > Apps Script**
3. ลบโค้ดเดิมทั้งหมด แล้ววางเนื้อหาจากไฟล์ `Code.gs` ที่แนบมา
4. บันทึกโปรเจกต์ (ตั้งชื่อ เช่น `FireCheck Backend`)

### ขั้นตอนที่ 2 — สร้างโครงสร้างฐานข้อมูลอัตโนมัติ
1. ในหน้า Apps Script เลือกฟังก์ชัน `setupSheets` จาก dropdown ด้านบน แล้วกด ▶ Run
2. อนุญาตสิทธิ์ (Authorize) ตามที่ระบบขอ (เข้าถึง Sheets, Drive, Gmail)
3. ระบบจะสร้างชีตอัตโนมัติ 4 ชีต พร้อมหัวตาราง:

**ชีต `Extinguishers`**
```
id | code | qrCode | serial | type | size | building | floor | room | lat | lng |
installDate | expireDate | company | owner | photoUrl | status | lastInspected | createdAt
```

**ชีต `Inspections`**
```
id | extId | date | inspector | pressure | checklistJSON | result | notes |
photoUrls | gpsLat | gpsLng | signatureUrl | supervisorSignatureUrl | createdAt
```

**ชีต `Users`**
```
username | passwordHash | role | fullName | email | active
```
> เพิ่มผู้ใช้ด้วยตนเองในชีตนี้ โดย `passwordHash` คำนวณจาก SHA-256 ของรหัสผ่าน (ใช้ฟังก์ชัน `hashPassword()` ใน Apps Script Editor เพื่อสร้างค่า hash แล้วนำมาวางในชีต) — `role` ใช้ค่า `admin`, `inspector`, `supervisor`, หรือ `exec`

**ชีต `ActivityLog`**
```
timestamp | user | action | detail
```

4. ระบบจะสร้างโฟลเดอร์ Google Drive ชื่อ `FireCheck_Photos` ให้อัตโนมัติสำหรับเก็บรูปถ่ายและลายเซ็น

### ขั้นตอนที่ 3 — ตั้งค่าการแจ้งเตือน (ไม่บังคับ)
- แก้ค่า `ADMIN_EMAIL` ใน `Code.gs` เป็นอีเมลที่ต้องการรับแจ้งเตือน
- หากต้องการแจ้งเตือนผ่าน LINE ให้ขอ Token จาก [LINE Notify](https://notify-bot.line.me/) แล้วใส่ในตัวแปร `LINE_NOTIFY_TOKEN`
- ตั้ง Trigger อัตโนมัติ: เมนู **Triggers (นาฬิกา)** ทางซ้าย > Add Trigger > เลือกฟังก์ชัน `dailyExpiryCheck` > Time-driven > Day timer เพื่อให้ระบบแจ้งเตือนถังใกล้หมดอายุทุกวัน

### ขั้นตอนที่ 4 — Deploy เป็น Web App
1. มุมขวาบน กด **Deploy > New deployment**
2. เลือกประเภท **Web app**
3. ตั้งค่า:
   - Execute as: **Me**
   - Who has access: **Anyone with the link** (หรือจำกัดเฉพาะภายในองค์กรถ้าใช้ Google Workspace)
4. กด Deploy แล้วคัดลอก **Web app URL** ที่ได้ (รูปแบบ `https://script.google.com/macros/s/xxxx/exec`)

### ขั้นตอนที่ 5 — เชื่อมฝั่ง Frontend เข้ากับ Backend จริง
ไฟล์ `index.html` ที่แนบมาเป็นเวอร์ชันเดโมที่ใช้ข้อมูลในหน่วยความจำเพื่อให้ทดลองได้ทันที สำหรับใช้งานจริง ให้แก้ไขจุดที่มีการจัดการข้อมูล (`extinguishers`, `inspections`, ฟังก์ชัน `saveExt`, `submitInspection`, `doLogin` ฯลฯ) ให้เรียก API ผ่าน `fetch()` ไปยัง Web App URL แทนการอ่าน/เขียนตัวแปรในหน่วยความจำ ตัวอย่าง:

```javascript
const API_URL = 'https://script.google.com/macros/s/XXXXXXXX/exec';

// อ่านรายการถังดับเพลิง
async function fetchExtinguishers() {
  const res = await fetch(`${API_URL}?action=listExtinguishers`);
  return await res.json();
}

// ส่งผลตรวจ
async function postInspection(payload) {
  const res = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({ action: 'submitInspection', payload })
  });
  return await res.json();
}
```

> หมายเหตุ: Google Apps Script Web App ไม่รองรับ custom headers แบบ `Content-Type: application/json` โดยตรงจากบางเบราว์เซอร์เนื่องจาก CORS — วิธีที่นิยมคือส่งเป็น `text/plain` แล้วให้ `doPost` เรียก `JSON.parse(e.postData.contents)` ตามที่เขียนไว้ใน `Code.gs` แล้ว

---

## 3. Endpoints ที่มีให้ใน Code.gs

| Method | action | คำอธิบาย |
|---|---|---|
| GET | `listExtinguishers` | ดึงรายการถังดับเพลิงทั้งหมด |
| GET | `getExtinguisher&id=` | ดึงข้อมูลถังดับเพลิงรายตัว |
| GET | `listInspections&extId=` | ดึงประวัติการตรวจ (ระบุ extId เพื่อกรองเฉพาะถังนั้น) |
| GET | `dashboard` | สรุปจำนวนตามสถานะสำหรับ Dashboard |
| POST | `login` | เข้าสู่ระบบ (username, password) |
| POST | `createExt` | เพิ่มถังดับเพลิงใหม่ |
| POST | `updateExt` | แก้ไขข้อมูลถังดับเพลิง |
| POST | `deleteExt` | ลบถังดับเพลิง |
| POST | `submitInspection` | บันทึกผลตรวจ (รวมรูปภาพ Base64 → บันทึกลง Drive อัตโนมัติ, ส่งอีเมล/LINE แจ้งเตือนถ้าผลไม่ผ่าน) |

---

## 4. ความปลอดภัยที่ควรเพิ่มเติมก่อนใช้งานจริง

- เปลี่ยนรหัสผ่านผู้ใช้ตัวอย่างทั้งหมด และเก็บ `passwordHash` เท่านั้น (ห้ามเก็บรหัสผ่านตรงๆ)
- จำกัดสิทธิ์ Web App เป็น "Anyone within organization" หากใช้ Google Workspace เพื่อลดความเสี่ยงเข้าถึงจากภายนอก
- เพิ่มการตรวจสอบ Token/Session ฝั่ง `doGet`/`doPost` หากต้องการความปลอดภัยระดับสูงขึ้น (เช่น ออก token หลัง login แล้วตรวจสอบทุกคำขอ)
- ตั้งค่า Google Drive folder เป็น private และแชร์เฉพาะกับผู้ใช้ที่เกี่ยวข้อง แทนการตั้งเป็น "Anyone with the link" หากข้อมูลภาพถ่ายเป็นความลับ

---

## 5. แนวทางต่อยอด

- เพิ่มระบบ Push Notification ผ่าน Firebase Cloud Messaging สำหรับแจ้งเตือนแบบ Real-time บนมือถือ
- เพิ่มการยืนยันตัวตนแบบ Google Workspace SSO (OAuth) แทน username/password
- ต่อยอดเป็น Safety Management System โดยเพิ่มโมดูลตรวจเช็คอุปกรณ์ความปลอดภัยอื่น เช่น สปริงเกลอร์, ทางหนีไฟ, ไฟฉุกเฉิน ในโครงสร้างฐานข้อมูลเดียวกัน
