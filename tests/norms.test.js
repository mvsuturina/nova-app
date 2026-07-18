const assert = require('assert');
const { DAILY_NORMS, parseMealKcal, scaleNutrition, getExpectedByNow, macroColor } = require('../js/norms.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
    failed++;
  }
}

// ── parseMealKcal ────────────────────────────────────────────────────────────
console.log('\nparseMealKcal');

test('парсит строку с описанием перед цифрами', () => {
  const r = parseMealKcal('овсянка с бананом\n~450 ккал · Б 25г · Ж 15г · У 60г');
  assert.strictEqual(r.kcal, 450);
  assert.strictEqual(r.p,   25);
  assert.strictEqual(r.f,   15);
  assert.strictEqual(r.c,   60);
});

test('парсит строку без описания', () => {
  const r = parseMealKcal('~320 ккал · Б 18г · Ж 10г · У 40г');
  assert.strictEqual(r.kcal, 320);
  assert.strictEqual(r.p,   18);
});

test('возвращает null для null', () => {
  assert.strictEqual(parseMealKcal(null), null);
});

test('возвращает null для пустой строки', () => {
  assert.strictEqual(parseMealKcal(''), null);
});

test('возвращает null если паттерна нет', () => {
  assert.strictEqual(parseMealKcal('просто текст без калорий'), null);
});

test('возвращает null для частично совпадающей строки', () => {
  assert.strictEqual(parseMealKcal('~450 ккал без БЖУ'), null);
});

// ── scaleNutrition ──────────────────────────────────────────────────────────
console.log('\nscaleNutrition');

const recipe100 = {
  items: [{ name: 'Морковный торт', grams: 100, unit: 'г', kcal: 300, p: 5, f: 15, c: 36, fiber: 4.2, sodium: 180 }],
  total: { kcal: 300, p: 5, f: 15, c: 36, fiber: 4.2, sodium: 180 },
};

test('масштабирует эталонную порцию 100г до 150г', () => {
  const r = scaleNutrition(recipe100, 100, 150);
  assert.deepStrictEqual(r.total, { kcal: 450, p: 8, f: 23, c: 54, fiber: 6.3, sodium: 270 });
  assert.strictEqual(r.items[0].grams, 150);
  assert.strictEqual(r.items[0].kcal, 450);
  assert.strictEqual(r.items[0].fiber, 6.3);
  assert.strictEqual(r.items[0].sodium, 270);
});

test('сохраняет неизвестные клетчатку и натрий как null', () => {
  const oldRecipe = {
    items: [{ name: 'Старый рецепт', grams: 100, kcal: 200, p: 4, f: 8, c: 30 }],
    total: { kcal: 200, p: 4, f: 8, c: 30 },
  };
  const r = scaleNutrition(oldRecipe, 100, 200);
  assert.strictEqual(r.total.fiber, null);
  assert.strictEqual(r.total.sodium, null);
});

test('не изменяет исходный сохранённый рецепт', () => {
  scaleNutrition(recipe100, 100, 50);
  assert.strictEqual(recipe100.items[0].grams, 100);
  assert.strictEqual(recipe100.total.kcal, 300);
});

test('возвращает null для некорректного веса порции', () => {
  assert.strictEqual(scaleNutrition(recipe100, 0, 100), null);
  assert.strictEqual(scaleNutrition(recipe100, 100, -1), null);
});

// ── getExpectedByNow ─────────────────────────────────────────────────────────
console.log('\ngetExpectedByNow');

test('до 8 утра — ожидание нулевое (час 7)', () => {
  const e = getExpectedByNow(7);
  assert.strictEqual(e.kcal, 0);
  assert.strictEqual(e.p, 0);
  assert.strictEqual(e.f, 0);
  assert.strictEqual(e.c, 0);
});

test('ровно 8:00 — завтрак прошёл (окно 6–8), треть нормы', () => {
  const e = getExpectedByNow(8);
  assert.strictEqual(e.kcal, Math.round(DAILY_NORMS.kcal / 3));
  assert.strictEqual(e.p,    Math.round(DAILY_NORMS.p    / 3));
  assert.strictEqual(e.f,    Math.round(DAILY_NORMS.f    / 3));
});

test('в 13:00 — только завтрак прошёл, треть нормы', () => {
  const e = getExpectedByNow(13);
  assert.strictEqual(e.kcal, Math.round(DAILY_NORMS.kcal / 3));
});

test('в 14:00 — завтрак + обед прошли, две трети нормы', () => {
  const e = getExpectedByNow(14);
  assert.strictEqual(e.kcal, Math.round(DAILY_NORMS.kcal * 2 / 3));
  assert.strictEqual(e.p,    Math.round(DAILY_NORMS.p    * 2 / 3));
});

test('в 18:00 — все три приёма прошли (ужин 16–18), полная норма', () => {
  const e = getExpectedByNow(18);
  assert.strictEqual(e.kcal, DAILY_NORMS.kcal);
  assert.strictEqual(e.p,    DAILY_NORMS.p);
  assert.strictEqual(e.f,    DAILY_NORMS.f);
});

test('в 23:00 — полная норма (не превышает 100%)', () => {
  const e = getExpectedByNow(23);
  assert.strictEqual(e.kcal, DAILY_NORMS.kcal);
});

// ── macroColor ───────────────────────────────────────────────────────────────
console.log('\nmacroColor');

test('expected=0 → нейтральный серый (нет ориентира)', () => {
  assert.strictEqual(macroColor(500, 0), 'var(--text-dim)');
});

test('точное попадание в норму (100%) → зелёный', () => {
  assert.strictEqual(macroColor(600, 600), 'var(--green)');
});

test('в пределах нормы (95%) → зелёный', () => {
  assert.strictEqual(macroColor(570, 600), 'var(--green)');
});

test('нижняя граница нормы (80%) → зелёный', () => {
  assert.strictEqual(macroColor(480, 600), 'var(--green)');
});

test('превышение (116%) → красный', () => {
  assert.strictEqual(macroColor(696, 600), 'var(--red)');
});

test('ровно на границе превышения (115%) → зелёный (граница включительно)', () => {
  assert.strictEqual(macroColor(690, 600), 'var(--green)');
});

test('незначительное недоедание (70%) → золотой', () => {
  assert.strictEqual(macroColor(420, 600), 'var(--gold)');
});

test('нижняя граница золотого (50%) → золотой', () => {
  assert.strictEqual(macroColor(300, 600), 'var(--gold)');
});

test('сильное недоедание (49%) → красный', () => {
  assert.strictEqual(macroColor(294, 600), 'var(--red)');
});

test('actual=0, expected>0 → красный (не ел совсем)', () => {
  assert.strictEqual(macroColor(0, 600), 'var(--red)');
});

// ── итог ────────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} тестов: ${passed} ✓  ${failed} ✗`);
if (failed > 0) process.exit(1);
