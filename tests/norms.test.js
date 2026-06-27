const assert = require('assert');
const { DAILY_NORMS, parseMealKcal, getExpectedByNow, macroColor } = require('../js/norms.js');

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

// ── getExpectedByNow ─────────────────────────────────────────────────────────
console.log('\ngetExpectedByNow');

test('до 9 утра — ожидание нулевое (час 8)', () => {
  const e = getExpectedByNow(8);
  assert.strictEqual(e.kcal, 0);
  assert.strictEqual(e.p, 0);
  assert.strictEqual(e.f, 0);
  assert.strictEqual(e.c, 0);
});

test('ровно 9:00 — завтрак прошёл, треть нормы', () => {
  const e = getExpectedByNow(9);
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

test('в 21:00 — все три приёма прошли, полная норма', () => {
  const e = getExpectedByNow(21);
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
