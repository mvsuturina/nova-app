// ── ЖУРНАЛ ДНЯ ───────────────────────────────────────────

// Единые названия опросов (также используются в breakdown.js / home.js)
const SURVEY_NAMES = {
  1: 'Начало',      2: 'Чекап 7:00',  3: 'Чекап 10:00',
  4: 'Чекап 13:00', 5: 'Чекап 16:00', 6: 'Рефлексия дня',
  7: 'SOS',
};

const DL_MEAL_RU = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин' };
const DL_MEAL_QUALITY_COLOR = { plan: 'var(--green)', slip: 'var(--red)' };
const DL_MEAL_QUALITY_LBL   = { plan: 'по плану',     slip: 'срыв'      };

const DL_ANS_LABEL = {
  cycle_phase:    'Цикл',
  sleep:          'Сон',
  toilet:         'Туалет',
  workout:        'Тренировка',
  water:          'Вода',
  work:           'Работа',
  hunger:         'Голод',
  stomach:        'Живот',
  emotion:        'Эмоция',
  meal_breakfast: 'Завтрак',
  meal_lunch:     'Обед',
  meal_dinner:    'Ужин',
  what_worked:    'Получилось',
  what_failed:    'Не вышло',
  tomorrow_goals: 'Планы на завтра',
};

const DL_TEXT_KEYS  = new Set(['what_worked', 'what_failed', 'tomorrow_goals']);
const DL_MEAL_KEYS  = new Set(['meal_breakfast', 'meal_lunch', 'meal_dinner']);
const DL_ACT_LABELS = { warmup: 'Разминка', workout: 'Тренировка', walk: 'Прогулка' };

let dlAudio = null;

function showDayLog() {
  const el = document.getElementById('daylog-overlay');
  el.style.display = 'flex';
  document.getElementById('daylog-body').innerHTML =
    '<div class="empty-state" style="margin-top:80px;">Загружаю...</div>';
  loadDayLog();
}

function closeDayLog() {
  if (dlAudio) { dlAudio.pause(); dlAudio = null; }
  document.getElementById('daylog-overlay').style.display = 'none';
}

async function loadDayLog() {
  const today = todayKey();

  const { data: sessions } = await sb.from('daily_survey_sessions')
    .select('id, survey_id, completed_at')
    .eq('user_id', currentUser.id).eq('date', today)
    .order('completed_at');

  const sIds = (sessions || []).map(s => s.id);

  const [ansRes, scoresRes, mealRes, activityRes, journalRes, tasksRes,
         waterRes, periodsRes, sleepsRes, stomachsRes, emotionsRes, emotionLogRes, sosEventsRes] = await Promise.all([
    sIds.length
      ? sb.from('daily_survey_answers')
          .select('session_id, question_id, value')
          .in('session_id', sIds).order('id')
      : Promise.resolve({ data: [] }),
    sb.from('daily_scores')
      .select('value, source').eq('user_id', currentUser.id).eq('date', today)
      .order('created_at'),
    sb.from('meal_log')
      .select('meal_type, quality, description, photo_urls, hunger_before, hunger_after, hunger_after_hour, created_at')
      .eq('user_id', currentUser.id).eq('date', today).order('created_at'),
    sb.from('activity_log')
      .select('activity_type, created_at')
      .eq('user_id', currentUser.id).eq('date', today).order('created_at'),
    sb.from('journal_entries')
      .select('text, audio_url, source, created_at')
      .eq('user_id', currentUser.id).eq('date', today).order('created_at'),
    sb.from('daily_tasks')
      .select('id, is_complete, session_id, custom_name, tool:tool_id(name, duration_min)')
      .eq('user_id', currentUser.id).eq('date', today).order('created_at'),
    sb.from('water_log')
      .select('id, created_at')
      .eq('user_id', currentUser.id).eq('date', today).order('created_at'),
    sb.from('periods').select('id, label'),
    sb.from('sleeps').select('id, label'),
    sb.from('stomach_states').select('id, label'),
    sb.from('emotion_types').select('id, label'),
    sb.from('emotion_log')
      .select('session_id, note')
      .eq('user_id', currentUser.id).eq('date', today).order('created_at'),
    sb.from('sos_events')
      .select('session_id, score_delta, description')
      .eq('user_id', currentUser.id).eq('date', today),
  ]);

  const ref = {
    periods:  periodsRes.data  || [],
    sleeps:   sleepsRes.data   || [],
    stomachs: stomachsRes.data || [],
    emotions: emotionsRes.data || [],
  };

  // Матчинг скоров к опросам по source (session_id в daily_scores не заполняется)
  const scoresBySource = {};
  (scoresRes.data || []).forEach(s => {
    const src = s.source || '';
    if (!scoresBySource[src]) scoresBySource[src] = [];
    scoresBySource[src].push(s.value);
  });
  const sourceUsage = {};
  const getSessionScore = (surveyId) => {
    const src = surveyId === 7 ? 'sos' : 'checkin_' + surveyId;
    const idx = sourceUsage[src] || 0;
    sourceUsage[src] = idx + 1;
    return scoresBySource[src]?.[idx] ?? null;
  };

  // Маппинг question_id → ключ.
  // Используем surveyRef (уже загружен в app.js) — это те же IDs, по которым сохраняются ответы.
  // sleep в survey 1 сохраняется с хардкодом question_id=2.
  const qIdKey = { '2': 'sleep' };
  if (surveyRef?.stomachQId) qIdKey[String(surveyRef.stomachQId)] = 'stomach';
  if (surveyRef?.emotionQId) qIdKey[String(surveyRef.emotionQId)] = 'emotion';

  const answers = (ansRes.data || []).map(a => ({
    ...a,
    question: { key: qIdKey[String(a.question_id)] || null },
  }));
  const scores      = scoresRes.data      || [];
  const meals       = mealRes.data        || [];
  const activities  = activityRes.data    || [];
  const journals    = journalRes.data     || [];
  const tasks       = tasksRes.data       || [];
  const waters      = waterRes.data       || [];
  const emotionLogs = emotionLogRes.data  || [];
  const sosEvents   = sosEventsRes.data   || [];

  // ── Строим события ────────────────────────────────────────
  const events = [];

  (sessions || []).forEach(sess => events.push({
    type:         'survey',
    time:         new Date(sess.completed_at),
    surveyId:     sess.survey_id,
    answers:      answers.filter(a => a.session_id === sess.id),
    score:        getSessionScore(sess.survey_id),
    sessionTasks: tasks.filter(t => t.session_id === sess.id),
    emotionNote:  emotionLogs.find(e => e.session_id === sess.id)?.note || null,
    sosEvent:     sosEvents.find(e => e.session_id === sess.id) || null,
  }));

  meals.forEach(m => events.push({
    type:           'meal',
    time:           new Date(m.created_at),
    mealType:       m.meal_type,
    quality:        m.quality,
    description:    m.description,
    photos:         m.photo_urls || [],
    hungerBefore:   m.hunger_before,
    hungerAfter:    m.hunger_after,
    hungerAfterHour: m.hunger_after_hour,
  }));

  activities.forEach(a => events.push({
    type:    'activity',
    time:    new Date(a.created_at),
    actType: a.activity_type,
  }));

  waters.forEach((w, i) => events.push({
    type:     'water',
    time:     new Date(w.created_at),
    glassNum: i + 1,
  }));

  // Заметки об эмоциях — отдельный тип
  journals.filter(j => j.source === 'emotion_note' && j.text?.trim()).forEach(j => events.push({
    type: 'emotion_note',
    time: new Date(j.created_at),
    text: j.text,
  }));

  // Остальные дневниковые записи
  journals.filter(j => j.source !== 'emotion_note' && (j.text || j.audio_url)).forEach(j => events.push({
    type:     'journal',
    time:     new Date(j.created_at),
    text:     j.text,
    audioUrl: j.audio_url,
  }));

  events.sort((a, b) => a.time - b.time);

  // Считаем дельту скора для каждого опроса
  let prevSurveyScore = null;
  events.forEach(ev => {
    if (ev.type === 'survey' && ev.score !== null) {
      ev.scoreDelta = prevSurveyScore !== null ? ev.score - prevSurveyScore : null;
      prevSurveyScore = ev.score;
    }
  });

  // ── Сводка ─────────────────────────────────────────────
  const mealCount  = ['breakfast', 'lunch', 'dinner'].filter(t => todayMeals[t].done).length;
  const actCount   = [todayActivity.warmup, todayActivity.workout, todayActivity.walk].filter(Boolean).length;
  const tasksDone  = tasks.filter(t => t.is_complete).length;
  const goalsDone  = todayMiniGoals.filter(g => g.is_done).length;
  const goals      = todayMiniGoals;

  const col = (v, max) => v >= max ? 'var(--green)' : v > 0 ? 'var(--gold)' : 'var(--text-faint)';

  const cyclePart = todayCycleLabel
    ? `<div class="dl-summary-item">
        <div class="dl-summary-val" style="color:var(--text-dim);font-size:12px;line-height:1.2;">${todayCycleLabel}</div>
        <div class="dl-summary-label">Цикл</div>
       </div>`
    : '';

  const summaryHtml = `
    <div class="dl-summary">
      ${cyclePart}
      <div class="dl-summary-item">
        <div class="dl-summary-val" style="color:${col(mealCount, 3)};">${mealCount}/3</div>
        <div class="dl-summary-label">Еда</div>
      </div>
      <div class="dl-summary-item">
        <div class="dl-summary-val" style="color:${col(waters.length, 8)};">${waters.length}/8</div>
        <div class="dl-summary-label">Вода</div>
      </div>
      <div class="dl-summary-item">
        <div class="dl-summary-val" style="color:${col(actCount, 3)};">${actCount}/3</div>
        <div class="dl-summary-label">Активность</div>
      </div>
      ${tasks.length ? `<div class="dl-summary-item">
        <div class="dl-summary-val" style="color:${col(tasksDone, tasks.length)};">${tasksDone}/${tasks.length}</div>
        <div class="dl-summary-label">Практики</div>
      </div>` : ''}
      ${goals.length ? `<div class="dl-summary-item">
        <div class="dl-summary-val" style="color:${col(goalsDone, goals.length)};">${goalsDone}/${goals.length}</div>
        <div class="dl-summary-label">Цели</div>
      </div>` : ''}
    </div>`;

  if (!events.length && !tasks.length && !goals.length) {
    document.getElementById('daylog-body').innerHTML =
      '<div class="empty-state" style="margin-top:80px;">Данных за сегодня нет</div>';
    return;
  }

  const dateStr = new Date().toLocaleDateString('ru', { weekday: 'long', day: 'numeric', month: 'long' });
  const eventsHtml = events.map((ev, i) => dlRenderEvent(ev, ref, i === events.length - 1)).join('');

  document.getElementById('daylog-body').innerHTML = `
    <div style="font-size:9px;letter-spacing:3px;color:var(--text-faint);text-transform:uppercase;margin-bottom:16px;">${dateStr}</div>
    ${summaryHtml}
    <div class="dl-timeline">${eventsHtml}</div>
    ${dlRenderFooter(tasks, goals)}
  `;
}

function dlFmt(key, value, ref) {
  if (key === 'cycle_phase') return ref.periods.find(p => p.id == value)?.label  || '?';
  if (key === 'sleep')       return ref.sleeps.find(s => s.id == value)?.label   || '?';
  if (key === 'stomach')     return ref.stomachs.find(s => s.id == value)?.label || '?';
  if (key === 'emotion')     return ref.emotions.find(e => e.id == value)?.label || '?';
  if (key === 'hunger')      return value + '/10';
  if (value === 'true')  return '✓';
  if (value === 'false') return '✗';
  return value;
}

function dlRenderEvent(ev, ref, isLast) {
  const t    = ev.time.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  const line = isLast ? '' : '<div class="dl-dot-line"></div>';

  // ── Опрос ─────────────────────────────────────────────
  if (ev.type === 'survey') {
    const zone = ev.score != null ? getZone(ev.score) : null;
    const zc   = { green: 'var(--green)', yellow: 'var(--gold)', red: 'var(--red)', catastrophe: 'var(--red)' };
    const deltaHtml = (zone && ev.scoreDelta !== null)
      ? `<span style="font-size:11px;font-weight:500;margin-left:4px;
                      color:${ev.scoreDelta > 0 ? 'var(--red)' : ev.scoreDelta < 0 ? 'var(--green)' : 'var(--text-faint)'};">
           ${ev.scoreDelta > 0 ? '+' : ''}${ev.scoreDelta}
         </span>`
      : '';
    const scoreHtml = zone
      ? `&thinsp;<span style="color:${zc[zone]};font-weight:500;">${Math.max(0, ev.score)}</span>${deltaHtml}&thinsp;<span style="color:${zc[zone]};font-size:9px;letter-spacing:1px;">${ZONE_LABELS[zone]}</span>`
      : '';

    const chipAns = ev.answers.filter(a => {
      const k = a.question?.key;
      return k && !DL_TEXT_KEYS.has(k) && !DL_MEAL_KEYS.has(k);
    });
    const chips = chipAns.map(a => {
      const k = a.question?.key;
      return `<span class="dl-chip">${DL_ANS_LABEL[k] || k} ${dlFmt(k, a.value, ref)}</span>`;
    }).join('');

    const textAns = ev.answers.filter(a => DL_TEXT_KEYS.has(a.question?.key) && a.value?.trim());
    const texts = textAns.map(a => {
      const label = DL_ANS_LABEL[a.question.key] || a.question.key;
      return `<div class="dl-text-block">
        <div class="dl-text-label">${label.toUpperCase()}</div>
        ${a.value.trim().split('\n').filter(Boolean).map(l => `<div class="dl-text-line">${l}</div>`).join('')}
      </div>`;
    }).join('');

    const sessionTasks = ev.sessionTasks || [];
    const toolsHtml = sessionTasks.length ? `
      <div class="dl-text-block">
        <div class="dl-text-label">Практики</div>
        ${sessionTasks.map(tk => `
          <div style="display:flex;align-items:baseline;gap:7px;margin-bottom:4px;">
            <span style="color:${tk.is_complete ? 'var(--green)' : 'var(--text-faint)'};">${tk.is_complete ? '✓' : '○'}</span>
            <span style="font-size:12px;color:${tk.is_complete ? 'var(--text-dim)' : 'var(--text-faint)'};">${tk.tool?.name || tk.custom_name || '—'}</span>
            ${tk.tool?.duration_min ? `<span style="font-size:11px;color:var(--text-faint);">${tk.tool.duration_min} мин</span>` : ''}
          </div>`).join('')}
      </div>` : '';

    let sosEventHtml = '';
    if (ev.sosEvent) {
      const d = ev.sosEvent.score_delta;
      const dStr = d > 0 ? '+' + d : String(d);
      const dClr = d > 0 ? 'var(--red)' : d < 0 ? 'var(--green)' : 'var(--text-faint)';
      sosEventHtml = `<div style="margin-top:6px;">
        <span class="dl-chip" style="color:${dClr};">Скор ${dStr}</span>
        ${ev.sosEvent.description ? `<div class="dl-journal-text" style="margin-top:5px;">${ev.sosEvent.description}</div>` : ''}
      </div>`;
    }

    const dotClass = ev.surveyId === 7 ? 'dl-dot dl-dot--sos' : 'dl-dot dl-dot--survey';
    return `<div class="dl-event">
      <div class="dl-time-col"><div class="dl-time">${t}</div></div>
      <div class="dl-dot-col"><div class="${dotClass}"></div>${line}</div>
      <div class="dl-body">
        <div class="dl-title">${SURVEY_NAMES[ev.surveyId] || 'Опрос'}${scoreHtml}</div>
        ${chips ? `<div class="dl-chips">${chips}</div>` : ''}
        ${ev.emotionNote ? `<div class="dl-journal-text" style="margin-top:6px;">${ev.emotionNote}</div>` : ''}
        ${sosEventHtml}
        ${texts}${toolsHtml}
      </div>
    </div>`;
  }

  // ── Приём пищи ────────────────────────────────────────
  if (ev.type === 'meal') {
    const mealLabel = DL_MEAL_RU[ev.mealType] || ev.mealType;
    const qColor    = ev.quality ? DL_MEAL_QUALITY_COLOR[ev.quality] : null;
    const qualityTag = qColor
      ? `<span style="font-size:9px;color:${qColor};margin-left:6px;letter-spacing:0.5px;">${DL_MEAL_QUALITY_LBL[ev.quality]}</span>`
      : '';

    const photosHtml = ev.photos.length
      ? `<div style="display:flex;gap:6px;margin-top:8px;overflow-x:auto;padding-bottom:2px;">
          ${ev.photos.map((url, i) =>
            `<img src="${url}" onclick="dlOpenPhoto(${JSON.stringify(ev.photos)},${i})"
              style="width:110px;height:110px;object-fit:cover;border-radius:8px;flex-shrink:0;cursor:pointer;">`
          ).join('')}
        </div>`
      : '';

    const descHtml = ev.description?.trim()
      ? `<div class="dl-journal-text" style="margin-top:6px;">${ev.description.trim()}</div>`
      : '';

    const hungerParts = [];
    if (ev.hungerBefore    != null) hungerParts.push(`До: <b>${ev.hungerBefore}</b>`);
    if (ev.hungerAfter     != null) hungerParts.push(`После: <b>${ev.hungerAfter}</b>`);
    if (ev.hungerAfterHour != null) hungerParts.push(`+час: <b>${ev.hungerAfterHour}</b>`);
    const hungerHtml = hungerParts.length
      ? `<div style="font-size:11px;color:var(--text-faint);margin-top:6px;">${hungerParts.join(' · ')}</div>`
      : '';

    return `<div class="dl-event">
      <div class="dl-time-col"><div class="dl-time">${t}</div></div>
      <div class="dl-dot-col"><div class="dl-dot dl-dot--meal"></div>${line}</div>
      <div class="dl-body">
        <div class="dl-title">${mealLabel}${qualityTag}</div>
        ${photosHtml}${descHtml}${hungerHtml}
      </div>
    </div>`;
  }

  // ── Активность ────────────────────────────────────────
  if (ev.type === 'activity') {
    const label = ev.actType === 'warmup' && ev.time.getHours() < 10
      ? 'Зарядка'
      : DL_ACT_LABELS[ev.actType] || ev.actType;
    return `<div class="dl-event">
      <div class="dl-time-col"><div class="dl-time">${t}</div></div>
      <div class="dl-dot-col"><div class="dl-dot dl-dot--activity"></div>${line}</div>
      <div class="dl-body"><div class="dl-title">${label}</div></div>
    </div>`;
  }

  // ── Стакан воды ───────────────────────────────────────
  if (ev.type === 'water') {
    const color = ev.glassNum >= 8 ? 'var(--green)' : 'var(--text-faint)';
    return `<div class="dl-event">
      <div class="dl-time-col"><div class="dl-time">${t}</div></div>
      <div class="dl-dot-col"><div class="dl-dot" style="background:var(--blue,#3b9bdc);"></div>${line}</div>
      <div class="dl-body">
        <div class="dl-title" style="font-size:13px;">Вода <span style="color:${color};font-weight:500;">${ev.glassNum}</span><span style="color:var(--text-faint);font-size:11px;">/8</span></div>
      </div>
    </div>`;
  }

  // ── Заметка об эмоции ─────────────────────────────────
  if (ev.type === 'emotion_note') {
    return `<div class="dl-event">
      <div class="dl-time-col"><div class="dl-time">${t}</div></div>
      <div class="dl-dot-col"><div class="dl-dot dl-dot--journal"></div>${line}</div>
      <div class="dl-body">
        <div class="dl-title">Об эмоции</div>
        <div class="dl-journal-text">${ev.text}</div>
      </div>
    </div>`;
  }

  // ── Дневниковая запись ────────────────────────────────
  if (ev.type === 'journal') {
    const textHtml  = ev.text    ? `<div class="dl-journal-text">${ev.text}</div>` : '';
    const audioHtml = ev.audioUrl
      ? `<button class="dl-audio-btn" onclick="dlToggleAudio('${ev.audioUrl}',this)">▶ Прослушать</button>` : '';
    return `<div class="dl-event">
      <div class="dl-time-col"><div class="dl-time">${t}</div></div>
      <div class="dl-dot-col"><div class="dl-dot dl-dot--journal"></div>${line}</div>
      <div class="dl-body">
        <div class="dl-title">Дневник</div>
        ${textHtml}${audioHtml}
      </div>
    </div>`;
  }

  return '';
}

function dlRenderFooter(tasks, goals) {
  const allTasks = tasks.filter(t => t.tool || t.custom_name);
  const tasksDone = allTasks.filter(t => t.is_complete).length;

  const tasksHtml = allTasks.length ? `
    <div class="dl-footer-section">
      <div class="dl-footer-label">ПРАКТИКИ · ${tasksDone}/${allTasks.length}</div>
      ${allTasks.map(tk => `
        <div class="dl-footer-row">
          <span style="color:${tk.is_complete ? 'var(--green)' : 'var(--text-faint)'};">${tk.is_complete ? '✓' : '○'}</span>
          <span style="color:${tk.is_complete ? 'var(--text-dim)' : 'var(--text-faint)'};">${tk.tool?.name || tk.custom_name || '—'}</span>
          ${tk.tool?.duration_min ? `<span style="font-size:11px;color:var(--text-faint);">${tk.tool.duration_min} мин</span>` : ''}
        </div>`).join('')}
    </div>` : '';

  const goalsHtml = goals.length ? `
    <div class="dl-footer-section">
      <div class="dl-footer-label">МИНИ-ЦЕЛИ · ${goals.filter(g => g.is_done).length}/${goals.length}</div>
      ${goals.map(g => `
        <div class="dl-footer-row">
          <span style="color:${g.is_done ? 'var(--green)' : 'var(--text-faint)'};">${g.is_done ? '✓' : '○'}</span>
          <span style="color:${g.is_done ? 'var(--text-dim)' : 'var(--text-faint)'};">${g.text}</span>
        </div>`).join('')}
    </div>` : '';

  if (!tasksHtml && !goalsHtml) return '';
  return `<div class="dl-footer">${tasksHtml}${goalsHtml}</div>`;
}

// ── Лайтбокс фото ────────────────────────────────────────
let _dlLbPhotos = [];
let _dlLbIdx    = 0;

function dlOpenPhoto(photos, idx) {
  _dlLbPhotos = photos;
  _dlLbIdx    = idx;

  let overlay = document.getElementById('dl-lightbox');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'dl-lightbox';
    overlay.style.cssText = [
      'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.94)',
      'display:flex;align-items:center;justify-content:center',
      'touch-action:none;user-select:none',
    ].join(';');
    overlay.innerHTML = `
      <button onclick="dlCloseLb()" style="position:absolute;top:18px;right:20px;
        background:none;border:none;color:#fff;font-size:28px;cursor:pointer;line-height:1;">×</button>
      <button id="dl-lb-prev" onclick="dlLbNav(-1)" style="position:absolute;left:12px;
        background:none;border:none;color:#fff;font-size:32px;cursor:pointer;padding:20px;">‹</button>
      <img id="dl-lb-img" style="max-width:100%;max-height:90vh;object-fit:contain;border-radius:6px;">
      <button id="dl-lb-next" onclick="dlLbNav(1)" style="position:absolute;right:12px;
        background:none;border:none;color:#fff;font-size:32px;cursor:pointer;padding:20px;">›</button>
      <div id="dl-lb-dots" style="position:absolute;bottom:24px;left:0;right:0;
        display:flex;justify-content:center;gap:7px;"></div>`;
    // Закрыть по тапу на фон
    overlay.addEventListener('click', e => { if (e.target === overlay) dlCloseLb(); });
    // Свайп
    let sx = null;
    overlay.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
    overlay.addEventListener('touchend', e => {
      if (sx === null) return;
      const dx = e.changedTouches[0].clientX - sx;
      sx = null;
      if (Math.abs(dx) > 40) dlLbNav(dx < 0 ? 1 : -1);
    });
    document.body.appendChild(overlay);
  }

  overlay.style.display = 'flex';
  dlLbRender();
}

function dlLbRender() {
  document.getElementById('dl-lb-img').src = _dlLbPhotos[_dlLbIdx];
  const prev = document.getElementById('dl-lb-prev');
  const next = document.getElementById('dl-lb-next');
  if (prev) prev.style.visibility = _dlLbIdx > 0 ? 'visible' : 'hidden';
  if (next) next.style.visibility = _dlLbIdx < _dlLbPhotos.length - 1 ? 'visible' : 'hidden';
  const dots = document.getElementById('dl-lb-dots');
  if (dots && _dlLbPhotos.length > 1) {
    dots.innerHTML = _dlLbPhotos.map((_, i) =>
      `<div style="width:6px;height:6px;border-radius:50%;
        background:${i === _dlLbIdx ? '#fff' : 'rgba(255,255,255,.35)'};"></div>`
    ).join('');
  } else if (dots) {
    dots.innerHTML = '';
  }
}

function dlLbNav(dir) {
  const next = _dlLbIdx + dir;
  if (next < 0 || next >= _dlLbPhotos.length) return;
  _dlLbIdx = next;
  dlLbRender();
}

function dlCloseLb() {
  const overlay = document.getElementById('dl-lightbox');
  if (overlay) overlay.style.display = 'none';
}

function dlToggleAudio(url, btn) {
  if (dlAudio && !dlAudio.paused) {
    dlAudio.pause();
    btn.textContent = '▶ Прослушать';
    return;
  }
  if (dlAudio) dlAudio.pause();
  dlAudio = new Audio(url);
  dlAudio.play();
  btn.textContent = '⏸ Пауза';
  dlAudio.onended = () => { btn.textContent = '▶ Прослушать'; dlAudio = null; };
}
