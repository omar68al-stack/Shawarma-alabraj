// شاورما الأبراج — منطق اللوحة (حسابات، عرض، حفظ محلي)

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

function fmt(n, unit = 'ريال') {
  const rounded = Math.round(n);
  return rounded.toLocaleString('en-US') + (unit ? ' ' + unit : '');
}

function fmtSigned(n, unit = 'ريال') {
  const rounded = Math.round(n);
  const sign = rounded > 0 ? '+' : '';
  return sign + rounded.toLocaleString('en-US') + (unit ? ' ' + unit : '');
}

// ---------- الحسابات المالية ----------
function computeMetrics(s) {
  const salariesTotal = Object.values(s.salaries).reduce((a, b) => a + b.value, 0);
  const rentMonthly = s.rentYearly / 12;
  const fixedCosts = salariesTotal + rentMonthly + s.utilities + s.internet;
  const directFoodCost = s.chicken + s.sides + s.pepsi;
  const packaging = s.plastic;
  const variableCosts = directFoodCost + packaging;
  const totalMonthlyCosts = fixedCosts + variableCosts;
  const breakEvenDaily = totalMonthlyCosts / 30;

  const salesAvg = (s.salesLow + s.salesHigh) / 2;
  const kgAvg = (s.kgLow + s.kgHigh) / 2;

  const scenarios = ['Low', 'Avg', 'High'].map((k) => {
    const daily = k === 'Low' ? s.salesLow : k === 'High' ? s.salesHigh : salesAvg;
    const monthlyRevenue = daily * 30;
    const profit = monthlyRevenue - totalMonthlyCosts;
    return { key: k, daily, monthlyRevenue, profit };
  });
  const avgScenario = scenarios[1];

  const foodCostPct = (directFoodCost / avgScenario.monthlyRevenue) * 100;
  const totalCogsPct = (variableCosts / avgScenario.monthlyRevenue) * 100;
  const fixedPct = (fixedCosts / totalMonthlyCosts) * 100;
  const variablePct = (variableCosts / totalMonthlyCosts) * 100;

  const costPerKg = s.chicken / (kgAvg * 30);
  const revenuePerKg = salesAvg / kgAvg;
  const marginPerKg = revenuePerKg - costPerKg;

  const totalDebt = s.debts.reduce((a, d) => a + d.amount, 0);
  const requiredDailySalesForDebtTarget = (totalMonthlyCosts + s.debtMonthlyTarget) / 30;
  const payoffMonths = totalDebt > 0 && s.debtMonthlyTarget > 0 ? Math.ceil(totalDebt / s.debtMonthlyTarget) : null;
  const debtFeasible = s.debtMonthlyTarget <= avgScenario.profit;

  return {
    salariesTotal, rentMonthly, fixedCosts, directFoodCost, packaging, variableCosts,
    totalMonthlyCosts, breakEvenDaily, salesAvg, kgAvg, scenarios, avgScenario,
    foodCostPct, totalCogsPct, fixedPct, variablePct, costPerKg, revenuePerKg, marginPerKg,
    totalDebt, requiredDailySalesForDebtTarget, payoffMonths, debtFeasible,
  };
}

// محاكاة سداد الديون بالأولوية (Waterfall): كل شهر يُدفع القسط كاملاً للدائن الأول حتى يُسدَّد بالكامل، ثم ينتقل للتالي
function simulateDebtPayoff(debts, monthlyBudget, cap = 60) {
  const remaining = debts.map((d) => ({ ...d, remaining: d.amount }));
  const payoffMonth = {};
  let month = 0;
  while (monthlyBudget > 0 && remaining.some((d) => d.remaining > 0) && month < cap) {
    month++;
    let budget = monthlyBudget;
    for (const d of remaining) {
      if (budget <= 0) break;
      if (d.remaining <= 0) continue;
      const pay = Math.min(d.remaining, budget);
      d.remaining -= pay;
      budget -= pay;
      if (d.remaining === 0 && !(d.id in payoffMonth)) payoffMonth[d.id] = month;
    }
  }
  return { payoffMonth, monthsToClear: month };
}

// ---------- عناصر مساعدة للعرض ----------
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

// ---------- تبويبات ----------
function initTabs() {
  document.querySelectorAll('.tab-link').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-link').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('section.view').forEach((v) => v.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.view).classList.add('active');
      const syncedViews = ['view-costs', 'view-overview', 'view-inventory', 'view-admin'];
      if (syncedViews.includes(btn.dataset.view)) {
        syncFromCloud();
      }
    });
  });
}

// ---------- تبديل الوضع الليلي ----------
function initTheme() {
  const btn = document.getElementById('theme-toggle');
  const saved = localStorage.getItem('shawarma-theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('shawarma-theme', next);
  });
}

// ---------- نظرة عامة / لوحة المتابعة ----------
function switchToTab(viewId) {
  const btn = document.querySelector(`.tab-link[data-view="${viewId}"]`);
  if (btn) btn.click();
}

function computeFollowUpSummary() {
  const m = computeMetrics(state);
  const today = todayISO();

  const totalDebt = m.totalDebt;
  const debtCount = state.debts.length;

  let correctiveTotal = 0, correctiveDone = 0;
  CORRECTIVE_PHASES.forEach((phase) => {
    phase.items.forEach((item) => {
      correctiveTotal++;
      if (state.checklist[item.id]) correctiveDone++;
    });
  });
  const correctivePct = correctiveTotal ? (correctiveDone / correctiveTotal) * 100 : 0;

  const adminTotal = state.adminTasks.length;
  const adminDone = state.adminTasks.filter((t) => t.status === 'done').length;
  const adminPending = state.adminTasks.filter((t) => t.status === 'pending').length;

  const sortedLogs = sortedInventoryLogs();
  const loggedToday = sortedLogs.some((l) => l.date === today);
  const latestInventory = sortedLogs[0] || null;

  const cashierWeeks = state.cashierFund.weeks;
  const cashierWeek = cashierWeeks.length ? cashierWeeks[cashierWeeks.length - 1] : null;
  let cashierRemaining = null;
  if (cashierWeek) {
    const spent = cashierWeek.entries.reduce((a, e) => a + e.amount, 0);
    cashierRemaining = cashierWeek.allowance - spent;
  }

  const sortedMkt = sortedMarketingLogs();
  const marketingWeek = sortedMkt[0] || null;
  let marketingPct = null;
  if (marketingWeek && state.marketingGoals.length) {
    const pcts = state.marketingGoals.map((g) => {
      const actual = marketingWeek.actuals[g.id] || 0;
      return g.targetPerWeek > 0 ? Math.min((actual / g.targetPerWeek) * 100, 150) : 0;
    });
    marketingPct = pcts.reduce((a, b) => a + b, 0) / pcts.length;
  }

  return {
    totalDebt, debtCount,
    correctivePct, correctiveDone, correctiveTotal,
    adminDone, adminPending, adminTotal,
    loggedToday, latestInventory,
    cashierWeek, cashierRemaining,
    marketingWeek, marketingPct,
  };
}

function renderOverview() {
  const s = computeFollowUpSummary();
  const grid = document.getElementById('followup-grid');
  grid.innerHTML = '';

  const cards = [
    {
      label: 'إجمالي الديون الحالية',
      value: fmt(s.totalDebt),
      note: `${s.debtCount} جهة دائنة`,
      view: 'view-debt',
    },
    {
      label: 'تقدّم الخطة التصحيحية',
      value: s.correctivePct.toFixed(0) + '%',
      note: `${s.correctiveDone} من ${s.correctiveTotal} إجراء منجَز`,
      tone: s.correctivePct >= 70 ? 'good' : s.correctivePct >= 30 ? 'warning' : 'critical',
      view: 'view-corrective',
    },
    {
      label: 'معاملات لم تبدأ',
      value: String(s.adminPending),
      note: `${s.adminDone} من ${s.adminTotal} معاملة منجزة`,
      tone: s.adminPending ? 'warning' : 'good',
      view: 'view-admin',
    },
    {
      label: 'جرد اليوم',
      value: s.loggedToday ? '✓ تم التسجيل' : 'لم يُسجَّل بعد',
      note: s.latestInventory ? `آخر جرد: ${s.latestInventory.date}` : 'لا يوجد جرد مسجّل',
      tone: s.loggedToday ? 'good' : 'warning',
      view: 'view-inventory',
    },
    {
      label: 'عهدة الكاشير المتبقية',
      value: s.cashierWeek ? fmt(s.cashierRemaining) : '—',
      note: s.cashierWeek ? `منذ ${s.cashierWeek.weekStart}` : 'ما بدأ أي عهدة أسبوعية',
      tone: s.cashierWeek ? (s.cashierRemaining < 0 ? 'critical' : s.cashierRemaining < s.cashierWeek.allowance * 0.2 ? 'warning' : 'good') : '',
      view: 'view-costs',
    },
    {
      label: 'تقدّم التسويق هذا الأسبوع',
      value: s.marketingPct !== null ? s.marketingPct.toFixed(0) + '%' : '—',
      note: s.marketingWeek ? `أسبوع ${s.marketingWeek.weekStart}` : 'ما فيه أسبوع مسجّل بعد',
      tone: s.marketingPct !== null ? (s.marketingPct >= 100 ? 'good' : s.marketingPct >= 50 ? 'warning' : 'critical') : '',
      view: 'view-marketing',
    },
  ];

  cards.forEach((c) => {
    const tile = el('div', 'card stat-tile followup-card');
    tile.innerHTML = `
      <div class="stat-label">${c.label}</div>
      <div class="stat-value ${c.tone ? 'tone-' + c.tone : ''}">${c.value}</div>
      <div class="stat-delta">${c.note}</div>`;
    tile.onclick = () => switchToTab(c.view);
    grid.appendChild(tile);
  });

  renderOverviewCharts(s);
}

function hbarRow(label, pctOfMax, valueText, tag) {
  const row = el('div', 'hbar-row hbar-row-compact');
  row.innerHTML = `
    <div class="hbar-label">${label}${tag ? ` <span class="tag-cat">${tag}</span>` : ''}</div>
    <div class="hbar-track"><div class="hbar-fill" style="width:${Math.max(0, Math.min(100, pctOfMax))}%"></div></div>
    <div class="hbar-value">${valueText}</div>`;
  return row;
}

function renderOverviewCharts(s) {
  document.getElementById('ov-debt-card').onclick = () => switchToTab('view-debt');
  document.getElementById('ov-corrective-card').onclick = () => switchToTab('view-corrective');
  document.getElementById('ov-admin-card').onclick = () => switchToTab('view-admin');
  document.getElementById('ov-chicken-card').onclick = () => switchToTab('view-inventory');
  document.getElementById('ov-marketing-card').onclick = () => switchToTab('view-marketing');

  // توزيع الديون حسب الدائن
  document.getElementById('ov-debt-total').textContent = fmt(s.totalDebt);
  const debtChart = document.getElementById('ov-debt-chart');
  debtChart.innerHTML = '';
  if (state.debts.length) {
    const sortedDebts = [...state.debts].sort((a, b) => b.amount - a.amount);
    const maxDebt = sortedDebts[0].amount || 1;
    sortedDebts.forEach((d) => {
      const pct = s.totalDebt ? (d.amount / s.totalDebt) * 100 : 0;
      debtChart.appendChild(hbarRow(d.name, (d.amount / maxDebt) * 100, `${fmt(d.amount)}<span class="hbar-pct">${pct.toFixed(0)}%</span>`));
    });
  } else {
    debtChart.innerHTML = '<div class="chart-empty">لا توجد ديون مسجّلة.</div>';
  }

  // تقدّم الخطة التصحيحية بالمراحل
  const correctiveChart = document.getElementById('ov-corrective-chart');
  correctiveChart.innerHTML = '';
  CORRECTIVE_PHASES.forEach((phase) => {
    const total = phase.items.length;
    const done = phase.items.filter((it) => state.checklist[it.id]).length;
    const pct = total ? (done / total) * 100 : 0;
    correctiveChart.appendChild(hbarRow(phase.title, pct, `${done}/${total}<span class="hbar-pct">${pct.toFixed(0)}%</span>`, phase.duration));
  });

  // حالة المعاملات الإدارية
  const total = state.adminTasks.length;
  const doneCount = state.adminTasks.filter((t) => t.status === 'done').length;
  const progressCount = state.adminTasks.filter((t) => t.status === 'in_progress').length;
  const pendingCount = state.adminTasks.filter((t) => t.status === 'pending').length;
  document.getElementById('ov-admin-note').textContent = `${total} معاملة إجمالاً`;
  const adminChart = document.getElementById('ov-admin-chart');
  adminChart.innerHTML = `
    <div class="stacked-bar">
      <div class="stacked-seg-done" style="width:${total ? (doneCount / total) * 100 : 0}%"></div>
      <div class="stacked-seg-progress" style="width:${total ? (progressCount / total) * 100 : 0}%"></div>
      <div class="stacked-seg-pending" style="width:${total ? (pendingCount / total) * 100 : 0}%"></div>
    </div>
    <div class="stacked-legend">
      <span><i class="dot done"></i> منجزة ${doneCount}</span>
      <span><i class="dot progress"></i> جارية ${progressCount}</span>
      <span><i class="dot pending"></i> لم تبدأ ${pendingCount}</span>
    </div>`;

  // استهلاك الدجاج آخر الأيام
  document.getElementById('ov-chicken-range').textContent = `${state.kgLow}–${state.kgHigh} كجم/يوم`;
  const chickenChart = document.getElementById('ov-chicken-chart');
  chickenChart.innerHTML = '';
  const recentLogs = sortedInventoryLogs().slice(0, 7);
  if (recentLogs.length) {
    const maxKg = Math.max(state.kgHigh, ...recentLogs.map((l) => l.chickenConsumedKg)) * 1.1 || 1;
    recentLogs.forEach((log) => {
      const tone = log.chickenConsumedKg > state.kgHigh ? 'critical' : log.chickenConsumedKg < state.kgLow ? 'warning' : 'good';
      const row = hbarRow(log.date, (log.chickenConsumedKg / maxKg) * 100, `${log.chickenConsumedKg} كجم`);
      row.querySelector('.hbar-fill').classList.add('tone-bg-' + tone);
      chickenChart.appendChild(row);
    });
  } else {
    chickenChart.innerHTML = '<div class="chart-empty">لا يوجد جرد مسجّل بعد.</div>';
  }

  // التسويق: الفعلي مقابل المستهدف
  const marketingChart = document.getElementById('ov-marketing-chart');
  marketingChart.innerHTML = '';
  if (s.marketingWeek && state.marketingGoals.length) {
    document.getElementById('ov-marketing-note').textContent = `أسبوع ${s.marketingWeek.weekStart}`;
    state.marketingGoals.forEach((g) => {
      const actual = s.marketingWeek.actuals[g.id] || 0;
      const pct = g.targetPerWeek > 0 ? (actual / g.targetPerWeek) * 100 : 0;
      const tone = pct >= 100 ? 'good' : pct >= 50 ? 'warning' : 'critical';
      const row = hbarRow(g.name, pct, `${actual}/${g.targetPerWeek} ${g.unit}<span class="hbar-pct">${pct.toFixed(0)}%</span>`);
      row.querySelector('.hbar-fill').classList.add('tone-bg-' + tone);
      marketingChart.appendChild(row);
    });
  } else {
    document.getElementById('ov-marketing-note').textContent = '';
    marketingChart.innerHTML = '<div class="chart-empty">ما فيه أسبوع تسويق مسجّل بعد.</div>';
  }
}

function bindNumberInput(inputId, stateKey, onChange) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.value = state[stateKey];
  input.oninput = () => {
    const v = parseFloat(input.value);
    state[stateKey] = isNaN(v) ? 0 : v;
    saveState();
    renderAll();
  };
}

// ---------- تحليل التكاليف ----------
function renderCosts() {
  const m = computeMetrics(state);

  // افتراضات الإيراد والإنتاج
  bindNumberInput('input-salesLow', 'salesLow');
  bindNumberInput('input-salesHigh', 'salesHigh');
  bindNumberInput('input-kgLow', 'kgLow');
  bindNumberInput('input-kgHigh', 'kgHigh');
  document.getElementById('startup-cost-note').textContent =
    `تذكير: تكلفة إنشاء المحل الأولية كانت نحو ${fmt(state.startupCost)} (تكاليف عمال وإنشائية) — هذه تكلفة مدفوعة مسبقاً ولا تدخل في الحسابات الشهرية أعلاه.`;

  // مدخلات الرواتب
  const salariesWrap = document.getElementById('salaries-inputs');
  salariesWrap.innerHTML = '';
  Object.entries(state.salaries).forEach(([key, item]) => {
    const row = el('div', 'input-row');
    row.innerHTML = `<label>${item.label}</label><div class="input-suffix"><input type="number" min="0" step="50" value="${item.value}" /><span>ريال/شهر</span></div>`;
    row.querySelector('input').oninput = (e) => {
      state.salaries[key].value = parseFloat(e.target.value) || 0;
      saveState();
      renderAll();
    };
    salariesWrap.appendChild(row);
  });
  document.getElementById('salaries-total').textContent = fmt(m.salariesTotal) + '/شهر';

  // مدخلات التكاليف الأخرى
  const otherCosts = [
    { key: 'rentYearly', label: 'الإيجار (سنوياً)', suffix: 'ريال/سنة' },
    { key: 'utilities', label: 'الكهرباء والسكن', suffix: 'ريال/شهر' },
    { key: 'internet', label: 'الإنترنت والتأمينات', suffix: 'ريال/شهر' },
    { key: 'chicken', label: 'مشتريات الدجاج', suffix: 'ريال/شهر' },
    { key: 'sides', label: 'البطاطس والمخلل والخبز', suffix: 'ريال/شهر' },
    { key: 'pepsi', label: 'المشروبات (ببسي)', suffix: 'ريال/شهر' },
    { key: 'plastic', label: 'التغليف (بلاستيك)', suffix: 'ريال/شهر' },
  ];
  const otherWrap = document.getElementById('other-costs-inputs');
  otherWrap.innerHTML = '';
  otherCosts.forEach((c) => {
    const row = el('div', 'input-row');
    row.innerHTML = `<label>${c.label}</label><div class="input-suffix"><input type="number" min="0" step="50" value="${state[c.key]}" /><span>${c.suffix}</span></div>`;
    row.querySelector('input').oninput = (e) => {
      state[c.key] = parseFloat(e.target.value) || 0;
      saveState();
      renderAll();
    };
    otherWrap.appendChild(row);
  });

  // جدول ورسم بياني لتوزيع التكاليف
  const rows = [
    { label: 'الرواتب', value: m.salariesTotal, cat: 'ثابتة' },
    { label: 'الإيجار (شهرياً)', value: m.rentMonthly, cat: 'ثابتة' },
    { label: 'الكهرباء والسكن', value: state.utilities, cat: 'ثابتة' },
    { label: 'الإنترنت والتأمينات', value: state.internet, cat: 'ثابتة' },
    { label: 'الدجاج', value: state.chicken, cat: 'مباشرة' },
    { label: 'البطاطس والمخلل والخبز', value: state.sides, cat: 'مباشرة' },
    { label: 'المشروبات (ببسي)', value: state.pepsi, cat: 'مباشرة' },
    { label: 'التغليف (بلاستيك)', value: state.plastic, cat: 'تغليف' },
  ].sort((a, b) => b.value - a.value);

  const maxVal = rows[0].value;
  const barsWrap = document.getElementById('cost-bars');
  barsWrap.innerHTML = '';
  rows.forEach((r) => {
    const pctOfRevenue = (r.value / m.avgScenario.monthlyRevenue) * 100;
    const row = el('div', 'hbar-row');
    row.innerHTML = `
      <div class="hbar-label">${r.label} <span class="tag-cat">${r.cat}</span></div>
      <div class="hbar-track"><div class="hbar-fill" style="width:${(r.value / maxVal) * 100}%"></div></div>
      <div class="hbar-value">${fmt(r.value)}<span class="hbar-pct">${pctOfRevenue.toFixed(0)}% من الإيراد</span></div>`;
    barsWrap.appendChild(row);
  });

  document.getElementById('total-costs-value').textContent = fmt(m.totalMonthlyCosts);
  document.getElementById('fixed-variable-split').innerHTML =
    `<div class="split-bar"><div class="split-fixed" style="width:${m.fixedPct}%"></div><div class="split-variable" style="width:${m.variablePct}%"></div></div>
     <div class="split-legend"><span><i class="dot fixed"></i> ثابتة ${m.fixedPct.toFixed(0)}%</span><span><i class="dot variable"></i> متغيرة (مواد وتغليف) ${m.variablePct.toFixed(0)}%</span></div>`;

  renderCashierFundSummary();
}

// ---------- مزامنة العهدة والجرد والتسويق والمعاملات من Google Sheets (عبر JSONP — يتجاوز قيود CORS) ----------
function setSyncStatus(text, tone) {
  ['cashier-sync-status', 'inventory-sync-status', 'marketing-sync-status', 'admin-sync-status'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = 'sync-status' + (tone ? ' tone-' + tone : '');
  });
}

function jsonpFetch_() {
  return new Promise((resolve, reject) => {
    const cbName = 'syncCb_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
    const script = document.createElement('script');
    const timeout = setTimeout(() => { cleanup(); reject(new Error('انتهت مهلة الاتصال')); }, 35000);
    function cleanup() { clearTimeout(timeout); delete window[cbName]; script.remove(); }
    window[cbName] = (data) => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error('تعذّر تحميل البيانات')); };
    script.src = SYNC_URL + (SYNC_URL.includes('?') ? '&' : '?') + 'callback=' + cbName + '&t=' + Date.now();
    document.body.appendChild(script);
  });
}

function postCloud(payload) {
  return new Promise((resolve) => {
    if (!SYNC_URL) { resolve(); return; }
    const frameName = 'syncFrame_' + Date.now();
    const iframe = document.createElement('iframe');
    iframe.name = frameName;
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = SYNC_URL;
    form.target = frameName;
    form.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'payload';
    input.value = JSON.stringify(payload);
    form.appendChild(input);
    document.body.appendChild(form);

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      form.remove();
      setTimeout(() => iframe.remove(), 500);
      resolve();
    };
    iframe.addEventListener('load', finish);
    setTimeout(finish, 8000);
    form.submit();
  });
}

async function syncFromCloud() {
  if (!SYNC_URL) return;
  setSyncStatus('🔄 مزامنة...', '');
  try {
    const data = await jsonpFetch_();
    state.cashierFund.weeks = data.weeks || [];
    state.inventoryLogs = data.inventoryLogs || [];
    state.marketingLogs = data.marketingLogs || [];
    if (data.adminTasks && data.adminTasks.length) {
      state.adminTasks = data.adminTasks;
    } else if (state.adminTasks.length) {
      // الشيت لسا ما فيه معاملات (أول مزامنة) — ارفع القائمة المحلية الحالية كبداية
      postCloud({ action: 'save_admin_tasks', tasks: state.adminTasks });
    }
    saveState();
    setSyncStatus('✓ متزامن', 'good');
    renderCosts();
    renderOverview();
    renderInventory();
    renderMarketing();
    renderAdminTasks();
  } catch (e) {
    console.error('sync fetch failed:', e);
    setSyncStatus('⚠ فشل: ' + (e && e.message ? e.message : e), 'critical');
  }
}

function renderCashierFundSummary() {
  const wrap = document.getElementById('cashier-fund-summary');
  const weeks = state.cashierFund.weeks;
  if (!weeks.length) {
    wrap.innerHTML = '<div class="empty-state">الكاشير لسا ما بدأ أي عهدة أسبوعية.</div>';
    return;
  }
  const week = weeks[weeks.length - 1];
  const spent = week.entries.reduce((a, e) => a + e.amount, 0);
  const remaining = week.allowance - spent;
  const tone = remaining < 0 ? 'critical' : remaining < week.allowance * 0.2 ? 'warning' : 'good';

  wrap.innerHTML = `
    <div class="grid grid-3" style="margin-top:10px">
      <div class="card stat-tile"><div class="stat-label">عهدة هذا الأسبوع</div><div class="stat-value">${fmt(week.allowance)}</div><div class="stat-delta">منذ ${week.weekStart}</div></div>
      <div class="card stat-tile"><div class="stat-label">المصروف حتى الآن</div><div class="stat-value">${fmt(spent)}</div><div class="stat-delta">${week.entries.length} عملية</div></div>
      <div class="card stat-tile"><div class="stat-label">المتبقي</div><div class="stat-value tone-${tone}">${fmt(remaining)}</div></div>
    </div>`;

  if (week.entries.length) {
    const table = el('table');
    table.style.marginTop = '14px';
    table.innerHTML = `<thead><tr><th>البيان</th><th>المبلغ</th></tr></thead>
      <tbody>${week.entries.slice(0, 8).map(e => `<tr><td>${e.description}</td><td>${fmt(e.amount)}</td></tr>`).join('')}</tbody>`;
    const tw = el('div', 'table-wrap');
    tw.appendChild(table);
    wrap.appendChild(tw);
  }
}

// ---------- الخطة التصحيحية ----------
function renderCorrective() {
  const m = computeMetrics(state);
  const wrap = document.getElementById('corrective-content');
  wrap.innerHTML = '';

  const diag = el('div', 'card diagnosis-card');
  diag.innerHTML = `
    <h3>التشخيص</h3>
    <span class="card-note">الفجوة الأكبر بين الوضع الحالي والمعدل الصحي للقطاع</span>
    <div class="diagnosis-row">
      <div class="diagnosis-label">تكلفة المواد المباشرة والتغليف من الإيرادات</div>
      <div class="diagnosis-compare">
        <div class="diagnosis-bar-track"><div class="diagnosis-bar-fill critical" style="width:${Math.min(m.totalCogsPct, 100)}%"></div><div class="diagnosis-target-marker" style="right:${100 - 40}%"></div></div>
        <div class="diagnosis-legend"><b class="tone-critical">${m.totalCogsPct.toFixed(0)}% حالياً</b><span>المستهدف: 35–40%</span></div>
      </div>
    </div>
    <p class="diagnosis-text">الدجاج وحده يكلّف ${fmt(state.chicken)} شهرياً — أي نحو ${((state.chicken / m.avgScenario.monthlyRevenue) * 100).toFixed(0)}% من متوسط الإيرادات. تخفيض هذه النسبة إلى المعدل الصحي (عبر تفاوض الأسعار وضبط الأوزان) يوفّر تقريباً ${fmt(m.variableCosts - (m.avgScenario.monthlyRevenue * 0.4))} ريال شهرياً إضافية — وهذا هو الفارق بين الديون المتراكمة والسيولة المستقرة.</p>
  `;
  wrap.appendChild(diag);

  const rootWrap = el('div', 'card');
  rootWrap.innerHTML = `<h3>جذور الأزمة</h3><span class="card-note">السبب مقابل الأثر الفعلي على المحل</span>`;
  const rootTable = el('table');
  rootTable.innerHTML = `<thead><tr><th>السبب الجذري</th><th>الأثر</th></tr></thead>
    <tbody>${ROOT_CAUSES.map(r => `<tr><td class="cell-strong">${r.cause}</td><td>${r.effect}</td></tr>`).join('')}</tbody>`;
  rootWrap.appendChild(el('div', 'table-wrap')).appendChild(rootTable);
  wrap.appendChild(rootWrap);

  let totalItems = 0, checkedItems = 0;
  CORRECTIVE_PHASES.forEach((phase) => {
    const card = el('div', 'card corrective-cat');
    const header = el('div', 'corrective-cat-header');
    header.innerHTML = `<h3>${phase.title} <span class="phase-badge">${phase.duration}</span></h3>`;
    card.appendChild(header);
    const list = el('div', 'checklist');
    phase.items.forEach((item) => {
      totalItems++;
      const checked = !!state.checklist[item.id];
      if (checked) checkedItems++;
      const row = el('label', 'checklist-item' + (checked ? ' checked' : ''));
      row.innerHTML = `<input type="checkbox" ${checked ? 'checked' : ''} /><span>${item.text}</span>`;
      row.querySelector('input').onchange = (e) => {
        state.checklist[item.id] = e.target.checked;
        saveState();
        renderCorrective();
      };
      list.appendChild(row);
    });
    card.appendChild(list);
    wrap.appendChild(card);
  });

  const progressPct = totalItems ? (checkedItems / totalItems) * 100 : 0;
  document.getElementById('corrective-progress-bar').style.width = progressPct + '%';
  document.getElementById('corrective-progress-label').textContent = `${checkedItems} من ${totalItems} إجراء منجَز (${progressPct.toFixed(0)}%)`;
}

// ---------- خطة سداد الديون ----------
let installmentFormOpenId = null;
let expandedInstallmentDebtId = null;

function addMonthsClamped(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const total = (m - 1) + n;
  const ny = y + Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12;
  const lastDay = new Date(ny, nm + 1, 0).getDate();
  const nd = Math.min(d, lastDay);
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
}

function fmtDateDMY(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function buildInstallmentSchedule(debt) {
  const plan = debt.installmentPlan;
  if (!plan || !plan.monthlyAmount || debt.amount <= 0) return [];
  const first = plan.firstAmount > 0 ? plan.firstAmount : plan.monthlyAmount;
  const afterFirst = Math.max(0, debt.amount - first);
  const months = afterFirst > 0 ? 1 + Math.ceil(afterFirst / plan.monthlyAmount) : 1;
  const rows = [];
  let allocated = 0;
  for (let i = 1; i <= months; i++) {
    let amount;
    if (i === months) amount = +(debt.amount - allocated).toFixed(2);
    else if (i === 1) amount = first;
    else amount = plan.monthlyAmount;
    allocated += amount;
    rows.push({
      index: i,
      dueDate: addMonthsClamped(plan.startDate, i - 1),
      amount,
      paid: i <= (plan.paidCount || 0),
    });
  }
  return rows;
}

function renderInstallmentSection(wrap, debt) {
  const box = el('div', 'installment-box');
  const plan = debt.installmentPlan;

  if (!plan) {
    const toggleBtn = el('button', 'btn btn-sm', installmentFormOpenId === debt.id ? 'إلغاء' : '➕ إنشاء جدول أقساط');
    toggleBtn.onclick = () => { installmentFormOpenId = installmentFormOpenId === debt.id ? null : debt.id; renderDebt(); };
    box.appendChild(toggleBtn);

    if (installmentFormOpenId === debt.id) {
      const form = el('div', 'installment-form');

      const amtWrap = el('div', 'input-suffix');
      const amtInput = document.createElement('input'); amtInput.type = 'number'; amtInput.min = '0'; amtInput.step = '50'; amtInput.placeholder = 'القسط الشهري';
      const amtUnit = document.createElement('span'); amtUnit.textContent = 'ريال';
      amtWrap.appendChild(amtInput); amtWrap.appendChild(amtUnit);

      const dateInput = document.createElement('input'); dateInput.type = 'date'; dateInput.value = todayISO();

      const firstAmtWrap = el('div', 'input-suffix');
      const firstAmtInput = document.createElement('input'); firstAmtInput.type = 'number'; firstAmtInput.min = '0'; firstAmtInput.step = '50'; firstAmtInput.placeholder = 'أول قسط مختلف (اختياري)';
      const firstAmtUnit = document.createElement('span'); firstAmtUnit.textContent = 'ريال';
      firstAmtWrap.appendChild(firstAmtInput); firstAmtWrap.appendChild(firstAmtUnit);

      const createBtn = el('button', 'btn btn-sm btn-primary', 'إنشاء الجدول');
      createBtn.onclick = () => {
        const monthlyAmount = parseFloat(amtInput.value) || 0;
        if (monthlyAmount <= 0) { alert('أدخل قيمة القسط الشهري أولاً'); return; }
        const firstAmount = parseFloat(firstAmtInput.value) || 0;
        debt.installmentPlan = { monthlyAmount, firstAmount, startDate: dateInput.value || todayISO(), paidCount: 0 };
        installmentFormOpenId = null;
        expandedInstallmentDebtId = debt.id;
        saveState();
        renderDebt();
      };

      form.appendChild(amtWrap);
      form.appendChild(dateInput);
      form.appendChild(firstAmtWrap);
      form.appendChild(createBtn);
      box.appendChild(form);
    }
  } else {
    const schedule = buildInstallmentSchedule(debt);
    const paidCount = Math.min(plan.paidCount || 0, schedule.length);

    const summary = el('div', 'installment-summary');
    const firstNote = plan.firstAmount > 0 && plan.firstAmount !== plan.monthlyAmount ? ` (أول قسط ${fmt(plan.firstAmount)})` : '';
    summary.innerHTML = `جدول أقساط: <b>${fmt(plan.monthlyAmount)}</b> شهرياً${firstNote} — <b>${paidCount}</b> من <b>${schedule.length}</b> مدفوع`;

    const actions = el('div', 'installment-actions');
    const viewBtn = el('button', 'btn btn-sm', expandedInstallmentDebtId === debt.id ? 'إخفاء الجدول' : 'عرض الجدول');
    viewBtn.onclick = () => { expandedInstallmentDebtId = expandedInstallmentDebtId === debt.id ? null : debt.id; renderDebt(); };
    const deleteBtn = el('button', 'btn btn-sm', '🗑 حذف الجدول');
    deleteBtn.onclick = () => {
      if (!confirm('حذف جدول الأقساط لهذا الدين؟')) return;
      delete debt.installmentPlan;
      if (expandedInstallmentDebtId === debt.id) expandedInstallmentDebtId = null;
      saveState();
      renderDebt();
    };
    actions.appendChild(viewBtn);
    actions.appendChild(deleteBtn);

    box.appendChild(summary);
    box.appendChild(actions);

    if (expandedInstallmentDebtId === debt.id) {
      const tableWrap = el('div', 'table-wrap installment-table-wrap');
      const table = document.createElement('table');
      table.innerHTML = `<thead><tr><th>تاريخ الاستحقاق</th><th>القسط #</th><th>القسط الشهري</th><th>الحالة</th><th></th></tr></thead>
        <tbody>${schedule.map((row) => `
          <tr>
            <td>${fmtDateDMY(row.dueDate)}</td>
            <td>${row.index}</td>
            <td>${fmt(row.amount)}</td>
            <td>${row.paid ? '<span class="tag-cat tone-good">مغلق</span>' : '<span class="tag-cat tone-warning">مفتوح</span>'}</td>
            <td data-row-action="${row.index}"></td>
          </tr>`).join('')}
          <tr class="installment-total-row"><td colspan="2">المجموع</td><td>${fmt(schedule.reduce((s, r) => s + r.amount, 0))}</td><td colspan="2"></td></tr>
        </tbody>`;
      tableWrap.appendChild(table);
      box.appendChild(tableWrap);

      table.querySelectorAll('[data-row-action]').forEach((cell) => {
        const idx = parseInt(cell.dataset.rowAction, 10);
        if (idx === paidCount + 1) {
          const b = el('button', 'btn btn-sm', 'تحديد كمدفوع');
          b.onclick = () => { debt.installmentPlan.paidCount = idx; saveState(); renderDebt(); };
          cell.appendChild(b);
        } else if (idx === paidCount && paidCount > 0) {
          const b = el('button', 'btn btn-sm', 'تراجع');
          b.onclick = () => { debt.installmentPlan.paidCount = idx - 1; saveState(); renderDebt(); };
          cell.appendChild(b);
        }
      });
    }
  }

  wrap.appendChild(box);
}

function moveDebt(idx, dir) {
  const target = idx + dir;
  if (target < 0 || target >= state.debts.length) return;
  const tmp = state.debts[idx];
  state.debts[idx] = state.debts[target];
  state.debts[target] = tmp;
  saveState();
  renderDebt();
}

function removeDebt(idx) {
  if (!confirm(`حذف "${state.debts[idx].name}" من قائمة الديون؟`)) return;
  state.debts.splice(idx, 1);
  saveState();
  renderDebt();
}

function addDebt() {
  state.debts.push({ id: 'debt-' + Date.now(), name: '', amount: 0, note: '' });
  saveState();
  renderDebt();
}

function renderDebtsList() {
  const wrap = document.getElementById('debts-list');
  wrap.innerHTML = '';
  state.debts.forEach((debt, idx) => {
    const row = el('div', 'debt-row');
    const orderBtns = el('div', 'debt-order-btns');
    const upBtn = el('button', 'btn btn-sm', '▲'); upBtn.disabled = idx === 0; upBtn.onclick = () => moveDebt(idx, -1);
    const downBtn = el('button', 'btn btn-sm', '▼'); downBtn.disabled = idx === state.debts.length - 1; downBtn.onclick = () => moveDebt(idx, 1);
    orderBtns.appendChild(upBtn); orderBtns.appendChild(downBtn);

    const rankBadge = el('div', 'debt-rank', String(idx + 1));

    const nameInput = el('input'); nameInput.placeholder = 'اسم الدائن'; nameInput.value = debt.name;
    nameInput.oninput = (e) => { debt.name = e.target.value; saveState(); };

    const amountWrap = el('div', 'input-suffix');
    const amountInput = document.createElement('input'); amountInput.type = 'number'; amountInput.min = '0'; amountInput.step = '100'; amountInput.value = debt.amount;
    amountInput.oninput = (e) => { debt.amount = parseFloat(e.target.value) || 0; saveState(); renderDebt(); };
    const amountUnit = document.createElement('span'); amountUnit.textContent = 'ريال';
    amountWrap.appendChild(amountInput); amountWrap.appendChild(amountUnit);

    const removeBtn = el('button', 'btn btn-sm', '✕');
    removeBtn.onclick = () => removeDebt(idx);

    row.appendChild(rankBadge);
    row.appendChild(orderBtns);
    row.appendChild(nameInput);
    row.appendChild(amountWrap);
    row.appendChild(removeBtn);
    wrap.appendChild(row);

    if (debt.note) {
      const noteEl = el('div', 'debt-note', debt.note);
      wrap.appendChild(noteEl);
    }

    renderInstallmentSection(wrap, debt);
  });
}

function renderDebt() {
  const m = computeMetrics(state);

  renderDebtsList();
  document.getElementById('debts-total').textContent = fmt(m.totalDebt);
  bindNumberInput('input-debtTarget', 'debtMonthlyTarget');

  const summary = document.getElementById('debt-summary');
  const monthsText = m.payoffMonths ? `${m.payoffMonths} شهراً (≈ ${(m.payoffMonths / 12).toFixed(1)} سنة)` : '—';
  summary.innerHTML = `
    <div class="card stat-tile">
      <div class="stat-label">إجمالي الديون الحالية</div>
      <div class="stat-value">${fmt(m.totalDebt)}</div>
      <div class="stat-delta">${state.debts.length} جهة دائنة</div>
    </div>
    <div class="card stat-tile">
      <div class="stat-label">مدة السداد المتوقعة</div>
      <div class="stat-value">${monthsText}</div>
      <div class="stat-delta">عند تخصيص ${fmt(state.debtMonthlyTarget)} شهرياً للسداد</div>
    </div>
    <div class="card stat-tile">
      <div class="stat-label">المبيعات اليومية المطلوبة</div>
      <div class="stat-value ${m.debtFeasible ? 'tone-good' : 'tone-warning'}">${fmt(m.requiredDailySalesForDebtTarget)}</div>
      <div class="stat-delta">لتغطية كل التكاليف + قسط الدين الشهري</div>
    </div>
    <div class="card stat-tile">
      <div class="stat-label">الربح المتوقع عند المتوسط الحالي</div>
      <div class="stat-value ${m.avgScenario.profit >= 0 ? 'tone-good' : 'tone-critical'}">${fmtSigned(m.avgScenario.profit)}</div>
      <div class="stat-delta">قبل تخصيص أي مبلغ للسداد</div>
    </div>`;

  const feasibilityNote = document.getElementById('debt-feasibility-note');
  if (m.totalDebt <= 0) {
    feasibilityNote.className = 'card note-box note-neutral';
    feasibilityNote.innerHTML = 'أضف الديون الحالية أعلاه لحساب خطة سداد واقعية.';
  } else if (m.debtFeasible) {
    feasibilityNote.className = 'card note-box note-good';
    feasibilityNote.innerHTML = `هذا الهدف واقعي عند متوسط المبيعات الحالي (${fmt(m.salesAvg)} يومياً) — الربح المتوقع (${fmt(m.avgScenario.profit)}) يغطي قسط السداد (${fmt(state.debtMonthlyTarget)}).`;
  } else {
    const gap = state.debtMonthlyTarget - m.avgScenario.profit;
    feasibilityNote.className = 'card note-box note-critical';
    feasibilityNote.innerHTML = `⚠ هذا الهدف غير واقعي عند الوضع الحالي — يوجد نقص ${fmt(gap)} شهرياً بين الربح المتوقع وقسط السداد المطلوب. الحل: طبّق الخطة التصحيحية لخفض التكاليف، و/أو ارفع متوسط المبيعات نحو ${fmt(m.requiredDailySalesForDebtTarget)} يومياً، و/أو قلّل قسط السداد الشهري إلى ${fmt(Math.max(m.avgScenario.profit, 0))} كخطوة أولى وأعد التفاوض مع كل جهة على مدة أطول.`;
  }

  // خطة السداد بالأولوية (Waterfall): كل القسط الشهري يذهب للدائن الأول حتى يُسدَّد بالكامل، ثم ينتقل للتالي
  const priorityWrap = document.getElementById('debt-priority-plan');
  priorityWrap.innerHTML = '';
  if (m.totalDebt > 0 && state.debtMonthlyTarget > 0) {
    const { payoffMonth } = simulateDebtPayoff(state.debts, state.debtMonthlyTarget);
    const table = el('table');
    table.innerHTML = `<thead><tr><th>#</th><th>الدائن</th><th>المبلغ</th><th>% من الإجمالي</th><th>شهر السداد الكامل المتوقع</th></tr></thead>
      <tbody>${state.debts.map((d, i) => {
        const pct = (d.amount / m.totalDebt) * 100;
        const monthVal = payoffMonth[d.id];
        const monthText = monthVal ? `الشهر ${monthVal}` : '—';
        return `<tr><td>${i + 1}</td><td class="cell-strong">${d.name || '(بدون اسم)'}</td><td>${fmt(d.amount)}</td><td>${pct.toFixed(0)}%</td><td>${monthText}</td></tr>`;
      }).join('')}</tbody>`;
    priorityWrap.appendChild(table);
    const note = el('div', 'card-note', 'الترتيب أعلاه هو ترتيب السداد المقترح (يمكن تعديله بالأسهم ▲▼ في قائمة الديون) — القسط الشهري كاملاً يذهب للدائن الأول حتى يُسدَّد بالكامل، ثم ينتقل تلقائياً للتالي.');
    note.style.marginTop = '10px';
    priorityWrap.appendChild(note);
  } else {
    priorityWrap.innerHTML = '<div class="empty-state">أضف الديون وحدد القسط الشهري لعرض خطة السداد بالأولوية.</div>';
  }
}

// ---------- مشتريات قادمة ----------
function movePurchase(idx, dir) {
  const target = idx + dir;
  if (target < 0 || target >= state.upcomingPurchases.length) return;
  const tmp = state.upcomingPurchases[idx];
  state.upcomingPurchases[idx] = state.upcomingPurchases[target];
  state.upcomingPurchases[target] = tmp;
  saveState();
  renderPurchases();
}

function removePurchase(idx) {
  if (!confirm(`حذف "${state.upcomingPurchases[idx].name}" من قائمة المشتريات؟`)) return;
  state.upcomingPurchases.splice(idx, 1);
  saveState();
  renderPurchases();
}

function addPurchase() {
  state.upcomingPurchases.push({ id: 'buy-' + Date.now(), name: '', estimatedCost: 0, purchased: false, note: '' });
  saveState();
  renderPurchases();
}

function renderPurchasesList() {
  const wrap = document.getElementById('purchases-list');
  wrap.innerHTML = '';
  state.upcomingPurchases.forEach((item, idx) => {
    const row = el('div', 'debt-row purchase-row' + (item.purchased ? ' purchased' : ''));

    const doneWrap = el('label', 'purchase-check');
    const doneInput = document.createElement('input'); doneInput.type = 'checkbox'; doneInput.checked = item.purchased;
    doneInput.onchange = (e) => { item.purchased = e.target.checked; saveState(); renderPurchases(); };
    doneWrap.appendChild(doneInput);

    const orderBtns = el('div', 'debt-order-btns');
    const upBtn = el('button', 'btn btn-sm', '▲'); upBtn.disabled = idx === 0; upBtn.onclick = () => movePurchase(idx, -1);
    const downBtn = el('button', 'btn btn-sm', '▼'); downBtn.disabled = idx === state.upcomingPurchases.length - 1; downBtn.onclick = () => movePurchase(idx, 1);
    orderBtns.appendChild(upBtn); orderBtns.appendChild(downBtn);

    const nameInput = el('input'); nameInput.placeholder = 'اسم الغرض'; nameInput.value = item.name;
    nameInput.oninput = (e) => { item.name = e.target.value; saveState(); };

    const costWrap = el('div', 'input-suffix');
    const costInput = document.createElement('input'); costInput.type = 'number'; costInput.min = '0'; costInput.step = '50'; costInput.value = item.estimatedCost;
    costInput.placeholder = 'السعر التقريبي';
    costInput.oninput = (e) => { item.estimatedCost = parseFloat(e.target.value) || 0; saveState(); renderPurchases(); };
    const costUnit = document.createElement('span'); costUnit.textContent = 'ريال';
    costWrap.appendChild(costInput); costWrap.appendChild(costUnit);

    const removeBtn = el('button', 'btn btn-sm', '✕');
    removeBtn.onclick = () => removePurchase(idx);

    row.appendChild(doneWrap);
    row.appendChild(orderBtns);
    row.appendChild(nameInput);
    row.appendChild(costWrap);
    row.appendChild(removeBtn);
    wrap.appendChild(row);

    if (item.note) {
      const noteEl = el('div', 'debt-note', item.note);
      wrap.appendChild(noteEl);
    }
  });
}

function renderPurchases() {
  const m = computeMetrics(state);
  renderPurchasesList();

  const pending = state.upcomingPurchases.filter((p) => !p.purchased);
  const totalPending = pending.reduce((a, p) => a + p.estimatedCost, 0);
  document.getElementById('purchases-total').textContent = fmt(totalPending);

  const surplusAfterDebt = m.avgScenario.profit - state.debtMonthlyTarget;

  const note = document.getElementById('purchases-feasibility-note');
  if (totalPending <= 0) {
    note.className = 'card note-box note-neutral';
    note.innerHTML = 'أضف الأسعار التقريبية للمشتريات أعلاه لمعرفة الوقت اللازم لتوفيرها نقداً دون دين جديد.';
  } else if (surplusAfterDebt <= 0) {
    note.className = 'card note-box note-critical';
    note.innerHTML = `⚠ لا يوجد فائض شهري متاح حالياً بعد تخصيص ${fmt(state.debtMonthlyTarget)} لسداد الديون (العجز ${fmt(Math.abs(surplusAfterDebt))} شهرياً). لا يُنصح بشراء أي معدة جديدة بالدين الآن — ثبّت الخطة التصحيحية وخطة السداد أولاً، ثم أعد النظر في هذه المشتريات لاحقاً (يتوافق مع المرحلة الثالثة: الاستقرار والنمو).`;
  } else {
    const monthsNeeded = Math.ceil(totalPending / surplusAfterDebt);
    note.className = 'card note-box note-good';
    note.innerHTML = `بفائض ${fmt(surplusAfterDebt)} شهرياً بعد سداد الديون، تحتاج تقريباً ${monthsNeeded} شهراً لتوفير ${fmt(totalPending)} نقداً دون دين جديد. الأفضل عدم الشراء بالتقسيط أو الآجل طالما ديون ثلاجة الجزيرة ما زالت هي سبب أزمة السيولة.`;
  }
}

// ---------- الجرد اليومي ----------
let selectedInventoryDate = null;
let inventoryFormOpen = false;
let draftInventory = null;

function sortedInventoryLogs() {
  return [...state.inventoryLogs].sort((a, b) => b.date.localeCompare(a.date));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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
  postCloud({ action: 'save_inventory', log }).then(syncFromCloud);
}

function deleteInventoryLog(date) {
  if (!confirm(`حذف جرد يوم ${date}؟`)) return;
  state.inventoryLogs = state.inventoryLogs.filter((l) => l.date !== date);
  saveState();
  selectedInventoryDate = null;
  renderInventory();
  postCloud({ action: 'delete_inventory', date }).then(syncFromCloud);
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
  pasteCard.innerHTML = '<h3>الصق رسالة الجرد (اختياري)</h3><span class="card-note">الصق رسالة الجرد كاملة (زي رسالة الواتساب من الشيف) وبتتعبّى لك كل الحقول تلقائياً بالأسفل — راجعها قبل الحفظ</span>';

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
  card.innerHTML = `<h3>${state.inventoryLogs.some(l => l.date === draftInventory.date) ? 'تعديل جرد يوم' : 'إضافة جرد يوم جديد'}</h3><span class="card-note">سجّل الباقي من كل صنف (والمستهلك إن توفر) لمتابعة الهدر وضبط المشتريات</span>`;

  const dateRow = el('div', 'input-row');
  dateRow.innerHTML = `<label>تاريخ الجرد</label><div class="input-suffix"><input type="date" id="draft-date" dir="ltr" /></div>`;
  dateRow.querySelector('input').value = draftInventory.date;
  dateRow.querySelector('input').oninput = (e) => { draftInventory.date = e.target.value; };
  card.appendChild(dateRow);

  const chickenGrid = el('div', 'grid grid-2', '');
  chickenGrid.style.marginTop = '10px';
  const remRow = el('div', 'input-row');
  remRow.innerHTML = `<label>الدجاج الباقي</label><div class="input-suffix"><input type="number" step="0.25" id="draft-chicken-rem" /><span>كجم</span></div>`;
  remRow.querySelector('input').value = draftInventory.chickenRemainingKg;
  remRow.querySelector('input').oninput = (e) => { draftInventory.chickenRemainingKg = e.target.value; };
  const consRow = el('div', 'input-row');
  consRow.innerHTML = `<label>الدجاج المستهلك اليوم</label><div class="input-suffix"><input type="number" step="0.25" id="draft-chicken-cons" /><span>كجم</span></div>`;
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

function renderInventoryDetail(container, log) {
  const m = computeMetrics(state);
  const inRange = log.chickenConsumedKg >= state.kgLow && log.chickenConsumedKg <= state.kgHigh;
  const chickenTone = log.chickenConsumedKg === 0 ? '' : (inRange ? 'good' : 'warning');

  const kpiCard = el('div', 'grid grid-3');
  kpiCard.innerHTML = `
    <div class="card stat-tile">
      <div class="stat-label">الدجاج الباقي</div>
      <div class="stat-value">${log.chickenRemainingKg} كجم</div>
    </div>
    <div class="card stat-tile">
      <div class="stat-label">الدجاج المستهلك اليوم</div>
      <div class="stat-value ${chickenTone ? 'tone-' + chickenTone : ''}">${log.chickenConsumedKg} كجم</div>
      <div class="stat-delta">النطاق المستهدف: ${state.kgLow}–${state.kgHigh} كجم/يوم</div>
    </div>
    <div class="card stat-tile">
      <div class="stat-label">قيمة الدجاج المستهلك تقريباً</div>
      <div class="stat-value">${fmt(log.chickenConsumedKg * m.costPerKg)}</div>
      <div class="stat-delta">بسعر ${m.costPerKg.toFixed(1)} ريال/كجم</div>
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

// ---------- التسويق ----------
function moveMarketingGoal(idx, dir) {
  const target = idx + dir;
  if (target < 0 || target >= state.marketingGoals.length) return;
  const tmp = state.marketingGoals[idx];
  state.marketingGoals[idx] = state.marketingGoals[target];
  state.marketingGoals[target] = tmp;
  saveState();
  renderMarketing();
}

function removeMarketingGoal(idx) {
  if (!confirm(`حذف "${state.marketingGoals[idx].name}" من المستهدفات؟`)) return;
  state.marketingGoals.splice(idx, 1);
  saveState();
  renderMarketing();
}

function addMarketingGoal() {
  state.marketingGoals.push({ id: 'mkt-' + Date.now(), name: '', targetPerWeek: 1, unit: '' });
  saveState();
  renderMarketing();
}

function renderMarketingGoalsList() {
  const wrap = document.getElementById('marketing-goals-list');
  wrap.innerHTML = '';
  state.marketingGoals.forEach((goal, idx) => {
    const row = el('div', 'marketing-goal-row');
    const orderBtns = el('div', 'debt-order-btns');
    const upBtn = el('button', 'btn btn-sm', '▲'); upBtn.disabled = idx === 0; upBtn.onclick = () => moveMarketingGoal(idx, -1);
    const downBtn = el('button', 'btn btn-sm', '▼'); downBtn.disabled = idx === state.marketingGoals.length - 1; downBtn.onclick = () => moveMarketingGoal(idx, 1);
    orderBtns.appendChild(upBtn); orderBtns.appendChild(downBtn);

    const nameInput = el('input'); nameInput.placeholder = 'اسم النشاط'; nameInput.value = goal.name;
    nameInput.oninput = (e) => { goal.name = e.target.value; saveState(); };

    const targetInput = document.createElement('input'); targetInput.type = 'number'; targetInput.min = '0'; targetInput.step = '1'; targetInput.value = goal.targetPerWeek;
    targetInput.oninput = (e) => { goal.targetPerWeek = parseFloat(e.target.value) || 0; saveState(); renderMarketing(); };

    const unitInput = el('input'); unitInput.placeholder = 'الوحدة'; unitInput.value = goal.unit;
    unitInput.oninput = (e) => { goal.unit = e.target.value; saveState(); };

    const removeBtn = el('button', 'btn btn-sm', '✕');
    removeBtn.onclick = () => removeMarketingGoal(idx);

    row.appendChild(orderBtns);
    row.appendChild(nameInput);
    row.appendChild(targetInput);
    row.appendChild(unitInput);
    row.appendChild(removeBtn);
    wrap.appendChild(row);
  });
}

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
  draftMarketingWeek = newDraftMarketingWeek();
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
  card.innerHTML = `<h3>تسجيل أسبوع جديد</h3><span class="card-note">أدخل الفعلي مقابل كل مستهدف لهذا الأسبوع</span>`;

  const dateRow = el('div', 'input-row');
  dateRow.innerHTML = `<label>بداية الأسبوع</label><div class="input-suffix"><input type="date" /></div>`;
  dateRow.querySelector('input').value = draftMarketingWeek.weekStart;
  dateRow.querySelector('input').oninput = (e) => { draftMarketingWeek.weekStart = e.target.value; };
  card.appendChild(dateRow);

  state.marketingGoals.forEach((goal) => {
    const row = el('div', 'input-row');
    row.innerHTML = `<label>${goal.name || '(بدون اسم)'} <span class="card-note" style="display:inline">(المستهدف: ${goal.targetPerWeek} ${goal.unit})</span></label>`;
    const suffix = el('div', 'input-suffix');
    const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.step = '1';
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
}

function renderMarketing() {
  const toolbar = document.getElementById('marketing-toolbar');
  if (!toolbar) return;

  renderMarketingGoalsList();

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

// ---------- معاملات ومتابعات إدارية ----------
const ADMIN_STATUS_LABELS = { pending: 'لم يبدأ', in_progress: 'جارٍ', done: 'منجز' };
const ADMIN_CATEGORIES = [
  { key: 'store', title: 'أمور المحل والتراخيص' },
  { key: 'hr', title: 'الموارد البشرية' },
  { key: 'finance', title: 'المعاملات المالية' },
  { key: 'marketing', title: 'التسويق' },
];

function removeAdminTask(id) {
  const task = state.adminTasks.find((t) => t.id === id);
  if (!confirm(`حذف "${task.name}" من المتابعات؟`)) return;
  state.adminTasks = state.adminTasks.filter((t) => t.id !== id);
  saveState();
  renderAdminTasks();
  postCloud({ action: 'save_admin_tasks', tasks: state.adminTasks }).then(syncFromCloud);
}

function addAdminTask(category) {
  state.adminTasks.push({ id: 'admin-' + Date.now(), category, name: '', status: 'pending' });
  saveState();
  renderAdminTasks();
  postCloud({ action: 'save_admin_tasks', tasks: state.adminTasks }).then(syncFromCloud);
}

function renderAdminTaskRow(task) {
  const card = el('div', 'task-card');

  const topRow = el('div', 'task-card-top');
  const nameInput = el('input', 'task-name-input'); nameInput.placeholder = 'اسم المعاملة'; nameInput.value = task.name;
  nameInput.oninput = (e) => { task.name = e.target.value; saveState(); };
  nameInput.onblur = () => { postCloud({ action: 'save_admin_tasks', tasks: state.adminTasks }).then(syncFromCloud); };

  const statusSelect = document.createElement('select');
  statusSelect.className = 'status-select status-' + task.status;
  Object.entries(ADMIN_STATUS_LABELS).forEach(([value, label]) => {
    const opt = document.createElement('option');
    opt.value = value; opt.textContent = label;
    if (task.status === value) opt.selected = true;
    statusSelect.appendChild(opt);
  });
  statusSelect.onchange = (e) => {
    task.status = e.target.value;
    statusSelect.className = 'status-select status-' + task.status;
    saveState();
    renderAdminTasks();
    postCloud({ action: 'save_admin_tasks', tasks: state.adminTasks }).then(syncFromCloud);
  };

  const removeBtn = el('button', 'btn btn-sm task-remove-btn', '✕');
  removeBtn.onclick = () => removeAdminTask(task.id);

  topRow.appendChild(nameInput);
  topRow.appendChild(statusSelect);
  topRow.appendChild(removeBtn);
  card.appendChild(topRow);

  return card;
}

function computeAdminStats() {
  const total = state.adminTasks.length;
  const done = state.adminTasks.filter((t) => t.status === 'done').length;
  const inProgress = state.adminTasks.filter((t) => t.status === 'in_progress').length;
  const pending = state.adminTasks.filter((t) => t.status === 'pending').length;
  return { total, done, inProgress, pending };
}

function renderAdminKPIs() {
  const stats = computeAdminStats();
  const grid = document.getElementById('admin-kpi-grid');
  grid.innerHTML = '';
  const kpis = [
    { label: 'إجمالي المعاملات', value: stats.total },
    { label: 'منجزة', value: stats.done, tone: 'good' },
    { label: 'جارية', value: stats.inProgress, tone: stats.inProgress ? 'warning' : '' },
    { label: 'لم تبدأ', value: stats.pending },
  ];
  kpis.forEach((k) => {
    const tile = el('div', 'card stat-tile');
    tile.innerHTML = `
      <div class="stat-label">${k.label}</div>
      <div class="stat-value ${k.tone ? 'tone-' + k.tone : ''}">${k.value}</div>`;
    grid.appendChild(tile);
  });
}

function renderAdminTasks() {
  renderAdminKPIs();

  const wrap = document.getElementById('admin-tasks-content');
  wrap.innerHTML = '';

  ADMIN_CATEGORIES.forEach((cat) => {
    const tasks = state.adminTasks.filter((t) => t.category === cat.key);

    const card = el('div', 'card');
    card.style.marginBottom = '16px';
    card.innerHTML = `<h3>${cat.title}</h3>`;
    const list = el('div', 'task-list');
    tasks.forEach((task) => list.appendChild(renderAdminTaskRow(task)));
    card.appendChild(list);
    const addBtn = el('button', 'btn btn-sm', '+ إضافة بند');
    addBtn.style.marginTop = '10px';
    addBtn.onclick = () => addAdminTask(cat.key);
    card.appendChild(addBtn);
    wrap.appendChild(card);
  });

  const stats = computeAdminStats();
  const progressPct = stats.total ? (stats.done / stats.total) * 100 : 0;
  document.getElementById('admin-progress-bar').style.width = progressPct + '%';
  document.getElementById('admin-progress-label').textContent = `${stats.done} من ${stats.total} معاملة منجزة (${progressPct.toFixed(0)}%)`;
}

// ---------- عرض شامل ----------
function renderAll() {
  renderOverview();
  renderCosts();
  renderInventory();
  renderCorrective();
  renderDebt();
  renderPurchases();
  renderMarketing();
  renderAdminTasks();
}

// ---------- نسخة احتياطية (تصدير/استيراد) ----------
function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `shawarma-alabraj-backup-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(reader.result);
    } catch (e) {
      alert('ملف غير صالح، تأكد إنه نسخة احتياطية صحيحة من هذا الموقع.');
      return;
    }
    if (!confirm('سيتم استبدال كل البيانات الحالية بالنسخة المستوردة. متابعة؟')) return;
    state = deepMerge(structuredClone(DEFAULT_STATE), parsed);
    saveState();
    renderAll();
    alert('تم استيراد النسخة الاحتياطية بنجاح.');
  };
  reader.readAsText(file);
}

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initTheme();
  renderAll();
  syncFromCloud();

  document.getElementById('export-btn').addEventListener('click', exportBackup);
  document.getElementById('import-btn').addEventListener('click', () => document.getElementById('import-file-input').click());
  document.getElementById('import-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importBackup(file);
    e.target.value = '';
  });

  document.getElementById('reset-btn').addEventListener('click', () => {
    if (confirm('سيتم إعادة كل الأرقام إلى القيم الافتراضية المذكورة في بيانات المحل. متابعة؟')) {
      state = structuredClone(DEFAULT_STATE);
      saveState();
      renderAll();
    }
  });

  document.getElementById('print-btn').addEventListener('click', () => window.print());
  document.getElementById('add-debt-btn').addEventListener('click', addDebt);
  document.getElementById('add-purchase-btn').addEventListener('click', addPurchase);
});
