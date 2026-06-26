let sb          = null;
let currentUser = null;
let profile     = {};
let messages    = [];
let isLoading   = false;
let todayScore       = null;
let dailyTasks       = [];
let todaySurvey2Done = false;
let todaySurvey3Done = false;
let todaySurvey4Done = false;
let todaySurvey5Done = false;
let todaySurvey6Done = false;
let todayMiniGoals   = [];
let todayJournal     = {};
let todayWaterCount  = 0;

// todayMeals: объект {done, quality, description, hungerBefore} для каждого приёма
let todayMeals = {
  breakfast: { done: false, quality: null, description: null, hungerBefore: null, hungerAfter: null, hungerAfterHour: null, nutritionJson: null },
  lunch:     { done: false, quality: null, description: null, hungerBefore: null, hungerAfter: null, hungerAfterHour: null, nutritionJson: null },
  dinner:    { done: false, quality: null, description: null, hungerBefore: null, hungerAfter: null, hungerAfterHour: null, nutritionJson: null },
};
let todayMealPhotos   = { breakfast: [], lunch: [], dinner: [] };
let mealCarouselIdx   = { breakfast: 0,  lunch: 0,  dinner: 0  };
let todayActivity   = { warmup: false, workout: false, walk: false };

// Факты дня — туалет и работа (по умолчанию не сделано = +10 стресс каждый)
let todayToilet = false;
let todayWork   = false;

// Цикл (постоянный факт из профиля, меняется ~раз в неделю)
let todayCyclePeriodId = null;
let todayCycleLabel    = '';
let todayCycleWeight   = 0;

// Сон (из утреннего опроса)
let todaySleepWeight = 0;

// Последний чекин (для отображения в UI)
let todayDynamic = { stomachWeight: 0, emotionWeight: 0, surveyId: null };
// История всех чекинов дня (для накопительного скора)
let todayCheckins = [];
// Ручные события SOS: [{delta, description, sessionId}]
let todayEventDeltas = [];

// Recording state
let journalTaskId = null;
let journalWeight = null;
let mediaRecorder = null;
let currentStream = null;
let audioChunks   = [];
let audioBlob     = null;
let isRecording   = false;
let recognition   = null;

// Survey 1 state
let surveyRef     = null;
let surveyAns     = {};
let selectedTools = [];

// Checkin state (surveys 2–6)
let survey2Ans      = {};
let s2SurveyId      = 2;
let s2TomorrowGoals      = []; // вечерний опрос: мини-цели на завтра
let forceUnlockedSurveys = new Set(); // id кнопок, разлоченных вручную

let userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

function todayKey() {
  return new Date().toLocaleDateString('en-CA', { timeZone: userTimezone });
}

function tomorrowKey() {
  const [y, m, d] = todayKey().split('-').map(Number);
  const t = new Date(y, m - 1, d + 1);
  return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
}

function setScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(name + '-screen').classList.add('active');
}
