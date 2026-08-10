// شاورما الأبراج — عهدة الكاشير (صفحة مستقلة، محمية برقم سري بسيط)

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

// ---------- مزامنة العهدة بين الأجهزة (Google Sheets) ----------
function setSyncStatus(text, tone) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  el.textContent = text;
  el.className = 'sync-status' + (tone ? ' tone-' + tone : '');
}

function noCacheUrl_() {
  return CASHIER_SYNC_URL + (CASHIER_SYNC_URL.includes('?') ? '&' : '?') + 't=' + Date.now();
}

async function fetchCloudWeeks() {
  if (!CASHIER_SYNC_URL) return null;
  try {
    const res = await fetch(noCacheUrl_(), { cache: 'no-store' });
    if (!res.ok) throw new Error('bad response: ' + res.status);
    const data = await res.json();
    return data.weeks || [];
  } catch (e) {
    console.error('cashier sync fetch failed:', e);
    return null;
  }
}

async function postCloud(payload) {
  if (!CASHIER_SYNC_URL) return;
  try {
    await fetch(CASHIER_SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
  } catch (e) {
    console.error('cashier sync post failed:', e);
    // بدون اتصال — البيانات محفوظة محلياً على الأقل، بتتزامن أول ما يرجع الاتصال
  }
}

async function syncFromCloud() {
  if (!CASHIER_SYNC_URL) return;
  setSyncStatus('🔄 مزامنة...', '');
  const weeks = await fetchCloudWeeks();
  if (weeks) {
    state.cashierFund.weeks = weeks;
    saveState();
    setSyncStatus('✓ متزامن', 'good');
    renderCashier();
  } else {
    setSyncStatus('⚠ بدون اتصال — عرض آخر نسخة محفوظة', 'critical');
  }
}

function fmt(n) {
  return Math.round(n).toLocaleString('en-US') + ' ريال';
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
    if (pinBuffer === CASHIER_PIN) {
      sessionStorage.setItem('cashier-unlocked', 'true');
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
  renderCashier();
  syncFromCloud();
}

// ---------- منطق العهدة ----------
function currentWeek() {
  const weeks = state.cashierFund.weeks;
  return weeks.length ? weeks[weeks.length - 1] : null;
}

function weekSpent(week) {
  return week.entries.reduce((a, e) => a + e.amount, 0);
}

function startNewWeek(allowance) {
  const weekStart = todayISO();
  state.cashierFund.weeks.push({ weekStart, allowance, entries: [] });
  saveState();
  renderCashier();
  postCloud({ action: 'start_week', weekStart, allowance }).then(syncFromCloud);
}

function addExpense(amount, description) {
  const week = currentWeek();
  const entry = { id: Date.now(), time: new Date().toISOString(), amount, description };
  week.entries.unshift(entry);
  saveState();
  renderCashier();
  postCloud({ action: 'add_expense', id: entry.id, weekStart: week.weekStart, time: entry.time, amount, description }).then(syncFromCloud);
}

function deleteExpense(id) {
  const week = currentWeek();
  week.entries = week.entries.filter((e) => e.id !== id);
  saveState();
  renderCashier();
  postCloud({ action: 'delete_expense', id }).then(syncFromCloud);
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

// ---------- العرض ----------
function renderSetupWeek(container) {
  const card = el('div', 'card setup-week-card');
  card.innerHTML = `<h3>ابدأ عهدة هذا الأسبوع</h3><span class="card-note">أدخل المبلغ اللي استلمته</span>`;
  const row = el('div', 'cashier-form-row');
  row.style.marginTop = '14px';
  row.innerHTML = `<input type="number" inputmode="decimal" class="cashier-input" placeholder="مبلغ العهدة (ريال)" />`;
  const input = row.querySelector('input');
  const btn = el('button', 'btn-cashier', 'بدء العهدة');
  btn.style.marginTop = '10px';
  btn.onclick = () => {
    const amount = parseFloat(input.value);
    if (!amount || amount <= 0) { input.focus(); return; }
    startNewWeek(amount);
  };
  card.appendChild(row);
  card.appendChild(btn);
  container.appendChild(card);
}

function renderWeekHistory(container) {
  const weeks = state.cashierFund.weeks;
  if (weeks.length <= 1) return;
  const card = el('div', 'card');
  card.style.marginTop = '16px';
  card.innerHTML = `<h3>الأسابيع السابقة</h3>`;
  const list = el('div');
  [...weeks].slice(0, -1).reverse().forEach((w) => {
    const spent = weekSpent(w);
    const row = el('div', 'week-history-item');
    row.innerHTML = `<span>${w.weekStart}</span><span>عهدة ${fmt(w.allowance)} — صُرف ${fmt(spent)}</span>`;
    list.appendChild(row);
  });
  card.appendChild(list);
  container.appendChild(card);
}

function renderCashier() {
  const content = document.getElementById('cashier-content');
  content.innerHTML = '';

  const week = currentWeek();
  if (!week) {
    renderSetupWeek(content);
    return;
  }

  const spent = weekSpent(week);
  const remaining = week.allowance - spent;
  const tone = remaining < 0 ? 'tone-critical' : remaining < week.allowance * 0.2 ? 'tone-warning' : 'tone-good';

  const hero = el('div', 'card fund-hero');
  hero.innerHTML = `
    <div class="stat-label">المتبقي من عهدة هذا الأسبوع</div>
    <div class="stat-value ${tone}">${fmt(remaining)}</div>
    <div class="fund-breakdown">
      <div>العهدة<b>${fmt(week.allowance)}</b></div>
      <div>المصروف<b>${fmt(spent)}</b></div>
    </div>`;
  content.appendChild(hero);

  const formCard = el('div', 'card');
  formCard.style.marginTop = '16px';
  formCard.innerHTML = `<h3>تسجيل مشترى جديد</h3>`;
  const amountRow = el('div', 'cashier-form-row');
  amountRow.innerHTML = `<label>المبلغ</label><input type="number" inputmode="decimal" class="cashier-input" id="expense-amount" placeholder="مثال: 45" />`;
  const descRow = el('div', 'cashier-form-row');
  descRow.innerHTML = `<label>البيان</label><input type="text" class="cashier-input" id="expense-desc" placeholder="مثال: غاز، بقالة، صيانة..." />`;
  const addBtn = el('button', 'btn-cashier', '+ إضافة');
  addBtn.onclick = () => {
    const amountInput = document.getElementById('expense-amount');
    const descInput = document.getElementById('expense-desc');
    const amount = parseFloat(amountInput.value);
    const description = descInput.value.trim();
    if (!amount || amount <= 0) { amountInput.focus(); return; }
    if (!description) { descInput.focus(); return; }
    addExpense(amount, description);
  };
  formCard.appendChild(amountRow);
  formCard.appendChild(descRow);
  formCard.appendChild(addBtn);
  content.appendChild(formCard);

  const listCard = el('div', 'card');
  listCard.style.marginTop = '16px';
  listCard.innerHTML = `<h3>مشتريات هذا الأسبوع</h3>`;
  if (week.entries.length) {
    const list = el('div');
    week.entries.forEach((entry) => {
      const row = el('div', 'expense-entry');
      row.innerHTML = `
        <div>
          <div class="expense-desc">${entry.description}</div>
          <div class="expense-time">${formatTime(entry.time)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <div class="expense-amount">${fmt(entry.amount)}</div>
        </div>`;
      const delBtn = el('button', 'expense-del', '✕');
      delBtn.onclick = () => { if (confirm('حذف هذا المشترى؟')) deleteExpense(entry.id); };
      row.querySelector('div:last-child').appendChild(delBtn);
      list.appendChild(row);
    });
    listCard.appendChild(list);
  } else {
    listCard.appendChild(el('div', 'empty-state', 'لسا ما فيه أي مشترى مسجّل هذا الأسبوع.'));
  }
  content.appendChild(listCard);

  const newWeekBtn = el('button', 'btn-cashier-outline', '↺ بدء عهدة أسبوع جديد');
  newWeekBtn.style.marginTop = '16px';
  newWeekBtn.onclick = () => {
    if (confirm('سيتم إغلاق عهدة هذا الأسبوع وبدء عهدة جديدة. متابعة؟')) {
      content.appendChild(el('div'));
      renderNewWeekPrompt();
    }
  };
  content.appendChild(newWeekBtn);

  renderWeekHistory(content);
}

function renderNewWeekPrompt() {
  const amount = prompt('أدخل مبلغ عهدة الأسبوع الجديد:');
  const parsed = parseFloat(amount);
  if (parsed && parsed > 0) startNewWeek(parsed);
}

document.addEventListener('DOMContentLoaded', () => {
  renderPinPad();
  document.getElementById('lock-btn').addEventListener('click', () => {
    sessionStorage.removeItem('cashier-unlocked');
    showLockScreen();
  });

  if (sessionStorage.getItem('cashier-unlocked') === 'true') {
    showMainScreen();
  } else {
    showLockScreen();
  }
});
