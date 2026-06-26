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

function _normalizeNutritionText(text) {
  return text
    .replace(/\$([^$]*)\$/g, (_, inner) => inner.replace(/\\approx\s*/g, '').trim())
    .replace(/\$+/g, '')
    .replace(/\\approx\s*/g, '')
    .replace(/(\d+)\s+г/g, '$1г')
    .replace(/(\d+)\s+ккал/g, '$1ккал');
}

function _parseNutritionResponse(text) {
  const clean = _normalizeNutritionText(text);
  const items = [];

  for (const line of clean.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.includes('ккал')) continue;
    if (/итого|всего|total/i.test(trimmed)) continue;

    // Ищем "Xг:" или "Xмл:" — разделитель между названием и КБЖУ
    const gcM = trimmed.match(/(\d+)\s*(г|мл)\s*:/);
    if (!gcM) continue;
    const splitAt = trimmed.indexOf(gcM[0]);
    const left  = trimmed.slice(0, splitAt + gcM[1].length + gcM[2].length);
    const right = trimmed.slice(splitAt + gcM[0].length);

    const grams = +gcM[1];
    const unit  = gcM[2];
    const name  = left
      .replace(/^[-•*\s]+/, '')
      .replace(/\d+\s*(г|мл)$/, '')
      .replace(/\d+\s*шт\.?/g, '')
      .replace(/[~≈\\]/g, '')
      .trim() || '—';

    const kM = right.match(/(\d+)\s*ккал/);
    const pM = right.match(/Б\s*(\d+)/);
    const fM = right.match(/Ж\s*(\d+)/);
    const cM = right.match(/У\s*(\d+)/);
    if (!kM) continue;

    items.push({
      name, grams, unit,
      kcal: +kM[1],
      p: pM ? +pM[1] : 0,
      f: fM ? +fM[1] : 0,
      c: cM ? +cM[1] : 0,
    });
  }

  // Ищем итоговую строку
  let total = null;
  for (const line of clean.split('\n')) {
    const t = line.trim();
    if (!t.includes('ккал')) continue;
    if (!/итого|всего|total|^[~≈]/i.test(t) && !t.startsWith('~')) continue;
    const kM = t.match(/(\d+)\s*ккал/);
    const pM = t.match(/Б\s*(\d+)/);
    const fM = t.match(/Ж\s*(\d+)/);
    const cM = t.match(/У\s*(\d+)/);
    if (kM && pM && fM && cM) { total = { kcal: +kM[1], p: +pM[1], f: +fM[1], c: +cM[1] }; break; }
  }

  if (!total && items.length)
    total = items.reduce((a, it) => ({ kcal: a.kcal+it.kcal, p: a.p+it.p, f: a.f+it.f, c: a.c+it.c }), { kcal:0, p:0, f:0, c:0 });

  if (!total) return null;
  return { items, total };
}

function _recalcNutritionTotal() {
  if (!_mealNutrition) return;
  _mealNutrition.total = _mealNutrition.items.reduce(
    (acc, it) => ({ kcal: acc.kcal + it.kcal, p: acc.p + it.p, f: acc.f + it.f, c: acc.c + it.c }),
    { kcal: 0, p: 0, f: 0, c: 0 }
  );
}

function _renderNutritionBreakdown() {
  const el = document.getElementById('meal-nutrition-breakdown');
  if (!el) return;
  if (!_mealNutrition) { el.innerHTML = ''; return; }
  const { items, total } = _mealNutrition;
  const rows = items.map((it, i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);">
      <div style="flex:1;font-size:12px;color:var(--text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${it.name}</div>
      <span id="nitem-g-${i}" onclick="editNutritionGrams(${i})"
            style="color:var(--purple-light);cursor:pointer;font-size:11px;flex-shrink:0;
                   padding:1px 7px;border:1px solid rgba(147,112,219,0.3);border-radius:5px;">
        ${it.grams}${it.unit || 'г'}</span>
      <div style="font-size:11px;color:var(--text);flex-shrink:0;min-width:52px;text-align:right;">${it.kcal} ккал</div>
      <div style="font-size:10px;color:var(--text-faint);flex-shrink:0;">Б${it.p} Ж${it.f} У${it.c}</div>
    </div>`).join('');
  el.innerHTML = `
    <div style="margin-top:10px;background:var(--bg3);border-radius:10px;padding:8px 12px;">
      <div style="font-size:9px;letter-spacing:2px;color:var(--text-faint);text-transform:uppercase;margin-bottom:4px;">СОСТАВ · тап на граммы чтобы поправить</div>
      ${rows}
      <div style="display:flex;justify-content:space-between;align-items:center;padding-top:7px;margin-top:4px;">
        <div style="font-size:11px;color:var(--text-faint);">Итого</div>
        <div style="font-size:12px;color:var(--purple-light);">~${total.kcal} ккал · Б${total.p}г Ж${total.f}г У${total.c}г</div>
      </div>
    </div>`;
}

function editNutritionGrams(idx) {
  if (!_mealNutrition) return;
  const item = _mealNutrition.items[idx];
  const span = document.getElementById(`nitem-g-${idx}`);
  if (!span) return;
  const input = document.createElement('input');
  input.type  = 'number'; input.value = item.grams; input.min = 1;
  input.style.cssText = `width:52px;background:var(--bg);border:1px solid var(--purple-light);
    border-radius:6px;color:var(--text);font-size:11px;padding:2px 4px;font-family:'Jost',sans-serif;`;
  span.replaceWith(input);
  input.focus(); input.select();
  const commit = () => {
    const ng = Math.max(1, parseInt(input.value) || item.grams);
    const factor = ng / item.grams;
    item.grams = ng;
    item.kcal  = Math.round(item.kcal * factor);
    item.p     = Math.round(item.p    * factor);
    item.f     = Math.round(item.f    * factor);
    item.c     = Math.round(item.c    * factor);
    _recalcNutritionTotal();
    _renderNutritionBreakdown();
    // обновляем итоговую строку в textarea
    const t = _mealNutrition.total;
    const totalLine = `~${t.kcal} ккал · Б ${t.p}г · Ж ${t.f}г · У ${t.c}г`;
    const ta = document.getElementById('meal-modal-desc');
    if (ta) {
      ta.value = ta.value.replace(/\n~\d+[^\n]+$/, '') + '\n' + totalLine;
      mealModalData.description = ta.value;
    }
    document.getElementById('meal-kcal-result').textContent = totalLine;
  };
  input.addEventListener('blur',  commit);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
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

function renderTools() {
  const el = document.getElementById('red-zone-tools');
  if (!el) return;

  const isRed = todayScore !== null && todayScore >= 65;
  if (!isRed || !surveyRef?.redZoneTools?.length) {
    el.innerHTML = '';
    return;
  }

  const redZoneIds = new Set((surveyRef?.redZoneTools || []).map(t => t.id));
  const doneIds = new Set(dailyTasks.filter(t => t.is_complete && redZoneIds.has(t.tool_id)).map(t => t.tool_id));

  const buttons = surveyRef.redZoneTools.map(tool => {
    const done = doneIds.has(tool.id);
    return `<button onclick="toggleRedZoneTool(${tool.id})"
      style="flex:1;min-width:calc(50% - 4px);background:${done ? 'none' : 'var(--bg2)'};
             border:1px solid ${done ? 'rgba(255,255,255,0.08)' : 'var(--border)'};
             border-radius:12px;padding:10px 8px;cursor:pointer;text-align:left;
             color:${done ? 'rgba(255,255,255,0.25)' : 'var(--text)'};
             font-family:'Jost',sans-serif;font-size:12px;transition:opacity 0.2s;">
        <div style="font-size:10px;color:${done ? 'rgba(255,255,255,0.15)' : 'var(--green)'};letter-spacing:0.5px;margin-bottom:3px;">${done ? '✓' : tool.weight}</div>
        <div style="${done ? 'text-decoration:line-through;' : ''}">${tool.name}</div>
    </button>`;
  }).join('');

  el.innerHTML = `
    <div style="margin-bottom:8px;">
      <div style="font-size:9px;letter-spacing:3px;color:var(--red);text-transform:uppercase;margin-bottom:10px;">ВЫБЕРИ ПРАКТИКУ</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">${buttons}</div>
    </div>`;
}

async function toggleRedZoneTool(toolId) {
  const today = todayKey();
  const existing = dailyTasks.find(t => t.tool_id === toolId);

  if (existing) {
    const newDone = !existing.is_complete;
    await sb.from('daily_tasks').update({ is_complete: newDone, completed_at: newDone ? new Date().toISOString() : null }).eq('id', existing.id);
    existing.is_complete = newDone;
  } else {
    const { data } = await sb.from('daily_tasks').insert({
      user_id: currentUser.id, date: today, tool_id: toolId, is_complete: true, completed_at: new Date().toISOString(),
    }).select('id, is_complete, tool_id, custom_name, tool:tool_id(name, duration_min, weight, tool_type)').single();
    if (data) dailyTasks.push(data);
  }

  await recalculateScore('tool');
  renderTools();
}

function renderSurveyCta() {
  const panel = document.getElementById('checkins-panel');
  if (!panel) return;
  panel.innerHTML = '';

  const hour = parseInt(new Date().toLocaleString('en-CA', { timeZone: userTimezone, hour: 'numeric', hour12: false }));

  const surveys = [
    { id: 'survey-cta',  done: todayScore !== null,  fn: 'showSurvey()',  label: 'НАЧАЛО',        bg: '',                                          from:  0 },
    { id: 'survey2-cta', done: todaySurvey2Done, fn: 'showSurvey2()', label: 'ЧЕКАП 7:00',    bg: 'linear-gradient(135deg,#0f3460,#16213e)', from:  7 },
    { id: 'survey3-cta', done: todaySurvey3Done, fn: 'showSurvey3()', label: 'ЧЕКАП 10:00',   bg: 'linear-gradient(135deg,#0a2030,#071520)', from: 10 },
    { id: 'survey4-cta', done: todaySurvey4Done, fn: 'showSurvey4()', label: 'ЧЕКАП 13:00',   bg: 'linear-gradient(135deg,#0a1e30,#060f18)', from: 13 },
    { id: 'survey5-cta', done: todaySurvey5Done, fn: 'showSurvey5()', label: 'ЧЕКАП 16:00',   bg: 'linear-gradient(135deg,#0a1830,#050c18)', from: 16 },
    { id: 'survey6-cta', done: todaySurvey6Done, fn: 'showSurvey6()', label: 'РЕФЛЕКСИЯ ДНЯ', bg: 'linear-gradient(135deg,#1a0a30,#0d0518)', from: 19 },
  ];

  surveys.forEach(s => {
    const locked = !s.done && hour < s.from && !forceUnlockedSurveys.has(s.id);

    const wrap = document.createElement('div');
    wrap.id = s.id;
    wrap.style.marginBottom = '8px';

    const btn = document.createElement('button');
    btn.className = 'survey-cta';
    btn.style.marginBottom = '0';
    btn.style.padding = '10px 8px';
    btn.style.fontSize = '11px';
    btn.style.letterSpacing = '1px';
    btn.style.width = '100%';

    if (s.done) {
      btn.textContent = '✓ ' + s.label;
      btn.style.background = 'none';
      btn.style.border = '1px solid rgba(255,255,255,0.08)';
      btn.style.color = 'rgba(255,255,255,0.25)';
      btn.style.cursor = 'default';
      btn.style.textDecoration = 'line-through';
    } else if (locked) {
      if (s.bg) btn.style.background = s.bg;
      btn.textContent = `${s.label} · ${s.from}:00`;
      btn.style.opacity = '0.35';
      btn.style.cursor  = 'default';

      const unlockBtn = document.createElement('button');
      unlockBtn.textContent = '🔓 досрочно';
      unlockBtn.style.cssText = 'display:block;margin:3px auto 0;background:none;border:none;' +
        'color:var(--text-faint);font-size:10px;font-family:"Jost",sans-serif;' +
        'letter-spacing:0.5px;cursor:pointer;padding:3px 6px;';
      unlockBtn.onclick = () => { forceUnlockedSurveys.add(s.id); renderSurveyCta(); };
      wrap.appendChild(btn);
      wrap.appendChild(unlockBtn);
      panel.appendChild(wrap);
      return;
    } else {
      if (s.bg) btn.style.background = s.bg;
      btn.textContent = s.label + ' →';
      btn.onclick = new Function(s.fn);
    }

    wrap.appendChild(btn);
    panel.appendChild(wrap);
  });

  // SOS
  const sosWrap = document.createElement('div');
  sosWrap.id = 'sos-cta';
  sosWrap.style.marginTop = '4px';
  const sosBtn = document.createElement('button');
  sosBtn.style.cssText = 'width:100%;background:none;border:1px solid rgba(180,40,40,0.35);' +
    'border-radius:12px;padding:10px 6px;color:var(--red);' +
    'font-family:"Jost",sans-serif;font-size:10px;letter-spacing:1px;cursor:pointer;';
  sosBtn.textContent = 'SOS';
  sosBtn.onclick = showSos;
  sosWrap.appendChild(sosBtn);
  panel.appendChild(sosWrap);
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
  snack:     { label: 'Перекус', window: '' },
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

  // Снеки
  const snackCards = todaySnacks.map((snack, i) => {
    const photo = snack.photos[snack.carouselIdx] || null;
    const dots  = snack.photos.length > 1
      ? `<div class="meal-dots">${snack.photos.map((_, pi) =>
          `<span class="meal-dot${pi === snack.carouselIdx ? ' active' : ''}"></span>`
        ).join('')}</div>`
      : '';
    const qualityTag = snack.quality === 'plan'
      ? `<span style="font-size:9px;color:var(--green);letter-spacing:0.5px;">по плану</span>`
      : snack.quality === 'slip'
      ? `<span style="font-size:9px;color:var(--red);letter-spacing:0.5px;">срыв</span>`
      : '';
    return `
      <div class="meal-card done" data-snack="${i}"
           style="${photo ? `background-image:url('${photo}')` : ''}"
           ondblclick="openSnackModal(${i})"
           ontouchstart="snackTouchStart(event,${i})"
           ontouchend="snackTouchEnd(event,${i})">
        <div class="meal-card-overlay"></div>
        ${!photo ? '<div class="meal-cam-placeholder">📷</div>' : ''}
        ${dots}
        <div class="meal-card-label">
          <div class="meal-slot-icon">✓</div>
          <div class="meal-slot-name">Перекус ${qualityTag}</div>
        </div>
      </div>`;
  }).join('');

  const addSnackCard = `
    <div class="meal-card" style="cursor:pointer;opacity:0.6;" onclick="openSnackModal(null)">
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;">
        <div style="font-size:24px;color:var(--text-faint);line-height:1;">+</div>
        <div style="font-size:10px;color:var(--text-faint);letter-spacing:1px;margin-top:4px;">ПЕРЕКУС</div>
      </div>
    </div>`;

  container.innerHTML = `
    ${factsHtml}
    <div class="tracker-block">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div style="font-size:9px;letter-spacing:3px;color:var(--text-faint);text-transform:uppercase;">ПРИЁМЫ ПИЩИ</div>
        <div style="font-size:10px;color:${mealCount === 3 ? 'var(--green)' : 'var(--text-faint)'};">${mealCount}/3</div>
      </div>
      <div class="meal-row">
        ${meals}
        ${snackCards}
        ${addSnackCard}
      </div>
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

// ── СНЕК — карусель и модал ───────────────────────────────

let _snackTouchX = 0, _snackTouchY = 0, _snackLastTapIdx = null, _snackLastTapTime = 0;
let activeSnackIdx = null; // null = новый снек, число = индекс в todaySnacks

function snackTouchStart(e, idx) {
  _snackTouchX = e.touches[0].clientX;
  _snackTouchY = e.touches[0].clientY;
}

function snackTouchEnd(e, idx) {
  const dx = e.changedTouches[0].clientX - _snackTouchX;
  const dy = e.changedTouches[0].clientY - _snackTouchY;
  if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) {
    const snack = todaySnacks[idx];
    if (!snack) return;
    const len = snack.photos.length;
    if (len < 2) return;
    snack.carouselIdx = dx < 0
      ? Math.min(snack.carouselIdx + 1, len - 1)
      : Math.max(snack.carouselIdx - 1, 0);
    updateSnackCarousel(idx);
    return;
  }
  if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
    const now = Date.now();
    if (_snackLastTapIdx === idx && now - _snackLastTapTime < 350) {
      _snackLastTapIdx = null; _snackLastTapTime = 0;
      openSnackModal(idx);
    } else {
      _snackLastTapIdx = idx; _snackLastTapTime = now;
    }
  }
}

function updateSnackCarousel(idx) {
  const snack = todaySnacks[idx];
  if (!snack) return;
  const card = document.querySelector(`.meal-card[data-snack="${idx}"]`);
  if (!card) return;
  card.style.backgroundImage = snack.photos[snack.carouselIdx] ? `url('${snack.photos[snack.carouselIdx]}')` : '';
  card.querySelectorAll('.meal-dot').forEach((d, i) => d.classList.toggle('active', i === snack.carouselIdx));
}

function openSnackModal(idx) {
  activeSnackIdx = idx;
  activeMealType = 'snack';
  const snack = idx !== null ? todaySnacks[idx] : null;

  document.getElementById('meal-modal-title').textContent = 'ПЕРЕКУС';
  document.querySelectorAll('[id^="mq-"]').forEach(el => el.classList.remove('mq-selected'));
  if (snack?.quality) document.getElementById('mq-' + snack.quality)?.classList.add('mq-selected');

  document.querySelectorAll('[id^="mmh-"],[id^="mah-"],[id^="mhh-"]').forEach(el => el.classList.remove('selected'));
  if (snack?.hungerBefore)    document.getElementById('mmh-' + snack.hungerBefore)?.classList.add('selected');
  if (snack?.hungerAfter)     document.getElementById('mah-' + snack.hungerAfter)?.classList.add('selected');
  if (snack?.hungerAfterHour) document.getElementById('mhh-' + snack.hungerAfterHour)?.classList.add('selected');

  mealModalData = {
    quality:        snack?.quality        || null,
    hungerBefore:   snack?.hungerBefore   || null,
    hungerAfter:    snack?.hungerAfter    || null,
    hungerAfterHour:snack?.hungerAfterHour|| null,
    description:    snack?.description    || '',
  };

  const _descTa = document.getElementById('meal-modal-desc');
  _descTa.value = snack?.description || '';
  _descTa.style.height = 'auto';
  _descTa.style.height = _descTa.scrollHeight + 'px';

  const kcalRes = document.getElementById('meal-kcal-result');
  if (kcalRes) kcalRes.textContent = '';
  _mealNutrition = snack?.nutritionJson || null;
  renderMealNutritionBreakdown();

  // Фото
  const photoArr = snack?.photos || [];
  const el = document.getElementById('meal-modal-photos');
  el.innerHTML = photoArr.length
    ? `<div style="display:flex;gap:8px;overflow-x:auto;margin-bottom:12px;padding-bottom:4px;">
        ${photoArr.map((url, i) => `
          <div style="position:relative;flex-shrink:0;">
            <img src="${url}" onclick="openMealLightbox('${url}')"
                 style="width:80px;height:80px;border-radius:10px;object-fit:cover;cursor:pointer;">
            <button onclick="deleteSnackPhoto(${i})"
                    style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.6);border:none;
                           color:white;border-radius:50%;width:20px;height:20px;font-size:11px;
                           cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;">✕</button>
          </div>`).join('')}
      </div>`
    : '';

  if (photoArr.length < 3) {
    el.innerHTML += `<button onclick="addSnackPhoto()"
      style="width:100%;background:var(--bg3);border:1px dashed var(--border);border-radius:10px;
             padding:10px;color:var(--text-faint);font-family:'Jost',sans-serif;font-size:12px;
             letter-spacing:1px;cursor:pointer;margin-bottom:12px;">+ Фото</button>`;
  }

  document.getElementById('meal-modal-delete').style.display = snack ? 'block' : 'none';
  document.getElementById('meal-modal').style.display = 'flex';
}

async function saveSnackModal() {
  const today = todayKey();
  const h = parseInt(new Date().toLocaleString('en-CA', { timeZone: userTimezone, hour: 'numeric', hour12: false }));
  const { quality, hungerBefore, hungerAfter, hungerAfterHour, description } = mealModalData;
  const fields = {
    quality:          quality || null,
    description:      description?.trim() || null,
    hunger_before:    hungerBefore || null,
    hunger_after:     hungerAfter || null,
    hunger_after_hour:hungerAfterHour || null,
    nutrition_json:   _mealNutrition || null,
  };

  if (activeSnackIdx !== null) {
    const snack = todaySnacks[activeSnackIdx];
    await sb.from('meal_log').update(fields).eq('id', snack.id);
    Object.assign(snack, {
      quality, description: description?.trim()||null,
      hungerBefore, hungerAfter, hungerAfterHour,
      nutritionJson: _mealNutrition || null,
    });
  } else {
    const { data } = await sb.from('meal_log').insert({
      user_id: currentUser.id, date: today, meal_type: 'snack',
      in_window: false, ...fields,
    }).select('id').single();
    todaySnacks.push({
      id: data?.id || null,
      description: description?.trim()||null,
      quality, hungerBefore, hungerAfter, hungerAfterHour,
      nutritionJson: _mealNutrition || null,
      photos: [], carouselIdx: 0,
    });
  }
  closeMealModal();
  renderTrackers();
  renderScore();
  await recalculateScore('meal_snack');
}

async function deleteSnackFromModal() {
  if (activeSnackIdx === null) { closeMealModal(); return; }
  const snack = todaySnacks[activeSnackIdx];
  if (snack.photos.length) {
    for (const url of snack.photos) {
      const path = url.split('/meal-photos/')[1]?.split('?')[0];
      if (path) await sb.storage.from('meal-photos').remove([decodeURIComponent(path)]);
    }
  }
  await sb.from('meal_log').delete().eq('id', snack.id);
  todaySnacks.splice(activeSnackIdx, 1);
  closeMealModal();
  renderTrackers();
  await recalculateScore('meal_snack');
}

async function addSnackPhoto() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file || activeSnackIdx === null && todaySnacks.length === 0) return;
    const snack = activeSnackIdx !== null ? todaySnacks[activeSnackIdx] : todaySnacks[todaySnacks.length - 1];
    if (!snack || snack.photos.length >= 3) return;
    const blob = file.size > 1500000
      ? await (async () => { const c = document.createElement('canvas'); const img = new Image(); img.src=URL.createObjectURL(file); await new Promise(r=>{img.onload=r;}); const ratio=Math.min(1500/img.width,1500/img.height,1); c.width=img.width*ratio; c.height=img.height*ratio; c.getContext('2d').drawImage(img,0,0,c.width,c.height); return await new Promise(r=>c.toBlob(r,'image/jpeg',0.82)); })()
      : file;
    const path = `${currentUser.id}/${todayKey()}/${Date.now()}.jpg`;
    const { error } = await sb.storage.from('meal-photos').upload(path, blob, { contentType: 'image/jpeg' });
    if (error) return;
    const { data: urlData } = sb.storage.from('meal-photos').getPublicUrl(path);
    snack.photos.push(urlData.publicUrl);
    await sb.from('meal_log').update({ photo_urls: snack.photos }).eq('id', snack.id);
    openSnackModal(activeSnackIdx);
  };
  input.click();
}

async function deleteSnackPhoto(photoIdx) {
  if (activeSnackIdx === null) return;
  const snack = todaySnacks[activeSnackIdx];
  const url = snack.photos[photoIdx];
  const path = url.split('/meal-photos/')[1]?.split('?')[0];
  if (path) await sb.storage.from('meal-photos').remove([decodeURIComponent(path)]);
  snack.photos.splice(photoIdx, 1);
  await sb.from('meal_log').update({ photo_urls: snack.photos.length ? snack.photos : null }).eq('id', snack.id);
  openSnackModal(activeSnackIdx);
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
let _mealNutrition = null; // { items: [{name,grams,kcal,p,f,c}], total: {kcal,p,f,c} }

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

  const _descTa = document.getElementById('meal-modal-desc');
  _descTa.value = meal.description || '';
  _descTa.style.height = 'auto';
  _descTa.style.height = _descTa.scrollHeight + 'px';
  document.getElementById('meal-modal-delete').style.display = meal.done ? 'block' : 'none';
  const kcalRes = document.getElementById('meal-kcal-result');
  if (kcalRes) kcalRes.textContent = '';
  _mealNutrition = meal.nutritionJson || null;
  _renderNutritionBreakdown();
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
  const desc = raw.replace(/\n~\d+[^\n]+$/, '').trim();
  const btn  = document.getElementById('meal-kcal-btn');
  const res  = document.getElementById('meal-kcal-result');

  const photos = activeMealType ? (todayMealPhotos[activeMealType] || []) : [];
  if (!desc && !photos.length) { res.textContent = 'Добавь описание или фото'; return; }

  const apiKey = profile.groq_api_key || localStorage.getItem('nova_api_key');
  if (!apiKey) { res.textContent = 'Нужен API ключ Groq в настройках'; return; }

  btn.disabled = true; btn.textContent = '...'; res.textContent = '';

  const instruction = `Ты нутрициолог. Посчитай ккал и БЖУ по каждому ингредиенту отдельно.
Правила:
- Тарелка по умолчанию: плоская 24 см диаметр. Если указан другой диаметр или тарелка глубокая — используй это
- По фото оцени заполненность тарелки и рассчитай граммы исходя из диаметра
- Если указаны граммы в описании — используй их, они точнее фото
- Для составных блюд (пирожок, котлета, борщ) — среднее по стандартной порции
Формат ответа — СТРОГО такой, без лишнего текста, БЕЗ LaTeX, БЕЗ знаков $, только цифры:
- Название ингредиента Xг: X ккал · Б Xг · Ж Xг · У Xг
- Название ингредиента Xг: X ккал · Б Xг · Ж Xг · У Xг
~X ккал · Б Xг · Ж Xг · У Xг`;

  try {
    let messages;
    if (photos.length) {
      // Отправляем все фото + описание в vision-модель
      const imgContent = [
        ...photos.map(url => ({ type: 'image_url', image_url: { url } })),
        { type: 'text', text: instruction + (desc ? `\n\nОписание от пользователя: ${desc}` : '\nОпиши что видишь на тарелке и посчитай.') },
      ];
      messages = [{ role: 'user', content: imgContent }];
    } else {
      messages = [
        { role: 'system', content: instruction },
        { role: 'user',   content: desc },
      ];
    }

    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: photos.length ? 'meta-llama/llama-4-scout-17b-16e-instruct' : 'llama-3.3-70b-versatile',
        messages,
        max_tokens: 800,
        temperature: 0.1,
      }),
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);
    const raw = data.choices?.[0]?.message?.content?.trim() || '';
    // DEBUG
    const dbg = document.getElementById('meal-nutrition-breakdown');
    if (dbg) { dbg.innerHTML = `<pre style="font-size:10px;color:var(--text-faint);white-space:pre-wrap;word-break:break-all;background:var(--bg3);border-radius:8px;padding:8px;margin-top:8px;">${raw}</pre>`; }
    _mealNutrition = _parseNutritionResponse(raw);
    _renderNutritionBreakdown();
    const t = _mealNutrition?.total;
    const totalLine = t
      ? `~${t.kcal} ккал · Б ${t.p}г · Ж ${t.f}г · У ${t.c}г`
      : (raw.match(/[~≈]?\s*\d+\s*ккал[^\n]*/i)?.[0]?.trim() || '—');
    const ta = document.getElementById('meal-modal-desc');
    ta.value = (desc || '') + (desc ? '\n' : '') + totalLine;
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
  if (activeMealType === 'snack') { await saveSnackModal(); return; }
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
    nutrition_json:    _mealNutrition   || null,
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
    nutritionJson:   _mealNutrition || null,
  };

  renderTrackers();
  renderScore();
  if (isFirstLog || (quality || null) !== prevQuality) await recalculateScore('meal_' + type);
}

async function deleteMealFromModal() {
  if (!activeMealType) return;
  if (activeMealType === 'snack') { await deleteSnackFromModal(); return; }
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
