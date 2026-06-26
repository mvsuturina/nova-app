function showHome() { setScreen('home'); renderHome(); }

function renderHome() {
  const now  = new Date();
  const days = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
  document.getElementById('time-display').textContent =
    days[now.getDay()] + ' · ' + now.toLocaleTimeString('ru', { hour:'2-digit', minute:'2-digit' });

  const h = now.getHours();
  const greet = h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
  document.getElementById('greeting-text').textContent =
    greet + (profile.name ? `, ${profile.name}` : '');

  renderScore();
  renderTrackers();
  renderMiniGoals();
  renderSurveyCta();
  renderDailyTasks();
}

function _parseMealKcal(desc) {
  if (!desc) return null;
  const m = desc.match(/~(\d+)\s*ккал\s*·\s*Б\s*(\d+)г\s*·\s*Ж\s*(\d+)г\s*·\s*У\s*(\d+)г/);
  return m ? { kcal: +m[1], p: +m[2], f: +m[3], c: +m[4] } : null;
}

function renderScore() {
  const valueEl = document.getElementById('score-value');
  const fillEl  = document.getElementById('score-fill');
  const cardEl  = document.getElementById('score-card');
  const zoneEl  = document.getElementById('score-zone');

  if (todayScore === null) {
    valueEl.textContent = '—';
    valueEl.className   = 'score-value';
    fillEl.style.width  = '0%';
    fillEl.className    = 'score-fill';
    cardEl.className    = 'score-card';
    zoneEl.textContent  = '';
    zoneEl.className    = 'score-zone';
    return;
  }

  const zone    = getZone(todayScore);
  const display = Math.max(0, todayScore);
  const pct     = Math.min(100, display);

  valueEl.textContent = display;
  valueEl.className   = `score-value ${zone}`;
  fillEl.style.width  = pct + '%';
  fillEl.className    = `score-fill ${zone}`;
  cardEl.className    = `score-card ${zone}-zone`;
  zoneEl.textContent  = ZONE_LABELS[zone];
  zoneEl.className    = `score-zone ${zone}`;
  document.getElementById('score-desc').textContent = ZONE_DESCS[zone];

  const kcalEl = document.getElementById('score-kcal');
  if (kcalEl) {
    const totals = ['breakfast', 'lunch', 'dinner'].reduce((acc, t) => {
      const parsed = _parseMealKcal(todayMeals[t]?.description);
      if (parsed) { acc.kcal += parsed.kcal; acc.p += parsed.p; acc.f += parsed.f; acc.c += parsed.c; acc.n++; }
      return acc;
    }, { kcal: 0, p: 0, f: 0, c: 0, n: 0 });
    kcalEl.textContent = totals.n
      ? `~${totals.kcal} ккал  ·  Б ${totals.p}г  Ж ${totals.f}г  У ${totals.c}г`
      : '';
  }

  const btn = document.getElementById('breakdown-btn');
  if (btn) btn.style.display = 'block';
}

function renderSurveyCta() {
  document.getElementById('survey-cta')?.remove();
  ['2','3','4','5','6'].forEach(n => document.getElementById('survey' + n + '-cta')?.remove());
  document.getElementById('sos-cta')?.remove();

  const scroll = document.querySelector('.home-scroll');
  if (!scroll) return;
  const ref = scroll.firstElementChild;

  const hour = parseInt(new Date().toLocaleString('en-CA', { timeZone: userTimezone, hour: 'numeric', hour12: false }));

  const surveys = [
    { id: 'survey-cta',  show: todayScore === null,   fn: 'showSurvey()',  label: 'НАЧАЛО',        bg: '',                                          from:  0 },
    { id: 'survey2-cta', show: !todaySurvey2Done, fn: 'showSurvey2()', label: 'ЧЕКАП 7:00',    bg: 'linear-gradient(135deg,#0f3460,#16213e)', from:  7 },
    { id: 'survey3-cta', show: !todaySurvey3Done, fn: 'showSurvey3()', label: 'ЧЕКАП 10:00',   bg: 'linear-gradient(135deg,#0a2030,#071520)', from: 10 },
    { id: 'survey4-cta', show: !todaySurvey4Done, fn: 'showSurvey4()', label: 'ЧЕКАП 13:00',   bg: 'linear-gradient(135deg,#0a1e30,#060f18)', from: 13 },
    { id: 'survey5-cta', show: !todaySurvey5Done, fn: 'showSurvey5()', label: 'ЧЕКАП 16:00',   bg: 'linear-gradient(135deg,#0a1830,#050c18)', from: 16 },
    { id: 'survey6-cta', show: !todaySurvey6Done, fn: 'showSurvey6()', label: 'РЕФЛЕКСИЯ ДНЯ', bg: 'linear-gradient(135deg,#1a0a30,#0d0518)', from: 19 },
  ];

  surveys.forEach(s => {
    if (!s.show) return;
    const locked = hour < s.from && !forceUnlockedSurveys.has(s.id);

    const wrap = document.createElement('div');
    wrap.id = s.id;

    const btn = document.createElement('button');
    btn.className = 'survey-cta';
    if (s.bg) btn.style.background = s.bg;

    if (locked) {
      btn.textContent = `${s.label}  ·  с ${s.from}:00`;
      btn.style.opacity = '0.35';
      btn.style.cursor  = 'default';
      btn.style.width   = '100%';

      const unlockBtn = document.createElement('button');
      unlockBtn.textContent = '🔓 разлочить досрочно';
      unlockBtn.style.cssText = 'display:block;margin:4px auto 0;background:none;border:none;' +
        'color:var(--text-faint);font-size:11px;font-family:"Jost",sans-serif;' +
        'letter-spacing:1px;cursor:pointer;padding:4px 8px;';
      unlockBtn.onclick = () => { forceUnlockedSurveys.add(s.id); renderSurveyCta(); };

      wrap.appendChild(btn);
      wrap.appendChild(unlockBtn);
    } else {
      btn.textContent = s.label + ' →';
      btn.style.width = '100%';
      btn.onclick = new Function(s.fn);
      wrap.appendChild(btn);
    }

    ref.parentNode.insertBefore(wrap, ref);
  });

  // SOS — всегда доступен, без лока по времени, можно использовать несколько раз
  const sosWrap = document.createElement('div');
  sosWrap.id = 'sos-cta';
  const sosBtn = document.createElement('button');
  sosBtn.style.cssText = 'width:100%;background:none;border:1px solid rgba(180,40,40,0.35);' +
    'border-radius:12px;padding:12px 20px;color:var(--red);' +
    'font-family:"Jost",sans-serif;font-size:11px;letter-spacing:2px;cursor:pointer;';
  sosBtn.textContent = 'SOS · ЗАФИКСИРОВАТЬ МОМЕНТ';
  sosBtn.onclick = showSos;
  sosWrap.appendChild(sosBtn);
  ref.parentNode.insertBefore(sosWrap, ref);
}

function renderMiniGoals() {
  const container = document.getElementById('mini-goals-container');
  if (!container) return;
  if (!todayMiniGoals.length) { container.innerHTML = ''; return; }
  container.innerHTML = `
    <div class="tracker-block" style="margin-bottom:0">
      <div style="font-size:9px;letter-spacing:3px;color:var(--text-faint);text-transform:uppercase;margin-bottom:10px;">МИНИ-ЦЕЛИ НА СЕГОДНЯ</div>
      ${todayMiniGoals.map(g => `
        <div class="task-row${g.is_done ? ' done' : ''}" onclick="toggleMiniGoal(${g.id})" style="cursor:pointer;margin-bottom:6px;">
          <div class="task-check ${g.is_done ? 'checked' : ''}">${g.is_done ? '✓' : ''}</div>
          <div class="task-text">${g.text}</div>
        </div>`).join('')}
    </div>
  `;
}

async function toggleMiniGoal(id) {
  const goal = todayMiniGoals.find(g => g.id === id);
  if (!goal) return;
  goal.is_done = !goal.is_done;
  await sb.from('mini_goals').update({ is_done: goal.is_done }).eq('id', id);
  renderMiniGoals();
}

const MEAL_WINDOWS = {
  breakfast: { label: 'Завтрак', window: '6 – 8' },
  lunch:     { label: 'Обед',    window: '12 – 14' },
  dinner:    { label: 'Ужин',    window: '16 – 18' },
};

const ACTIVITY_SLOTS = {
  warmup:  { label: 'Разминка',    hint: '−10' },
  workout: { label: 'Тренировка',  hint: '−30' },
  walk:    { label: 'Прогулка',    hint: '−10' },
};

function renderTrackers() {
  const container = document.getElementById('trackers-container');
  if (!container) return;

  // Факты дня
  const cycleSlot = `
    <button class="act-slot${todayCyclePeriodId ? ' done' : ''}" onclick="openCycleModal()" style="flex:1;">
      <div class="act-slot-icon" style="font-size:13px;">${todayCycleLabel ? '◉' : '○'}</div>
      <div class="act-slot-name">Цикл</div>
      <div class="act-slot-hint" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
        ${todayCycleLabel || 'выбрать →'}
      </div>
    </button>`;

  const factsHtml = `
    <div class="tracker-block">
      <div style="font-size:9px;letter-spacing:3px;color:var(--text-faint);text-transform:uppercase;margin-bottom:10px;">ФАКТЫ ДНЯ</div>
      <div class="meal-row">
        ${cycleSlot}
        ${[
          { key: 'toilet', label: 'Туалет', done: todayToilet },
          { key: 'work',   label: 'Работа', done: todayWork   },
        ].map(f => `
          <button class="act-slot${f.done ? ' done' : ''}" onclick="toggleDayFact('${f.key}')" style="flex:1;">
            <div class="act-slot-icon">${f.done ? '✓' : '○'}</div>
            <div class="act-slot-name">${f.label}</div>
            <div class="act-slot-hint">${f.done ? '−20' : '+10'}</div>
          </button>`).join('')}
      </div>
    </div>`;

  // Карточки еды
  const meals = ['breakfast', 'lunch', 'dinner'].map(type => {
    const { label, window } = MEAL_WINDOWS[type];
    const meal   = todayMeals[type];
    const photos = todayMealPhotos[type] || [];
    const idx    = mealCarouselIdx[type] || 0;
    const photo  = photos[idx] || null;

    const qualityTag = meal.quality === 'plan'
      ? `<span style="font-size:9px;color:var(--green);letter-spacing:0.5px;">по плану</span>`
      : meal.quality === 'slip'
      ? `<span style="font-size:9px;color:var(--red);letter-spacing:0.5px;">срыв</span>`
      : `<span style="font-size:9px;color:rgba(255,255,255,0.35);">${window}</span>`;

    const dots = photos.length > 1
      ? `<div class="meal-dots">${photos.map((_, i) =>
          `<span class="meal-dot${i === idx ? ' active' : ''}"></span>`
        ).join('')}</div>`
      : '';

    return `
      <div class="meal-card${meal.done ? ' done' : ''}"
           data-meal="${type}"
           style="${photo ? `background-image:url('${photo}')` : ''}"
           ondblclick="openMealModal('${type}')"
           ontouchstart="mealTouchStart(event,'${type}')"
           ontouchend="mealTouchEnd(event,'${type}')">
        <div class="meal-card-overlay"></div>
        ${!photo ? '<div class="meal-cam-placeholder">📷</div>' : ''}
        ${dots}
        <div class="meal-card-label">
          <div class="meal-slot-icon">${meal.done ? '✓' : '○'}</div>
          <div class="meal-slot-name">${label} ${qualityTag}</div>
        </div>
      </div>`;
  }).join('');

  // Активность
  const actCount = ['warmup', 'workout', 'walk'].filter(t => todayActivity[t]).length;
  const activities = ['warmup', 'workout', 'walk'].map(type => {
    const { label, hint } = ACTIVITY_SLOTS[type];
    const done = todayActivity[type];
    return `<button class="act-slot${done ? ' done' : ''}" onclick="logActivity('${type}')" style="flex:1;">
      <div class="act-slot-icon">${done ? '✓' : '○'}</div>
      <div class="act-slot-name">${label}</div>
      <div class="act-slot-hint">${hint}</div>
    </button>`;
  }).join('');

  // Вода
  const dots = Array.from({ length: 8 }, (_, i) =>
    `<div class="water-dot${i < todayWaterCount ? ' filled' : ''}"></div>`
  ).join('');

  const mealCount = ['breakfast','lunch','dinner'].filter(t => todayMeals[t].done).length;

  container.innerHTML = `
    ${factsHtml}
    <div class="tracker-block">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div style="font-size:9px;letter-spacing:3px;color:var(--text-faint);text-transform:uppercase;">ПРИЁМЫ ПИЩИ</div>
        <div style="font-size:10px;color:${mealCount === 3 ? 'var(--green)' : 'var(--text-faint)'};">${mealCount}/3</div>
      </div>
      <div class="meal-row">${meals}</div>
    </div>
    <div class="tracker-block">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div style="font-size:9px;letter-spacing:3px;color:var(--text-faint);text-transform:uppercase;">АКТИВНОСТЬ</div>
        <div style="font-size:10px;color:${actCount === 3 ? 'var(--green)' : 'var(--text-faint)'};">${actCount}/3</div>
      </div>
      <div class="meal-row">${activities}</div>
    </div>
    <div class="tracker-block">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div style="font-size:9px;letter-spacing:3px;color:var(--text-faint);text-transform:uppercase;">ВОДА · ${todayWaterCount}/8</div>
        <div style="display:flex;gap:6px;">
          <button class="water-add-btn" onclick="removeWater()"${todayWaterCount <= 0 ? ' disabled' : ''}>−</button>
          <button class="water-add-btn" onclick="addWater()"${todayWaterCount >= 8 ? ' disabled' : ''}>+ стакан</button>
        </div>
      </div>
      <div class="water-dots">${dots}</div>
    </div>
  `;
}

// ── МОДАЛ ЦИКЛА ───────────────────────────────────────────

function openCycleModal() {
  if (!surveyRef?.periods?.length) return;
  const body = document.getElementById('cycle-modal-body');
  body.innerHTML = surveyRef.periods.map(p => `
    <div class="radio-option${p.id === todayCyclePeriodId ? ' selected' : ''}"
         onclick="saveCyclePhase(${p.id})">
      <div class="radio-dot"></div>
      <div class="radio-label">${p.label}</div>
    </div>`).join('');
  document.getElementById('cycle-modal').style.display = 'flex';
}

function closeCycleModal() {
  document.getElementById('cycle-modal').style.display = 'none';
}

async function saveCyclePhase(periodId) {
  const period = surveyRef.periods.find(p => p.id === periodId);
  if (!period) return;

  await sb.from('profiles').update({ current_period_id: periodId }).eq('id', currentUser.id);

  todayCyclePeriodId = period.id;
  todayCycleLabel    = period.label;
  todayCycleWeight   = period.weight;

  closeCycleModal();
  renderTrackers();
  await recalculateScore('cycle_phase');
}

// ── ФАКТЫ ДНЯ (туалет + работа) ───────────────────────────

async function toggleDayFact(key) {
  const today = todayKey();
  const isDone = key === 'toilet' ? todayToilet : todayWork;

  if (isDone) {
    const { data } = await sb.from('activity_log').select('id')
      .eq('user_id', currentUser.id).eq('date', today).eq('activity_type', key)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (data) await sb.from('activity_log').delete().eq('id', data.id);
    if (key === 'toilet') todayToilet = false;
    else todayWork = false;
  } else {
    await sb.from('activity_log').insert({ user_id: currentUser.id, date: today, activity_type: key });
    if (key === 'toilet') todayToilet = true;
    else todayWork = true;
  }

  renderTrackers();
  await recalculateScore('fact_' + key);
}

// ── АКТИВНОСТЬ ─────────────────────────────────────────────

async function logActivity(type) {
  const today = todayKey();
  if (todayActivity[type]) {
    const { data } = await sb.from('activity_log').select('id')
      .eq('user_id', currentUser.id).eq('date', today).eq('activity_type', type)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (data) await sb.from('activity_log').delete().eq('id', data.id);
    todayActivity[type] = false;
  } else {
    await sb.from('activity_log').insert({ user_id: currentUser.id, date: today, activity_type: type });
    todayActivity[type] = true;
  }
  renderTrackers();
  await recalculateScore('activity_' + type);
}

// ── КАРУСЕЛЬ ФОТ В КАРТОЧКЕ ───────────────────────────────

let _mealTouchX      = null;
let _mealTouchY      = null;
let _mealLastTapType = null;
let _mealLastTapTime = 0;

function mealTouchStart(e, type) {
  _mealTouchX = e.touches[0].clientX;
  _mealTouchY = e.touches[0].clientY;
}

function mealTouchEnd(e, type) {
  if (_mealTouchX === null) return;
  const dx = e.changedTouches[0].clientX - _mealTouchX;
  const dy = e.changedTouches[0].clientY - _mealTouchY;
  _mealTouchX = null;
  _mealTouchY = null;

  // Горизонтальный свайп → листаем фото
  if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy)) {
    const photos = todayMealPhotos[type] || [];
    if (photos.length > 1) {
      e.preventDefault();
      const cur = mealCarouselIdx[type] || 0;
      mealCarouselIdx[type] = dx < 0
        ? Math.min(cur + 1, photos.length - 1)
        : Math.max(cur - 1, 0);
      updateMealCarousel(type);
    }
    return;
  }

  // Тап (без движения) → детектируем двойной тап
  if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
    const now = Date.now();
    if (_mealLastTapType === type && now - _mealLastTapTime < 350) {
      _mealLastTapType = null;
      _mealLastTapTime = 0;
      openMealModal(type);
    } else {
      _mealLastTapType = type;
      _mealLastTapTime = now;
    }
  }
}

function updateMealCarousel(type) {
  const photos = todayMealPhotos[type] || [];
  const idx    = mealCarouselIdx[type] || 0;
  const card   = document.querySelector(`.meal-card[data-meal="${type}"]`);
  if (!card) return;
  card.style.backgroundImage = photos[idx] ? `url('${photos[idx]}')` : '';
  card.querySelectorAll('.meal-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
}

// ── МОДАЛ ЕДЫ ─────────────────────────────────────────────

let activeMealType = null;
let mealModalData = { quality: null, hungerBefore: null, hungerAfter: null, hungerAfterHour: null, description: '' };

function openMealModal(type) {
  activeMealType = type;
  const meal  = todayMeals[type];
  const label = MEAL_WINDOWS[type].label;

  mealModalData = {
    quality:         meal.quality         || null,
    hungerBefore:    meal.hungerBefore    || null,
    hungerAfter:     meal.hungerAfter     || null,
    hungerAfterHour: meal.hungerAfterHour || null,
    description:     meal.description    || '',
  };

  document.getElementById('meal-modal-title').textContent = label;

  document.getElementById('mq-plan').classList.toggle('mq-selected', meal.quality === 'plan');
  document.getElementById('mq-slip').classList.toggle('mq-selected', meal.quality === 'slip');

  document.querySelectorAll('[id^="mmh-"]').forEach(el => el.classList.remove('selected'));
  if (meal.hungerBefore) document.getElementById('mmh-' + meal.hungerBefore)?.classList.add('selected');

  document.querySelectorAll('[id^="mah-"]').forEach(el => el.classList.remove('selected'));
  if (meal.hungerAfter) document.getElementById('mah-' + meal.hungerAfter)?.classList.add('selected');

  document.querySelectorAll('[id^="mhh-"]').forEach(el => el.classList.remove('selected'));
  if (meal.hungerAfterHour) document.getElementById('mhh-' + meal.hungerAfterHour)?.classList.add('selected');

  document.getElementById('meal-modal-desc').value = meal.description || '';
  document.getElementById('meal-modal-delete').style.display = meal.done ? 'block' : 'none';
  const kcalRes = document.getElementById('meal-kcal-result');
  if (kcalRes) kcalRes.textContent = '';
  renderMealModalPhotos(type);

  document.getElementById('meal-modal').style.display = 'flex';
}

function renderMealModalPhotos(type) {
  const el = document.getElementById('meal-modal-photos');
  if (!el) return;
  const photos = todayMealPhotos[type] || [];
  el.innerHTML = `
    <div style="font-size:9px;letter-spacing:3px;color:var(--text-faint);text-transform:uppercase;margin-bottom:10px;">Фото</div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:20px;">
      ${photos.map((url, i) => `
        <div style="position:relative;flex-shrink:0;">
          <img src="${url}" onclick="openMealLightbox('${url}')"
               style="width:76px;height:76px;object-fit:cover;border-radius:10px;display:block;cursor:pointer;">
          <button onclick="deleteMealPhotoFromModal('${type}',${i})"
                  style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;
                         background:rgba(0,0,0,0.85);border:none;border-radius:50%;color:white;
                         font-size:12px;line-height:1;cursor:pointer;display:flex;
                         align-items:center;justify-content:center;padding:0;">×</button>
        </div>`).join('')}
      ${photos.length < 3 ? `
        <label style="width:76px;height:76px;background:var(--bg3);border-radius:10px;
                      border:1px dashed var(--border);display:flex;align-items:center;
                      justify-content:center;font-size:26px;cursor:pointer;flex-shrink:0;
                      -webkit-tap-highlight-color:transparent;">
          <input type="file" accept="image/*" style="display:none"
                 onchange="handleMealPhotoFromModal('${type}',this)">
          📷
        </label>` : ''}
    </div>`;
}

async function handleMealPhotoFromModal(type, input) {
  await handleMealPhotoFile(type, input);
  renderMealModalPhotos(type);
}

async function deleteMealPhotoFromModal(type, idx) {
  await deleteMealPhoto(type, idx);
  const len = (todayMealPhotos[type] || []).length;
  if ((mealCarouselIdx[type] || 0) >= len) mealCarouselIdx[type] = Math.max(0, len - 1);
  renderMealModalPhotos(type);
}

function closeMealModal() {
  document.getElementById('meal-modal').style.display = 'none';
  activeMealType = null;
}

async function estimateMealCalories() {
  const raw  = mealModalData.description?.trim() || '';
  // Убираем старую оценку перед отправкой
  const desc = raw.replace(/\n~\d+[^\n]+$/, '').trim();
  const btn  = document.getElementById('meal-kcal-btn');
  const res  = document.getElementById('meal-kcal-result');
  if (!desc) { res.textContent = 'Сначала опиши что съела'; return; }

  const apiKey = profile.groq_api_key || localStorage.getItem('nova_api_key');
  if (!apiKey) { res.textContent = 'Нужен API ключ Groq в настройках'; return; }

  btn.disabled = true; btn.textContent = '...'; res.textContent = '';

  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: `Ты нутрициолог. Посчитай ккал и БЖУ по описанию еды.
Правила:
- Если указаны граммы — считай точно по ним (гречка 150г = ~170 ккал, куриная грудка 200г = ~220 ккал и т.д.)
- Если граммы не указаны — используй среднюю порцию для этого блюда
- Для составных блюд (пирожок, котлета, борщ) — среднее по стандартной порции
- Сначала посчитай каждый ингредиент отдельно (внутри своих рассуждений), потом сложи
Отвечай ТОЛЬКО итоговой строкой в формате: ~X ккал · Б Xг · Ж Xг · У Xг
Никаких пояснений и расшифровок — только эта строка.` },
          { role: 'user', content: desc },
        ],
        max_tokens: 60,
        temperature: 0.1,
      }),
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);
    const estimate = data.choices?.[0]?.message?.content?.trim() || '—';
    res.textContent = estimate;
    const ta = document.getElementById('meal-modal-desc');
    ta.value = desc + '\n' + estimate;
    mealModalData.description = ta.value;
  } catch(e) {
    res.textContent = 'Ошибка: ' + e.message;
  }
  btn.disabled = false; btn.textContent = '~ ккал';
}

function setMealQuality(q) {
  mealModalData.quality = mealModalData.quality === q ? null : q;
  document.getElementById('mq-plan').classList.toggle('mq-selected', mealModalData.quality === 'plan');
  document.getElementById('mq-slip').classList.toggle('mq-selected', mealModalData.quality === 'slip');
}

function setMealHunger(v) {
  mealModalData.hungerBefore = mealModalData.hungerBefore === v ? null : v;
  document.querySelectorAll('[id^="mmh-"]').forEach(el => el.classList.remove('selected'));
  if (mealModalData.hungerBefore !== null) document.getElementById('mmh-' + v)?.classList.add('selected');
}

function setMealHungerAfter(v) {
  mealModalData.hungerAfter = mealModalData.hungerAfter === v ? null : v;
  document.querySelectorAll('[id^="mah-"]').forEach(el => el.classList.remove('selected'));
  if (mealModalData.hungerAfter !== null) document.getElementById('mah-' + v)?.classList.add('selected');
}

function setMealHungerAfterHour(v) {
  mealModalData.hungerAfterHour = mealModalData.hungerAfterHour === v ? null : v;
  document.querySelectorAll('[id^="mhh-"]').forEach(el => el.classList.remove('selected'));
  if (mealModalData.hungerAfterHour !== null) document.getElementById('mhh-' + v)?.classList.add('selected');
}

async function saveMealModal() {
  if (!activeMealType) return;
  const type = activeMealType;
  const today = todayKey();
  const { quality, hungerBefore, hungerAfter, hungerAfterHour, description } = mealModalData;
  const prevDone    = todayMeals[type].done;
  const prevQuality = todayMeals[type].quality;
  const isFirstLog  = !prevDone;

  closeMealModal();

  const { data: existingMeal } = await sb.from('meal_log').select('id')
    .eq('user_id', currentUser.id).eq('date', today).eq('meal_type', type).maybeSingle();

  const mealFields = {
    quality:           quality          || null,
    description:       description      || null,
    hunger_before:     hungerBefore     || null,
    hunger_after:      hungerAfter      || null,
    hunger_after_hour: hungerAfterHour  || null,
  };

  if (existingMeal) {
    await sb.from('meal_log').update(mealFields).eq('id', existingMeal.id);
  } else {
    const h = new Date().getHours();
    const inWindow = { breakfast: h>=6&&h<8, lunch: h>=12&&h<14, dinner: h>=16&&h<18 }[type] ?? false;
    await sb.from('meal_log').insert({ user_id: currentUser.id, date: today, meal_type: type, in_window: inWindow, ...mealFields });
  }

  todayMeals[type] = {
    done:            true,
    quality:         quality        || null,
    description:     description    || null,
    hungerBefore:    hungerBefore   || null,
    hungerAfter:     hungerAfter    || null,
    hungerAfterHour: hungerAfterHour || null,
  };

  renderTrackers();
  if (isFirstLog || (quality || null) !== prevQuality) await recalculateScore('meal_' + type);
}

async function deleteMealFromModal() {
  if (!activeMealType) return;
  const type  = activeMealType;
  const today = todayKey();

  const photosToDelete = todayMealPhotos[type] || [];
  for (const url of photosToDelete) {
    try {
      const path = url.split('/meal-photos/')[1]?.split('?')[0];
      if (path) await sb.storage.from('meal-photos').remove([decodeURIComponent(path)]);
    } catch (e) {}
  }
  todayMealPhotos[type] = [];

  await sb.from('meal_log').delete()
    .eq('user_id', currentUser.id).eq('date', today).eq('meal_type', type);

  todayMeals[type] = { done: false, quality: null, description: null, hungerBefore: null, hungerAfter: null, hungerAfterHour: null };

  closeMealModal();
  renderTrackers();
  await recalculateScore('meal_' + type + '_removed');
}

async function cropImageSquare(file, size = 600) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx   = (bitmap.width  - side) / 2;
  const sy   = (bitmap.height - side) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  canvas.getContext('2d').drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close();
  return new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
}

async function handleMealPhotoFile(mealType, input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;

  const photos = todayMealPhotos[mealType] || [];
  if (photos.length >= 3) return;

  const today = todayKey();
  const isFirstLog = !todayMeals[mealType].done;

  if (isFirstLog) {
    const h = new Date().getHours();
    const inWindow = { breakfast: h>=6&&h<8, lunch: h>=12&&h<14, dinner: h>=16&&h<18 }[mealType] ?? false;
    await sb.from('meal_log').insert({
      user_id: currentUser.id, date: today, meal_type: mealType, in_window: inWindow,
    });
    todayMeals[mealType] = { done: true, quality: null, description: null, hungerBefore: null, hungerAfter: null, hungerAfterHour: null };
  }

  const blob = await cropImageSquare(file);
  const path = `${currentUser.id}/${today}/${mealType}_${Date.now()}.jpg`;
  const { error } = await sb.storage.from('meal-photos').upload(path, blob, { contentType: 'image/jpeg' });
  if (error) { console.error('photo upload:', error); return; }

  const { data: urlData } = sb.storage.from('meal-photos').getPublicUrl(path);
  const newPhotos = [...photos, urlData.publicUrl];
  await sb.from('meal_log').update({ photo_urls: newPhotos })
    .eq('user_id', currentUser.id).eq('date', today).eq('meal_type', mealType);
  todayMealPhotos[mealType] = newPhotos;
  renderTrackers();
  if (isFirstLog) await recalculateScore('meal_' + mealType);
}

async function deleteMealPhoto(mealType, idx) {
  const photos = [...(todayMealPhotos[mealType] || [])];
  const today  = todayKey();
  const url    = photos[idx];

  if (url) {
    try {
      const path = url.split('/meal-photos/')[1]?.split('?')[0];
      if (path) await sb.storage.from('meal-photos').remove([decodeURIComponent(path)]);
    } catch (e) { console.warn('storage delete:', e); }
  }

  photos.splice(idx, 1);
  await sb.from('meal_log').update({ photo_urls: photos.length ? photos : null })
    .eq('user_id', currentUser.id).eq('date', today).eq('meal_type', mealType);
  todayMealPhotos[mealType] = photos;
  renderTrackers();
}

function openMealLightbox(url) {
  const lb = document.getElementById('photo-lightbox');
  document.getElementById('photo-lightbox-img').src = url;
  lb.classList.add('open');
}

function closeMealLightbox() {
  document.getElementById('photo-lightbox').classList.remove('open');
}

// ── ВОДА ──────────────────────────────────────────────────

async function addWater() {
  if (todayWaterCount >= 8) return;
  const { error } = await sb.from('water_log').insert({ user_id: currentUser.id, date: todayKey() });
  if (error) { console.error('addWater:', error); return; }
  todayWaterCount++;
  renderTrackers();
}

async function removeWater() {
  if (todayWaterCount <= 0) return;
  const { data } = await sb.from('water_log').select('id')
    .eq('user_id', currentUser.id).eq('date', todayKey())
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!data) { todayWaterCount = 0; renderTrackers(); return; }
  const { error } = await sb.from('water_log').delete().eq('id', data.id);
  if (error) { console.error('removeWater:', error); return; }
  todayWaterCount--;
  renderTrackers();
}

// ── ЗАДАЧИ ─────────────────────────────────────────────────

function renderDailyTasks() {
  const container = document.getElementById('daily-tasks-list');
  if (!dailyTasks.length) {
    container.innerHTML = '<div class="empty-state">Нажми + чтобы добавить задачу</div>';
    return;
  }
  container.innerHTML = '';
  dailyTasks.forEach(task => {
    const isCustom  = !task.tool;
    const isJournal = !isCustom && task.tool.tool_type === 'journal';

    const row = document.createElement('div');
    row.className = 'task-row' + (task.is_complete ? ' done' : '');

    if (isCustom) {
      const delBtn = !task.is_complete
        ? `<button onclick="event.stopPropagation();deleteCustomTask(${task.id})"
                   style="background:none;border:none;color:var(--text-faint);font-size:14px;
                          cursor:pointer;padding:0 4px;flex-shrink:0;">✕</button>`
        : '';
      row.innerHTML = `
        <div class="task-check ${task.is_complete ? 'checked' : ''}">${task.is_complete ? '✓' : ''}</div>
        <div class="task-text">${task.custom_name}</div>
        ${delBtn}
        <div class="task-meta">−10</div>`;
      if (!task.is_complete) row.onclick = () => completeTask(task.id);
    } else {
      const playBtn = (isJournal && task.is_complete)
        ? `<button onclick="event.stopPropagation();openJournal(${task.id},${task.tool.weight})"
                   style="background:none;border:1px solid #2d2550;border-radius:8px;color:var(--purple-light);
                          font-size:12px;padding:4px 10px;cursor:pointer;font-family:'Jost',sans-serif;flex-shrink:0;">▶</button>`
        : '';
      row.innerHTML = `
        <div class="task-check ${task.is_complete ? 'checked' : ''}">${task.is_complete ? '✓' : ''}</div>
        <div class="task-text">${task.tool.name}</div>
        ${playBtn}
        <div class="task-meta">${task.tool.duration_min} мин</div>`;
      if (isJournal && !task.is_complete) row.onclick = () => openJournal(task.id, task.tool.weight);
      else if (!isJournal && !task.is_complete) row.onclick = () => completeTask(task.id);
    }
    container.appendChild(row);
  });
}

function toggleAddTask() {
  const row   = document.getElementById('add-task-row');
  const input = document.getElementById('add-task-input');
  const visible = row.style.display !== 'none';
  row.style.display = visible ? 'none' : 'block';
  if (!visible) input.focus();
}

async function submitAddTask() {
  const input = document.getElementById('add-task-input');
  const name  = input.value.trim();
  if (!name) return;
  input.value = '';
  document.getElementById('add-task-row').style.display = 'none';

  const { data, error } = await sb.from('daily_tasks').insert({
    user_id:     currentUser.id,
    date:        todayKey(),
    custom_name: name,
    is_complete: false,
  }).select('id, is_complete, custom_name').maybeSingle();

  if (error) { console.error('addTask:', error); return; }
  dailyTasks.push({ ...data, tool: null });
  renderDailyTasks();
}

async function deleteCustomTask(taskId) {
  await sb.from('daily_tasks').delete().eq('id', taskId);
  dailyTasks = dailyTasks.filter(t => t.id !== taskId);
  renderDailyTasks();
}

async function completeTask(taskId) {
  const task = dailyTasks.find(t => t.id === taskId);
  if (!task || task.is_complete) return;

  task.is_complete = true;
  renderDailyTasks();

  await sb.from('daily_tasks').update({
    is_complete: true,
    completed_at: new Date().toISOString(),
  }).eq('id', taskId);

  await recalculateScore('task_' + taskId);
}

function updateClock() {
  const now  = new Date();
  const days = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
  const el   = document.getElementById('time-display');
  if (el) el.textContent = days[now.getDay()] + ' · ' + now.toLocaleTimeString('ru', { hour:'2-digit', minute:'2-digit' });
}
