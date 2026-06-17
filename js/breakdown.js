// ── РАЗБОР СЧЁТА ─────────────────────────────────────────

// SOURCE_LABELS использует SURVEY_NAMES из daylog.js для единообразия
const SOURCE_LABELS = {
  checkin_1:   SURVEY_NAMES[1],
  checkin_2:   SURVEY_NAMES[2],
  checkin_3:   SURVEY_NAMES[3],
  checkin_4:   SURVEY_NAMES[4],
  checkin_5:   SURVEY_NAMES[5],
  checkin_6:   SURVEY_NAMES[6],
  cycle_phase:       'Фаза цикла',
  fact_toilet:       'Туалет',
  fact_work:         'Работа',
  activity_warmup:   'Разминка',
  activity_workout:  'Тренировка',
  activity_walk:     'Прогулка',
  meal_breakfast:         'Завтрак',
  meal_lunch:             'Обед',
  meal_dinner:            'Ужин',
  meal_breakfast_removed: 'Завтрак удалён',
  meal_lunch_removed:     'Обед удалён',
  meal_dinner_removed:    'Ужин удалён',
};

function sourceLabel(source) {
  if (!source) return '—';
  if (SOURCE_LABELS[source]) return SOURCE_LABELS[source];
  if (source.startsWith('task_')) return 'Задача выполнена';
  return source;
}

async function showBreakdown() {
  if (todayScore === null) return;
  const el = document.getElementById('breakdown-overlay');
  el.style.display = 'flex';
  document.getElementById('breakdown-body').innerHTML =
    '<div class="empty-state" style="margin-top:60px;">Считаю...</div>';

  const today = todayKey();
  const zone  = getZone(todayScore);
  const zc    = { green: 'var(--green)', yellow: 'var(--gold)', red: 'var(--red)', catastrophe: 'var(--red)' };
  const color = zc[zone] || 'var(--text)';

  // История пересчётов за сегодня
  const { data: history } = await sb.from('daily_scores')
    .select('value, source, created_at')
    .eq('user_id', currentUser.id)
    .eq('date', today)
    .order('created_at', { ascending: true });

  // ── Заголовок ──
  const totalHtml = `
    <div style="display:flex;justify-content:space-between;align-items:baseline;
                margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid var(--border);">
      <div style="font-size:10px;letter-spacing:3px;color:var(--text-faint);text-transform:uppercase;">Счёт сейчас</div>
      <div style="font-family:'Cormorant Garamond',serif;font-size:36px;font-weight:300;color:${color};">${todayScore}</div>
    </div>`;

  // ── История (только строки где скор изменился) ──
  const filteredHistory = (history || []).filter((row, i, arr) =>
    i === 0 || row.value !== arr[i - 1].value
  );

  const historyRows = filteredHistory.map(row => {
    const timeStr = new Date(row.created_at).toLocaleTimeString('ru', {
      timeZone: userTimezone, hour: '2-digit', minute: '2-digit',
    });
    const rz = getZone(row.value);
    const rc = zc[rz] || 'var(--text-dim)';
    return `<div class="bkd-row" style="padding:8px 0;">
      <div style="font-size:11px;color:var(--text-faint);min-width:38px;flex-shrink:0;">${timeStr}</div>
      <div style="font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:300;
                  color:${rc};min-width:44px;text-align:right;flex-shrink:0;">${row.value}</div>
      <div style="flex:1;font-size:12px;color:var(--text-faint);padding-left:12px;">${sourceLabel(row.source)}</div>
    </div>`;
  }).join('');

  const historyHtml = filteredHistory.length
    ? `<div style="height:1px;background:var(--border);margin:20px 0 16px;"></div>
       <div style="font-size:9px;letter-spacing:3px;color:var(--text-faint);text-transform:uppercase;
                   margin-bottom:8px;">ИСТОРИЯ ПЕРЕСЧЁТА СКОРА</div>
       ${historyRows}`
    : '';

  // ── Текущее состояние ──
  const sectionHdr = (text) =>
    `<div style="font-size:9px;letter-spacing:3px;color:var(--text-faint);text-transform:uppercase;
                 margin:14px 0 6px;">${text}</div>`;

  const bkdRow = (delta, label, note) => {
    const pos  = delta > 0;
    const sign = pos ? '+' : '';
    const clr  = pos ? 'var(--red)' : 'var(--green)';
    return `<div class="bkd-row">
      <div class="bkd-delta" style="color:${clr};">${sign}${delta}</div>
      <div class="bkd-info">
        <div class="bkd-text">${label}</div>
        ${note ? `<div class="bkd-val">${note}</div>` : ''}
      </div>
    </div>`;
  };

  let factRows = '';
  if (todayCycleWeight) factRows += bkdRow(todayCycleWeight, 'Цикл', '');
  if (todaySleepWeight) factRows += bkdRow(todaySleepWeight, 'Сон', '');
  factRows += bkdRow(todayToilet ? -20 : 10, 'Туалет', todayToilet ? '✓ сделано' : '✗ не сделано');
  factRows += bkdRow(todayWork   ? -20 : 10, 'Работа', todayWork   ? '✓ сделано' : '✗ не сделано');

  let actRows = '';
  if (todayActivity.warmup)  actRows += bkdRow(-10, 'Разминка',   '✓');
  if (todayActivity.workout) actRows += bkdRow(-30, 'Тренировка', '✓');
  if (todayActivity.walk)    actRows += bkdRow(-10, 'Прогулка',   '✓');

  let mealRows = '';
  const mealLabels = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин' };
  for (const [type, label] of Object.entries(mealLabels)) {
    const m = todayMeals[type];
    if (m.quality === 'plan') mealRows += bkdRow(-10, label, 'по плану');
    else if (m.quality === 'slip') mealRows += bkdRow(+10, label, 'срыв');
  }

  let dynRows = '';
  let dynHdr  = '';
  if (todayCheckins.length > 0) {
    const activeCheckins = todayCheckins.filter(c => getCheckinCoefficient(c.surveyId) > 0);
    if (activeCheckins.length > 0) {
      dynHdr = `<div style="font-size:9px;letter-spacing:3px;color:var(--text-faint);text-transform:uppercase;
                            margin:14px 0 6px;">ДИНАМИКА</div>`;
      // Живот — последнее значение, полный вес
      if (todayDynamic?.surveyId && todayDynamic.stomachWeight) {
        const name = SURVEY_NAMES[todayDynamic.surveyId] || '';
        dynRows += bkdRow(todayDynamic.stomachWeight, 'Живот · ' + name, 'текущее');
      }
      // Эмоции — каждый чекин отдельно, с коэффициентом
      activeCheckins.forEach(c => {
        const coeff = getCheckinCoefficient(c.surveyId);
        const ec = Math.round(c.emotionWeight * coeff);
        if (ec) dynRows += bkdRow(ec, 'Эмоция · ' + (SURVEY_NAMES[c.surveyId] || ''), '×' + coeff);
      });
    }
  }

  let sosRows = '';
  todayEventDeltas.forEach(e => {
    if (e.delta) sosRows += bkdRow(e.delta, 'Событие' + (e.description ? ` · ${e.description.slice(0,30)}${e.description.length > 30 ? '…' : ''}` : ''), '');
  });

  let taskRows = '';
  dailyTasks.filter(t => t.is_complete).forEach(task => {
    const name = task.tool?.name || task.custom_name || 'Задача';
    taskRows += bkdRow(-10, name, '✓ выполнено');
  });

  const hint = `
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border);
                font-size:11px;color:var(--text-faint);line-height:1.6;
                font-family:'Cormorant Garamond',serif;font-style:italic;">
      Красный — факторы которые поднимают стресс.<br>Зелёный — то что его снижает.
    </div>`;

  document.getElementById('breakdown-body').innerHTML =
    totalHtml +
    sectionHdr('ФАКТЫ') + factRows +
    (actRows  ? sectionHdr('АКТИВНОСТЬ') + actRows  : '') +
    (mealRows ? sectionHdr('ЕДА')        + mealRows : '') +
    (dynRows  ? dynHdr + dynRows : '') +
    (sosRows  ? sectionHdr('СОБЫТИЯ SOS') + sosRows : '') +
    (taskRows ? sectionHdr('ЗАДАЧИ') + taskRows : '') +
    hint +
    historyHtml;
}

function closeBreakdown() {
  document.getElementById('breakdown-overlay').style.display = 'none';
}
