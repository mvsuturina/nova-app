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

  const zone = getZone(todayScore);
  const pct  = Math.min(100, todayScore);

  valueEl.textContent = todayScore;
  valueEl.className   = `score-value ${zone}`;
  fillEl.style.width  = pct + '%';
  fillEl.className    = `score-fill ${zone}`;
  cardEl.className    = `score-card ${zone}-zone`;
  zoneEl.textContent  = ZONE_LABELS[zone];
  zoneEl.className    = `score-zone ${zone}`;
  document.getElementById('score-desc').textContent = ZONE_DESCS[zone];
  const btn = document.getElementById('breakdown-btn');
  if (btn) btn.style.display = 'block';
}

function renderSurveyCta() {
  document.getElementById('survey-cta')?.remove();
  document.getElementById('survey2-cta')?.remove();
  document.getElementById('survey3-cta')?.remove();
  document.getElementById('survey4-cta')?.remove();
  document.getElementById('survey5-cta')?.remove();
  document.getElementById('survey6-cta')?.remove();

  const scroll = document.querySelector('.home-scroll');
  if (!scroll) return;
  const ref = scroll.firstElementChild; // вставляем в самый верх

  // Вставляем по порядку — каждый insertBefore(btn, ref) сдвигает вниз
  if (todayScore === null) {
    const btn = document.createElement('button');
    btn.id = 'survey-cta'; btn.className = 'survey-cta';
    btn.textContent = 'НАЧАТЬ УТРЕННИЙ ОПРОС →';
    btn.onclick = showSurvey;
    ref.parentNode.insertBefore(btn, ref);
  }

  if (!todaySurvey2Done) {
    const btn = document.createElement('button');
    btn.id = 'survey2-cta'; btn.className = 'survey-cta';
    btn.style.background = 'linear-gradient(135deg, #0f3460, #16213e)';
    btn.textContent = 'УТРЕННИЙ ОТЧЁТ →';
    btn.onclick = showSurvey2;
    ref.parentNode.insertBefore(btn, ref);
  }

  if (!todaySurvey3Done) {
    const btn = document.createElement('button');
    btn.id = 'survey3-cta'; btn.className = 'survey-cta';
    btn.style.background = 'linear-gradient(135deg, #0a2030, #071520)';
    btn.textContent = 'ЧЕКИН В 10:00 →';
    btn.onclick = showSurvey3;
    ref.parentNode.insertBefore(btn, ref);
  }

  if (!todaySurvey4Done) {
    const btn = document.createElement('button');
    btn.id = 'survey4-cta'; btn.className = 'survey-cta';
    btn.style.background = 'linear-gradient(135deg, #0a1e30, #060f18)';
    btn.textContent = 'ЧЕКИН В 14:00 →';
    btn.onclick = showSurvey4;
    ref.parentNode.insertBefore(btn, ref);
  }

  if (!todaySurvey5Done) {
    const btn = document.createElement('button');
    btn.id = 'survey5-cta'; btn.className = 'survey-cta';
    btn.style.background = 'linear-gradient(135deg, #0a1830, #050c18)';
    btn.textContent = 'ЧЕКИН В 16:00 →';
    btn.onclick = showSurvey5;
    ref.parentNode.insertBefore(btn, ref);
  }

  if (!todaySurvey6Done) {
    const btn = document.createElement('button');
    btn.id = 'survey6-cta'; btn.className = 'survey-cta';
    btn.style.background = 'linear-gradient(135deg, #1a0a30, #0d0518)';
    btn.textContent = 'ВЕЧЕРНИЙ ОТЧЁТ →';
    btn.onclick = showSurvey6;
    ref.parentNode.insertBefore(btn, ref);
  }
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
  warmup:  { label: 'Разминка',     hint: '15 мин' },
  workout: { label: 'Тренировка',  hint: '60 мин' },
  walk:    { label: 'Прогулка',    hint: 'с подкастом' },
};

function renderTrackers() {
  const container = document.getElementById('trackers-container');
  if (!container) return;

  const meals = ['breakfast', 'lunch', 'dinner'].map(type => {
    const { label, window } = MEAL_WINDOWS[type];
    const done  = todayMeals[type];
    const photo = todayMealPhotos[type];
    const photoStyle = photo ? `background-image:url('${photo}')` : '';
    const delBtn = photo
      ? `<button class="meal-del-btn" onclick="event.stopPropagation();deleteMealPhoto('${type}')">✕</button>`
      : '';
    const photoClick = photo ? `openMealLightbox('${photo}')` : '';
    const photoAreaClick = photo
      ? `onclick="event.stopPropagation();openMealLightbox('${photo}')"`
      : '';
    return `
      <div class="meal-card${done ? ' done' : ''}">
        <div class="meal-card-photo${photo ? ' has-photo' : ''}" style="${photoStyle}" ${photoAreaClick}>
          ${!photo ? '<span class="meal-cam-placeholder">📷</span>' : ''}
          ${delBtn}
          <div class="meal-cam-wrap">
            <label class="meal-cam-label" onclick="event.stopPropagation()">
              <input type="file" accept="image/*" capture="environment" style="display:none"
                     onchange="handleMealPhotoFile('${type}',this)">
              📷
            </label>
          </div>
        </div>
        <div class="meal-card-info" onclick="logMeal('${type}')">
          <div class="meal-slot-icon">${done ? '✓' : '○'}</div>
          <div class="meal-slot-name">${label}</div>
          <div class="meal-slot-window">${window}</div>
        </div>
      </div>`;
  }).join('');

  const dots = Array.from({ length: 8 }, (_, i) =>
    `<div class="water-dot${i < todayWaterCount ? ' filled' : ''}"></div>`
  ).join('');

  const mealCount = [todayMeals.breakfast, todayMeals.lunch, todayMeals.dinner].filter(Boolean).length;
  const actCount  = ['warmup', 'workout', 'walk'].filter(t => todayActivity[t]).length;

  const activities = ['warmup', 'workout', 'walk'].map(type => {
    const { label, hint } = ACTIVITY_SLOTS[type];
    const done = todayActivity[type];
    return `<button class="meal-slot${done ? ' done' : ''}" onclick="logActivity('${type}')" style="flex:1;">
      <div class="meal-slot-icon">${done ? '✓' : '○'}</div>
      <div class="meal-slot-name">${label}</div>
      <div class="meal-slot-window">${hint}</div>
    </button>`;
  }).join('');

  container.innerHTML = `
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

async function logMeal(mealType) {
  const today = todayKey();
  if (todayMeals[mealType]) {
    const { data } = await sb.from('meal_log').select('id')
      .eq('user_id', currentUser.id).eq('date', today).eq('meal_type', mealType)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (data) await sb.from('meal_log').delete().eq('id', data.id);
    todayMeals[mealType]       = false;
    todayMealPhotos[mealType]  = null;
  } else {
    const h = new Date().getHours();
    const inWindow = { breakfast: h >= 6 && h < 8, lunch: h >= 12 && h < 14, dinner: h >= 16 && h < 18 }[mealType] ?? false;
    await sb.from('meal_log').insert({ user_id: currentUser.id, date: today, meal_type: mealType, in_window: inWindow });
    todayMeals[mealType] = true;
  }
  renderTrackers();
}

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
}

async function handleMealPhotoFile(mealType, input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  if (!todayMeals[mealType]) await logMeal(mealType);
  const today = todayKey();
  const path  = `${currentUser.id}/${today}/${mealType}.jpg`;
  const { error } = await sb.storage.from('meal-photos').upload(path, file, { upsert: true });
  if (error) { console.error('photo upload:', error); return; }
  const { data: urlData } = sb.storage.from('meal-photos').getPublicUrl(path);
  const url = urlData.publicUrl;
  await sb.from('meal_log').update({ photo_url: url })
    .eq('user_id', currentUser.id).eq('date', today).eq('meal_type', mealType);
  todayMealPhotos[mealType] = url + '?t=' + Date.now();
  renderTrackers();
}

async function deleteMealPhoto(mealType) {
  const today = todayKey();
  const path  = `${currentUser.id}/${today}/${mealType}.jpg`;
  await sb.storage.from('meal-photos').remove([path]);
  await sb.from('meal_log').update({ photo_url: null })
    .eq('user_id', currentUser.id).eq('date', today).eq('meal_type', mealType);
  todayMealPhotos[mealType] = null;
  renderTrackers();
}

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
      if (!task.is_complete) row.onclick = () => completeTask(task.id, -10);
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
      else if (!isJournal && !task.is_complete) row.onclick = () => completeTask(task.id, task.tool.weight);
    }
    container.appendChild(row);
  });
}

function toggleAddTask() {
  const row = document.getElementById('add-task-row');
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

async function completeTask(taskId, toolWeight) {
  const task = dailyTasks.find(t => t.id === taskId);
  if (!task || task.is_complete) return;

  task.is_complete = true;
  renderDailyTasks();

  await sb.from('daily_tasks').update({
    is_complete: true,
    completed_at: new Date().toISOString()
  }).eq('id', taskId);

  const newValue = Math.max(0, (todayScore ?? 0) + toolWeight);
  await sb.from('daily_scores').insert({
    user_id:   currentUser.id,
    date:      todayKey(),
    value:     newValue,
    task_id:   taskId,
    is_manual: false,
  });
  todayScore = newValue;
  renderScore();
}

function openMealLightbox(url) {
  const lb = document.getElementById('photo-lightbox');
  document.getElementById('photo-lightbox-img').src = url;
  lb.classList.add('open');
}

function closeMealLightbox() {
  document.getElementById('photo-lightbox').classList.remove('open');
}

function updateClock() {
  const now  = new Date();
  const days = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
  const el   = document.getElementById('time-display');
  if (el) el.textContent = days[now.getDay()] + ' · ' + now.toLocaleTimeString('ru', { hour:'2-digit', minute:'2-digit' });
}
