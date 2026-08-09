// يجيب أحدث بيانات المبادرات مباشرة من شيت Google عند فتح الموقع، عبر رابط
// التصدير المباشر (export) بدل لقطة "النشر على الويب" — التصدير المباشر يقرأ
// محتوى الشيت الفعلي لحظيًا (يتطلب مشاركة الشيت كـ "أي شخص لديه الرابط: عارض")،
// بينما لقطة النشر تتجمّد أحيانًا ولا تتحدّث مع كل تعديل.
// إذا تعذّر الاتصال (لا إنترنت، أو تغيّرت صلاحية المشاركة)، يبقى الموقع يعرض
// النسخة الاحتياطية المدمجة في assets/js/data.js دون أي كسر.

const SHEET_ID = "1MO_9TCHvyLKUcizX02V6ZKWiKPPVbVY1";

function sheetCsvUrl(gid) {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
}

const SHEET_SOURCES = {
  beneficiaries: sheetCsvUrl(491891042),
  financial: sheetCsvUrl(539878785),
  internal: sheetCsvUrl(873560772),
  learning: sheetCsvUrl(507901612),
};

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// بعض التبويبات (مثل "بعد المستفيدين") فيها صف عنوان ("الخطة التشغيلية") فوق
// صف رؤوس الأعمدة الفعلي، لذا نبحث عن صف الرؤوس بدل افتراض أنه أول صف دائمًا.
function csvToObjects(text) {
  const rows = parseCSV(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (!rows.length) return [];
  const headerIdx = rows.findIndex((r) => r.some((c) => c.trim() === "المبادرة التنفيذية"));
  const header = (headerIdx >= 0 ? rows[headerIdx] : rows[0]).map((h) => h.trim());
  const dataRows = rows.slice((headerIdx >= 0 ? headerIdx : 0) + 1);
  return dataRows.map((r) => {
    const obj = {};
    header.forEach((h, idx) => { obj[h] = (r[idx] ?? "").trim(); });
    return obj;
  });
}

function parseNum(s) {
  const cleaned = String(s ?? "").replace(/[^\d.]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function parseSheetDate(s) {
  if (!s) return null;
  s = s.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function rowToInitiative(obj, perspective, idx) {
  const name = obj["المبادرة التنفيذية"];
  if (!name) return null;
  const targetRaw = obj["المستهدف"] || "";
  return {
    id: `${perspective}-${idx}`,
    perspective,
    name,
    description: obj["وصف المبادرة"] || "",
    kpi: obj["مؤشر أداء المبادرة"] || "",
    target: parseNum(targetRaw),
    targetIsPercent: targetRaw.includes("%"),
    achieved: parseNum(obj["المتحقق"]),
    owner: obj["مسؤول المبادرة"] || "",
    start: parseSheetDate(obj["البداية"]) || DASHBOARD_DATA.planStart,
    end: parseSheetDate(obj["النهاية"]) || DASHBOARD_DATA.planEnd,
    budget: parseNum(obj["التكلفة المالية"]),
    spent: parseNum(obj["المصروف"]),
    support: (obj["توفر الدعم"] || "داخلي").trim(),
    closureReport: (obj["تقرير الاغلاق"] || obj["تقرير الإغلاق"] || "").trim(),
  };
}

const PERSPECTIVE_LABEL_FOR_ERRORS = {
  beneficiaries: "بعد المستفيدين",
  financial: "البعد المالي",
  internal: "بعد العمليات الداخلية",
  learning: "بعد التعلم والنمو",
};

async function fetchPerspectiveRows(perspective, url) {
  let res;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch (networkErr) {
    // فشل على مستوى الشبكة قبل وصول أي استجابة — الحالة الأكثر شيوعًا لهذا هي
    // رفض CORS من متصفح المستخدم (المتصفح يمنع قراءة الاستجابة رغم وصولها).
    throw new Error(`تعذّر الوصول لتبويب "${PERSPECTIVE_LABEL_FOR_ERRORS[perspective]}" — على الأغلب رفض CORS من المتصفح. تفصيل: ${networkErr.message}`);
  }
  if (!res.ok) {
    throw new Error(`تبويب "${PERSPECTIVE_LABEL_FOR_ERRORS[perspective]}" أعاد HTTP ${res.status} — تأكد أن التبويب منشور للويب.`);
  }
  const text = await res.text();
  const rows = csvToObjects(text)
    .map((obj, idx) => rowToInitiative(obj, perspective, idx))
    .filter(Boolean);
  if (!rows.length) {
    throw new Error(`تبويب "${PERSPECTIVE_LABEL_FOR_ERRORS[perspective]}" رجع بدون صفوف صالحة — تحقّق من رابط النشر أو أسماء الأعمدة.`);
  }
  return rows;
}

// نسخة أصلية من بيانات المصدر الاحتياطي (assets/js/data.js) محفوظة قبل أي مزامنة،
// تُستخدم فقط للأبعاد التي يفشل جلبها من الشيت — حتى لا يؤدي فشل تبويب واحد
// لفقدان بيانات الأبعاد الثلاثة الأخرى الناجحة.
const FALLBACK_INITIATIVES = DASHBOARD_DATA.initiatives.slice();

// يحاول تحديث DASHBOARD_DATA.initiatives من الشيت الحي، بُعدًا بُعد. يُرجع حالة
// النتيجة (ok: true كامل / "partial" جزئي / false فشل الكل) دون رمي استثناء أبدًا.
async function syncFromSheet() {
  const perspectiveKeys = Object.keys(SHEET_SOURCES);
  const results = await Promise.allSettled(
    perspectiveKeys.map((key) => fetchPerspectiveRows(key, SHEET_SOURCES[key]))
  );

  const combined = [];
  const failed = [];
  results.forEach((result, i) => {
    const key = perspectiveKeys[i];
    if (result.status === "fulfilled") {
      combined.push(...result.value);
    } else {
      failed.push({ key, error: result.reason && result.reason.message ? result.reason.message : String(result.reason) });
      combined.push(...FALLBACK_INITIATIVES.filter((it) => it.perspective === key));
    }
  });

  DASHBOARD_DATA.initiatives = combined;
  if (!failed.length) {
    DASHBOARD_DATA._sync = { ok: true, at: new Date() };
  } else if (failed.length === perspectiveKeys.length) {
    DASHBOARD_DATA._sync = { ok: false, at: new Date(), error: failed.map((f) => f.error).join(" — ") };
  } else {
    DASHBOARD_DATA._sync = { ok: "partial", at: new Date(), error: failed.map((f) => f.error).join(" — ") };
  }
  return DASHBOARD_DATA._sync;
}
