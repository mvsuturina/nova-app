// ── ОПРОС 1 (утренний: цикл + сон) ───────────────────────

async function showSurvey() {
  const { data: existing } = await sb.from('daily_survey_sessions')
    .select('id').eq('user_id', currentUser.id)
    .eq('date', todayKey()).eq('survey_id', 1).maybeSingle();
  if (existing) { alert('Утренний опрос уже пройден сегодня'); return; }

  // surveyRef уже загружен в loadUserData — догружаем только что не хватает
  if (!surveyRef?.sleeps?.length || !surveyRef?.stomachs?.length) {
    const [sl, ss, sq] = await Promise.all([
      sb.from('sleeps').select('*').order('id'),
      sb.from('stomach_states').select('*').order('id'),
      sb.from('questions').select('id').eq('key', 'stomach').maybeSingle(),
    ]);
    surveyRef = {
      ...(surveyRef || {}),
      sleeps:     sl.data || [],
      stomachs:   ss.data || [],
      stomachQId: sq.data?.id || surveyRef?.stomachQId || null,
    };
  }

  surveyAns = {};
  selectedTools = [];
  document.querySelector('#survey-screen .chat-title').textContent = 'УТРЕННИЙ ОПРОС';
  setScreen('survey');
  renderSurveyStep();
}

function renderSurveyStep() {
  const { sleeps } = surveyRef;
  document.getElementById('survey-body').innerHTML = `
    <div class="survey-question">
      <div class="survey-q-text">Сколько спала?</div>
      ${sleeps.map(s => `
        <div class="radio-option" id="slp-${s.id}" onclick="pickRadio('sleep',${s.id},'slp')">
          <div class="radio-dot"></div>
          <div class="radio-label">${s.label}</div>
        </div>`).join('')}
    </div>

    <div class="survey-question">
      <div class="survey-q-text">Состояние живота?</div>
      ${surveyRef.stomachs.map(s => `
        <div class="radio-option" id="stm-${s.id}" onclick="pickRadio('stomach',${s.id},'stm')">
          <div class="radio-dot"></div>
          <div class="radio-label">${s.label}</div>
        </div>`).join('')}
    </div>

    <button class="save-btn" id="survey-submit" onclick="submitSurvey()" disabled
            style="margin-top:8px">ГОТОВО →</button>
  `;
}

function pickRadio(key, val, prefix) {
  surveyAns[key] = val;
  document.querySelectorAll(`[id^="${prefix}-"]`).forEach(el => el.classList.remove('selected'));
  document.getElementById(`${prefix}-${val}`).classList.add('selected');
  checkSurveyReady();
}

function checkSurveyReady() {
  const ready = surveyAns.sleep   !== undefined
             && surveyAns.stomach  !== undefined;
  const btn = document.getElementById('survey-submit');
  if (btn) btn.disabled = !ready;
}

async function submitSurvey() {
  const btn = document.getElementById('survey-submit');
  btn.disabled = true; btn.textContent = 'Сохраняю...';

  const today = todayKey();
  const { sleep: sleepId, stomach: stomachId } = surveyAns;
  const sleep      = surveyRef.sleeps.find(s => s.id === sleepId);
  const stomachRow = surveyRef.stomachs.find(s => s.id === stomachId);

  const { data: session } = await sb.from('daily_survey_sessions')
    .insert({ user_id: currentUser.id, survey_id: 1, date: today })
    .select('id').single();

  const answers = [
    { session_id: session.id, question_id: 2, value: String(sleepId) },
  ];
  if (surveyRef.stomachQId && stomachId !== undefined) {
    answers.push({ session_id: session.id, question_id: surveyRef.stomachQId, value: String(stomachId) });
  }
  await sb.from('daily_survey_answers').insert(answers);

  todaySleepWeight = sleep?.weight ?? 0;
  todayDynamic = {
    stomachWeight: stomachRow?.weight ?? 0,
    emotionWeight: todayDynamic.emotionWeight,
    submittedAt:   new Date().toISOString(),
  };

  await recalculateScore('checkin_1');

  document.querySelector('#survey-screen .chat-title').textContent = 'ОПРОС';
  const zone = getZone(todayScore);
  if (zone === 'red' || zone === 'catastrophe') {
    await showToolSelection(session.id, 1);
  } else {
    showHome();
  }
}

// ── ЧЕКИНЫ 2–6 (живот + эмоции) ──────────────────────────

async function _openSurvey(surveyId) {
  const { data: existing } = await sb.from('daily_survey_sessions')
    .select('id').eq('user_id', currentUser.id)
    .eq('date', todayKey()).eq('survey_id', surveyId).maybeSingle();
  if (existing) { alert('Чекин уже пройден сегодня'); return; }

  // Убеждаемся что справочники загружены
  if (!surveyRef?.stomachs?.length) {
    const [ss, et, sq, eq] = await Promise.all([
      sb.from('stomach_states').select('*').order('id'),
      sb.from('emotion_types').select('*').order('id'),
      sb.from('questions').select('id').eq('key', 'stomach').maybeSingle(),
      sb.from('questions').select('id').eq('key', 'emotion').maybeSingle(),
    ]);
    surveyRef = {
      ...(surveyRef || {}),
      stomachs:   ss.data || [],
      emotions:   et.data || [],
      stomachQId: sq.data?.id || null,
      emotionQId: eq.data?.id || null,
    };
  }

  survey2Ans = {};
  s2SurveyId = surveyId;
  document.querySelector('#survey-screen .chat-title').textContent = 'ЧЕКИН';
  setScreen('survey');
  renderCheckinStep();
}

function renderCheckinStep() {
  const { stomachs, emotions } = surveyRef;

  document.getElementById('survey-body').innerHTML = `
    <div class="survey-question">
      <div class="survey-q-text">Состояние живота?</div>
      ${stomachs.map(s => `
        <div class="radio-option" id="chk-stm-${s.id}" onclick="pickCheckinStomach(${s.id})">
          <div class="radio-dot"></div>
          <div class="radio-label">${s.label}</div>
        </div>`).join('')}
    </div>

    <div class="survey-question">
      <div class="survey-q-text">Эмоции?</div>
      ${emotions.map(e => `
        <div class="radio-option" id="chk-emo-${e.id}" onclick="pickCheckinEmotion(${e.id})">
          <div class="radio-dot"></div>
          <div class="radio-label">${e.label}</div>
        </div>`).join('')}
      <textarea id="chk-emo-note" placeholder="Можешь написать подробнее..." rows="2"
        style="width:100%;margin-top:10px;background:var(--bg2);border:1px solid var(--border);
               border-radius:10px;padding:10px 12px;color:var(--text);font-family:'Jost',sans-serif;
               font-size:14px;resize:none;box-sizing:border-box;"
        oninput="survey2Ans.emotion_note=this.value"></textarea>
    </div>

    <button class="save-btn" id="survey2-submit" onclick="_submitCheckin(${s2SurveyId})" disabled
            style="margin-top:8px">ГОТОВО →</button>
  `;
}

function pickCheckinStomach(id) {
  survey2Ans.stomach = id;
  document.querySelectorAll('[id^="chk-stm-"]').forEach(el => el.classList.remove('selected'));
  document.getElementById('chk-stm-' + id).classList.add('selected');
  checkCheckinReady();
}

function pickCheckinEmotion(id) {
  survey2Ans.emotion = id;
  document.querySelectorAll('[id^="chk-emo-"]').forEach(el => el.classList.remove('selected'));
  document.getElementById('chk-emo-' + id).classList.add('selected');
  checkCheckinReady();
}

function checkCheckinReady() {
  const ready = survey2Ans.stomach !== undefined && survey2Ans.emotion !== undefined;
  const btn = document.getElementById('survey2-submit');
  if (btn) btn.disabled = !ready;
}

async function _submitCheckin(surveyId) {
  const btn = document.getElementById('survey2-submit');
  btn.disabled = true; btn.textContent = 'Сохраняю...';

  const today = todayKey();
  const { stomach, emotion, emotion_note } = survey2Ans;

  const { data: session } = await sb.from('daily_survey_sessions')
    .insert({ user_id: currentUser.id, survey_id: surveyId, date: today })
    .select('id').single();

  const answers = [];
  if (surveyRef.stomachQId && stomach !== undefined) {
    answers.push({ session_id: session.id, question_id: surveyRef.stomachQId, value: String(stomach) });
  }
  if (surveyRef.emotionQId && emotion !== undefined) {
    answers.push({ session_id: session.id, question_id: surveyRef.emotionQId, value: String(emotion) });
  }
  if (answers.length) await sb.from('daily_survey_answers').insert(answers);

  if (emotion !== undefined && emotion_note?.trim()) {
    await sb.from('emotion_log').insert({
      user_id: currentUser.id, date: today,
      emotion_type_id: emotion,
      note: emotion_note,
      session_id: session.id,
    });
  }

  const stomachRow = surveyRef.stomachs.find(s => s.id === stomach);
  const emotionRow = surveyRef.emotions.find(e => e.id === emotion);

  todayDynamic = {
    stomachWeight: stomachRow?.weight ?? 0,
    emotionWeight: emotionRow?.weight ?? 0,
    submittedAt:   new Date().toISOString(),
  };

  if (surveyId === 2) todaySurvey2Done = true;
  if (surveyId === 3) todaySurvey3Done = true;
  if (surveyId === 4) todaySurvey4Done = true;
  if (surveyId === 5) todaySurvey5Done = true;
  if (surveyId === 6) todaySurvey6Done = true;

  await recalculateScore('checkin_' + surveyId);

  document.querySelector('#survey-screen .chat-title').textContent = 'ОПРОС';
  const zone = getZone(todayScore);
  if (zone === 'red' || zone === 'catastrophe') {
    await showToolSelection(session.id, surveyId);
  } else {
    showHome();
  }
}

function showSurvey2() { return _openSurvey(2); }
function showSurvey3() { return _openSurvey(3); }
function showSurvey4() { return _openSurvey(4); }
function showSurvey5() { return _openSurvey(5); }
function showSurvey6() { return _openSurvey(6); }

// ── ВЫБОР ПРАКТИК ─────────────────────────────────────────

async function showToolSelection(sessionId, surveyId) {
  document.querySelector('#survey-screen .chat-title').textContent = 'ПРАКТИКИ';
  const body = document.getElementById('survey-body');
  body.innerHTML = '<div class="empty-state">Загружаю практики...</div>';

  const { data: links } = await sb.from('survey_tools')
    .select('tool:tool_id(id, name, duration_min, weight)')
    .eq('survey_id', surveyId)
    .order('tool_id');
  const tools = (links || []).map(l => l.tool);

  selectedTools = [];
  const zone      = getZone(todayScore);
  const zoneColor = { green:'var(--green)', yellow:'var(--gold)', red:'var(--red)', catastrophe:'var(--red)' }[zone];

  body.innerHTML = `
    <div style="margin-bottom:28px;">
      <div style="font-family:'Cormorant Garamond',serif;font-size:60px;font-weight:300;line-height:1;
                  color:${zoneColor};margin-bottom:4px;">${todayScore}</div>
      <div style="font-size:10px;letter-spacing:3px;color:var(--text-faint);margin-bottom:6px;">СТАКАН СОСТОЯНИЯ</div>
      <div style="font-size:14px;letter-spacing:2px;text-transform:uppercase;font-weight:500;
                  color:${zoneColor};margin-bottom:12px;">${ZONE_LABELS[zone]}</div>
      <div style="font-size:16px;color:var(--text-dim);line-height:1.5;
                  font-family:'Cormorant Garamond',serif;">${ZONE_DESCS[zone]}</div>
    </div>
    <div class="section-label">ВЫБЕРИ ПРАКТИКИ ДЛЯ СНИЖЕНИЯ НАПРЯЖЕНИЯ</div>
    ${tools.map(t => `
      <div class="tool-option" id="tool-${t.id}" onclick="toggleTool(${t.id})">
        <div class="tool-check" id="toolchk-${t.id}"></div>
        <div class="tool-name">${t.name}</div>
        <div class="tool-dur">${t.duration_min} мин</div>
      </div>`).join('')}
    <button class="save-btn" onclick="saveToolsAndGoHome(${sessionId})"
            style="margin-top:16px">ДОБАВИТЬ В ДЕНЬ →</button>
    <button onclick="showHome()"
            style="background:none;border:none;color:var(--text-faint);font-size:13px;
                   font-family:'Jost',sans-serif;display:block;margin:14px auto 0;
                   cursor:pointer;padding:8px;letter-spacing:1px;">
      пропустить
    </button>
  `;
}

function toggleTool(id) {
  const idx = selectedTools.indexOf(id);
  if (idx === -1) selectedTools.push(id);
  else selectedTools.splice(idx, 1);
  document.getElementById(`tool-${id}`).classList.toggle('selected', selectedTools.includes(id));
  document.getElementById(`toolchk-${id}`).textContent = selectedTools.includes(id) ? '✓' : '';
}

async function saveToolsAndGoHome(sessionId) {
  if (selectedTools.length > 0) {
    const today = todayKey();
    await sb.from('daily_tasks').insert(
      selectedTools.map(toolId => ({
        user_id:    currentUser.id,
        tool_id:    toolId,
        session_id: sessionId,
        date:       today,
      }))
    );
    const { data: td } = await sb.from('daily_tasks')
      .select('id, is_complete, custom_name, tool:tool_id(name, duration_min, weight, tool_type)')
      .eq('user_id', currentUser.id).eq('date', todayKey()).order('created_at');
    dailyTasks = td || [];
  }
  document.querySelector('#survey-screen .chat-title').textContent = 'ОПРОС';
  showHome();
}
