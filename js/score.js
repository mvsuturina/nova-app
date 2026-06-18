// ── ЗОНЫ ──────────────────────────────────────────────────

function getZone(score) {
  if (score === null) return null;
  if (score >= 100)   return 'catastrophe';
  if (score >= 65)    return 'red';
  if (score >= 45)    return 'yellow';
  return 'green';
}

const ZONE_LABELS = {
  green:       'ВСЁ ОК',
  yellow:      'ЖЁЛТАЯ ЗОНА',
  red:         'КРАСНАЯ ЗОНА',
  catastrophe: 'КАТАСТРОФА',
};

const ZONE_DESCS = {
  green:       'Ты в норме. Можно планировать и развиваться.',
  yellow:      'Будь внимательна — напряжение растёт.',
  red:         'Слишком много негативных событий. Применяй инструменты и проявляй заботу к себе.',
  catastrophe: 'Надо всё бросить и перевести дух.',
};

// ── КОЭФФИЦИЕНТ ЭМОЦИЙ ────────────────────────────────────
// Эмоции накапливаются и влияют сильнее к вечеру.
// Привязан к номеру опроса:
//   Начало (1) + Чекап 7:00 (2)  → 0    (утро, стрессовый след ещё не накоплен)
//   Чекап 10:00 (3) + 13:00 (4)  → 1.25
//   Чекап 16:00 (5) + Рефлексия (6) → 1.5
// Живот коэффициента НЕ имеет — это текущее физическое состояние, всегда полный вес.

function getCheckinCoefficient(surveyId) {
  if (!surveyId || surveyId === 1) return 0;  // утренний опрос — без эмоции
  if (surveyId === 2) return 1;               // 7:00 — полный вес
  if (surveyId === 7) return 1;               // SOS — полный вес
  if (surveyId <= 4)  return 1.25;            // 10:00, 13:00
  return 1.5;                                 // 16:00, рефлексия
}

// ── ПЕРЕСЧЁТ СКОРА ────────────────────────────────────────

async function recalculateScore(source) {
  if (!currentUser) return;

  let s = 0;

  // Утренние факты
  s += todayCycleWeight;
  s += todaySleepWeight;

  // Факты дня (по умолчанию не сделано = стресс)
  s += todayToilet ? -20 : 10;
  s += todayWork   ? -20 : 10;

  // Активность (снижают стресс)
  if (todayActivity.warmup)  s -= 10;
  if (todayActivity.workout) s -= 30;
  if (todayActivity.walk)    s -= 10;

  // Еда (по плану = снижает, срыв = повышает)
  for (const type of ['breakfast', 'lunch', 'dinner']) {
    const m = todayMeals[type];
    if (m.quality === 'plan') s -= 10;
    else if (m.quality === 'slip') s += 10;
  }

  // Живот — только последнее значение, полный вес без коэффициента
  // (физическое состояние сейчас, одинаково значимо утром и вечером)
  if (todayDynamic?.surveyId) {
    s += todayDynamic.stomachWeight;
  }
  // Эмоции — накопительно, с коэффициентом (след остаётся, вечером весомее)
  for (const c of todayCheckins) {
    const coeff = getCheckinCoefficient(c.surveyId);
    s += Math.round(c.emotionWeight * coeff);
  }

  // Ручные события SOS
  for (const e of todayEventDeltas) {
    s += e.delta;
  }

  // Выполненные задачи
  const doneCount = dailyTasks.filter(t => t.is_complete).length;
  s -= doneCount * 10;

  // Пропускаем запись только для не-чекиновых источников (активность, еда и т.д.)
  const isCheckin = source.startsWith('checkin_') || source === 'sos';
  if (!isCheckin && todayScore !== null && todayScore === s) {
    renderScore();
    return;
  }

  await sb.from('daily_scores').insert({
    user_id: currentUser.id,
    date:    todayKey(),
    value:   s,
    source:  source,
  });

  todayScore = s;
  renderScore();
}
