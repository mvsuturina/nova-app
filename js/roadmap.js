// Экран «Цели» — карточки долгосрочных целей + прогресс за неделю/месяц.
// Не участвует в скоре стресса, только читает goals/goal_plans/goal_plan_tasks.

const ROADMAP_STATUS_LABEL = { active: 'Активна', experiment: 'Эксперимент', paused: 'На паузе', done: 'Завершена' };

function showRoadmap() {
  document.getElementById('roadmap-overlay').style.display = 'flex';
  loadRoadmap();
}

function closeRoadmap() {
  document.getElementById('roadmap-overlay').style.display = 'none';
}

function roadmapDaysAgoKey(n) {
  const [y, m, d] = todayKey().split('-').map(Number);
  const t = new Date(y, m - 1, d - n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

function roadmapFormatMinutes(minutes) {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h > 0 ? h + 'ч ' : ''}${m}м`;
}

async function loadRoadmap() {
  const body = document.getElementById('roadmap-body');
  body.innerHTML = '<div class="empty-state">Загрузка…</div>';

  const { data: goals, error: goalsErr } = await sb
    .from('goals')
    .select('id, name, status, deadline')
    .eq('user_id', currentUser.id)
    .order('status');

  if (goalsErr) {
    body.innerHTML = '<div class="empty-state">Не удалось загрузить цели</div>';
    return;
  }
  if (!goals?.length) {
    body.innerHTML = '<div class="empty-state">Целей пока нет</div>';
    return;
  }

  const monthFrom = roadmapDaysAgoKey(29);
  const weekFrom = roadmapDaysAgoKey(6);
  const today = todayKey();

  const stats = new Map(goals.map(g => [g.id, {
    week: { done: 0, total: 0, minutes: 0 },
    month: { done: 0, total: 0, minutes: 0 },
  }]));

  const { data: plans } = await sb
    .from('goal_plans')
    .select('id, date')
    .eq('user_id', currentUser.id)
    .gte('date', monthFrom)
    .lte('date', today);

  if (plans?.length) {
    const planDateById = new Map(plans.map(p => [p.id, p.date]));

    const { data: tasks } = await sb
      .from('goal_plan_tasks')
      .select('plan_id, status, duration_minutes, goal_id')
      .in('plan_id', plans.map(p => p.id))
      .not('goal_id', 'is', null);

    for (const t of tasks || []) {
      const s = stats.get(t.goal_id);
      if (!s) continue; // задача ссылается на цель, которой уже нет в списке (удалена/чужая)

      const inWeek = planDateById.get(t.plan_id) >= weekFrom;
      s.month.total += 1;
      if (inWeek) s.week.total += 1;

      if (t.status === 'done') {
        s.month.done += 1;
        s.month.minutes += t.duration_minutes || 0;
        if (inWeek) {
          s.week.done += 1;
          s.week.minutes += t.duration_minutes || 0;
        }
      }
    }
  }

  renderRoadmap(goals, stats);
}

function renderRoadmap(goals, stats) {
  const body = document.getElementById('roadmap-body');

  body.innerHTML = goals.map(g => {
    const s = stats.get(g.id);
    const weekDur = roadmapFormatMinutes(s.week.minutes);
    const monthDur = roadmapFormatMinutes(s.month.minutes);
    const deadline = g.deadline
      ? `<div style="font-size:11px;color:var(--text-faint);margin-top:2px;">до ${g.deadline}</div>`
      : '';

    return `
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:16px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
          <div style="font-family:'Cormorant Garamond',serif;font-size:18px;color:var(--text);font-weight:300;">${g.name}</div>
          <div style="font-size:10px;letter-spacing:1px;color:var(--purple-light);border:1px solid var(--border);border-radius:8px;padding:2px 8px;white-space:nowrap;">${ROADMAP_STATUS_LABEL[g.status] ?? g.status}</div>
        </div>
        ${deadline}
        <div style="display:flex;gap:18px;margin-top:12px;font-size:12px;color:var(--text-dim);">
          <div>Неделя: ${s.week.done}/${s.week.total}${weekDur ? ', ' + weekDur : ''}</div>
          <div>Месяц: ${s.month.done}/${s.month.total}${monthDur ? ', ' + monthDur : ''}</div>
        </div>
      </div>`;
  }).join('');
}
