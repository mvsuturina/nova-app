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

// ── КОЭФФИЦИЕНТ ВРЕМЕНИ ────────────────────────────────────
// Динамические факторы (живот, эмоции) влияют сильнее ближе к вечеру

function getCheckinCoefficient(submittedAtISO) {
  const hour = parseInt(
    new Date(submittedAtISO).toLocaleString('en-CA', {
      timeZone: userTimezone,
      hour: 'numeric',
      hour12: false,
    })
  );
  if (hour < 9)  return 1.0;
  if (hour < 12) return 1.1;
  if (hour < 15) return 1.25;
  if (hour < 18) return 1.35;
  if (hour < 21) return 1.5;
  return 1.6;
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

  // Динамика с коэффициентом по времени
  if (todayDynamic.submittedAt) {
    const coeff = getCheckinCoefficient(todayDynamic.submittedAt);
    s += Math.round(todayDynamic.stomachWeight * coeff);
    s += Math.round(todayDynamic.emotionWeight * coeff);
  }

  // Выполненные задачи
  const doneCount = dailyTasks.filter(t => t.is_complete).length;
  s -= doneCount * 10;

  s = Math.max(0, s);

  await sb.from('daily_scores').insert({
    user_id: currentUser.id,
    date:    todayKey(),
    value:   s,
    source:  source,
  });

  todayScore = s;
  renderScore();
}
