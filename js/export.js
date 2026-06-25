// ── ЭКСПОРТ НЕДЕЛИ ────────────────────────────────────────

let _exportJson = '';
let _exportHtml = '';

function _renderExportJson() {
  _exportHtml = `<pre style="font-size:11px;color:var(--text-dim);line-height:1.5;white-space:pre-wrap;
                 word-break:break-word;font-family:'Jost',monospace;">${_exportJson}</pre>`;
  document.getElementById('export-body').innerHTML = _exportHtml;
}

function showWeekExport() {
  document.getElementById('export-overlay').style.display = 'flex';
  document.getElementById('export-body').innerHTML =
    '<div class="empty-state" style="margin-top:60px;">Собираю данные...</div>';
  document.getElementById('export-copy-btn').textContent = 'Копировать';
  const analyzeBtn = document.getElementById('export-analyze-btn');
  if (analyzeBtn) { analyzeBtn.textContent = 'Анализ AI'; analyzeBtn.dataset.mode = 'ai'; analyzeBtn.disabled = false; }
  _buildWeekReport().then(report => {
    _exportJson = JSON.stringify(report, null, 2);
    _renderExportJson();
  }).catch(e => {
    document.getElementById('export-body').innerHTML =
      `<div class="empty-state" style="color:var(--red);">Ошибка: ${e.message}</div>`;
  });
}

function closeExport() {
  document.getElementById('export-overlay').style.display = 'none';
}

async function copyExport() {
  if (!_exportJson) return;
  try {
    await navigator.clipboard.writeText(_exportJson);
    const btn = document.getElementById('export-copy-btn');
    btn.textContent = '✓ Скопировано';
    setTimeout(() => { btn.textContent = 'Копировать'; }, 2000);
  } catch {
    // fallback для iOS
    const ta = document.createElement('textarea');
    ta.value = _exportJson;
    ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    const btn = document.getElementById('export-copy-btn');
    btn.textContent = '✓ Скопировано';
    setTimeout(() => { btn.textContent = 'Копировать'; }, 2000);
  }
}

function downloadExport() {
  if (!_exportJson) return;
  const blob = new Blob([_exportJson], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const from = _exportJson.match(/"period":\s*"([^"]+)"/)?.[1]?.replace(' — ', '_') || 'week';
  a.href     = url;
  a.download = `nova_week_${from}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function analyzeWeek() {
  if (!_exportJson) return;

  const btn = document.getElementById('export-analyze-btn');

  // Переключение: показать JSON обратно
  if (btn?.dataset.mode === 'json') {
    document.getElementById('export-body').innerHTML = _exportHtml;
    btn.textContent = 'Анализ AI';
    btn.dataset.mode = 'ai';
    return;
  }

  const apiKey = profile.groq_api_key || localStorage.getItem('nova_api_key');
  if (!apiKey) {
    document.getElementById('export-body').innerHTML =
      '<div class="empty-state" style="margin-top:60px;color:var(--red);">Нужен API ключ Groq<br>Зайди в ⚙️ настройки</div>';
    return;
  }

  if (btn) { btn.textContent = '...'; btn.disabled = true; }
  document.getElementById('export-body').innerHTML =
    '<div class="empty-state" style="margin-top:60px;">Анализирую...</div>';

  const systemPrompt = `Ты NOVA — аналитик поведенческих паттернов. Твоя задача: найти в данных конкретные цепочки причин и следствий, которые пользователь сам не замечает.

ЗАДАЧА: выяви 3-5 реальных паттернов из данных. Паттерн — это конкретная комбинация факторов, которая предшествует определённому исходу.

КАК ИСКАТЬ:
- Смотри на дни с низким скором или SOS: что было в тот же день и день до? (сон, вода, активность, еда, эмоции)
- Смотри на дни с высоким скором: что совпало?
- Ищи «цепочки домино»: плохой сон → пропустила зарядку → переела → плохое настроение вечером
- Ищи «защитные факторы»: что всегда есть в хорошие дни?
- Смотри на время SOS событий и их описания — что их спровоцировало?
- НЕСОСТЫКОВКИ: ищи дни где скор высокий, но было много SOS или негативных эмоций — это значит внутреннее состояние хуже, чем показывает скор. И наоборот: низкий скор при позитивных эмоциях — что тянет скор вниз несмотря на хорошее самочувствие? Такие расхождения особенно важны.

ФОРМАТ КАЖДОГО ПАТТЕРНА:
→ [что случилось конкретно, с датой или описанием дня]
→ [что этому предшествовало — 2-3 фактора]
→ [вывод: если X и Y, то обычно Z]

НЕ ПИШИ:
- общие советы типа "важно высыпаться"
- абстрактные наблюдения без привязки к конкретным дням
- советы, которые не следуют из данных

В КОНЦЕ — три вывода:
1. Самый важный паттерн этой недели одним предложением.
2. Если нашла несостыковку скора с реальным состоянием — напиши явно: «⚠️ Возможно, система не точно отражает твоё состояние в [день/ситуация] — стоит пересмотреть веса или добавить новый фактор».
3. **ГЛАВНОЕ СОБЫТИЕ НЕДЕЛИ**: найди самый критичный момент — день или отрезок где скор был низким долго, или резко упал, или было несколько SOS подряд — и опиши его прямо: «[дата]: скор держался ниже X весь день, при этом [что происходило / чего не было сделано]. Это пропущенная точка вмешательства.» Если таких не было — напиши что неделя прошла ровно.

Стиль: русский, коротко, как будто разговариваешь с человеком. Максимум 350 слов.`;

  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: 'Данные за неделю:\n\n' + _exportJson },
        ],
        max_tokens: 1600,
        temperature: 0.4,
      }),
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);
    const reply = data.choices?.[0]?.message?.content || 'Нет ответа.';
    const escaped = reply
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    document.getElementById('export-body').innerHTML =
      `<div style="font-family:'Jost',sans-serif;font-size:14px;line-height:1.75;
                   color:var(--text);white-space:pre-wrap;padding-bottom:40px;">${escaped}</div>`;
    if (btn) { btn.textContent = 'Показать JSON'; btn.dataset.mode = 'json'; btn.disabled = false; }
  } catch(e) {
    document.getElementById('export-body').innerHTML =
      `<div class="empty-state" style="color:var(--red);">Ошибка: ${e.message}</div>`;
    if (btn) { btn.textContent = 'Анализ AI'; btn.dataset.mode = 'ai'; btn.disabled = false; }
  }
}

async function _buildWeekReport() {
  // Последние 7 дней включая сегодня
  const dates = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    // Вычитаем дни в UTC, потом форматируем в таймзоне пользователя
    const shifted = new Date(d.getTime() - i * 86400000);
    dates.push(shifted.toLocaleDateString('en-CA', { timeZone: userTimezone }));
  }
  const from = dates[0];
  const to   = dates[dates.length - 1];

  // Параллельный запрос всех таблиц
  const [scoresR, sessionsR, actR, mealR, waterR, emotionR, sosR, goalsR, journalR, tasksR] = await Promise.all([
    sb.from('daily_scores')
      .select('date, value, source, created_at')
      .eq('user_id', currentUser.id).gte('date', from).lte('date', to)
      .order('created_at'),
    sb.from('daily_survey_sessions')
      .select('id, survey_id, date, completed_at')
      .eq('user_id', currentUser.id).gte('date', from).lte('date', to)
      .order('completed_at'),
    sb.from('activity_log')
      .select('date, activity_type')
      .eq('user_id', currentUser.id).gte('date', from).lte('date', to),
    sb.from('meal_log')
      .select('date, meal_type, quality, description, hunger_before, hunger_after')
      .eq('user_id', currentUser.id).gte('date', from).lte('date', to),
    sb.from('water_log')
      .select('date')
      .eq('user_id', currentUser.id).gte('date', from).lte('date', to),
    sb.from('emotion_log')
      .select('session_id, date, emotion_type_id, note, created_at')
      .eq('user_id', currentUser.id).gte('date', from).lte('date', to)
      .order('created_at'),
    sb.from('sos_events')
      .select('date, stomach_state_id, emotion_type_id, emotion_note, score_delta, description, created_at')
      .eq('user_id', currentUser.id).gte('date', from).lte('date', to)
      .order('created_at'),
    sb.from('mini_goals')
      .select('date, text, is_done')
      .eq('user_id', currentUser.id).gte('date', from).lte('date', to),
    sb.from('journal_entries')
      .select('date, text, source, created_at')
      .eq('user_id', currentUser.id).gte('date', from).lte('date', to)
      .not('text', 'is', null)
      .order('created_at'),
    sb.from('daily_tasks')
      .select('date, is_complete, custom_name, tool:tool_id(name, tool_type)')
      .eq('user_id', currentUser.id).gte('date', from).lte('date', to)
      .order('created_at'),
  ]);

  // Ответы на вопросы по всем сессиям недели
  const sessionIds = (sessionsR.data || []).map(s => s.id);
  let answersData = [];
  if (sessionIds.length) {
    const { data } = await sb.from('daily_survey_answers')
      .select('session_id, question_id, value')
      .in('session_id', sessionIds);
    answersData = data || [];
  }

  const fmt = (ts) => new Date(ts).toLocaleTimeString('ru', {
    hour: '2-digit', minute: '2-digit', timeZone: userTimezone,
  });

  // Строим отчёт по дням
  const days = dates.map(date => {
    const scores   = (scoresR.data   || []).filter(r => r.date === date);
    const sessions = (sessionsR.data || []).filter(r => r.date === date);
    const acts     = (actR.data      || []).filter(r => r.date === date);
    const meals    = (mealR.data     || []).filter(r => r.date === date);
    const water    = (waterR.data    || []).filter(r => r.date === date).length;
    const emoLogs  = (emotionR.data  || []).filter(r => r.date === date);
    const sos      = (sosR.data      || []).filter(r => r.date === date);
    const goals    = (goalsR.data    || []).filter(r => r.date === date);

    const journal  = (journalR.data  || []).filter(r => r.date === date);
    const tasks    = (tasksR.data    || []).filter(r => r.date === date);
    const s1       = sessions.find(s => s.survey_id === 1);
    const dynSess  = sessions.filter(s => s.survey_id >= 2 && s.survey_id <= 6);

    // Сон из утреннего опроса
    let sleep = null;
    if (s1) {
      const sleepAns = answersData.find(a => a.session_id === s1.id && a.question_id === 2);
      if (sleepAns) sleep = surveyRef.sleeps.find(s => s.id === parseInt(sleepAns.value))?.label || null;
    }

    // Чекины 2–6
    const checkins = dynSess.map(sess => {
      const sa = answersData.filter(a => a.session_id === sess.id);
      const stAns = sa.find(a => a.question_id === surveyRef.stomachQId);
      const emAns = sa.find(a => a.question_id === surveyRef.emotionQId);
      const eLog  = emoLogs.find(e => e.session_id === sess.id);
      const score = scores.find(s => s.source === 'checkin_' + sess.survey_id)?.value ?? null;
      return {
        survey:       SURVEY_NAMES[sess.survey_id] || 'Чекап',
        time:         fmt(sess.completed_at),
        stomach:      stAns ? surveyRef.stomachs.find(s => s.id === parseInt(stAns.value))?.label : null,
        emotion:      emAns ? surveyRef.emotions.find(e => e.id === parseInt(emAns.value))?.label  : null,
        emotion_note: eLog?.note || null,
        score,
      };
    });

    // SOS
    const sosFormatted = sos.map(ev => ({
      time:         fmt(ev.created_at),
      stomach:      ev.stomach_state_id ? surveyRef.stomachs.find(s => s.id === ev.stomach_state_id)?.label : null,
      emotion:      ev.emotion_type_id  ? surveyRef.emotions.find(e => e.id === ev.emotion_type_id)?.label  : null,
      emotion_note: ev.emotion_note || null,
      score_delta:  ev.score_delta,
      description:  ev.description || null,
    }));

    // Сводка эмоций за день
    const emotionCounts = {};
    [...emoLogs, ...sos.filter(s => s.emotion_type_id)].forEach(e => {
      const label = surveyRef.emotions.find(em => em.id === e.emotion_type_id)?.label;
      if (label) emotionCounts[label] = (emotionCounts[label] || 0) + 1;
    });

    const mealFmt = (type) => {
      const m = meals.find(r => r.meal_type === type);
      if (!m) return null;
      return { quality: m.quality, description: m.description || null,
               hunger_before: m.hunger_before, hunger_after: m.hunger_after };
    };

    return {
      date,
      score_final:   scores.length ? scores[scores.length - 1].value : null,
      score_history: scores.map(s => ({ time: fmt(s.created_at), value: s.value, source: s.source })),
      sleep,
      toilet:        acts.some(a => a.activity_type === 'toilet'),
      work_done:     acts.some(a => a.activity_type === 'work'),
      activity: {
        warmup:  acts.some(a => a.activity_type === 'warmup'),
        workout: acts.some(a => a.activity_type === 'workout'),
        walk:    acts.some(a => a.activity_type === 'walk'),
      },
      meals: { breakfast: mealFmt('breakfast'), lunch: mealFmt('lunch'), dinner: mealFmt('dinner') },
      water_glasses: water,
      checkins,
      sos_events:    sosFormatted,
      emotions:      Object.entries(emotionCounts).map(([emotion, count]) => ({ emotion, count })),
      mini_goals:    goals.map(g => ({ text: g.text, done: g.is_done })),
      journal:       journal.map(j => ({
        time:   fmt(j.created_at),
        source: j.source,
        text:   j.text,
      })),
      tasks: tasks.map(t => ({
        name:     t.tool?.name || t.custom_name || '—',
        type:     t.tool?.tool_type || null,
        done:     t.is_complete,
      })),
    };
  });

  // Сводка за неделю
  const scored = days.filter(d => d.score_final !== null);
  const allEmo = {};
  days.flatMap(d => d.emotions).forEach(e => {
    allEmo[e.emotion] = (allEmo[e.emotion] || 0) + e.count;
  });
  const topEmotion = Object.entries(allEmo).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  return {
    period:      `${from} — ${to}`,
    exported_at: new Date().toISOString(),
    cycle_current: todayCycleLabel || null,
    summary: {
      avg_score:        scored.length ? Math.round(scored.reduce((s, d) => s + d.score_final, 0) / scored.length) : null,
      max_score:        scored.length ? Math.max(...scored.map(d => d.score_final)) : null,
      min_score:        scored.length ? Math.min(...scored.map(d => d.score_final)) : null,
      dominant_emotion: topEmotion,
      workout_days:     days.filter(d => d.activity.workout).length,
      avg_water:        days.length ? Math.round(days.reduce((s, d) => s + d.water_glasses, 0) / days.length * 10) / 10 : 0,
      sos_count:        days.reduce((s, d) => s + d.sos_events.length, 0),
      tasks_total:      days.reduce((s, d) => s + d.tasks.length, 0),
      tasks_done:       days.reduce((s, d) => s + d.tasks.filter(t => t.done).length, 0),
      journal_entries:  days.reduce((s, d) => s + d.journal.length, 0),
    },
    days,
  };
}
