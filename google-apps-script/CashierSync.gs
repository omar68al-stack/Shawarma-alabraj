// شاورما الأبراج — مزامنة عهدة الكاشير بين الأجهزة عبر Google Sheets
//
// طريقة التركيب:
// 1) افتح الشيت اللي تبي تستخدمه، من القائمة: Extensions → Apps Script
// 2) امسح أي كود موجود بملف Code.gs، والصق هذا الملف كامل بدلاً عنه
// 3) من الأعلى: Deploy → New deployment → اختر النوع "Web app"
//    - Execute as: Me (حسابك)
//    - Who has access: Anyone
// 4) اضغط Deploy، وافق على صلاحيات الوصول لحسابك، وانسخ رابط "Web app URL"
// 5) الصق هذا الرابط بمكان CASHIER_SYNC_URL في ملف assets/js/data.js بالموقع
//
// أول مرة يُستدعى فيها السكربت (أول طلب من صفحة الكاشير) بينشئ تلقائياً تبويبين
// بالشيت باسم "Weeks" و"Expenses" لتخزين البيانات — ما تحتاج تجهزهم يدوياً.

const SHEET_WEEKS = 'Weeks';
const SHEET_EXPENSES = 'Expenses';

function getSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
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

function doGet(e) {
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

  const weeks = weeksRows
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

  return jsonOutput_({ weeks });
}

function doPost(e) {
  const payload = JSON.parse(e.postData.contents);

  if (payload.action === 'start_week') {
    getSheet_(SHEET_WEEKS, ['weekStart', 'allowance']).appendRow([payload.weekStart, payload.allowance]);
  } else if (payload.action === 'add_expense') {
    getSheet_(SHEET_EXPENSES, ['id', 'weekStart', 'time', 'amount', 'description'])
      .appendRow([payload.id, payload.weekStart, payload.time, payload.amount, payload.description]);
  } else if (payload.action === 'delete_expense') {
    const sheet = getSheet_(SHEET_EXPENSES, ['id', 'weekStart', 'time', 'amount', 'description']);
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]) === String(payload.id)) { sheet.deleteRow(i + 1); break; }
    }
  }

  return jsonOutput_({ ok: true });
}
