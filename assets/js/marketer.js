// شاورما الأبراج — تسجيل التسويق (صفحة مستقلة، محمية برقم سري بسيط)

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
    if (pinBuffer === MARKETER_PIN) {
      sessionStorage.setItem('marketer-unlocked', 'true');
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
  renderMarketing();
  syncFromCloud();
}

// ---------- مزامنة التسويق بين الأجهزة (Google Sheets) ----------
function setSyncStatus(text, tone) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  el.textContent = text;
  el.className = 'sync-status' + (tone ? ' tone-' + tone : '');
}

function noCacheUrl_() {
  return SYNC_URL + (SYNC_URL.includes('?') ? '&' : '?') + 't=' + Date.now();
}

async function fetchCloudMarketingLogs() {
  const res = await fetch(noCacheUrl_(), { cache: 'no-store', credentials: 'omit' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  return data.marketingLogs || [];
}

async function postCloud(payload) {
  if (!SYNC_URL) return;
  try {
    await fetch(SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      cache: 'no-store',
      credentials: 'omit',
    });
  } catch (e) {
    console.error('marketing sync post failed:', e);
  }
}

async function syncFromCloud() {
  if (!SYNC_URL) return;
  setSyncStatus('🔄 مزامنة...', '');
  try {
    const logs = await fetchCloudMarketingLogs();
    state.marketingLogs = logs;
    saveState();
    setSyncStatus('✓ متزامن', 'good');
    renderMarketing();
  } catch (e) {
    console.error('marketing sync fetch failed:', e);
    setSyncStatus('⚠ فشل: ' + (e && e.message ? e.message : e), 'critical');
  }
}

// ---------- التسويق ----------
let selectedMarketingWeek = null;
let marketingFormOpen = false;
let draftMarketingWeek = null;

function sortedMarketingLogs() {
  return [...state.marketingLogs].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

function newDraftMarketingWeek() {
  const actuals = {};
  state.marketingGoals.forEach((g) => { actuals[g.id] = ''; });
  return { weekStart: todayISO(), actuals };
}

function openMarketingWeekForm() {
  const existing = state.marketingLogs.find((l) => l.weekStart === todayISO());
  if (existing) {
    editMarketingWeek(existing);
    return;
  }
  draftMarketingWeek = newDraftMarketingWeek();
  marketingFormOpen = true;
  renderMarketing();
}

function editMarketingWeek(log) {
  const actuals = {};
  state.marketingGoals.forEach((g) => { actuals[g.id] = log.actuals[g.id] || ''; });
  draftMarketingWeek = { weekStart: log.weekStart, actuals };
  marketingFormOpen = true;
  renderMarketing();
}

function saveDraftMarketingWeek() {
  if (!draftMarketingWeek.weekStart) { alert('أدخل تاريخ بداية الأسبوع.'); return; }
  const actuals = {};
  Object.keys(draftMarketingWeek.actuals).forEach((id) => {
    actuals[id] = parseFloat(draftMarketingWeek.actuals[id]) || 0;
  });
  const log = { weekStart: draftMarketingWeek.weekStart, actuals };
  state.marketingLogs = state.marketingLogs.filter((l) => l.weekStart !== log.weekStart);
  state.marketingLogs.push(log);
  saveState();
  selectedMarketingWeek = log.weekStart;
  marketingFormOpen = false;
  draftMarketingWeek = null;
  renderMarketing();
  postCloud({ action: 'save_marketing', log }).then(syncFromCloud);
}

function deleteMarketingWeek(weekStart) {
  if (!confirm(`حذف أسبوع ${weekStart}؟`)) return;
  state.marketingLogs = state.marketingLogs.filter((l) => l.weekStart !== weekStart);
  saveState();
  selectedMarketingWeek = null;
  renderMarketing();
  postCloud({ action: 'delete_marketing', weekStart }).then(syncFromCloud);
}

function renderMarketingWeekForm(container) {
  const card = el('div', 'card');
  card.innerHTML = `<h3>${state.marketingLogs.some(l => l.weekStart === draftMarketingWeek.weekStart) ? 'تعديل أسبوع' : 'تسجيل أسبوع جديد'}</h3><span class="card-note">أدخل الفعلي مقابل كل مستهدف لهذا الأسبوع</span>`;

  const dateRow = el('div', 'input-row');
  dateRow.innerHTML = `<label>بداية الأسبوع</label><div class="input-suffix"><input type="date" dir="ltr" /></div>`;
  dateRow.querySelector('input').value = draftMarketingWeek.weekStart;
  dateRow.querySelector('input').oninput = (e) => { draftMarketingWeek.weekStart = e.target.value; };
  card.appendChild(dateRow);

  if (!state.marketingGoals.length) {
    card.appendChild(el('div', 'empty-state', 'ما فيه مستهدفات تسويقية معرّفة بعد — تُضاف من لوحة المالك.'));
  }

  state.marketingGoals.forEach((goal) => {
    const row = el('div', 'input-row');
    row.innerHTML = `<label>${goal.name || '(بدون اسم)'} <span class="card-note" style="display:inline">(المستهدف: ${goal.targetPerWeek} ${goal.unit})</span></label>`;
    const suffix = el('div', 'input-suffix');
    const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.step = '1'; input.inputMode = 'decimal';
    input.value = draftMarketingWeek.actuals[goal.id] || '';
    input.oninput = (e) => { draftMarketingWeek.actuals[goal.id] = e.target.value; };
    const unit = document.createElement('span'); unit.textContent = goal.unit;
    suffix.appendChild(input); suffix.appendChild(unit);
    row.appendChild(suffix);
    card.appendChild(row);
  });

  const actions = el('div', 'form-actions');
  const saveBtn = el('button', 'btn btn-primary', 'حفظ الأسبوع');
  saveBtn.onclick = saveDraftMarketingWeek;
  const cancelBtn = el('button', 'btn', 'إلغاء');
  cancelBtn.onclick = () => { marketingFormOpen = false; draftMarketingWeek = null; renderMarketing(); };
  actions.appendChild(saveBtn); actions.appendChild(cancelBtn);
  card.appendChild(actions);

  container.appendChild(card);
}

function renderMarketingWeekDetail(container, log) {
  const grid = el('div', 'grid grid-3');
  state.marketingGoals.forEach((goal) => {
    const actual = log.actuals[goal.id] || 0;
    const pct = goal.targetPerWeek > 0 ? (actual / goal.targetPerWeek) * 100 : 0;
    const tone = pct >= 100 ? 'good' : pct >= 50 ? 'warning' : 'critical';
    const tile = el('div', 'card stat-tile');
    tile.innerHTML = `
      <div class="stat-label">${goal.name || '(بدون اسم)'}</div>
      <div class="stat-value tone-${tone}">${actual} ${goal.unit}</div>
      <div class="stat-delta">المستهدف: ${goal.targetPerWeek} ${goal.unit} (${pct.toFixed(0)}%)</div>
      <div class="hbar-track" style="height:6px;margin-top:8px"><div class="hbar-fill" style="width:${Math.min(pct, 100)}%"></div></div>`;
    grid.appendChild(tile);
  });
  container.appendChild(grid);

  const editBtn = el('button', 'btn btn-primary', '✎ تعديل هذا الأسبوع');
  editBtn.style.marginTop = '14px';
  editBtn.onclick = () => editMarketingWeek(log);
  container.appendChild(editBtn);
}

function renderMarketing() {
  const toolbar = document.getElementById('marketing-toolbar');
  toolbar.innerHTML = '';
  const logs = sortedMarketingLogs();
  if (!selectedMarketingWeek || !logs.find((l) => l.weekStart === selectedMarketingWeek)) {
    selectedMarketingWeek = logs[0] ? logs[0].weekStart : null;
  }

  const tabsWrap = el('div', 'inventory-day-tabs');
  logs.forEach((log) => {
    const btn = el('button', 'day-pill' + (log.weekStart === selectedMarketingWeek && !marketingFormOpen ? ' active' : ''), log.weekStart);
    btn.onclick = () => { selectedMarketingWeek = log.weekStart; marketingFormOpen = false; renderMarketing(); };
    tabsWrap.appendChild(btn);
  });
  toolbar.appendChild(tabsWrap);

  const actionsWrap = el('div', 'inventory-toolbar-actions');
  const addBtn = el('button', 'btn btn-primary', '+ تسجيل أسبوع جديد');
  addBtn.onclick = openMarketingWeekForm;
  actionsWrap.appendChild(addBtn);
  if (selectedMarketingWeek && !marketingFormOpen) {
    const delBtn = el('button', 'btn', '🗑 حذف هذا الأسبوع');
    delBtn.onclick = () => deleteMarketingWeek(selectedMarketingWeek);
    actionsWrap.appendChild(delBtn);
  }
  toolbar.appendChild(actionsWrap);

  const body = document.getElementById('marketing-body');
  body.innerHTML = '';
  if (marketingFormOpen && draftMarketingWeek) {
    renderMarketingWeekForm(body);
  } else if (selectedMarketingWeek) {
    const log = logs.find((l) => l.weekStart === selectedMarketingWeek);
    renderMarketingWeekDetail(body, log);
  } else {
    body.innerHTML = '<div class="card empty-state">لا يوجد أسبوع مسجّل بعد — اضغط "+ تسجيل أسبوع جديد" للبدء.</div>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderPinPad();
  document.getElementById('lock-btn').addEventListener('click', () => {
    sessionStorage.removeItem('marketer-unlocked');
    showLockScreen();
  });

  if (sessionStorage.getItem('marketer-unlocked') === 'true') {
    showMainScreen();
  } else {
    showLockScreen();
  }
});
