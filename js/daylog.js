// ── ЖУРНАЛ ДНЯ ───────────────────────────────────────────

const DL_SURVEY_NAMES = {
  1: 'Утренний опрос', 2: 'Утренний отчёт', 3: 'Чекин 10:00',
  4: 'Чекин 14:00',   5: 'Чекин 16:00',    6: 'Вечерний отчёт',
};
const DL_MEAL_RU   = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин' };
const DL_ANS_LABEL = {
  cycle_phase: 'Цикл', sleep: 'Сон', toilet: 'Туалет', workout: 'Разминка',
  water: 'Вода', work: 'Работа', hunger: 'Голод', stomach: 'Живот',
  emotion: 'Эмоция', meal_breakfast: 'Завтрак', meal_lunch: 'Обед',
  meal_dinner: 'Ужин', what_worked: 'Получилось', what_failed: 'Не вышло',
  tomorrow_goals: 'Планы на завтра',
};
const DL_TEXT_KEYS    = new Set(['what_worked', 'what_failed', 'tomorrow_goals']);
const DL_MEAL_KEYS    = new Set(['meal_breakfast', 'meal_lunch', 'meal_dinner']);
const DL_ACT_LABELS   = { warmup: 'Разминка', workout: 'Тренировка', walk: 'Прогулка' };

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

  if (!sessions?.length) {
    document.getElementById('daylog-body').innerHTML =
      '<div class="empty-state" style="margin-top:80px;">Данных за сегодня нет</div>';
    return;
  }

  const sIds = sessions.map(s => s.id);

  const [ansRes, scoresRes, mealRes, activityRes, journalRes, tasksRes,
         periodsRes, sleepsRes, stomachsRes, emotionsRes] = await Promise.all([
    sb.from('daily_survey_answers')
      .select('session_id, value, question:question_id(key, text, type)')
      .in('session_id', sIds).order('answered_at'),
    sb.from('daily_scores')
      .select('value, session_id').eq('user_id', currentUser.id).eq('date', today)
      .order('created_at'),
    sb.from('meal_log')
      .select('meal_type, photo_url, created_at')
      .eq('user_id', currentUser.id).eq('date', today).order('created_at'),
    sb.from('activity_log')
      .select('activity_type, created_at')
      .eq('user_id', currentUser.id).eq('date', today).order('created_at'),
    sb.from('journal_entries')
      .select('text, audio_url, created_at')
      .eq('user_id', currentUser.id).eq('date', today).order('created_at'),
    sb.from('daily_tasks')
      .select('id, is_complete, session_id, tool:tool_id(name, duration_min)')
      .eq('user_id', currentUser.id).eq('date', today).order('created_at'),
    sb.from('periods').select('id, label'),
    sb.from('sleeps').select('id, label'),
    sb.from('stomach_states').select('id, label'),
    sb.from('emotion_types').select('id, label'),
  ]);

  const ref = {
    periods:  periodsRes.data  || [],
    sleeps:   sleepsRes.data   || [],
    stomachs: stomachsRes.data || [],
    emotions: emotionsRes.data || [],
  };

  const answers    = ansRes.data      || [];
  const scores     = scoresRes.data   || [];
  const meals      = mealRes.data     || [];
  const activities = activityRes.data || [];
  const journals   = journalRes.data  || [];
  const tasks      = tasksRes.data    || [];

  const events = [];

  sessions.forEach(sess => events.push({
    type:         'survey',
    time:         new Date(sess.completed_at),
    surveyId:     sess.survey_id,
    answers:      answers.filter(a => a.session_id === sess.id),
    score:        scores.find(s => s.session_id === sess.id)?.value,
    sessionTasks: tasks.filter(t => t.session_id === sess.id),
  }));

  meals.forEach(m => events.push({
    type: 'meal', time: new Date(m.created_at),
    mealType: m.meal_type, photoUrl: m.photo_url,
  }));

  activities.forEach(a => events.push({
    type: 'activity', time: new Date(a.created_at),
    actType: a.activity_type,
  }));

  journals.forEach(j => {
    if (j.text || j.audio_url) events.push({
      type: 'journal', time: new Date(j.created_at),
      text: j.text, audioUrl: j.audio_url,
    });
  });

  events.sort((a, b) => a.time - b.time);

  // ── Сводка ──
  const mealCount   = [todayMeals.breakfast, todayMeals.lunch, todayMeals.dinner].filter(m => m.done).length;
  const waterCount  = todayWaterCount;
  const workoutDone = todayActivity.workout ||
    tasks.some(t => t.is_complete && t.tool?.name === 'Тренировка');
  const actCount    = [todayActivity.warmup, workoutDone, todayActivity.walk].filter(Boolean).length;

  const col = (val, max) => val >= max ? 'var(--green)' : val > 0 ? 'var(--gold)' : 'var(--text-faint)';
  const summaryHtml = `
    <div class="dl-summary">
      <div class="dl-summary-item">
        <div class="dl-summary-val" style="color:${col(mealCount, 3)};">${mealCount}/3</div>
        <div class="dl-summary-label">Еда</div>
      </div>
      <div class="dl-summary-item">
        <div class="dl-summary-val" style="color:${col(waterCount, 8)};">${waterCount}/8</div>
        <div class="dl-summary-label">Вода</div>
      </div>
      <div class="dl-summary-item">
        <div class="dl-summary-val" style="color:${col(actCount, 3)};">${actCount}/3</div>
        <div class="dl-summary-label">Активность</div>
      </div>
    </div>`;

  const dateStr = new Date().toLocaleDateString('ru', { weekday: 'long', day: 'numeric', month: 'long' });
  const eventsHtml = events.map((ev, i) => dlRenderEvent(ev, ref, i === events.length - 1)).join('');

  document.getElementById('daylog-body').innerHTML = `
    <div style="font-size:9px;letter-spacing:3px;color:var(--text-faint);text-transform:uppercase;margin-bottom:16px;">${dateStr}</div>
    ${summaryHtml}
    <div class="dl-timeline">${eventsHtml}</div>
    ${dlRenderFooter(tasks)}
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

  if (ev.type === 'survey') {
    const zone = ev.score != null ? getZone(ev.score) : null;
    const zc   = { green: 'var(--green)', yellow: 'var(--gold)', red: 'var(--red)', catastrophe: 'var(--red)' };
    const scoreHtml = zone
      ? `&thinsp;<span style="color:${zc[zone]};font-weight:500;">${ev.score}</span>&thinsp;<span style="color:${zc[zone]};font-size:9px;letter-spacing:1px;">${ZONE_LABELS[zone]}</span>`
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

    const sessionTools = ev.sessionTasks || [];
    const toolsHtml = sessionTools.length ? `
      <div class="dl-text-block">
        <div class="dl-text-label">Выбранные практики</div>
        ${sessionTools.map(t => `
          <div style="display:flex;align-items:baseline;gap:7px;margin-bottom:4px;">
            <span style="color:${t.is_complete ? 'var(--green)' : 'var(--text-faint)'};">${t.is_complete ? '✓' : '○'}</span>
            <span style="font-size:12px;color:${t.is_complete ? 'var(--text-dim)' : 'var(--text-faint)'};">${t.tool.name}</span>
            <span style="font-size:11px;color:var(--text-faint);">${t.tool.duration_min} мин</span>
          </div>`).join('')}
      </div>` : '';

    return `<div class="dl-event">
      <div class="dl-time-col"><div class="dl-time">${t}</div></div>
      <div class="dl-dot-col"><div class="dl-dot dl-dot--survey"></div>${line}</div>
      <div class="dl-body">
        <div class="dl-title">${DL_SURVEY_NAMES[ev.surveyId] || 'Опрос'}${scoreHtml}</div>
        ${chips ? `<div class="dl-chips">${chips}</div>` : ''}
        ${texts}${toolsHtml}
      </div>
    </div>`;
  }

  if (ev.type === 'meal') {
    const photoHtml = ev.photoUrl
      ? `<img src="${ev.photoUrl}" style="display:block;width:100%;max-height:200px;object-fit:cover;object-position:center top;border-radius:10px;margin-top:6px;">`
      : '';
    return `<div class="dl-event">
      <div class="dl-time-col"><div class="dl-time">${t}</div></div>
      <div class="dl-dot-col"><div class="dl-dot dl-dot--meal"></div>${line}</div>
      <div class="dl-body">
        <div class="dl-title">${DL_MEAL_RU[ev.mealType] || ev.mealType}</div>
        ${photoHtml}
      </div>
    </div>`;
  }

  if (ev.type === 'activity') {
    let label;
    if (ev.actType === 'warmup') {
      label = ev.time.getHours() < 10 ? 'Зарядка' : 'Разминка';
    } else {
      label = DL_ACT_LABELS[ev.actType] || ev.actType;
    }
    return `<div class="dl-event">
      <div class="dl-time-col"><div class="dl-time">${t}</div></div>
      <div class="dl-dot-col"><div class="dl-dot dl-dot--activity"></div>${line}</div>
      <div class="dl-body"><div class="dl-title">${label}</div></div>
    </div>`;
  }

  if (ev.type === 'journal') {
    const textHtml  = ev.text
      ? `<div class="dl-journal-text">${ev.text}</div>` : '';
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

function dlRenderFooter(tasks) {
  const goals = todayMiniGoals;
  if (!goals.length) return '';

  const tasksHtml = '';

  const goalsHtml = goals.length ? `
    <div class="dl-footer-section">
      <div class="dl-footer-label">МИНИ-ЦЕЛИ · ${goals.filter(g => g.is_done).length}/${goals.length}</div>
      ${goals.map(g => `
        <div class="dl-footer-row">
          <span style="color:${g.is_done ? 'var(--green)' : 'var(--text-faint)'};">${g.is_done ? '✓' : '○'}</span>
          <span style="color:${g.is_done ? 'var(--text-dim)' : 'var(--text-faint)'};">${g.text}</span>
        </div>`).join('')}
    </div>` : '';

  return `<div class="dl-footer">${tasksHtml}${goalsHtml}</div>`;
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
