async function initApp() {
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      currentUser = null; profile = {}; messages = [];
      todayScore = null; dailyTasks = []; todayJournal = {};
      todaySurvey2Done = false; todaySurvey3Done = false; todaySurvey4Done = false;
      todaySurvey5Done = false; todaySurvey6Done = false;
      todayMiniGoals   = [];
      todayMeals = {
        breakfast: { done: false, quality: null, description: null, hungerBefore: null, hungerAfter: null, hungerAfterHour: null },
        lunch:     { done: false, quality: null, description: null, hungerBefore: null, hungerAfter: null, hungerAfterHour: null },
        dinner:    { done: false, quality: null, description: null, hungerBefore: null, hungerAfter: null, hungerAfterHour: null },
      };
      todayMealPhotos  = { breakfast: [], lunch: [], dinner: [] };
      mealCarouselIdx  = { breakfast: 0,  lunch: 0,  dinner: 0  };
      todayActivity    = { warmup: false, workout: false, walk: false };
      todayToilet        = false;
      todayWork          = false;
      todayCyclePeriodId = null;
      todayCycleLabel    = '';
      todayCycleWeight   = 0;
      todaySleepWeight   = 0;
      todayDynamic     = { stomachWeight: 0, emotionWeight: 0, surveyId: null };
      todayCheckins    = [];
      todayEventDeltas = [];
      survey2Ans       = {};
      surveyRef        = null;
      userTimezone     = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      setScreen('auth');
    }
  });

  const { data: { session } } = await sb.auth.getSession();
  if (session) { currentUser = session.user; await loadUserData(); }
  else setScreen('auth');
}

async function loadUserData() {
  try {
    // Профиль + часовой пояс
    const { data: pd } = await sb.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();
    if (pd) {
      profile = pd;
      if (pd.groq_api_key) localStorage.setItem('nova_api_key', pd.groq_api_key);
      if (pd.timezone && pd.timezone !== 'UTC') {
        userTimezone = pd.timezone;
      } else {
        const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (detected && detected !== 'UTC') {
          userTimezone = detected;
          sb.from('profiles').update({ timezone: detected }).eq('id', currentUser.id);
        }
      }
    }

    const today = todayKey();

    // Справочники (нужны для расчёта весов)
    const [pr, sl, ss, et, sq, eq] = await Promise.all([
      sb.from('periods').select('id, label, weight').order('id'),
      sb.from('sleeps').select('id, label, weight').order('id'),
      sb.from('stomach_states').select('id, label, weight').order('id'),
      sb.from('emotion_types').select('id, label, weight').order('id'),
      sb.from('questions').select('id').eq('key', 'stomach').maybeSingle(),
      sb.from('questions').select('id').eq('key', 'emotion').maybeSingle(),
    ]);
    surveyRef = {
      periods:     pr.data || [],
      sleeps:      sl.data || [],
      stomachs:    ss.data || [],
      emotions:    et.data || [],
      stomachQId:  sq.data?.id || null,
      emotionQId:  eq.data?.id || null,
    };

    // Сессии опросов за сегодня
    const { data: sessions } = await sb.from('daily_survey_sessions')
      .select('id, survey_id, completed_at')
      .eq('user_id', currentUser.id)
      .eq('date', today)
      .order('completed_at', { ascending: true });

    const s1Session      = (sessions || []).find(s => s.survey_id === 1);
    const dynamicSessions = (sessions || []).filter(s => s.survey_id > 1);

    todaySurvey2Done = dynamicSessions.some(s => s.survey_id === 2);
    todaySurvey3Done = dynamicSessions.some(s => s.survey_id === 3);
    todaySurvey4Done = dynamicSessions.some(s => s.survey_id === 4);
    todaySurvey5Done = dynamicSessions.some(s => s.survey_id === 5);
    todaySurvey6Done = dynamicSessions.some(s => s.survey_id === 6);

    // Цикл из профиля (постоянный факт, меняется ~раз в неделю)
    if (pd?.current_period_id) {
      const period = surveyRef.periods.find(p => p.id === pd.current_period_id);
      if (period) {
        todayCyclePeriodId = period.id;
        todayCycleLabel    = period.label;
        todayCycleWeight   = period.weight;
      }
    }

    // Веса из утреннего опроса (сон + начальное состояние живота)
    let s1StomachAns = null;
    if (s1Session) {
      const { data: s1Ans } = await sb.from('daily_survey_answers')
        .select('question_id, value')
        .eq('session_id', s1Session.id);

      const sleepAns = (s1Ans || []).find(a => a.question_id === 2);
      s1StomachAns   = (s1Ans || []).find(a => a.question_id === surveyRef.stomachQId);

      if (sleepAns) {
        const sleep = surveyRef.sleeps.find(s => s.id === parseInt(sleepAns.value));
        todaySleepWeight = sleep?.weight ?? 0;
      }
    }

    // Динамика: накопительно загружаем все чекины 2-6 одним запросом
    todayCheckins = [];
    if (dynamicSessions.length > 0) {
      const { data: allDynAns } = await sb.from('daily_survey_answers')
        .select('session_id, question_id, value')
        .in('session_id', dynamicSessions.map(s => s.id));

      todayCheckins = dynamicSessions.map(sess => {
        const sessAns    = (allDynAns || []).filter(a => a.session_id === sess.id);
        const stomachAns = sessAns.find(a => a.question_id === surveyRef.stomachQId);
        const emotionAns = sessAns.find(a => a.question_id === surveyRef.emotionQId);
        const stomachRow = stomachAns ? surveyRef.stomachs.find(s => s.id === parseInt(stomachAns.value)) : null;
        const emotionRow = emotionAns ? surveyRef.emotions.find(e => e.id === parseInt(emotionAns.value)) : null;
        return {
          stomachWeight: stomachRow?.weight ?? 0,
          emotionWeight: emotionRow?.weight ?? 0,
          surveyId:      sess.survey_id,
        };
      });

      todayDynamic = todayCheckins[todayCheckins.length - 1];
    } else if (s1StomachAns && s1Session) {
      // Только утренний опрос — живот без эмоции, коэфф 0 (не влияет на скор)
      const stomachRow = surveyRef.stomachs.find(s => s.id === parseInt(s1StomachAns.value));
      const c = { stomachWeight: stomachRow?.weight ?? 0, emotionWeight: 0, surveyId: 1 };
      todayCheckins = [c];
      todayDynamic  = c;
    }

    // SOS-события за сегодня (хранятся отдельно, без daily_survey_sessions)
    const { data: sosEvData } = await sb.from('sos_events')
      .select('score_delta, description, stomach_state_id, emotion_type_id, created_at')
      .eq('user_id', currentUser.id).eq('date', today)
      .order('created_at', { ascending: true });

    todayEventDeltas = (sosEvData || []).map(e => ({
      delta:       e.score_delta,
      description: e.description,
    }));

    if (sosEvData?.length) {
      const sosCheckins = sosEvData.map(ev => ({
        stomachWeight: surveyRef.stomachs.find(s => s.id === ev.stomach_state_id)?.weight ?? 0,
        emotionWeight: surveyRef.emotions.find(e => e.id === ev.emotion_type_id)?.weight  ?? 0,
        surveyId: 7,
      }));
      // Определяем порядок: сравниваем время последнего обычного чекина и последнего SOS
      const lastDynTime  = dynamicSessions.length
        ? new Date(dynamicSessions[dynamicSessions.length - 1].completed_at).getTime()
        : 0;
      const lastSosTime  = new Date(sosEvData[sosEvData.length - 1].created_at).getTime();
      todayCheckins = [...todayCheckins, ...sosCheckins];
      if (lastSosTime > lastDynTime) todayDynamic = sosCheckins[sosCheckins.length - 1];
    }

    // Параллельно грузим активность, еду, воду, задачи
    const [actRes, mealRes, waterRes, td, je, mgData, sd] = await Promise.all([
      sb.from('activity_log').select('activity_type').eq('user_id', currentUser.id).eq('date', today),
      sb.from('meal_log').select('meal_type, quality, description, hunger_before, hunger_after, hunger_after_hour, photo_urls')
        .eq('user_id', currentUser.id).eq('date', today),
      sb.from('water_log').select('id').eq('user_id', currentUser.id).eq('date', today),
      sb.from('daily_tasks')
        .select('id, is_complete, custom_name, tool:tool_id(name, duration_min, weight, tool_type)')
        .eq('user_id', currentUser.id).eq('date', today).order('created_at', { ascending: true }),
      sb.from('journal_entries')
        .select('task_id, text, audio_url, source')
        .eq('user_id', currentUser.id).eq('date', today),
      sb.from('mini_goals').select('id, text, is_done')
        .eq('user_id', currentUser.id).eq('date', today).order('created_at', { ascending: true }),
      sb.from('daily_scores')
        .select('value').eq('user_id', currentUser.id).eq('date', today)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    // Активность
    const actTypes = (actRes.data || []).map(a => a.activity_type);
    todayToilet  = actTypes.includes('toilet');
    todayWork    = actTypes.includes('work');
    todayActivity = {
      warmup:  actTypes.includes('warmup'),
      workout: actTypes.includes('workout'),
      walk:    actTypes.includes('walk'),
    };

    // Еда
    const mealRows = mealRes.data || [];
    for (const type of ['breakfast', 'lunch', 'dinner']) {
      const row = mealRows.find(m => m.meal_type === type);
      todayMeals[type] = {
        done:            !!row,
        quality:         row?.quality           || null,
        description:     row?.description       || null,
        hungerBefore:    row?.hunger_before      || null,
        hungerAfter:     row?.hunger_after       || null,
        hungerAfterHour: row?.hunger_after_hour  || null,
      };
      todayMealPhotos[type] = row?.photo_urls || [];
    }

    todayWaterCount = (waterRes.data || []).length;
    dailyTasks      = td.data || [];
    todayJournal    = Object.fromEntries((je.data || []).filter(e => e.task_id).map(e => [e.task_id, e]));
    todayMiniGoals  = mgData.data || [];
    todayScore      = sd.data?.value ?? null;

    // Чат
    const { data: md } = await sb.from('chat_messages')
      .select('role, content')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: true })
      .limit(30);
    if (md) messages = md;

    if (!profile.name) setScreen('setup');
    else { showHome(); initPush(); }
  } catch(e) {
    console.error('loadUserData:', e);
    setScreen('auth');
  }
}

async function debugResetDay() {
  if (!confirm('Сбросить данные за сегодня?')) return;
  const today = todayKey();

  // Получаем ID сессий за сегодня
  const { data: todaySessions } = await sb.from('daily_survey_sessions')
    .select('id').eq('user_id', currentUser.id).eq('date', today);
  const sessionIds = (todaySessions || []).map(s => s.id);

  // Удаляем ответы (FK → sessions), потом разрываем circular FK, потом всё остальное
  if (sessionIds.length) {
    await sb.from('daily_survey_answers').delete().in('session_id', sessionIds);
  }
  await sb.from('daily_survey_sessions')
    .update({ daily_score_id: null }).eq('user_id', currentUser.id).eq('date', today);
  await sb.from('daily_scores').delete().eq('user_id', currentUser.id).eq('date', today);
  await sb.from('daily_tasks').delete().eq('user_id', currentUser.id).eq('date', today);
  await sb.from('journal_entries').delete().eq('user_id', currentUser.id).eq('date', today);
  await sb.from('daily_survey_sessions').delete().eq('user_id', currentUser.id).eq('date', today);
  await Promise.all([
    sb.from('meal_log').delete().eq('user_id', currentUser.id).eq('date', today),
    sb.from('water_log').delete().eq('user_id', currentUser.id).eq('date', today),
    sb.from('activity_log').delete().eq('user_id', currentUser.id).eq('date', today),
    sb.from('mini_goals').delete().eq('user_id', currentUser.id).eq('date', today),
    sb.from('sos_events').delete().eq('user_id', currentUser.id).eq('date', today),
    sb.from('emotion_log').delete().eq('user_id', currentUser.id).eq('date', today),
  ]);

  todayScore       = null;
  dailyTasks       = [];
  todaySurvey2Done = false;
  todaySurvey3Done = false;
  todaySurvey4Done = false;
  todaySurvey5Done = false;
  todaySurvey6Done = false;
  todayMiniGoals   = [];
  todayJournal     = {};
  todayWaterCount  = 0;
  todayMeals = {
    breakfast: { done: false, quality: null, description: null, hungerBefore: null, hungerAfter: null, hungerAfterHour: null },
    lunch:     { done: false, quality: null, description: null, hungerBefore: null, hungerAfter: null, hungerAfterHour: null },
    dinner:    { done: false, quality: null, description: null, hungerBefore: null, hungerAfter: null, hungerAfterHour: null },
  };
  todayMealPhotos  = { breakfast: [], lunch: [], dinner: [] };
  mealCarouselIdx  = { breakfast: 0,  lunch: 0,  dinner: 0  };
  todayActivity    = { warmup: false, workout: false, walk: false };
  todayToilet      = false;
  todayWork        = false;
  // Цикл не сбрасываем — он из профиля, постоянный
  todaySleepWeight = 0;
  todayDynamic     = { stomachWeight: 0, emotionWeight: 0, surveyId: null };
  todayCheckins    = [];
  todayEventDeltas = [];
  survey2Ans       = {};
  renderHome();
}

initApp();
setInterval(updateClock, 30000);
