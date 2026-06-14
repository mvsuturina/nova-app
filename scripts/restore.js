#!/usr/bin/env node
// Генерирует SQL для восстановления данных из бэкапа
// Использование: node scripts/restore.js nova-backup-2026-06-14.json

const fs   = require('fs');
const path = require('path');

const file = process.argv[2];
if (!file) {
  console.error('Использование: node scripts/restore.js <backup.json>');
  process.exit(1);
}

const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
const sql    = [];

// Экранирование значений для SQL
function val(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean')        return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number')         return String(v);
  if (typeof v === 'object')         return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

function table(name, rows) {
  if (!rows?.length) {
    sql.push(`-- ${name}: нет данных\n`);
    return;
  }
  const cols = Object.keys(rows[0]);
  sql.push(`-- ── ${name.toUpperCase()} (${rows.length} строк) ──`);
  for (const row of rows) {
    const colList = cols.map(c => `"${c}"`).join(', ');
    const valList = cols.map(c => val(row[c])).join(', ');
    sql.push(`INSERT INTO public.${name} (${colList}) VALUES (${valList}) ON CONFLICT (id) DO NOTHING;`);
  }
  sql.push('');
}

sql.push('-- ══════════════════════════════════════════════════════');
sql.push(`-- Nova restore — бэкап от ${backup.exported_at}`);
sql.push(`-- Пользователь: ${backup.user_id}`);
sql.push('-- ══════════════════════════════════════════════════════');
sql.push('');
sql.push('BEGIN;');
sql.push('');
// Отключаем проверку FK чтобы обойти circular reference (daily_scores ↔ daily_survey_sessions)
sql.push('SET LOCAL session_replication_role = replica;');
sql.push('');

// Порядок важен: сначала сессии и скоры (circular FK — вставляем оба, FK отключен)
table('daily_survey_sessions',  backup.sessions);
table('daily_scores',           backup.scores);
table('daily_score_snapshots',  backup.snapshots);
table('daily_survey_answers',   backup.answers);
table('meal_log',               backup.meals);
table('water_log',              backup.water);
table('activity_log',           backup.activity);
table('mini_goals',             backup.goals);
table('daily_tasks',            backup.tasks);
table('journal_entries',        backup.journals);
table('hunger_log',             backup.hunger);
table('emotion_log',            backup.emotions);

sql.push('SET LOCAL session_replication_role = DEFAULT;');
sql.push('');
sql.push('COMMIT;');
sql.push('');
sql.push('-- Проверка количества восстановленных строк:');
sql.push(`SELECT 'daily_scores'          AS t, count(*) FROM public.daily_scores          WHERE user_id = '${backup.user_id}'`);
sql.push(`UNION ALL SELECT 'sessions',        count(*) FROM public.daily_survey_sessions  WHERE user_id = '${backup.user_id}'`);
sql.push(`UNION ALL SELECT 'meals',           count(*) FROM public.meal_log               WHERE user_id = '${backup.user_id}'`);
sql.push(`UNION ALL SELECT 'goals',           count(*) FROM public.mini_goals             WHERE user_id = '${backup.user_id}'`);
sql.push(`UNION ALL SELECT 'journals',        count(*) FROM public.journal_entries        WHERE user_id = '${backup.user_id}'`);
sql.push('ORDER BY t;');

const out = path.join(path.dirname(file), path.basename(file, '.json') + '-restore.sql');
fs.writeFileSync(out, sql.join('\n'));
console.log(`✓ Готово: ${out}`);
console.log(`  Строк SQL: ${sql.length}`);
console.log(`  Вставь содержимое файла в Supabase → SQL Editor и запусти`);
