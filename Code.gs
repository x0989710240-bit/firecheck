/**
 * ============================================================================
 *  FireCheck — ระบบตรวจเช็คถังดับเพลิง
 *  Backend: Google Apps Script + Google Sheets + Google Drive + Gmail
 * ============================================================================
 *  วิธีติดตั้ง (ดูรายละเอียดเต็มใน README.md):
 *  1. สร้าง Google Sheet ใหม่ ตั้งชื่อ "FireCheck_DB"
 *  2. เปิด Extensions > Apps Script แล้ววางไฟล์นี้ทับ Code.gs
 *  3. รันฟังก์ชัน setupSheets() หนึ่งครั้ง เพื่อสร้างชีตและหัวตารางอัตโนมัติ
 *  4. Deploy > New deployment > Web app
 *       - Execute as: Me
 *       - Who has access: Anyone with the link (หรือ Anyone within org)
 *  5. คัดลอก Web App URL ไปตั้งค่าที่ฝั่ง Frontend (ตัวแปร API_URL ใน index.html)
 * ============================================================================
 */

/* ------------------------- ค่าคงที่ / การตั้งค่า ------------------------- */
const SHEET_EXT = 'Extinguishers';
const SHEET_INSPECTIONS = 'Inspections';
const SHEET_USERS = 'Users';
const SHEET_LOG = 'ActivityLog';
const DRIVE_FOLDER_NAME = 'FireCheck_Photos';
const NOTIFY_DAYS_BEFORE_EXPIRE = 60; // แจ้งเตือนล่วงหน้ากี่วันก่อนหมดอายุ
const ADMIN_EMAIL = 'safety-admin@example.com'; // อีเมลผู้รับแจ้งเตือนหลัก
const LINE_NOTIFY_TOKEN = ''; // ใส่ LINE Notify token ถ้าต้องการแจ้งเตือนผ่าน LINE

/* ------------------------------ SETUP ------------------------------ */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const extHeaders = ['id','code','qrCode','serial','type','size','building','floor','room',
    'lat','lng','installDate','expireDate','company','owner','photoUrl','status','lastInspected','createdAt'];
  const inspHeaders = ['id','extId','date','inspector','pressure','checklistJSON','result','notes',
    'photoUrls','gpsLat','gpsLng','signatureUrl','supervisorSignatureUrl','createdAt'];
  const userHeaders = ['username','passwordHash','role','fullName','email','active'];
  const logHeaders = ['timestamp','user','action','detail'];

  ensureSheet(ss, SHEET_EXT, extHeaders);
  ensureSheet(ss, SHEET_INSPECTIONS, inspHeaders);
  ensureSheet(ss, SHEET_USERS, userHeaders);
  ensureSheet(ss, SHEET_LOG, logHeaders);

  // สร้างโฟลเดอร์ Drive สำหรับเก็บรูปภาพ ถ้ายังไม่มี
  getOrCreatePhotoFolder();

  SpreadsheetApp.getUi().alert('ตั้งค่าฐานข้อมูลเรียบร้อยแล้ว: สร้างชีต Extinguishers, Inspections, Users, ActivityLog และโฟลเดอร์ Drive สำหรับรูปภาพ');
}

function ensureSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#C62828').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getOrCreatePhotoFolder() {
  const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(DRIVE_FOLDER_NAME);
}

/* ------------------------------ WEB APP ENTRY POINTS ------------------------------ */
// GET  ?action=list|get|report&...   -> อ่านข้อมูล
// POST body: {action:'login'|'createExt'|'updateExt'|'deleteExt'|'submitInspection', payload:{...}}

function doGet(e) {
  const action = e.parameter.action;
  try {
    let result;
    switch (action) {
      case 'listExtinguishers': result = listExtinguishers(); break;
      case 'listInspections': result = listInspections(e.parameter.extId); break;
      case 'getExtinguisher': result = getExtinguisher(e.parameter.id); break;
      case 'dashboard': result = getDashboardSummary(); break;
      default: result = { error: 'Unknown action' };
    }
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    const payload = body.payload || {};
    let result;
    switch (action) {
      case 'login': result = login(payload.username, payload.password); break;
      case 'createExt': result = createExtinguisher(payload); break;
      case 'updateExt': result = updateExtinguisher(payload); break;
      case 'deleteExt': result = deleteExtinguisher(payload.id); break;
      case 'submitInspection': result = submitInspection(payload); break;
      default: result = { error: 'Unknown action' };
    }
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------ AUTH ------------------------------ */
function login(username, password) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS);
  const rows = sheet.getDataRange().getValues();
  const headers = rows.shift();
  const hash = hashPassword(password);
  for (const row of rows) {
    const u = rowToObject(headers, row);
    if (u.username === username && u.passwordHash === hash && u.active) {
      logActivity(username, 'เข้าสู่ระบบ', '');
      delete u.passwordHash;
      return { success: true, user: u };
    }
  }
  return { success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
}
function hashPassword(pw) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pw));
}

/* ------------------------------ EXTINGUISHERS CRUD ------------------------------ */
function listExtinguishers() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_EXT);
  const rows = sheet.getDataRange().getValues();
  const headers = rows.shift();
  return rows.map(r => rowToObject(headers, r));
}
function getExtinguisher(id) {
  return listExtinguishers().find(e => e.id === id) || null;
}
function createExtinguisher(payload) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_EXT);
  const id = 'ext-' + new Date().getTime();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map(h => {
    if (h === 'id') return id;
    if (h === 'qrCode') return 'FE:' + payload.code;
    if (h === 'status') return 'not_inspected';
    if (h === 'createdAt') return new Date();
    return payload[h] || '';
  });
  sheet.appendRow(row);
  logActivity(payload.updatedBy || 'system', 'เพิ่มถังดับเพลิงใหม่', payload.code);
  return { success: true, id };
}
function updateExtinguisher(payload) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_EXT);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const idCol = headers.indexOf('id');
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][idCol] === payload.id) {
      headers.forEach((h, colIdx) => {
        if (payload[h] !== undefined) sheet.getRange(i + 1, colIdx + 1).setValue(payload[h]);
      });
      logActivity(payload.updatedBy || 'system', 'แก้ไขข้อมูลถังดับเพลิง', payload.code || payload.id);
      return { success: true };
    }
  }
  return { success: false, message: 'ไม่พบรายการ' };
}
function deleteExtinguisher(id) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_EXT);
  const rows = sheet.getDataRange().getValues();
  const idCol = rows[0].indexOf('id');
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][idCol] === id) {
      sheet.deleteRow(i + 1);
      logActivity('system', 'ลบถังดับเพลิง', id);
      return { success: true };
    }
  }
  return { success: false };
}

/* ------------------------------ INSPECTIONS ------------------------------ */
function listInspections(extId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_INSPECTIONS);
  const rows = sheet.getDataRange().getValues();
  const headers = rows.shift();
  let list = rows.map(r => rowToObject(headers, r));
  if (extId) list = list.filter(i => i.extId === extId);
  return list;
}

/**
 * payload: {extId, date, inspector, pressure, checklist:{}, result, notes,
 *           photosBase64:[{data,tag,filename}], gpsLat, gpsLng, signatureBase64}
 */
function submitInspection(payload) {
  const folder = getOrCreatePhotoFolder();
  const photoUrls = (payload.photosBase64 || []).map(p => saveBase64Image(folder, p.data, p.filename));
  const sigUrl = payload.signatureBase64 ? saveBase64Image(folder, payload.signatureBase64, 'signature_' + Date.now()) : '';

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_INSPECTIONS);
  const id = 'insp-' + new Date().getTime();
  sheet.appendRow([
    id, payload.extId, payload.date, payload.inspector, payload.pressure,
    JSON.stringify(payload.checklist || {}), payload.result, payload.notes || '',
    photoUrls.join(','), payload.gpsLat || '', payload.gpsLng || '', sigUrl, '', new Date()
  ]);

  // อัปเดตสถานะถังดับเพลิง
  updateExtinguisher({
    id: payload.extId,
    lastInspected: payload.date,
    status: payload.result === 'ผ่าน' ? 'normal' : 'need_repair',
    updatedBy: payload.inspector
  });

  logActivity(payload.inspector, 'บันทึกผลตรวจ', payload.extId + ' — ' + payload.result);

  if (payload.result !== 'ผ่าน') {
    notifyIssue(payload);
  }
  return { success: true, id };
}

function saveBase64Image(folder, base64Data, filename) {
  const parts = base64Data.split(',');
  const contentType = parts[0].match(/data:(.*);base64/)[1];
  const bytes = Utilities.base64Decode(parts[1]);
  const blob = Utilities.newBlob(bytes, contentType, filename + '.jpg');
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

/* ------------------------------ DASHBOARD SUMMARY ------------------------------ */
function getDashboardSummary() {
  const exts = listExtinguishers();
  const counts = {};
  exts.forEach(e => { counts[e.status] = (counts[e.status] || 0) + 1; });
  return { total: exts.length, counts };
}

/* ------------------------------ NOTIFICATIONS ------------------------------ */
function notifyIssue(inspection) {
  const subject = `[FireCheck] แจ้งเตือน: ตรวจพบความผิดปกติ ${inspection.extId}`;
  const body = `ถังดับเพลิงรหัส ${inspection.extId} ตรวจพบผลไม่ผ่าน\nผู้ตรวจ: ${inspection.inspector}\nวันที่: ${inspection.date}\nหมายเหตุ: ${inspection.notes || '-'}`;
  try { MailApp.sendEmail(ADMIN_EMAIL, subject, body); } catch (e) { /* ignore quota errors */ }
  if (LINE_NOTIFY_TOKEN) sendLineNotify(body);
}

function sendLineNotify(message) {
  UrlFetchApp.fetch('https://notify-api.line.me/api/notify', {
    method: 'post',
    headers: { Authorization: 'Bearer ' + LINE_NOTIFY_TOKEN },
    payload: { message: message }
  });
}

/**
 * ตั้ง Time-driven trigger ให้รันฟังก์ชันนี้ทุกวัน (Triggers > Add Trigger > dailyExpiryCheck > Time-driven > Day timer)
 * เพื่อแจ้งเตือนถังที่ใกล้หมดอายุ / ครบกำหนดตรวจ โดยอัตโนมัติ
 */
function dailyExpiryCheck() {
  const exts = listExtinguishers();
  const now = new Date();
  const soon = exts.filter(e => {
    const diffDays = (new Date(e.expireDate) - now) / 86400000;
    return diffDays >= 0 && diffDays <= NOTIFY_DAYS_BEFORE_EXPIRE;
  });
  if (soon.length === 0) return;
  const body = 'ถังดับเพลิงที่ใกล้หมดอายุ:\n' + soon.map(e => `- ${e.code} (${e.building}) หมดอายุ ${e.expireDate}`).join('\n');
  MailApp.sendEmail(ADMIN_EMAIL, '[FireCheck] แจ้งเตือนถังดับเพลิงใกล้หมดอายุ', body);
  if (LINE_NOTIFY_TOKEN) sendLineNotify(body);
}

/* ------------------------------ LOG ------------------------------ */
function logActivity(user, action, detail) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LOG);
  sheet.appendRow([new Date(), user, action, detail || '']);
}

/* ------------------------------ UTIL ------------------------------ */
function rowToObject(headers, row) {
  const obj = {};
  headers.forEach((h, i) => { obj[h] = row[i]; });
  return obj;
}
