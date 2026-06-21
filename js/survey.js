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
  document.querySelector('#survey-screen .chat-title').textContent = 'НАЧАЛО';
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

  // Добавляем опрос 1 в историю чекинов (coeff=0, не влияет на скор напрямую,
  // но todayDynamic нужен для корректного определения последнего состояния живота)
  const s1Checkin = { stomachWeight: stomachRow?.weight ?? 0, emotionWeight: 0, surveyId: 1 };
  todayCheckins = [s1Checkin, ...todayCheckins.filter(c => c.surveyId !== 1)];
  todayDynamic  = s1Checkin;

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

  survey2Ans      = {};
  s2SurveyId      = surveyId;
  s2TomorrowGoals = [];
  const SURVEY_TITLES = { 2: 'ЧЕКАП 7:00', 3: 'ЧЕКАП 10:00', 4: 'ЧЕКАП 13:00', 5: 'ЧЕКАП 16:00', 6: 'РЕФЛЕКСИЯ ДНЯ' };
  document.querySelector('#survey-screen .chat-title').textContent = SURVEY_TITLES[surveyId] || 'ЧЕКАП';
  setScreen('survey');
  renderCheckinStep();
}

const _textareaStyle = `width:100%;margin-top:10px;background:var(--bg2);border:1px solid var(--border);
  border-radius:10px;padding:10px 12px;color:var(--text);font-family:'Jost',sans-serif;
  font-size:14px;resize:none;box-sizing:border-box;`;

function renderCheckinStep() {
  const { stomachs, emotions } = surveyRef;
  const isEvening = s2SurveyId === 6;

  const eveningBlock = isEvening ? `
    <div class="survey-question">
      <div class="survey-q-text">Что получилось сегодня?</div>
      <textarea id="eve-well" rows="2" placeholder="Любая мелочь считается..." style="${_textareaStyle}"
        oninput="survey2Ans.eveningWell=this.value"></textarea>
    </div>
    <div class="survey-question">
      <div class="survey-q-text">Что не получилось?</div>
      <textarea id="eve-bad" rows="2" placeholder="Без осуждения, просто факт..." style="${_textareaStyle}"
        oninput="survey2Ans.eveningBad=this.value"></textarea>
    </div>
    <div class="survey-question">
      <div class="survey-q-text">Мини-цели на завтра</div>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <input id="eve-goal-input" type="text" placeholder="Добавить цель..."
          style="flex:1;background:var(--bg2);border:1px solid var(--border);border-radius:10px;
                 padding:10px 12px;color:var(--text);font-family:'Jost',sans-serif;font-size:14px;
                 box-sizing:border-box;"
          onkeydown="if(event.key==='Enter'){event.preventDefault();addTomorrowGoal();}">
        <button onclick="addTomorrowGoal()"
                style="background:var(--purple);border:none;border-radius:10px;padding:10px 16px;
                       color:white;font-family:'Jost',sans-serif;font-size:18px;cursor:pointer;">+</button>
      </div>
      <div id="eve-goals-list" style="margin-top:8px;"></div>
    </div>` : '';

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
        style="${_textareaStyle}"
        oninput="survey2Ans.emotion_note=this.value"></textarea>
    </div>

    ${eveningBlock}

    <button class="save-btn" id="survey2-submit" onclick="_submitCheckin(${s2SurveyId})" disabled
            style="margin-top:8px">ГОТОВО →</button>
  `;
}

function addTomorrowGoal() {
  const input = document.getElementById('eve-goal-input');
  const text = input.value.trim();
  if (!text) return;
  s2TomorrowGoals.push(text);
  input.value = '';
  renderTomorrowGoals();
}

function removeTomorrowGoal(idx) {
  s2TomorrowGoals.splice(idx, 1);
  renderTomorrowGoals();
}

function renderTomorrowGoals() {
  const list = document.getElementById('eve-goals-list');
  if (!list) return;
  list.innerHTML = s2TomorrowGoals.map((g, i) => `
    <div style="display:flex;align-items:center;justify-content:space-between;
                padding:8px 12px;background:var(--bg3);border-radius:8px;margin-bottom:6px;">
      <span style="font-size:14px;color:var(--text);">${g}</span>
      <button onclick="removeTomorrowGoal(${i})"
              style="background:none;border:none;color:var(--text-faint);cursor:pointer;
                     font-size:16px;padding:0 4px;">×</button>
    </div>`).join('');
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

  // Сохраняем эмоцию и заметку в emotion_log (note + session_id + emotion_type_id)
  if (emotion !== undefined) {
    await sb.from('emotion_log').insert({
      user_id:         currentUser.id,
      date:            today,
      emotion_type_id: emotion,
      note:            emotion_note?.trim() || null,
      session_id:      session.id,
    });
  }

  const stomachRow = surveyRef.stomachs.find(s => s.id === stomach);
  const emotionRow = surveyRef.emotions.find(e => e.id === emotion);

  const checkin = {
    stomachWeight: stomachRow?.weight ?? 0,
    emotionWeight: emotionRow?.weight ?? 0,
    surveyId:      surveyId,
  };
  todayCheckins = [...todayCheckins.filter(c => c.surveyId !== surveyId), checkin];
  todayDynamic  = checkin;

  if (surveyId === 6) {
    const { eveningWell, eveningBad } = survey2Ans;
    const reflections = [];
    if (eveningWell?.trim()) reflections.push({ user_id: currentUser.id, date: today, source: 'evening_well', text: eveningWell });
    if (eveningBad?.trim())  reflections.push({ user_id: currentUser.id, date: today, source: 'evening_bad',  text: eveningBad });
    if (reflections.length) await sb.from('journal_entries').insert(reflections);

    if (s2TomorrowGoals.length) {
      await sb.from('mini_goals').insert(
        s2TomorrowGoals.map(text => ({ user_id: currentUser.id, date: tomorrowKey(), text, is_done: false }))
      );
    }
  }

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

// ── SOS (внеплановый чекин + событие) ────────────────────

let sosAns = {};

async function showSos() {
  if (!surveyRef?.stomachs?.length || !surveyRef?.emotions?.length) {
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
      stomachQId: sq.data?.id || surveyRef?.stomachQId || null,
      emotionQId: eq.data?.id || surveyRef?.emotionQId || null,
    };
  }
  sosAns = { score_delta: 0 };
  renderSosOverlay();
  document.getElementById('sos-overlay').style.display = 'flex';
}

function closeSos() {
  document.getElementById('sos-overlay').style.display = 'none';
}

function renderSosOverlay() {
  const { stomachs, emotions } = surveyRef;
  document.getElementById('sos-body').innerHTML = `
    <div class="survey-question">
      <div class="survey-q-text">Состояние живота? <span style="font-size:11px;color:var(--text-faint);letter-spacing:0;">(необязательно)</span></div>
      ${stomachs.map(s => `
        <div class="radio-option" id="sos-stm-${s.id}" onclick="pickSosStomach(${s.id})">
          <div class="radio-dot"></div>
          <div class="radio-label">${s.label}</div>
        </div>`).join('')}
    </div>

    <div class="survey-question">
      <div class="survey-q-text">Эмоция прямо сейчас? <span style="font-size:11px;color:var(--text-faint);letter-spacing:0;">(необязательно)</span></div>
      ${emotions.map(e => `
        <div class="radio-option" id="sos-emo-${e.id}" onclick="pickSosEmotion(${e.id})">
          <div class="radio-dot"></div>
          <div class="radio-label">${e.label}</div>
        </div>`).join('')}
      <textarea id="sos-emo-note" placeholder="Подробнее..." rows="2"
        style="${_textareaStyle}"
        oninput="sosAns.emotion_note=this.value"></textarea>
    </div>

    <div class="survey-question">
      <div class="survey-q-text">Событие <span style="font-size:11px;color:var(--text-faint);letter-spacing:0;">(необязательно)</span></div>
      <div style="margin-top:8px;">
        <div style="font-size:10px;color:var(--text-faint);letter-spacing:2px;margin-bottom:8px;">ВЛИЯНИЕ НА СТРЕСС · положительное = больше стресса</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
          ${[-20, -10, 0, 10, 20, 30].map(v => `
            <button data-sos-delta="${v}" onclick="pickSosDelta(${v})"
                    style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;
                           padding:7px 11px;color:${v > 0 ? 'var(--red)' : v < 0 ? 'var(--green)' : 'var(--text-faint)'};
                           font-family:'Jost',sans-serif;font-size:13px;cursor:pointer;
                           ${v === 0 ? 'outline:2px solid var(--purple);outline-offset:2px;' : ''}"
            >${v > 0 ? '+' : ''}${v}</button>`).join('')}
        </div>
        <input id="sos-delta-input" type="number" value="0"
               style="width:100%;background:var(--bg2);border:1px solid var(--border);border-radius:10px;
                      padding:10px 12px;color:var(--text);font-family:'Jost',sans-serif;font-size:14px;
                      box-sizing:border-box;"
               oninput="sosAns.score_delta=parseInt(this.value)||0;_clearSosDeltaChips();_checkSosReady()">
      </div>
      <textarea id="sos-description" placeholder="Что произошло?" rows="3"
        style="${_textareaStyle};margin-top:10px;"
        oninput="sosAns.description=this.value;_checkSosReady()"></textarea>
    </div>

    <button class="save-btn" id="sos-submit" onclick="_submitSos()" disabled
            style="margin-top:8px;">ЗАФИКСИРОВАТЬ →</button>
  `;
}

function pickSosStomach(id) {
  sosAns.stomach = id;
  document.querySelectorAll('[id^="sos-stm-"]').forEach(el => el.classList.remove('selected'));
  document.getElementById('sos-stm-' + id).classList.add('selected');
  _checkSosReady();
}

function pickSosEmotion(id) {
  sosAns.emotion = id;
  document.querySelectorAll('[id^="sos-emo-"]').forEach(el => el.classList.remove('selected'));
  document.getElementById('sos-emo-' + id).classList.add('selected');
  _checkSosReady();
}

function pickSosDelta(val) {
  sosAns.score_delta = val;
  _clearSosDeltaChips();
  const chip = document.querySelector(`[data-sos-delta="${val}"]`);
  if (chip) chip.style.outline = '2px solid var(--purple)';
  const inp = document.getElementById('sos-delta-input');
  if (inp) inp.value = val;
  _checkSosReady();
}

function _clearSosDeltaChips() {
  document.querySelectorAll('[data-sos-delta]').forEach(el => el.style.outline = 'none');
}

function _checkSosReady() {
  const hasStomach  = sosAns.stomach !== undefined;
  const hasEmotion  = sosAns.emotion !== undefined;
  const hasDelta    = (sosAns.score_delta ?? 0) !== 0;
  const hasDesc     = !!sosAns.description?.trim();
  const ready = hasStomach || hasEmotion || hasDelta || hasDesc;
  const btn = document.getElementById('sos-submit');
  if (btn) btn.disabled = !ready;
}

async function _submitSos() {
  const btn = document.getElementById('sos-submit');
  btn.disabled = true; btn.textContent = 'Сохраняю...';

  try {
    const today = todayKey();
    const { stomach, emotion, emotion_note, score_delta, description } = sosAns;
    const delta = score_delta ?? 0;

    // SOS хранится целиком в sos_events — без daily_survey_sessions (нет FK-конфликта)
    const { error } = await sb.from('sos_events').insert({
      user_id:          currentUser.id,
      date:             today,
      stomach_state_id: stomach   || null,
      emotion_type_id:  emotion   || null,
      emotion_note:     emotion_note?.trim()  || null,
      score_delta:      delta,
      description:      description?.trim()   || null,
    });
    if (error) throw error;

    const stomachRow = surveyRef.stomachs.find(s => s.id === stomach);
    const emotionRow = surveyRef.emotions.find(e => e.id === emotion);

    const checkin = {
      stomachWeight: stomachRow?.weight ?? 0,
      emotionWeight: emotionRow?.weight ?? 0,
      surveyId: 7,
    };
    todayCheckins    = [...todayCheckins, checkin];
    todayDynamic     = checkin;
    todayEventDeltas = [...todayEventDeltas, { delta, description: description?.trim() || null }];

    await recalculateScore('sos');
    closeSos();
    renderHome();
  } catch (err) {
    console.error('SOS submit error:', err);
    btn.disabled  = false;
    btn.textContent = 'ЗАФИКСИРОВАТЬ →';
  }
}
