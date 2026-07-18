// ── Нормы и цветовая индикация КБЖУ ─────────────────────────────────────────
// Чистые функции без DOM и глобального состояния — легко тестировать и менять.
// Чтобы сменить нормы на персональные из профиля: заменить DAILY_NORMS.

const DAILY_NORMS = { kcal: 1800, p: 120, f: 60, c: 200 };

// Равные трети: каждый приём покрывает 1/3 дневной нормы по всем макросам
const MEAL_NORMS_SHARE = {
  breakfast: { kcal: 1 / 3, p: 1 / 3, f: 1 / 3, c: 1 / 3 },
  lunch:     { kcal: 1 / 3, p: 1 / 3, f: 1 / 3, c: 1 / 3 },
  dinner:    { kcal: 1 / 3, p: 1 / 3, f: 1 / 3, c: 1 / 3 },
};

// После этого часа приём считается «должен был состояться»
const MEAL_PAST_HOUR = { breakfast: 8, lunch: 14, dinner: 18 };

// Парсит строку вида «~450 ккал · Б 25г · Ж 15г · У 60г»
function parseMealKcal(desc) {
  if (!desc) return null;
  const m = desc.match(/~(\d+)\s*ккал\s*·\s*Б\s*(\d+)г\s*·\s*Ж\s*(\d+)г\s*·\s*У\s*(\d+)г/);
  return m ? { kcal: +m[1], p: +m[2], f: +m[3], c: +m[4] } : null;
}

function scaleNutrition(nutrition, sourceGrams, targetGrams) {
  const source = Number(sourceGrams);
  const target = Number(targetGrams);
  if (!nutrition?.items?.length || !nutrition.total || source <= 0 || target <= 0) return null;
  const factor = target / source;
  const scale = value => Math.max(0, Math.round(Number(value || 0) * factor));
  const scaleOptional = (value, digits = 0) => {
    if (value === null || value === undefined || value === '') return null;
    const multiplier = 10 ** digits;
    return Math.max(0, Math.round(Number(value) * factor * multiplier) / multiplier);
  };
  return {
    items: nutrition.items.map(item => ({
      ...item,
      grams: Math.max(1, scale(item.grams)),
      kcal: scale(item.kcal), p: scale(item.p), f: scale(item.f), c: scale(item.c),
      fiber: scaleOptional(item.fiber, 1), sodium: scaleOptional(item.sodium),
    })),
    total: {
      kcal: scale(nutrition.total.kcal), p: scale(nutrition.total.p),
      f: scale(nutrition.total.f), c: scale(nutrition.total.c),
      fiber: scaleOptional(nutrition.total.fiber, 1), sodium: scaleOptional(nutrition.total.sodium),
    },
  };
}

// Возвращает ожидаемые накопленные КБЖУ к заданному часу.
// hourNow = 8  → { kcal:0, p:0, f:0, c:0 }      (завтрак ещё не прошёл)
// hourNow = 10 → 1/3 нормы
// hourNow = 15 → 2/3 нормы
// hourNow = 22 → полная норма
function getExpectedByNow(hourNow) {
  const out = { kcal: 0, p: 0, f: 0, c: 0 };
  for (const [meal, cutoff] of Object.entries(MEAL_PAST_HOUR)) {
    if (hourNow >= cutoff) {
      const s = MEAL_NORMS_SHARE[meal];
      out.kcal += DAILY_NORMS.kcal * s.kcal;
      out.p    += DAILY_NORMS.p    * s.p;
      out.f    += DAILY_NORMS.f    * s.f;
      out.c    += DAILY_NORMS.c    * s.c;
    }
  }
  return {
    kcal: Math.round(out.kcal),
    p:    Math.round(out.p),
    f:    Math.round(out.f),
    c:    Math.round(out.c),
  };
}

// Возвращает CSS-цвет для значения макронутриента относительно ожидаемого.
// expected = 0 → слишком рано, ориентира нет → нейтральный серый
function macroColor(actual, expected) {
  if (expected === 0) return 'var(--text-dim)';
  const r = actual / expected;
  if (r > 1.15)  return 'var(--red)';
  if (r >= 0.80) return 'var(--green)';
  if (r >= 0.50) return 'var(--gold)';
  return 'var(--red)';
}

if (typeof module !== 'undefined') {
  module.exports = { DAILY_NORMS, MEAL_NORMS_SHARE, MEAL_PAST_HOUR, parseMealKcal, scaleNutrition, getExpectedByNow, macroColor };
}
