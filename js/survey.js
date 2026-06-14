// ── ОПРОС 1 ───────────────────────────────────────────────

async function showSurvey() {
  const { data: existing } = await sb.from('daily_survey_sessions')
    .select('id').eq('user_id', currentUser.id)
    .eq('date', todayKey()).eq('survey_id', 1).maybeSingle();
  if (existing) { alert('Первый опрос уже пройден сегодня'); return; }

  if (!surveyRef) {
    const [pr, sl, tl, hq, ss, sq, et, eq, wq] = await Promise.all([
      sb.from('periods').select('*').order('id'),
      sb.from('sleeps').select('*').order('id'),
      sb.from('toilet_states').select('*').order('id'),
      sb.from('questions').select('id, weights_json').eq('key', 'hunger').maybeSingle(),
      sb.from('stomach_states').select('*').order('id'),
      sb.from('questions').select('id').eq('key', 'stomach').maybeSingle(),
      sb.from('emotion_types').select('*').order('id'),
      sb.from('questions').select('id').eq('key', 'emotion').maybeSingle(),
      sb.from('questions').select('id, weight_yes, weight_no').eq('key', 'warmup').maybeSingle(),
    ]);
    surveyRef = {
      periods:            pr.data || [],
      sleeps:             sl.data || [],
      toilets:            tl.data || [],
      hungerQuestionId:   hq.data?.id || null,
      hungerWeights:      hq.data?.weights_json || {1:60,2:40,3:20,4:0,5:0,6:0,7:0,8:20,9:40,10:60},
      stomachs:           ss.data || [],
      stomachQuestionId:  sq.data?.id || null,
      emotions:           et.data || [],
      emotionQuestionId:  eq.data?.id || null,
      warmupQuestionId:   wq.data?.id || null,
      warmupWeightYes:    wq.data?.weight_yes ?? -10,
      warmupWeightNo:     wq.data?.weight_no  ??   5,
    };
  }

  surveyAns = {};
  selectedTools = [];
  document.querySelector('#survey-screen .chat-title').textContent = 'ОПРОС';
  setScreen('survey');
  renderSurveyStep();
}

function renderSurveyStep() {
  const { periods, sleeps } = surveyRef;
  document.getElementById('survey-body').innerHTML = `
    <div class="survey-question">
      <div class="survey-q-text">День цикла?</div>
      ${periods.map(p => `
        <div class="radio-option" id="cyc-${p.id}" onclick="pickRadio('cycle_phase',${p.id},'cyc')">
          <div class="radio-dot"></div>
          <div class="radio-label">${p.label}</div>
        </div>`).join('')}
    </div>

    <div class="survey-question">
      <div class="survey-q-text">Сколько спала?</div>
      ${sleeps.map(s => `
        <div class="radio-option" id="slp-${s.id}" onclick="pickRadio('sleep',${s.id},'slp')">
          <div class="radio-dot"></div>
          <div class="radio-label">${s.label}</div>
        </div>`).join('')}
    </div>

    <div class="survey-question">
      <div class="survey-q-text">Туалет был?</div>
      <div class="bool-toggle">
        <button class="bool-btn" id="tlt-yes" onclick="pickBool(true)">Да</button>
        <button class="bool-btn" id="tlt-no"  onclick="pickBool(false)">Нет</button>
      </div>
    </div>

    <div class="survey-question">
      <div class="survey-q-text">Зарядка была?</div>
      <div class="bool-toggle">
        <button class="bool-btn" id="wmup-yes" onclick="pickWarmup(true)">Да</button>
        <button class="bool-btn" id="wmup-no"  onclick="pickWarmup(false)">Нет</button>
      </div>
    </div>

    <div class="survey-question">
      <div class="survey-q-text">Голод?
        <span style="font-size:12px;color:var(--text-faint);font-family:'Jost',sans-serif;letter-spacing:0;font-weight:300;">
          &nbsp;1 — очень голодна · 10 — переела
        </span>
      </div>
      <div class="scale-row">
        ${[1,2,3,4,5,6,7,8,9,10].map(v =>
          `<button class="scale-btn" id="hun-${v}" onclick="pickSurvey1Scale(${v})">${v}</button>`
        ).join('')}
      </div>
    </div>

    <div class="survey-question">
      <div class="survey-q-text">Состояние живота?</div>
      ${surveyRef.stomachs.map(s => `
        <div class="radio-option" id="stm-${s.id}" onclick="pickRadio('stomach',${s.id},'stm')">
          <div class="radio-dot"></div>
          <div class="radio-label">${s.label}</div>
        </div>`).join('')}
    </div>

    <div class="survey-question">
      <div class="survey-q-text">Эмоции?</div>
      ${surveyRef.emotions.map(e => `
        <div class="radio-option" id="emo-${e.id}" onclick="pickRadio('emotion',${e.id},'emo')">
          <div class="radio-dot"></div>
          <div class="radio-label">${e.label}</div>
        </div>`).join('')}
      <textarea id="emo-note" placeholder="Можешь написать подробнее..." rows="2"
        style="width:100%;margin-top:10px;background:var(--bg2);border:1px solid var(--border);
               border-radius:10px;padding:10px 12px;color:var(--text);font-family:'Jost',sans-serif;
               font-size:14px;resize:none;box-sizing:border-box;"
        oninput="surveyAns.emotion_note=this.value"></textarea>
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

function pickBool(val) {
  surveyAns.toilet = val;
  document.getElementById('tlt-yes').classList.toggle('selected', val === true);
  document.getElementById('tlt-no').classList.toggle('selected', val === false);
  checkSurveyReady();
}

function pickSurvey1Scale(val) {
  surveyAns.hunger = val;
  document.querySelectorAll('[id^="hun-"]').forEach(el => el.classList.remove('selected'));
  document.getElementById(`hun-${val}`).classList.add('selected');
  checkSurveyReady();
}

function pickWarmup(val) {
  surveyAns.warmup = val;
  document.getElementById('wmup-yes').classList.toggle('selected', val === true);
  document.getElementById('wmup-no').classList.toggle('selected', val === false);
  checkSurveyReady();
}

function checkSurveyReady() {
  const ready = surveyAns.cycle_phase !== undefined
             && surveyAns.sleep       !== undefined
             && surveyAns.toilet      !== undefined
             && surveyAns.warmup      !== undefined
             && surveyAns.hunger      !== undefined
             && surveyAns.stomach     !== undefined
             && surveyAns.emotion     !== undefined;
  const btn = document.getElementById('survey-submit');
  if (btn) btn.disabled = !ready;
}

async function submitSurvey() {
  const btn = document.getElementById('survey-submit');
  btn.disabled = true; btn.textContent = 'Сохраняю...';

  const today = todayKey();
  const { cycle_phase: periodId, sleep: sleepId, toilet, warmup, hunger, stomach: stomachId, emotion: emotionTypeId, emotion_note: emotionNote } = surveyAns;
  const period       = surveyRef.periods.find(p => p.id === periodId);
  const sleep        = surveyRef.sleeps.find(s => s.id === sleepId);
  const toiletRow    = surveyRef.toilets.find(t => t.label === (toilet ? 'yes' : 'no'));
  const hungerDelta  = surveyRef.hungerWeights?.[String(hunger)] ?? 0;
  const stomachRow   = surveyRef.stomachs.find(s => s.id === stomachId);
  const emotionRow   = surveyRef.emotions.find(e => e.id === emotionTypeId);
  const warmupDelta  = warmup ? (surveyRef.warmupWeightYes ?? -10) : (surveyRef.warmupWeightNo ?? 5);
  const score        = Math.max(0, period.weight + sleep.weight + (toiletRow?.weight ?? (toilet ? -10 : 20)) + warmupDelta + hungerDelta + (stomachRow?.weight ?? 0) + (emotionRow?.weight ?? 0));

  const { data: session } = await sb.from('daily_survey_sessions')
    .insert({ user_id: currentUser.id, survey_id: 1, date: today })
    .select('id').single();

  const answers = [
    { session_id: session.id, question_id: 1, value: String(periodId) },
    { session_id: session.id, question_id: 2, value: String(sleepId) },
    { session_id: session.id, question_id: 3, value: String(toilet) },
  ];
  if (surveyRef.warmupQuestionId && warmup !== undefined) {
    answers.push({ session_id: session.id, question_id: surveyRef.warmupQuestionId, value: String(warmup) });
  }
  if (surveyRef.hungerQuestionId && hunger !== undefined) {
    answers.push({ session_id: session.id, question_id: surveyRef.hungerQuestionId, value: String(hunger) });
  }
  if (surveyRef.stomachQuestionId && stomachId !== undefined) {
    answers.push({ session_id: session.id, question_id: surveyRef.stomachQuestionId, value: String(stomachId) });
  }
  if (surveyRef.emotionQuestionId && emotionTypeId !== undefined) {
    answers.push({ session_id: session.id, question_id: surveyRef.emotionQuestionId, value: String(emotionTypeId) });
  }
  await sb.from('daily_survey_answers').insert(answers);

  const { data: scoreRow } = await sb.from('daily_scores')
    .insert({ user_id: currentUser.id, date: today, value: score, session_id: session.id })
    .select('id').single();

  if (warmup === true && !todayActivity.warmup) {
    await sb.from('activity_log').insert({ user_id: currentUser.id, date: today, activity_type: 'warmup' });
    todayActivity.warmup = true;
  }
  if (hunger !== undefined) {
    await sb.from('hunger_log').insert({
      user_id: currentUser.id, date: today, value: hunger, session_id: session.id,
    });
  }
  if (emotionTypeId !== undefined) {
    await sb.from('emotion_log').insert({
      user_id: currentUser.id, date: today,
      emotion_type_id: emotionTypeId,
      note: emotionNote || null,
      session_id: session.id,
    });
  }

  const s1snap = {
    period_id:   periodId,
    sleep_id:    sleepId,
    toilet_log:  [{ time: new Date().toISOString(), value: toilet }],
    workout_log: [],
    water_log:   [],
    work_done:   null,
    stomach_id:      stomachId   ?? null,
    emotion_type_id: emotionTypeId ?? null,
  };
  await sb.from('daily_score_snapshots').insert({ daily_score_id: scoreRow.id, ...s1snap });
  todaySnapshot = s1snap;

  await sb.from('daily_survey_sessions')
    .update({ daily_score_id: scoreRow.id }).eq('id', session.id);

  todayScore = score;

  const zone = getZone(score);
  if (zone === 'red' || zone === 'catastrophe') {
    await showToolSelection(session.id, 1);
  } else {
    showHome();
  }
}

// ── ОПРОСЫ 2+ — общий DB-driven движок ──────────────────────────────────────

async function _openSurvey(surveyId) {
  const { data: existing } = await sb.from('daily_survey_sessions')
    .select('id').eq('user_id', currentUser.id)
    .eq('date', todayKey()).eq('survey_id', surveyId).maybeSingle();
  if (existing) { alert('Опрос уже пройден сегодня'); return; }

  const { data: assignments } = await sb.from('survey_question_assignments')
    .select('skip_if_answered_today, skip_if_value, question:question_id(id, key, text, type, weight_yes, weight_no, weights_json, ref_table)')
    .eq('survey_id', surveyId)
    .order('order_index');

  const skipCandidates = (assignments || []).filter(a => a.skip_if_answered_today);
  const skipIds = skipCandidates.map(a => a.question.id);

  let lastAnswerMap = {};
  if (skipIds.length) {
    const { data: todaySess } = await sb.from('daily_survey_sessions')
      .select('id').eq('user_id', currentUser.id).eq('date', todayKey());
    const sIds = (todaySess || []).map(s => s.id);
    if (sIds.length) {
      const { data: ans } = await sb.from('daily_survey_answers')
        .select('question_id, value')
        .in('session_id', sIds).in('question_id', skipIds)
        .order('answered_at', { ascending: true });
      (ans || []).forEach(a => { lastAnswerMap[a.question_id] = a.value; });
    }
  }

  const [mealRes, waterRes] = await Promise.all([
    sb.from('meal_log').select('meal_type').eq('user_id', currentUser.id).eq('date', todayKey()),
    sb.from('water_log').select('id').eq('user_id', currentUser.id).eq('date', todayKey()),
  ]);
  const externalAnsweredKeys = new Set();
  (mealRes.data || []).forEach(m => externalAnsweredKeys.add(`meal_${m.meal_type}`));
  if ((waterRes.data || []).length > 0) externalAnsweredKeys.add('water');

  s2ActiveQuestions = (assignments || [])
    .filter(a => {
      if (!a.skip_if_answered_today) return true;
      if (externalAnsweredKeys.has(a.question.key)) return false;
      const prev = lastAnswerMap[a.question.id];
      if (prev === undefined) return true;
      if (a.skip_if_value === null || a.skip_if_value === undefined) return false;
      return prev !== a.skip_if_value;
    })
    .map(a => a.question);

  const radioQs = s2ActiveQuestions.filter(q => q.type === 'radio' && q.ref_table);
  if (radioQs.length) {
    const refResults = await Promise.all(
      radioQs.map(q => sb.from(q.ref_table).select('*').order('id'))
    );
    radioQs.forEach((q, i) => { q.refOptions = refResults[i].data || []; });
  }

  survey2Ans    = {};
  survey2Photos = {};
  selectedTools = [];
  s2SurveyId = surveyId;
  document.querySelector('#survey-screen .chat-title').textContent = 'ОТЧЁТ';
  setScreen('survey');
  renderSurvey2Step();
}

function renderSurvey2Step() {
  if (!s2ActiveQuestions.length) {
    document.getElementById('survey-body').innerHTML = `
      <div class="empty-state" style="margin-top:40px;">Все вопросы уже отвечены сегодня</div>
      <button class="save-btn" onclick="showHome()" style="margin-top:16px">НА ГЛАВНУЮ →</button>
    `;
    return;
  }

  // Текстовые вопросы считаются отвеченными по умолчанию (поле опциональное)
  s2ActiveQuestions.forEach(q => {
    if (q.type === 'text' && survey2Ans[q.key] === undefined) survey2Ans[q.key] = '';
  });

  const questionsHtml = s2ActiveQuestions.map(q => {
    if (q.type === 'text') {
      return `<div class="survey-question">
        <div class="survey-q-text">${q.text}</div>
        <textarea rows="3"
          style="width:100%;margin-top:6px;background:var(--bg2);border:1px solid var(--border);
                 border-radius:10px;padding:10px 12px;color:var(--text);font-family:'Jost',sans-serif;
                 font-size:14px;resize:none;box-sizing:border-box;"
          oninput="survey2Ans['${q.key}']=this.value">${survey2Ans[q.key] || ''}</textarea>
      </div>`;
    }
    if (q.type === 'radio' && q.refOptions) {
      const noteField = q.key === 'emotion'
        ? `<textarea placeholder="Можешь написать подробнее..." rows="2"
            style="width:100%;margin-top:10px;background:var(--bg2);border:1px solid var(--border);
                   border-radius:10px;padding:10px 12px;color:var(--text);font-family:'Jost',sans-serif;
                   font-size:14px;resize:none;box-sizing:border-box;"
            oninput="survey2Ans['emotion_note']=this.value"></textarea>`
        : '';
      return `<div class="survey-question">
        <div class="survey-q-text">${q.text}</div>
        ${q.refOptions.map(opt => `
          <div class="radio-option" id="q${q.id}-${opt.id}" onclick="pickS2Radio('${q.key}','q${q.id}',${opt.id})">
            <div class="radio-dot"></div>
            <div class="radio-label">${opt.label}</div>
          </div>`).join('')}
        ${noteField}
      </div>`;
    }
    if (q.type === 'scale') {
      return `<div class="survey-question">
        <div class="survey-q-text">${q.text}
          <span style="font-size:12px;color:var(--text-faint);font-family:'Jost',sans-serif;letter-spacing:0;font-weight:300;">
            &nbsp;1 — очень голодна · 10 — переела
          </span>
        </div>
        <div class="scale-row">
          ${[1,2,3,4,5,6,7,8,9,10].map(v =>
            `<button class="scale-btn" id="q${q.id}-${v}" onclick="pickS2Scale('${q.key}','q${q.id}',${v})">${v}</button>`
          ).join('')}
        </div>
      </div>`;
    }
    const mealPhotoInput = q.key.startsWith('meal_')
      ? `<label class="meal-survey-photo">
           <input type="file" accept="image/*" style="display:none" onchange="pickS2MealPhoto('${q.key}',this)">
           <span id="${q.key}-photo-badge">📷 фото тарелки</span>
         </label>`
      : '';
    return `<div class="survey-question">
      <div class="survey-q-text">${q.text}</div>
      <div class="bool-toggle">
        <button class="bool-btn" id="q${q.id}-yes" onclick="pickS2Bool('${q.key}','q${q.id}',true)">Да</button>
        <button class="bool-btn" id="q${q.id}-no"  onclick="pickS2Bool('${q.key}','q${q.id}',false)">Нет</button>
      </div>
      ${mealPhotoInput}
    </div>`;
  }).join('');

  document.getElementById('survey-body').innerHTML = questionsHtml + `
    <button class="save-btn" id="survey2-submit" onclick="submitSurvey${s2SurveyId}()" disabled
            style="margin-top:8px">ГОТОВО →</button>`;
}

function pickS2Radio(key, prefix, val) {
  survey2Ans[key] = val;
  document.querySelectorAll(`[id^="${prefix}-"]`).forEach(el => el.classList.remove('selected'));
  document.getElementById(`${prefix}-${val}`).classList.add('selected');
  const allAnswered = s2ActiveQuestions.every(q => survey2Ans[q.key] !== undefined);
  const btn = document.getElementById('survey2-submit');
  if (btn) btn.disabled = !allAnswered;
}

function pickS2Bool(key, prefix, val) {
  survey2Ans[key] = val;
  document.getElementById(`${prefix}-yes`).classList.toggle('selected', val === true);
  document.getElementById(`${prefix}-no`).classList.toggle('selected', val === false);
  const allAnswered = s2ActiveQuestions.every(q => survey2Ans[q.key] !== undefined);
  const btn = document.getElementById('survey2-submit');
  if (btn) btn.disabled = !allAnswered;
}

function pickS2Scale(key, prefix, val) {
  survey2Ans[key] = val;
  document.querySelectorAll(`[id^="${prefix}-"]`).forEach(el => el.classList.remove('selected'));
  document.getElementById(`${prefix}-${val}`).classList.add('selected');
  const allAnswered = s2ActiveQuestions.every(q => survey2Ans[q.key] !== undefined);
  const btn = document.getElementById('survey2-submit');
  if (btn) btn.disabled = !allAnswered;
}

function pickS2MealPhoto(key, input) {
  const file = input.files[0];
  if (!file) return;
  survey2Photos[key] = file;
  const badge = document.getElementById(`${key}-photo-badge`);
  if (badge) badge.textContent = '✓ фото добавлено';
}

async function _submitSurvey(surveyId) {
  const btn = document.getElementById('survey2-submit');
  btn.disabled = true; btn.textContent = 'Сохраняю...';

  const today = todayKey();
  const now   = new Date().toISOString();

  const delta = s2ActiveQuestions.reduce((sum, q) => {
    const val = survey2Ans[q.key];
    if (val === undefined) return sum;
    if (q.type === 'radio' && q.refOptions) {
      const refRow = q.refOptions.find(r => r.id === val);
      return sum + (refRow?.weight ?? 0);
    }
    if (q.type === 'scale' && q.weights_json) {
      return sum + (q.weights_json[String(val)] ?? 0);
    }
    return sum + (val ? (q.weight_yes ?? 0) : (q.weight_no ?? 0));
  }, 0);
  const newScore = Math.max(0, (todayScore ?? 0) + delta);

  const { data: session } = await sb.from('daily_survey_sessions')
    .insert({ user_id: currentUser.id, survey_id: surveyId, date: today })
    .select('id').single();

  await sb.from('daily_survey_answers').insert(
    s2ActiveQuestions.map(q => ({
      session_id:  session.id,
      question_id: q.id,
      value:       String(survey2Ans[q.key]),
    }))
  );

  const { data: scoreRow } = await sb.from('daily_scores')
    .insert({ user_id: currentUser.id, date: today, value: newScore, session_id: session.id })
    .select('id').single();

  if (survey2Ans['workout'] === true && !todayActivity.warmup) {
    await sb.from('activity_log').insert({ user_id: currentUser.id, date: today, activity_type: 'warmup' });
    todayActivity.warmup = true;
  }

  const hungerVal = survey2Ans['hunger'];
  if (hungerVal !== undefined) {
    await sb.from('hunger_log').insert({
      user_id: currentUser.id, date: today, value: hungerVal, session_id: session.id,
    });
  }
  if (survey2Ans['water'] === true) {
    const { error } = await sb.from('water_log').insert({ user_id: currentUser.id, date: today });
    if (!error) todayWaterCount++;
  }

  // Все meal_* вопросы обрабатываются автоматически
  const MEAL_HOURS = { breakfast: [6, 8], lunch: [12, 14], dinner: [16, 18] };
  const h = new Date().getHours();
  for (const [mealKey, [start, end]] of Object.entries(MEAL_HOURS)) {
    if (survey2Ans[`meal_${mealKey}`] === true) {
      const { data: mealRow } = await sb.from('meal_log').insert({
        user_id: currentUser.id, date: today,
        meal_type: mealKey,
        in_window: h >= start && h < end,
        session_id: session.id,
      }).select('id').single();
      todayMeals[mealKey] = true;
      const photoFile = survey2Photos[`meal_${mealKey}`];
      if (photoFile && mealRow) {
        const path = `${currentUser.id}/${today}/${mealKey}.jpg`;
        const { error: upErr } = await sb.storage.from('meal-photos').upload(path, photoFile, { upsert: true });
        if (!upErr) {
          const { data: urlData } = sb.storage.from('meal-photos').getPublicUrl(path);
          const url = urlData.publicUrl;
          await sb.from('meal_log').update({ photo_url: url }).eq('id', mealRow.id);
          todayMealPhotos[mealKey] = url + '?t=' + Date.now();
        }
      }
    }
  }

  const emotionVal = survey2Ans['emotion'];
  if (emotionVal !== undefined) {
    await sb.from('emotion_log').insert({
      user_id:         currentUser.id,
      date:            today,
      emotion_type_id: emotionVal,
      note:            survey2Ans['emotion_note'] || null,
      session_id:      session.id,
    });
  }

  // Мини-цели → в mini_goals с датой завтрашнего дня (каждая строка = отдельная запись)
  const goalsText = survey2Ans['tomorrow_goals'];
  if (goalsText && goalsText.trim()) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    const lines = goalsText.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length) {
      await sb.from('mini_goals').insert(
        lines.map(text => ({ user_id: currentUser.id, date: tomorrowStr, text, session_id: session.id }))
      );
    }
  }

  const prev = todaySnapshot || {};
  const sval = key => survey2Ans[key];

  const newToiletLog  = sval('toilet')  !== undefined
    ? [...(prev.toilet_log  || []), { time: now, value: sval('toilet') }]
    : (prev.toilet_log  || []);
  const newWorkoutLog = sval('workout') !== undefined
    ? [...(prev.workout_log || []), { time: now, value: sval('workout') }]
    : (prev.workout_log || []);
  const newWaterLog   = sval('water')   !== undefined
    ? [...(prev.water_log   || []), { time: now, value: sval('water') }]
    : (prev.water_log   || []);
  const workDone      = sval('work')    !== undefined ? sval('work')    : (prev.work_done       ?? null);
  const stomachId     = sval('stomach') !== undefined ? sval('stomach') : (prev.stomach_id      ?? null);
  const emotionTypeId = sval('emotion') !== undefined ? sval('emotion') : (prev.emotion_type_id ?? null);

  await sb.from('daily_score_snapshots').insert({
    daily_score_id:  scoreRow.id,
    period_id:       prev.period_id ?? null,
    sleep_id:        prev.sleep_id  ?? null,
    toilet_log:      newToiletLog,
    workout_log:     newWorkoutLog,
    water_log:       newWaterLog,
    work_done:       workDone,
    stomach_id:      stomachId,
    emotion_type_id: emotionTypeId,
  });

  await sb.from('daily_survey_sessions')
    .update({ daily_score_id: scoreRow.id }).eq('id', session.id);

  todayScore = newScore;
  if (surveyId === 2) todaySurvey2Done = true;
  if (surveyId === 3) todaySurvey3Done = true;
  if (surveyId === 4) todaySurvey4Done = true;
  if (surveyId === 5) todaySurvey5Done = true;
  if (surveyId === 6) todaySurvey6Done = true;
  todaySnapshot = { ...prev, toilet_log: newToiletLog, workout_log: newWorkoutLog, water_log: newWaterLog, work_done: workDone, stomach_id: stomachId, emotion_type_id: emotionTypeId };

  s2SurveyId = 2;
  document.querySelector('#survey-screen .chat-title').textContent = 'ОПРОС';
  const zone = getZone(newScore);
  if (zone === 'red' || zone === 'catastrophe') {
    await showToolSelection(session.id, surveyId);
  } else {
    showHome();
  }
}

function showSurvey2()   { return _openSurvey(2); }
function showSurvey3()   { return _openSurvey(3); }
function showSurvey4()   { return _openSurvey(4); }
function showSurvey5()   { return _openSurvey(5); }
function showSurvey6()   { return _openSurvey(6); }
function submitSurvey2() { return _submitSurvey(2); }
function submitSurvey3() { return _submitSurvey(3); }
function submitSurvey4() { return _submitSurvey(4); }
function submitSurvey5() { return _submitSurvey(5); }
function submitSurvey6() { return _submitSurvey(6); }

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
  const opt = document.getElementById(`tool-${id}`);
  const chk = document.getElementById(`toolchk-${id}`);
  opt.classList.toggle('selected', selectedTools.includes(id));
  chk.textContent = selectedTools.includes(id) ? '✓' : '';
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
      .select('id, is_complete, tool:tool_id(name, duration_min, weight, tool_type)')
      .eq('user_id', currentUser.id).eq('date', today).order('created_at');
    dailyTasks = td || [];
  }
  document.querySelector('#survey-screen .chat-title').textContent = 'ОПРОС';
  showHome();
}
