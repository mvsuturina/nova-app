// ── Челлендж / стрик ──────────────────────────────────────────────────────────
// Изолированный модуль. Не трогает существующий код.
//
// Точки интеграции (fire-and-forget):
//   loadChallenge()                 — из loadUserData() в app.js
//   renderChallenge()               — из renderHome() в home.js
//   autoCheckChallenge(event)       — из home.js в нужных местах:
//     'warmup'|'workout'|'walk'     — из logActivity()
//     'water_added'|'water_removed' — из addWater() / removeWater()
//     'meal_saved'|'meal_deleted'   — из saveMealModal/saveSnackModal/delete...

let activeChallenge = null;

async function loadChallenge() {
  if (!currentUser) return;
  const { data } = await sb.from('challenges')
    .select('*')
    .eq('user_id', currentUser.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  activeChallenge = data || null;
}

// ── Рендер виджета ─────────────────────────────────────────

function renderChallenge() {
  const el = document.getElementById('challenge-widget');
  if (!el) return;

  if (!activeChallenge) {
    el.innerHTML = `
      <button onclick="openChallengeCreateModal()"
              style="width:100%;background:none;border:1px dashed var(--border);border-radius:14px;
                     padding:12px;color:var(--text-faint);font-size:11px;letter-spacing:2px;
                     cursor:pointer;font-family:'Jost',sans-serif;margin-bottom:14px;
                     -webkit-tap-highlight-color:transparent;">
        + НАЧАТЬ ЧЕЛЛЕНДЖ
      </button>`;
    return;
  }

  const today      = todayKey();
  const doneDates  = activeChallenge.done_dates || [];
  const todayDone  = doneDates.includes(today);
  const doneCount  = doneDates.length;
  const total      = activeChallenge.duration_days;
  const isComplete = doneCount >= total;

  const h = parseInt(new Date().toLocaleString('en-CA', {
    timeZone: userTimezone, hour: 'numeric', hour12: false,
  }));
  const showNudge = !todayDone && !isComplete && h >= 16;
  const streak    = _chStreak(doneDates, today);

  const nudgeHtml = showNudge ? `
    <div style="margin-top:8px;padding:6px 10px;
                background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);
                border-radius:8px;font-size:11px;color:var(--gold);letter-spacing:1px;">
      ⚡ поднажми — сделай до конца дня!
    </div>` : '';

  const completeBanner = isComplete ? `
    <div style="margin-top:8px;text-align:center;font-size:11px;
                color:var(--green);letter-spacing:2px;">ЗАВЕРШЁН ✓</div>` : '';

  const streakBadge = streak > 1 && !isComplete
    ? `<div style="font-size:10px;color:var(--gold);margin-top:5px;">🔥 ${streak} дней подряд</div>` : '';

  const linkedHint = activeChallenge.linked_to
    ? `<div style="font-size:10px;color:var(--text-faint);margin-top:4px;">авто · ${_chLinkedLabel(activeChallenge.linked_to)}</div>` : '';

  const needManualBtn = !activeChallenge.linked_to && !todayDone && !isComplete;

  el.innerHTML = `
    <div style="background:linear-gradient(135deg,#1a1040 0%,#0d1a2a 100%);
                border:1px solid rgba(147,112,219,0.22);border-radius:16px;
                padding:14px 16px;margin-bottom:${needManualBtn ? '0' : '14px'};
                cursor:pointer;-webkit-tap-highlight-color:transparent;"
         onclick="openChallengeManageModal()">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div style="font-size:9px;letter-spacing:3px;color:var(--text-faint);text-transform:uppercase;">ЧЕЛЛЕНДЖ</div>
        <div style="font-size:11px;color:${todayDone ? 'var(--green)' : 'var(--text-faint)'};">
          ${doneCount}<span style="color:var(--text-faint);"> / ${total}</span>
        </div>
      </div>
      <div style="font-size:15px;color:var(--text);margin-bottom:10px;
                  font-family:'Cormorant Garamond',serif;font-weight:300;letter-spacing:0.5px;">
        ${activeChallenge.title}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:3px;">${_chDots(doneDates, total, today)}</div>
      ${streakBadge}${linkedHint}${nudgeHtml}${completeBanner}
    </div>
    ${needManualBtn ? `
    <button onclick="markChallengeToday()"
            style="display:block;width:100%;background:none;
                   border:1px solid rgba(147,112,219,0.3);border-radius:0 0 12px 12px;
                   border-top:none;padding:9px;color:var(--purple-light);
                   font-family:'Jost',sans-serif;font-size:11px;letter-spacing:2px;
                   cursor:pointer;margin-bottom:14px;-webkit-tap-highlight-color:transparent;">
      ✓ ОТМЕТИТЬ ВЫПОЛНЕНО
    </button>` : ''}`;
}

// ── Вспомогательные ────────────────────────────────────────

function _chDots(doneDates, total, today) {
  const start = activeChallenge.start_date;
  return Array.from({ length: total }, (_, i) => {
    const d       = _chAddDays(start, i);
    const done    = doneDates.includes(d);
    const isToday = d === today;
    const isPast  = d < today;
    if (done)
      return `<div style="width:9px;height:9px;border-radius:50%;background:var(--gold);flex-shrink:0;"></div>`;
    if (isToday)
      return `<div style="width:9px;height:9px;border-radius:50%;border:1.5px solid var(--purple-light);flex-shrink:0;"></div>`;
    if (isPast)
      return `<div style="width:9px;height:9px;border-radius:50%;border:1px solid rgba(239,68,68,0.4);flex-shrink:0;"></div>`;
    return `<div style="width:9px;height:9px;border-radius:50%;border:1px solid #2d2550;flex-shrink:0;"></div>`;
  }).join('');
}

function _chStreak(doneDates, today) {
  let n = 0, d = today;
  while (doneDates.includes(d)) { n++; d = _chAddDays(d, -1); }
  return n;
}

function _chAddDays(dateStr, n) {
  const [y, m, day] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, day + n);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}

function _chLinkedLabel(key) {
  return {
    warmup:    'зарядка',
    workout:   'тренировка',
    walk:      'прогулка',
    water_8:   'вода 8 стаканов',
    no_slip:   'еда без срывов',
    kcal_norm: 'калории в норме',
  }[key] || key;
}

// ── Условия выполнения ─────────────────────────────────────

function _chCheckWater8()   { return todayWaterCount >= 8; }

function _chCheckNoSlip() {
  const done = ['breakfast','lunch','dinner'].some(t => todayMeals[t].done);
  if (!done) return false;
  return ['breakfast','lunch','dinner'].every(t =>
    !todayMeals[t].done || todayMeals[t].quality !== 'slip'
  );
}

function _chCheckKcalNorm() {
  let kcal = 0, n = 0;
  ['breakfast','lunch','dinner'].forEach(t => {
    const nu = todayMeals[t].nutritionJson?.total || parseMealKcal(todayMeals[t].description);
    if (nu) { kcal += nu.kcal; n++; }
  });
  todaySnacks.forEach(s => {
    const nu = s.nutritionJson?.total || parseMealKcal(s.description);
    if (nu) { kcal += nu.kcal; n++; }
  });
  if (n === 0) return false;
  const pct = kcal / DAILY_NORMS.kcal;
  return pct >= 0.8 && pct <= 1.15;
}

// ── Основной хук ───────────────────────────────────────────
// Вызывается из home.js после изменения состояния.
// event: 'warmup'|'workout'|'walk'|'water_added'|'water_removed'|'meal_saved'|'meal_deleted'

async function autoCheckChallenge(event) {
  if (!activeChallenge || activeChallenge.status !== 'active') return;
  const today  = todayKey();
  const linked = activeChallenge.linked_to;

  if (['warmup','workout','walk'].includes(linked) && linked === event) {
    // Активность: только вперёд — отметить если ещё нет
    if (!(activeChallenge.done_dates || []).includes(today))
      await _chSetDay(today, true);
    return;
  }

  if (linked === 'water_8' && (event === 'water_added' || event === 'water_removed')) {
    await _chSetDay(today, _chCheckWater8());
    return;
  }

  if (linked === 'no_slip' && (event === 'meal_saved' || event === 'meal_deleted')) {
    await _chSetDay(today, _chCheckNoSlip());
    return;
  }

  if (linked === 'kcal_norm' && (event === 'meal_saved' || event === 'meal_deleted')) {
    await _chSetDay(today, _chCheckKcalNorm());
    return;
  }
}

// ── Обновление done_dates ──────────────────────────────────
// Умно добавляет ИЛИ убирает дату — для авто-условий.

async function _chSetDay(date, shouldBeDone) {
  const doneDates   = [...(activeChallenge.done_dates || [])];
  const alreadyDone = doneDates.includes(date);
  if (shouldBeDone === alreadyDone) return;

  const newDates   = shouldBeDone
    ? [...doneDates, date]
    : doneDates.filter(d => d !== date);
  const isComplete = shouldBeDone && newDates.length >= activeChallenge.duration_days;

  const update = { done_dates: newDates };
  if (isComplete) update.status = 'done';

  const { error } = await sb.from('challenges').update(update).eq('id', activeChallenge.id);
  if (!error) {
    activeChallenge.done_dates = newDates;
    if (isComplete) activeChallenge.status = 'done';
    renderChallenge();
    if (isComplete)
      setTimeout(() => alert(`Челлендж "${activeChallenge.title}" завершён!`), 300);
  }
}

// ── Ручная отметка ─────────────────────────────────────────

async function markChallengeToday() {
  if (!activeChallenge) return;
  await _chSetDay(todayKey(), true);
}

// ── Создание ───────────────────────────────────────────────

function openChallengeCreateModal() {
  document.getElementById('challenge-create-modal').style.display = 'flex';
  document.getElementById('ch-title').value  = '';
  document.getElementById('ch-days').value   = '21';
  document.getElementById('ch-linked').value = '';
}

function closeChallengeCreateModal() {
  document.getElementById('challenge-create-modal').style.display = 'none';
}

async function submitCreateChallenge() {
  const title  = document.getElementById('ch-title').value.trim();
  if (!title) return;
  const days   = parseInt(document.getElementById('ch-days').value) || 21;
  const linked = document.getElementById('ch-linked').value || null;
  const today  = todayKey();

  const { data, error } = await sb.from('challenges').insert({
    user_id:       currentUser.id,
    title,
    duration_days: days,
    start_date:    today,
    done_dates:    [],
    linked_to:     linked,
    status:        'active',
  }).select('*').single();

  if (!error && data) {
    activeChallenge = data;
    closeChallengeCreateModal();
    renderChallenge();
  }
}

// ── Управление ─────────────────────────────────────────────

function openChallengeManageModal() {
  if (!activeChallenge) return;
  const today      = todayKey();
  const doneDates  = activeChallenge.done_dates || [];
  const todayDone  = doneDates.includes(today);
  const isComplete = doneDates.length >= activeChallenge.duration_days;

  document.getElementById('challenge-manage-body').innerHTML = `
    <div style="font-family:'Cormorant Garamond',serif;font-size:18px;
                color:var(--text);margin-bottom:4px;">${activeChallenge.title}</div>
    <div style="font-size:12px;color:var(--text-faint);margin-bottom:20px;">
      Начат: ${activeChallenge.start_date} · ${doneDates.length}/${activeChallenge.duration_days} дней
      ${activeChallenge.linked_to ? ` · ${_chLinkedLabel(activeChallenge.linked_to)}` : ''}
    </div>
    ${!todayDone && !activeChallenge.linked_to && !isComplete ? `
    <button onclick="markChallengeToday();closeChallengeManageModal()"
            style="width:100%;background:linear-gradient(135deg,var(--purple),#5b21b6);
                   border:none;border-radius:12px;padding:13px;color:white;
                   font-family:'Jost',sans-serif;font-size:13px;letter-spacing:1px;
                   cursor:pointer;margin-bottom:10px;">
      ✓ Отметить сегодня выполненным
    </button>` : ''}
    <button onclick="abandonChallenge()"
            style="width:100%;background:none;border:1px solid #3a1a1a;border-radius:12px;
                   padding:12px;color:#ef4444;font-family:'Jost',sans-serif;
                   font-size:13px;cursor:pointer;margin-bottom:4px;">
      Отменить челлендж
    </button>
    <button onclick="closeChallengeManageModal()"
            style="width:100%;background:none;border:none;color:var(--text-faint);
                   font-family:'Jost',sans-serif;font-size:13px;cursor:pointer;padding:10px;">
      закрыть
    </button>`;

  document.getElementById('challenge-manage-modal').style.display = 'flex';
}

function closeChallengeManageModal() {
  document.getElementById('challenge-manage-modal').style.display = 'none';
}

async function abandonChallenge() {
  if (!activeChallenge || !confirm('Отменить челлендж?')) return;
  await sb.from('challenges').update({ status: 'abandoned' }).eq('id', activeChallenge.id);
  activeChallenge = null;
  closeChallengeManageModal();
  renderChallenge();
}
