// شاورما الأبراج — جرد الشيف اليومي (صفحة مستقلة، محمية برقم سري بسيط)

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const saved = JSON.parse(raw);
    return deepMerge(structuredClone(DEFAULT_STATE), saved);
  } catch (e) {
    return structuredClone(DEFAULT_STATE);
  }
}

function deepMerge(base, override) {
  for (const key of Object.keys(override || {})) {
    if (override[key] && typeof override[key] === 'object' && !Array.isArray(override[key]) && base[key] && typeof base[key] === 'object') {
      deepMerge(base[key], override[key]);
    } else {
      base[key] = override[key];
    }
  }
  return base;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

// ---------- تحليل رسالة الجرد النصية ----------
function normalizeArabicDigits(str) {
  const map = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
  return str.replace(/[٠-٩]/g, (d) => map[d]);
}

function normalizeArabicForMatch(str) {
  return str
    .replace(/[ً-ْ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ئ/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ء/g, '')
    .replace(/ى/g, 'ي')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/[ةه]$/, ''))
    .join(' ')
    .trim();
}

const INVENTORY_UNIT_WORDS = ['كيلو', 'كيلوجرام', 'جركل', 'حبة', 'حبه', 'حبات', 'ربطة', 'ربطه', 'كرتون', 'كيس', 'أكياس', 'اكياس', 'رول', 'قرام', 'جرام', 'غرام'];
const INVENTORY_FRACTION_WORDS = ['نص', 'نصف', 'ربع', 'ثلث', 'ونص', 'ونصف', 'وربع', 'وثلث'];
const THREE_QUARTERS_FIRST = ['ثلاث', 'وثلاث'];
const THREE_QUARTERS_SECOND = ['ارباع', 'أرباع'];

function isNumberToken(tok) { return /^\d+(\.\d+)?$/.test(tok); }
function isUnitToken(tok) { return INVENTORY_UNIT_WORDS.includes(tok); }
function isFractionToken(tok) { return INVENTORY_FRACTION_WORDS.includes(tok); }

function extractQuantityAndName(tokens) {
  let quantityTokens = [];
  let nameTokens = [];

  // محاولة أمامية: كمية ثم اسم (الحالة الشائعة: "باقي 2 كرتون بطاطس")
  let idx = 0;
  const forwardConsumed = [];
  while (idx < tokens.length) {
    const tok = tokens[idx];
    if (isNumberToken(tok) || isFractionToken(tok) || isUnitToken(tok)) {
      forwardConsumed.push(tok); idx++; continue;
    }
    if (THREE_QUARTERS_FIRST.includes(tok) && THREE_QUARTERS_SECOND.includes(tokens[idx + 1])) {
      forwardConsumed.push(tok, tokens[idx + 1]); idx += 2; continue;
    }
    if (tok === 'و' && idx + 1 < tokens.length && (isNumberToken(tokens[idx + 1]) || isFractionToken(tokens[idx + 1]) || isUnitToken(tokens[idx + 1]))) {
      forwardConsumed.push(tok); idx++; continue;
    }
    break;
  }

  if (forwardConsumed.length > 0) {
    quantityTokens = forwardConsumed;
    nameTokens = tokens.slice(idx);
  } else {
    // محاولة عكسية: اسم ثم كمية (حالة نادرة زي "برقر 1 كيس")
    let end = tokens.length - 1;
    const backwardConsumed = [];
    while (end >= 0) {
      const tok = tokens[end];
      if (isNumberToken(tok) || isFractionToken(tok) || isUnitToken(tok)) {
        backwardConsumed.unshift(tok); end--; continue;
      }
      if (end >= 1 && THREE_QUARTERS_SECOND.includes(tok) && THREE_QUARTERS_FIRST.includes(tokens[end - 1])) {
        backwardConsumed.unshift(tokens[end - 1], tok); end -= 2; continue;
      }
      break;
    }
    if (backwardConsumed.length > 0) {
      quantityTokens = backwardConsumed;
      nameTokens = tokens.slice(0, end + 1);
    } else {
      nameTokens = tokens;
    }
  }

  // لو صار الاسم فاضي (مثال: "1 كرتون اكياس" لو اتحسبت "اكياس" كوحدة غلط)، رجّع آخر كلمة للاسم
  if (nameTokens.length === 0 && quantityTokens.length > 0) {
    nameTokens = [quantityTokens.pop()];
  }

  return {
    quantity: quantityTokens.join(' ').trim(),
    name: nameTokens.join(' ').trim().replace(/[:：]+$/, '').trim(),
  };
}

// يحوّل رسالة جرد نصية حرة (زي رسائل واتساب) إلى بيانات جرد منظّمة
function parseInventoryMessage(text) {
  const cleaned = normalizeArabicDigits(text).replace(/[⁠​‌‍‎‏]/g, '');
  const lines = cleaned.split('\n').map((l) => l.trim()).filter(Boolean);

  const result = {
    chickenRemainingKg: 0,
    chickenConsumedKg: 0,
    items: [],
    largePie: { total: 0, remaining: 0 },
    smallPie: { total: 0, remaining: 0 },
  };
  const itemIndexByNorm = {};
  let section = 'remaining';
  let lastPieType = null;

  const numberMatch = (s) => { const m = s.match(/\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : null; };

  for (const rawLine of lines) {
    if (/^[-_—=]{3,}$/.test(rawLine)) continue;
    if (rawLine.includes('المستهلك')) { section = 'consumed'; continue; }

    let line = rawLine.replace(/^[*\-•]+\s*/, '').trim();
    if (!line) continue;

    if (line.includes('فطير') || line.includes('فطاير')) {
      const isLarge = line.includes('كبير');
      const isSmall = line.includes('صغير');
      if (isLarge) lastPieType = 'large';
      if (isSmall) lastPieType = 'small';
      const isTotal = line.includes('اجمالي') || line.includes('إجمالي');
      const num = numberMatch(line);
      const target = isLarge ? result.largePie : (isSmall ? result.smallPie : null);
      if (target && num !== null) {
        if (isTotal) target.total = num; else target.remaining = num;
      }
      continue;
    }

    if (/^باقي\s+منها/.test(line) && lastPieType) {
      const num = numberMatch(line);
      if (num !== null) {
        const target = lastPieType === 'large' ? result.largePie : result.smallPie;
        target.remaining = num;
      }
      continue;
    }

    if (line.includes('دجاج')) {
      let kg = 0;
      const kiloMatch = line.match(/(\d+(?:\.\d+)?)\s*كيلو/);
      if (kiloMatch) kg += parseFloat(kiloMatch[1]);
      const gramMatch = line.match(/(\d+(?:\.\d+)?)\s*(?:قرام|جرام|غرام)/);
      if (gramMatch) kg += parseFloat(gramMatch[1]) / 1000;
      if (kg === 0) {
        const n = numberMatch(line);
        if (n !== null) kg = n;
      }
      if (section === 'remaining') result.chickenRemainingKg += kg;
      else result.chickenConsumedKg += kg;
      continue;
    }

    line = line.replace(/^باقي\s+/, '');
    const tokens = line.split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;

    const { quantity, name } = extractQuantityAndName(tokens);
    if (!name) continue;

    const key = normalizeArabicForMatch(name);
    if (itemIndexByNorm[key] !== undefined) {
      const item = result.items[itemIndexByNorm[key]];
      if (section === 'remaining') item.remaining = quantity || item.remaining;
      else item.consumed = quantity || item.consumed;
    } else {
      const item = { name, unit: '', remaining: '', consumed: '' };
      if (section === 'remaining') item.remaining = quantity; else item.consumed = quantity;
      result.items.push(item);
      itemIndexByNorm[key] = result.items.length - 1;
    }
  }

  return result;
}

// ---------- شاشة القفل ----------
let pinBuffer = '';

function renderPinPad() {
  const pad = document.getElementById('pin-pad');
  pad.innerHTML = '';
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
  keys.forEach((k) => {
    if (k === '') {
      pad.appendChild(el('div', 'pin-key pin-key-empty'));
      return;
    }
    const btn = el('button', 'pin-key', k);
    btn.type = 'button';
    btn.onclick = () => handlePinKey(k);
    pad.appendChild(btn);
  });
}

function updatePinDots(errorState) {
  const dots = document.querySelectorAll('#pin-dots .pin-dot');
  dots.forEach((dot, i) => {
    dot.className = 'pin-dot' + (errorState ? ' error' : (i < pinBuffer.length ? ' filled' : ''));
  });
}

function handlePinKey(k) {
  const errorMsg = document.getElementById('pin-error');
  errorMsg.textContent = '';
  if (k === '⌫') {
    pinBuffer = pinBuffer.slice(0, -1);
    updatePinDots(false);
    return;
  }
  if (pinBuffer.length >= 4) return;
  pinBuffer += k;
  updatePinDots(false);
  if (pinBuffer.length === 4) {
    if (pinBuffer === CHEF_PIN) {
      sessionStorage.setItem('chef-unlocked', 'true');
      showMainScreen();
    } else {
      updatePinDots(true);
      errorMsg.textContent = 'رقم غير صحيح، حاول مرة ثانية';
      setTimeout(() => { pinBuffer = ''; updatePinDots(false); }, 500);
    }
  }
}

function showLockScreen() {
  pinBuffer = '';
  document.getElementById('lock-screen').style.display = 'flex';
  document.getElementById('main-screen').style.display = 'none';
  updatePinDots(false);
}

function showMainScreen() {
  document.getElementById('lock-screen').style.display = 'none';
  document.getElementById('main-screen').style.display = 'block';
  renderInventory();
}

// ---------- الجرد اليومي ----------
let selectedInventoryDate = null;
let inventoryFormOpen = false;
let draftInventory = null;

function sortedInventoryLogs() {
  return [...state.inventoryLogs].sort((a, b) => b.date.localeCompare(a.date));
}

function newDraftInventory() {
  return {
    date: todayISO(),
    chickenRemainingKg: '',
    chickenConsumedKg: '',
    items: [{ name: '', unit: '', remaining: '', consumed: '' }],
    largePie: { total: '', remaining: '' },
    smallPie: { total: '', remaining: '' },
  };
}

function openInventoryForm() {
  const existing = state.inventoryLogs.find((l) => l.date === todayISO());
  if (existing) {
    editInventoryLog(existing);
    return;
  }
  draftInventory = newDraftInventory();
  inventoryFormOpen = true;
  renderInventory();
}

function saveDraftInventory() {
  if (!draftInventory.date) { alert('أدخل تاريخ الجرد.'); return; }
  const cleanedItems = draftInventory.items.filter((it) => it.name.trim() !== '');
  const log = {
    date: draftInventory.date,
    chickenRemainingKg: parseFloat(draftInventory.chickenRemainingKg) || 0,
    chickenConsumedKg: parseFloat(draftInventory.chickenConsumedKg) || 0,
    items: cleanedItems,
    largePie: {
      total: parseFloat(draftInventory.largePie.total) || 0,
      remaining: parseFloat(draftInventory.largePie.remaining) || 0,
    },
    smallPie: {
      total: parseFloat(draftInventory.smallPie.total) || 0,
      remaining: parseFloat(draftInventory.smallPie.remaining) || 0,
    },
  };
  state.inventoryLogs = state.inventoryLogs.filter((l) => l.date !== log.date);
  state.inventoryLogs.push(log);
  saveState();
  selectedInventoryDate = log.date;
  inventoryFormOpen = false;
  draftInventory = null;
  renderInventory();
}

function deleteInventoryLog(date) {
  if (!confirm(`حذف جرد يوم ${date}؟`)) return;
  state.inventoryLogs = state.inventoryLogs.filter((l) => l.date !== date);
  saveState();
  selectedInventoryDate = null;
  renderInventory();
}

function applyParsedInventory(parsed) {
  draftInventory.chickenRemainingKg = parsed.chickenRemainingKg || '';
  draftInventory.chickenConsumedKg = parsed.chickenConsumedKg || '';
  if (parsed.items.length) draftInventory.items = parsed.items;
  draftInventory.largePie = { total: parsed.largePie.total || '', remaining: parsed.largePie.remaining || '' };
  draftInventory.smallPie = { total: parsed.smallPie.total || '', remaining: parsed.smallPie.remaining || '' };
}

function renderPasteCard(container) {
  const pasteCard = el('div', 'card');
  pasteCard.style.marginBottom = '16px';
  pasteCard.innerHTML = '<h3>الصق رسالة الجرد (اختياري)</h3><span class="card-note">الصق رسالة الجرد كاملة (زي رسالة الواتساب) وبتتعبّى لك كل الحقول تلقائياً بالأسفل — راجعها قبل الحفظ</span>';

  const textarea = document.createElement('textarea');
  textarea.className = 'cashier-input';
  textarea.rows = 6;
  textarea.style.marginTop = '10px';
  textarea.style.resize = 'vertical';
  textarea.placeholder = 'مثال: هذا جرد اليوم باقي 89 كيلو و250 قرام دجاج\nباقي 1 زيت عافية\n...';
  pasteCard.appendChild(textarea);

  const analyzeBtn = el('button', 'btn btn-primary', '📋 تحليل الرسالة وتعبئة النموذج');
  analyzeBtn.style.marginTop = '10px';
  analyzeBtn.onclick = () => {
    const text = textarea.value.trim();
    if (!text) { alert('الصق الرسالة أول.'); return; }
    const parsed = parseInventoryMessage(text);
    applyParsedInventory(parsed);
    alert('تم تحليل الرسالة وتعبئة الحقول — راجعها قبل ما تحفظ.');
    renderInventory();
  };
  pasteCard.appendChild(analyzeBtn);
  container.appendChild(pasteCard);
}

function renderInventoryForm(container) {
  renderPasteCard(container);

  const card = el('div', 'card');
  card.innerHTML = `<h3>${state.inventoryLogs.some(l => l.date === draftInventory.date) ? 'تعديل جرد يوم' : 'إضافة جرد يوم جديد'}</h3><span class="card-note">سجّل الباقي من كل صنف (والمستهلك إن توفر)</span>`;

  const dateRow = el('div', 'input-row');
  dateRow.innerHTML = `<label>تاريخ الجرد</label><div class="input-suffix"><input type="date" dir="ltr" /></div>`;
  dateRow.querySelector('input').value = draftInventory.date;
  dateRow.querySelector('input').oninput = (e) => { draftInventory.date = e.target.value; };
  card.appendChild(dateRow);

  const chickenGrid = el('div', 'grid grid-2', '');
  chickenGrid.style.marginTop = '10px';
  const remRow = el('div', 'input-row');
  remRow.innerHTML = `<label>الدجاج الباقي</label><div class="input-suffix"><input type="number" step="0.25" /><span>كجم</span></div>`;
  remRow.querySelector('input').value = draftInventory.chickenRemainingKg;
  remRow.querySelector('input').oninput = (e) => { draftInventory.chickenRemainingKg = e.target.value; };
  const consRow = el('div', 'input-row');
  consRow.innerHTML = `<label>الدجاج المستهلك اليوم</label><div class="input-suffix"><input type="number" step="0.25" /><span>كجم</span></div>`;
  consRow.querySelector('input').value = draftInventory.chickenConsumedKg;
  consRow.querySelector('input').oninput = (e) => { draftInventory.chickenConsumedKg = e.target.value; };
  chickenGrid.appendChild(remRow);
  chickenGrid.appendChild(consRow);
  card.appendChild(chickenGrid);

  const itemsTitle = el('h3', '', 'أصناف أخرى');
  itemsTitle.style.marginTop = '18px';
  card.appendChild(itemsTitle);

  const itemsTable = el('div', 'draft-items');
  const headerRow = el('div', 'draft-item-row draft-item-header');
  headerRow.innerHTML = `<span>الصنف</span><span>الوحدة</span><span>الباقي</span><span>المستهلك</span><span></span>`;
  itemsTable.appendChild(headerRow);

  draftInventory.items.forEach((item, idx) => {
    const row = el('div', 'draft-item-row');
    const nameInput = el('input'); nameInput.placeholder = 'مثال: مايونيز'; nameInput.value = item.name;
    nameInput.oninput = (e) => { item.name = e.target.value; };
    const unitInput = el('input'); unitInput.placeholder = 'حبة / كيلو'; unitInput.value = item.unit;
    unitInput.oninput = (e) => { item.unit = e.target.value; };
    const remInput = el('input'); remInput.placeholder = 'الباقي'; remInput.value = item.remaining;
    remInput.oninput = (e) => { item.remaining = e.target.value; };
    const consInput = el('input'); consInput.placeholder = 'المستهلك'; consInput.value = item.consumed;
    consInput.oninput = (e) => { item.consumed = e.target.value; };
    const removeBtn = el('button', 'btn btn-sm', '✕');
    removeBtn.onclick = () => { draftInventory.items.splice(idx, 1); renderInventory(); };
    row.appendChild(nameInput); row.appendChild(unitInput); row.appendChild(remInput); row.appendChild(consInput); row.appendChild(removeBtn);
    itemsTable.appendChild(row);
  });
  card.appendChild(itemsTable);

  const addRowBtn = el('button', 'btn btn-sm', '+ إضافة صنف');
  addRowBtn.style.marginTop = '10px';
  addRowBtn.onclick = () => { draftInventory.items.push({ name: '', unit: '', remaining: '', consumed: '' }); renderInventory(); };
  card.appendChild(addRowBtn);

  const pieTitle = el('h3', '', 'الفطاير');
  pieTitle.style.marginTop = '18px';
  card.appendChild(pieTitle);
  const pieGrid = el('div', 'grid grid-2');
  const largeBox = el('div', 'input-row-group');
  largeBox.innerHTML = `<label class="group-label">الفطيرة الكبيرة</label>`;
  const largeTotal = el('div', 'input-row'); largeTotal.innerHTML = `<label>الإجمالي المُعد</label><div class="input-suffix"><input type="number" /><span>حبة</span></div>`;
  largeTotal.querySelector('input').value = draftInventory.largePie.total;
  largeTotal.querySelector('input').oninput = (e) => { draftInventory.largePie.total = e.target.value; };
  const largeRem = el('div', 'input-row'); largeRem.innerHTML = `<label>الباقي</label><div class="input-suffix"><input type="number" /><span>حبة</span></div>`;
  largeRem.querySelector('input').value = draftInventory.largePie.remaining;
  largeRem.querySelector('input').oninput = (e) => { draftInventory.largePie.remaining = e.target.value; };
  largeBox.appendChild(largeTotal); largeBox.appendChild(largeRem);

  const smallBox = el('div', 'input-row-group');
  smallBox.innerHTML = `<label class="group-label">الفطيرة الصغيرة</label>`;
  const smallTotal = el('div', 'input-row'); smallTotal.innerHTML = `<label>الإجمالي المُعد</label><div class="input-suffix"><input type="number" /><span>حبة</span></div>`;
  smallTotal.querySelector('input').value = draftInventory.smallPie.total;
  smallTotal.querySelector('input').oninput = (e) => { draftInventory.smallPie.total = e.target.value; };
  const smallRem = el('div', 'input-row'); smallRem.innerHTML = `<label>الباقي</label><div class="input-suffix"><input type="number" /><span>حبة</span></div>`;
  smallRem.querySelector('input').value = draftInventory.smallPie.remaining;
  smallRem.querySelector('input').oninput = (e) => { draftInventory.smallPie.remaining = e.target.value; };
  smallBox.appendChild(smallTotal); smallBox.appendChild(smallRem);

  pieGrid.appendChild(largeBox); pieGrid.appendChild(smallBox);
  card.appendChild(pieGrid);

  const actions = el('div', 'form-actions');
  const saveBtn = el('button', 'btn btn-primary', 'حفظ الجرد');
  saveBtn.onclick = saveDraftInventory;
  const cancelBtn = el('button', 'btn', 'إلغاء');
  cancelBtn.onclick = () => { inventoryFormOpen = false; draftInventory = null; renderInventory(); };
  actions.appendChild(saveBtn); actions.appendChild(cancelBtn);
  card.appendChild(actions);

  container.appendChild(card);
}

function editInventoryLog(log) {
  draftInventory = {
    date: log.date,
    chickenRemainingKg: log.chickenRemainingKg || '',
    chickenConsumedKg: log.chickenConsumedKg || '',
    items: log.items.length ? log.items.map((i) => ({ ...i })) : [{ name: '', unit: '', remaining: '', consumed: '' }],
    largePie: { total: log.largePie.total || '', remaining: log.largePie.remaining || '' },
    smallPie: { total: log.smallPie.total || '', remaining: log.smallPie.remaining || '' },
  };
  inventoryFormOpen = true;
  renderInventory();
}

function renderInventoryDetail(container, log) {
  const inRange = log.chickenConsumedKg >= state.kgLow && log.chickenConsumedKg <= state.kgHigh;
  const chickenTone = log.chickenConsumedKg === 0 ? '' : (inRange ? 'good' : 'warning');

  const kpiCard = el('div', 'grid grid-2');
  kpiCard.innerHTML = `
    <div class="card stat-tile">
      <div class="stat-label">الدجاج الباقي</div>
      <div class="stat-value">${log.chickenRemainingKg} كجم</div>
    </div>
    <div class="card stat-tile">
      <div class="stat-label">الدجاج المستهلك اليوم</div>
      <div class="stat-value ${chickenTone ? 'tone-' + chickenTone : ''}">${log.chickenConsumedKg} كجم</div>
      <div class="stat-delta">النطاق المعتاد: ${state.kgLow}–${state.kgHigh} كجم/يوم</div>
    </div>`;
  container.appendChild(kpiCard);

  const editBtn = el('button', 'btn btn-primary', '✎ تعديل جرد هذا اليوم');
  editBtn.style.marginTop = '14px';
  editBtn.onclick = () => editInventoryLog(log);
  container.appendChild(editBtn);

  if (log.items.length) {
    const itemsCard = el('div', 'card');
    itemsCard.style.marginTop = '16px';
    itemsCard.innerHTML = `<h3>الأصناف</h3>`;
    const table = el('table');
    table.innerHTML = `<thead><tr><th>الصنف</th><th>الوحدة</th><th>الباقي</th><th>المستهلك</th></tr></thead>
      <tbody>${log.items.map(it => `<tr><td>${it.name}</td><td>${it.unit || '—'}</td><td>${it.remaining || '—'}</td><td>${it.consumed || '—'}</td></tr>`).join('')}</tbody>`;
    const tw = el('div', 'table-wrap'); tw.appendChild(table);
    itemsCard.appendChild(tw);
    container.appendChild(itemsCard);
  }

  const pieCard = el('div', 'card');
  pieCard.style.marginTop = '16px';
  pieCard.innerHTML = `<h3>الفطاير</h3>`;
  const pieGrid = el('div', 'grid grid-2');
  [{ label: 'الفطيرة الكبيرة', data: log.largePie }, { label: 'الفطيرة الصغيرة', data: log.smallPie }].forEach((p) => {
    const consumed = p.data.total - p.data.remaining;
    const pct = p.data.total ? (consumed / p.data.total) * 100 : 0;
    const box = el('div', 'card scenario-card');
    box.innerHTML = `
      <div class="scenario-title">${p.label}</div>
      <div class="scenario-row"><span>الإجمالي المُعد</span><b>${p.data.total}</b></div>
      <div class="scenario-row"><span>الباقي</span><b>${p.data.remaining}</b></div>
      <div class="scenario-row scenario-result"><span>المستهلك</span><b>${consumed} (${pct.toFixed(0)}%)</b></div>`;
    pieGrid.appendChild(box);
  });
  pieCard.appendChild(pieGrid);
  container.appendChild(pieCard);
}

function renderInventory() {
  const logs = sortedInventoryLogs();
  if (!selectedInventoryDate || !logs.find((l) => l.date === selectedInventoryDate)) {
    selectedInventoryDate = logs[0] ? logs[0].date : null;
  }

  const toolbar = document.getElementById('inventory-toolbar');
  toolbar.innerHTML = '';
  const tabsWrap = el('div', 'inventory-day-tabs');
  logs.forEach((log) => {
    const btn = el('button', 'day-pill' + (log.date === selectedInventoryDate && !inventoryFormOpen ? ' active' : ''), log.date);
    btn.onclick = () => { selectedInventoryDate = log.date; inventoryFormOpen = false; renderInventory(); };
    tabsWrap.appendChild(btn);
  });
  toolbar.appendChild(tabsWrap);

  const actionsWrap = el('div', 'inventory-toolbar-actions');
  const addBtn = el('button', 'btn btn-primary', '+ جرد يوم جديد');
  addBtn.onclick = openInventoryForm;
  actionsWrap.appendChild(addBtn);
  if (selectedInventoryDate && !inventoryFormOpen) {
    const delBtn = el('button', 'btn', '🗑 حذف هذا اليوم');
    delBtn.onclick = () => deleteInventoryLog(selectedInventoryDate);
    actionsWrap.appendChild(delBtn);
  }
  toolbar.appendChild(actionsWrap);

  const body = document.getElementById('inventory-body');
  body.innerHTML = '';
  if (inventoryFormOpen && draftInventory) {
    renderInventoryForm(body);
  } else if (selectedInventoryDate) {
    const log = logs.find((l) => l.date === selectedInventoryDate);
    renderInventoryDetail(body, log);
  } else {
    body.innerHTML = '<div class="card empty-state">لا يوجد جرد مسجّل بعد — اضغط "+ جرد يوم جديد" للبدء.</div>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderPinPad();
  document.getElementById('lock-btn').addEventListener('click', () => {
    sessionStorage.removeItem('chef-unlocked');
    showLockScreen();
  });

  if (sessionStorage.getItem('chef-unlocked') === 'true') {
    showMainScreen();
  } else {
    showLockScreen();
  }
});
