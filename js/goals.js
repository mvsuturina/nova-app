// Экран «План дня» — отдельный модуль, не участвует в скоре стресса.
// Данные пишет также Telegram-бот (bot/) через service role key — обе стороны
// работают с одними и теми же таблицами goal_plans/goal_plan_tasks напрямую,
// без отдельной синхронизации.

let goalPlanTasks = [];
let goalPlanFocus = null;

function showGoalPlan() {
  document.getElementById('goal-plan-overlay').style.display = 'flex';
  loadGoalPlan();
}

function closeGoalPlan() {
  document.getElementById('goal-plan-overlay').style.display = 'none';
}

async function loadGoalPlan() {
  const body = document.getElementById('goal-plan-body');
  body.innerHTML = '<div class="empty-state">Загрузка…</div>';

  const { data: plan, error: planErr } = await sb
    .from('goal_plans')
    .select('id, focus')
    .eq('user_id', currentUser.id)
    .eq('date', todayKey())
    .maybeSingle();

  if (planErr || !plan) {
    goalPlanTasks = [];
    goalPlanFocus = null;
    body.innerHTML = '<div class="empty-state">План на сегодня ещё не загружен</div>';
    return;
  }

  const { data: tasks, error: tasksErr } = await sb
    .from('goal_plan_tasks')
    .select('id, time, title, priority, status, goals(name)')
    .eq('plan_id', plan.id)
    .order('priority', { ascending: true });

  if (tasksErr) {
    body.innerHTML = '<div class="empty-state">Не удалось загрузить план</div>';
    return;
  }

  goalPlanFocus = plan.focus;
  goalPlanTasks = tasks || [];
  renderGoalPlan();
}

function renderGoalPlan() {
  const body = document.getElementById('goal-plan-body');

  if (!goalPlanTasks.length) {
    body.innerHTML = '<div class="empty-state">План на сегодня пуст</div>';
    return;
  }

  const focusHtml = goalPlanFocus
    ? `<div style="font-family:'Cormorant Garamond',serif;font-size:16px;color:var(--text-dim);margin-bottom:18px;font-style:italic;">${goalPlanFocus}</div>`
    : '';

  const rows = goalPlanTasks.map(t => {
    const done = t.status === 'done';
    const time = t.time ? t.time.slice(0, 5) + ' — ' : '';
    const goal = t.goals?.name ? `<span style="color:var(--text-faint);font-size:11px;"> · ${t.goals.name}</span>` : '';
    return `
      <div class="task-row${done ? ' done' : ''}" onclick="toggleGoalPlanTask(${t.id})" style="cursor:pointer;margin-bottom:8px;">
        <div class="task-check ${done ? 'checked' : ''}">${done ? '✓' : ''}</div>
        <div class="task-text">[${t.priority}] ${time}${t.title}${goal}</div>
      </div>`;
  }).join('');

  body.innerHTML = focusHtml + rows;
}

async function toggleGoalPlanTask(id) {
  const task = goalPlanTasks.find(t => t.id === id);
  if (!task) return;

  const prevStatus = task.status;
  task.status = prevStatus === 'done' ? 'pending' : 'done';
  renderGoalPlan();

  // reminded_at сознательно не трогаем — эта отметка только для планировщика бота.
  const { error } = await sb.from('goal_plan_tasks').update({ status: task.status }).eq('id', id);
  if (error) {
    task.status = prevStatus;
    renderGoalPlan();
  }
}
