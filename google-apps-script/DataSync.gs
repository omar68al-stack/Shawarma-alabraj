// شاورما الأبراج — مزامنة البيانات بين الأجهزة عبر Google Sheets
// (عهدة الكاشير + جرد الشيف + تسجيل التسويق — كلهم بنفس هذا الملف ونفس الرابط المنشور)
//
// طريقة التركيب (أول مرة فقط):
// 1) افتح الشيت، من القائمة: Extensions → Apps Script
// 2) امسح أي كود موجود بملف Code.gs، والصق هذا الملف كامل بدلاً عنه
// 3) من الأعلى: Deploy → New deployment → اختر النوع "Web app"
//    - Execute as: Me (حسابك)
//    - Who has access: Anyone
// 4) اضغط Deploy، وافق على صلاحيات الوصول لحسابك، وانسخ رابط "Web app URL"
// 5) الصق هذا الرابط بمكان SYNC_URL في ملف assets/js/data.js بالموقع
//
// لو رجعت تحدّث هذا الكود لاحقاً (بعد أول مرة): الصق النسخة الجديدة بمكان القديمة
// بنفس ملف Code.gs، واحفظ، وبعدها Deploy → Manage deployments → أيقونة القلم ✎ على
// النشر الموجود → Version: "New version" → Deploy. هذا يحدّث السلوك بدون ما يغيّر
// الرابط (ما تحتاج تاخذ رابط جديد ولا تعدّل الموقع).
//
// أول مرة يُستدعى فيها السكربت بينشئ تلقائياً التبويبات المطلوبة بالشيت
// (Weeks, Expenses, InventoryLogs, MarketingLogs, AdminTasks) — ما تحتاج تجهزها يدوياً.

const SHEET_WEEKS = 'Weeks';
const SHEET_EXPENSES = 'Expenses';
const SHEET_INVENTORY = 'InventoryLogs';
const SHEET_MARKETING = 'MarketingLogs';
const SHEET_ADMIN = 'AdminTasks';

// عدّة أجهزة (الكاشير/الشيف/المسوّقة) ممكن تنفّذ السكربت بنفس اللحظة، فلازم قفل قبل
// إنشاء ورقة جديدة عشان ما يصير تعارض (محاولة إنشاء نفس الورقة مرتين بالتوازي)
function getSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (sheet) return sheet;

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.appendRow(headers);
    }
  } finally {
    lock.releaseLock();
  }
  return sheet;
}

function formatDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v);
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function deleteRowsBy_(sheet, colIndex, value) {
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][colIndex]) === String(value)) sheet.deleteRow(i + 1);
  }
}

// ---------- عهدة الكاشير ----------
function readWeeks_() {
  const weeksSheet = getSheet_(SHEET_WEEKS, ['weekStart', 'allowance']);
  const expensesSheet = getSheet_(SHEET_EXPENSES, ['id', 'weekStart', 'time', 'amount', 'description']);

  const weeksRows = weeksSheet.getDataRange().getValues().slice(1).filter((r) => r[0]);
  const expenseRows = expensesSheet.getDataRange().getValues().slice(1).filter((r) => r[0]);

  const expenses = expenseRows.map((r) => ({
    id: String(r[0]),
    weekStart: formatDate_(r[1]),
    time: String(r[2]),
    amount: Number(r[3]) || 0,
    description: String(r[4] || ''),
  }));

  return weeksRows
    .map((r) => {
      const weekStart = formatDate_(r[0]);
      return {
        weekStart,
        allowance: Number(r[1]) || 0,
        entries: expenses
          .filter((ex) => ex.weekStart === weekStart)
          .sort((a, b) => b.time.localeCompare(a.time)),
      };
    })
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

// ---------- جرد الشيف ----------
const INVENTORY_HEADERS = ['date', 'chickenRemainingKg', 'chickenConsumedKg', 'itemsJson', 'largePieTotal', 'largePieRemaining', 'smallPieTotal', 'smallPieRemaining'];

function readInventoryLogs_() {
  const sheet = getSheet_(SHEET_INVENTORY, INVENTORY_HEADERS);
  const rows = sheet.getDataRange().getValues().slice(1).filter((r) => r[0]);
  return rows
    .map((r) => ({
      date: formatDate_(r[0]),
      chickenRemainingKg: Number(r[1]) || 0,
      chickenConsumedKg: Number(r[2]) || 0,
      items: JSON.parse(r[3] || '[]'),
      largePie: { total: Number(r[4]) || 0, remaining: Number(r[5]) || 0 },
      smallPie: { total: Number(r[6]) || 0, remaining: Number(r[7]) || 0 },
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function saveInventoryLog_(log) {
  const sheet = getSheet_(SHEET_INVENTORY, INVENTORY_HEADERS);
  deleteRowsBy_(sheet, 0, log.date);
  sheet.appendRow([
    log.date,
    log.chickenRemainingKg,
    log.chickenConsumedKg,
    JSON.stringify(log.items || []),
    log.largePie.total,
    log.largePie.remaining,
    log.smallPie.total,
    log.smallPie.remaining,
  ]);
}

// ---------- تسجيل التسويق ----------
const MARKETING_HEADERS = ['weekStart', 'actualsJson'];

function readMarketingLogs_() {
  const sheet = getSheet_(SHEET_MARKETING, MARKETING_HEADERS);
  const rows = sheet.getDataRange().getValues().slice(1).filter((r) => r[0]);
  return rows
    .map((r) => ({ weekStart: formatDate_(r[0]), actuals: JSON.parse(r[1] || '{}') }))
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

function saveMarketingLog_(log) {
  const sheet = getSheet_(SHEET_MARKETING, MARKETING_HEADERS);
  deleteRowsBy_(sheet, 0, log.weekStart);
  sheet.appendRow([log.weekStart, JSON.stringify(log.actuals || {})]);
}

// ---------- معاملات ومتابعات ----------
const ADMIN_HEADERS = ['id', 'category', 'name', 'status'];

function readAdminTasks_() {
  const sheet = getSheet_(SHEET_ADMIN, ADMIN_HEADERS);
  const rows = sheet.getDataRange().getValues().slice(1).filter((r) => r[0]);
  return rows.map((r) => ({ id: String(r[0]), category: String(r[1]), name: String(r[2]), status: String(r[3]) }));
}

function saveAdminTasks_(tasks) {
  const sheet = getSheet_(SHEET_ADMIN, ADMIN_HEADERS);
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, ADMIN_HEADERS.length).clearContent();
  if (tasks.length) {
    sheet.getRange(2, 1, tasks.length, ADMIN_HEADERS.length)
      .setValues(tasks.map((t) => [t.id, t.category, t.name, t.status]));
  }
}

// ---------- نقاط الدخول ----------
// ملاحظة: Apps Script Web Apps مو موثوقة مع fetch() من متصفح لموقع مستضاف بمكان ثاني
// (قيود CORS تختلف من متصفح لآخر بشكل غير متوقع، رغم إن فتح الرابط مباشرة يشتغل دايماً).
// فبدل fetch()، الموقع يستخدم JSONP للقراءة (وسم <script> ما يخضع لـ CORS إطلاقاً)
// ونموذج HTML مخفي (submit عادي، بدون XHR) للكتابة — الطريقتين تتجاوزان القيد كلياً.
function doGet(e) {
  const data = {
    weeks: readWeeks_(),
    inventoryLogs: readInventoryLogs_(),
    marketingLogs: readMarketingLogs_(),
    adminTasks: readAdminTasks_(),
  };
  if (e.parameter && e.parameter.callback) {
    return ContentService
      .createTextOutput(e.parameter.callback + '(' + JSON.stringify(data) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return jsonOutput_(data);
}

function doPost(e) {
  const raw = (e.parameter && e.parameter.payload) || (e.postData && e.postData.contents);
  const payload = JSON.parse(raw);

  if (payload.action === 'start_week') {
    getSheet_(SHEET_WEEKS, ['weekStart', 'allowance']).appendRow([payload.weekStart, payload.allowance]);
  } else if (payload.action === 'add_expense') {
    getSheet_(SHEET_EXPENSES, ['id', 'weekStart', 'time', 'amount', 'description'])
      .appendRow([payload.id, payload.weekStart, payload.time, payload.amount, payload.description]);
  } else if (payload.action === 'delete_expense') {
    deleteRowsBy_(getSheet_(SHEET_EXPENSES, ['id', 'weekStart', 'time', 'amount', 'description']), 0, payload.id);
  } else if (payload.action === 'save_inventory') {
    saveInventoryLog_(payload.log);
  } else if (payload.action === 'delete_inventory') {
    deleteRowsBy_(getSheet_(SHEET_INVENTORY, INVENTORY_HEADERS), 0, payload.date);
  } else if (payload.action === 'save_marketing') {
    saveMarketingLog_(payload.log);
  } else if (payload.action === 'delete_marketing') {
    deleteRowsBy_(getSheet_(SHEET_MARKETING, MARKETING_HEADERS), 0, payload.weekStart);
  } else if (payload.action === 'save_admin_tasks') {
    saveAdminTasks_(payload.tasks);
  }

  return jsonOutput_({ ok: true });
}
