// ── РАЗБОР СЧЁТА ─────────────────────────────────────────

async function showBreakdown() {
  if (todayScore === null) return;
  const el = document.getElementById('breakdown-overlay');
  el.style.display = 'flex';
  document.getElementById('breakdown-body').innerHTML =
    '<div class="empty-state" style="margin-top:60px;">Считаю...</div>';

  const today = todayKey();

  const { data: sessions } = await sb.from('daily_survey_sessions')
    .select('id').eq('user_id', currentUser.id).eq('date', today);

  if (!sessions?.length) {
    document.getElementById('breakdown-body').innerHTML =
      '<div class="empty-state" style="margin-top:60px;">Нет данных за сегодня</div>';
    return;
  }

  const sIds = sessions.map(s => s.id);

  const [ansRes, periodsRes, sleepsRes, stomachsRes, emotionsRes] = await Promise.all([
    sb.from('daily_survey_answers')
      .select('value, answered_at, question:question_id(key, text, type, weight_yes, weight_no, weights_json, ref_table)')
      .in('session_id', sIds).order('answered_at'),
    sb.from('periods').select('id, label, weight'),
    sb.from('sleeps').select('id, label, weight'),
    sb.from('stomach_states').select('id, label, weight'),
    sb.from('emotion_types').select('id, label, weight'),
  ]);

  const ref = {
    periods:        periodsRes.data  || [],
    sleeps:         sleepsRes.data   || [],
    stomach_states: stomachsRes.data || [],
    emotion_types:  emotionsRes.data || [],
  };

  const items = [];

  for (const ans of (ansRes.data || [])) {
    const q = ans.question;
    if (!q) continue;

    let delta = 0;
    let valueLabel = '';

    if (q.type === 'bool') {
      delta      = ans.value === 'true' ? (q.weight_yes || 0) : (q.weight_no || 0);
      valueLabel = ans.value === 'true' ? 'Да' : 'Нет';
    } else if (q.type === 'scale') {
      delta      = (q.weights_json || {})[ans.value] || 0;
      valueLabel = ans.value + '/10';
    } else if (q.type === 'radio' && q.ref_table) {
      const row  = (ref[q.ref_table] || []).find(r => String(r.id) === ans.value);
      delta      = row?.weight || 0;
      valueLabel = row?.label  || ans.value;
    } else {
      continue;
    }

    if (delta === 0) continue;

    items.push({ text: q.text, delta, valueLabel, key: q.key });
  }

  items.sort((a, b) => b.delta - a.delta);

  const zone  = getZone(todayScore);
  const zc    = { green: 'var(--green)', yellow: 'var(--gold)', red: 'var(--red)', catastrophe: 'var(--red)' };
  const color = zc[zone] || 'var(--text)';

  const totalHtml = `
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid var(--border);">
      <div style="font-size:10px;letter-spacing:3px;color:var(--text-faint);text-transform:uppercase;">Счёт сегодня</div>
      <div style="font-family:'Cormorant Garamond',serif;font-size:36px;font-weight:300;color:${color};">${todayScore}</div>
    </div>`;

  const rowsHtml = items.length ? items.map(item => {
    const pos   = item.delta > 0;
    const sign  = pos ? '+' : '';
    const clr   = pos ? 'var(--red)' : 'var(--green)';
    return `<div class="bkd-row">
      <div class="bkd-delta" style="color:${clr};">${sign}${item.delta}</div>
      <div class="bkd-info">
        <div class="bkd-text">${item.text}</div>
        <div class="bkd-val">${item.valueLabel}</div>
      </div>
    </div>`;
  }).join('') : '<div class="empty-state">Нет данных о вкладе факторов</div>';

  const hint = `
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border);font-size:11px;color:var(--text-faint);line-height:1.6;font-family:'Cormorant Garamond',serif;font-style:italic;">
      Красный — факторы которые поднимают стресс.<br>Зелёный — то что его снижает.
    </div>`;

  document.getElementById('breakdown-body').innerHTML = totalHtml + rowsHtml + hint;
}

function closeBreakdown() {
  document.getElementById('breakdown-overlay').style.display = 'none';
}
