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
let todaySnapshot    = null;
let todayJournal     = {};
let todayWaterCount  = 0;
let todayMeals       = { breakfast: false, lunch: false, dinner: false };
let todayMealPhotos  = { breakfast: null, lunch: null, dinner: null };
let todayActivity    = { warmup: false, workout: false, walk: false };

// Journal recording state
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

// Survey 2 / 3 state (shared generic engine)
let survey2Ans          = {};
let survey2Photos       = {};  // File objects for meal photos pending upload
let s2ActiveQuestions   = [];  // [{id, key, text, weight_yes, weight_no}, ...] — filtered by skip logic
let s2SurveyId          = 2;   // which survey is currently active in the generic engine

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
