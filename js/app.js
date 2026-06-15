async function initApp() {
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      currentUser = null; profile = {}; messages = [];
      todayScore = null; dailyTasks = []; todayJournal = {};
      todaySurvey2Done = false; todaySurvey3Done = false; todaySurvey4Done = false;
      todaySurvey5Done = false; todaySurvey6Done = false; todaySnapshot = null;
      todayMiniGoals  = []; todayMealPhotos = { breakfast: null, lunch: null, dinner: null };
      todayActivity   = { warmup: false, workout: false, walk: false };
      userTimezone    = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      setScreen('auth');
    }
  });

  const { data: { session } } = await sb.auth.getSession();
  if (session) { currentUser = session.user; await loadUserData(); }
  else setScreen('auth');
}

async function loadUserData() {
  try {
    const { data: pd } = await sb.from('profiles')
      .select('*').eq('id', currentUser.id).maybeSingle();
    if (pd) {
      profile = pd;
      if (pd.groq_api_key) localStorage.setItem('nova_api_key', pd.groq_api_key);
      if (pd.timezone && pd.timezone !== 'UTC') {
        userTimezone = pd.timezone;
      } else {
        // Авто-определяем и сохраняем если не задан или остался дефолтный UTC
        const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (detected && detected !== 'UTC') {
          userTimezone = detected;
          sb.from('profiles').update({ timezone: detected }).eq('id', currentUser.id);
        }
      }
    }

    const today = todayKey();

    const { data: sd } = await sb.from('daily_scores')
      .select('value')
      .eq('user_id', currentUser.id)
      .eq('date', today)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    todayScore = sd?.value ?? null;

    const [s2check, s3check, s4check, s5check, s6check, snapScore, mgData] = await Promise.all([
      sb.from('daily_survey_sessions').select('id')
        .eq('user_id', currentUser.id).eq('date', today).eq('survey_id', 2).maybeSingle(),
      sb.from('daily_survey_sessions').select('id')
        .eq('user_id', currentUser.id).eq('date', today).eq('survey_id', 3).maybeSingle(),
      sb.from('daily_survey_sessions').select('id')
        .eq('user_id', currentUser.id).eq('date', today).eq('survey_id', 4).maybeSingle(),
      sb.from('daily_survey_sessions').select('id')
        .eq('user_id', currentUser.id).eq('date', today).eq('survey_id', 5).maybeSingle(),
      sb.from('daily_survey_sessions').select('id')
        .eq('user_id', currentUser.id).eq('date', today).eq('survey_id', 6).maybeSingle(),
      sb.from('daily_scores')
        .select('id, daily_score_snapshots(*)')
        .eq('user_id', currentUser.id).eq('date', today)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      sb.from('mini_goals').select('id, text, is_done')
        .eq('user_id', currentUser.id).eq('date', today)
        .order('created_at', { ascending: true }),
    ]);
    todaySurvey2Done = !!s2check.data;
    todaySurvey3Done = !!s3check.data;
    todaySurvey4Done = !!s4check.data;
    todaySurvey5Done = !!s5check.data;
    todaySurvey6Done = !!s6check.data;
    todayMiniGoals = mgData.data || [];
    todaySnapshot  = snapScore.data?.daily_score_snapshots?.[0] || null;

    const { data: td } = await sb.from('daily_tasks')
      .select('id, is_complete, custom_name, tool:tool_id(name, duration_min, weight, tool_type)')
      .eq('user_id', currentUser.id)
      .eq('date', today)
      .order('created_at', { ascending: true });
    dailyTasks = td || [];

    const { data: je } = await sb.from('journal_entries')
      .select('task_id, text, audio_url, source')
      .eq('user_id', currentUser.id).eq('date', today);
    todayJournal = Object.fromEntries((je || []).filter(e => e.task_id).map(e => [e.task_id, e]));

    const [waterRes, mealRes, actRes] = await Promise.all([
      sb.from('water_log').select('id').eq('user_id', currentUser.id).eq('date', today),
      sb.from('meal_log').select('meal_type, photo_url').eq('user_id', currentUser.id).eq('date', today),
      sb.from('activity_log').select('activity_type').eq('user_id', currentUser.id).eq('date', today),
    ]);
    todayWaterCount = (waterRes.data || []).length;
    const mealRows = mealRes.data || [];
    todayMeals = {
      breakfast: mealRows.some(m => m.meal_type === 'breakfast'),
      lunch:     mealRows.some(m => m.meal_type === 'lunch'),
      dinner:    mealRows.some(m => m.meal_type === 'dinner'),
    };
    todayMealPhotos = {
      breakfast: mealRows.find(m => m.meal_type === 'breakfast')?.photo_url || null,
      lunch:     mealRows.find(m => m.meal_type === 'lunch')?.photo_url     || null,
      dinner:    mealRows.find(m => m.meal_type === 'dinner')?.photo_url    || null,
    };
    const actTypes = (actRes.data || []).map(a => a.activity_type);
    todayActivity = {
      warmup:  actTypes.includes('warmup'),
      workout: actTypes.includes('workout'),
      walk:    actTypes.includes('walk'),
    };

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

  await sb.from('journal_entries')
    .delete().eq('user_id', currentUser.id).eq('date', today);

  await sb.from('daily_survey_sessions')
    .update({ daily_score_id: null })
    .eq('user_id', currentUser.id).eq('date', today);

  await sb.from('daily_scores')
    .delete()
    .eq('user_id', currentUser.id).eq('date', today);

  await sb.from('daily_tasks')
    .delete()
    .eq('user_id', currentUser.id).eq('date', today);

  await sb.from('daily_survey_sessions')
    .delete()
    .eq('user_id', currentUser.id).eq('date', today);

  await Promise.all([
    sb.from('meal_log').delete().eq('user_id', currentUser.id).eq('date', today),
    sb.from('water_log').delete().eq('user_id', currentUser.id).eq('date', today),
    sb.from('activity_log').delete().eq('user_id', currentUser.id).eq('date', today),
    sb.from('mini_goals').delete().eq('user_id', currentUser.id).eq('date', today),
  ]);

  todayScore        = null;
  dailyTasks        = [];
  todaySurvey2Done  = false;
  todaySurvey3Done  = false;
  todaySurvey4Done  = false;
  todaySurvey5Done  = false;
  todaySurvey6Done  = false;
  todaySnapshot     = null;
  todayMiniGoals    = [];
  todayJournal      = {};
  todayWaterCount   = 0;
  todayMeals        = { breakfast: false, lunch: false, dinner: false };
  todayMealPhotos   = { breakfast: null, lunch: null, dinner: null };
  todayActivity     = { warmup: false, workout: false, walk: false };
  survey2Ans        = {};
  survey2Photos     = {};
  s2ActiveQuestions = [];
  renderHome();
}

initApp();
setInterval(updateClock, 30000);
