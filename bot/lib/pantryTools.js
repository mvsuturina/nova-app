const googleSheets = require('./googleSheets');

// Названия листов для промптов — по явному запросу пользователя писать разрешено
// в любой лист таблицы, никакого серверного ограничения по имени листа больше нет.
const STOCK_TAB = '03 Запасы';
const SHOWCASE_TAB = '01 Витрина недели';

const TOOLS = [
  {
    name: 'read_sheet',
    description: 'Прочитать все строки указанного листа таблицы. Возвращает заголовки и строки (с номером строки _row).',
    input_schema: {
      type: 'object',
      properties: { tab: { type: 'string', description: 'Точное название листа' } },
      required: ['tab'],
    },
  },
  {
    name: 'find_row',
    description: 'Найти строки на листе, где значение в указанной колонке совпадает (без учёта регистра).',
    input_schema: {
      type: 'object',
      properties: {
        tab: { type: 'string' },
        column: { type: 'string', description: 'Название колонки (как в заголовке)' },
        value: { type: 'string' },
      },
      required: ['tab', 'column', 'value'],
    },
  },
  {
    name: 'add_row',
    description: 'Добавить новую строку в любой лист. Перед добавлением обязательно проверь через find_row, нет ли уже такой строки — если есть, используй update_row вместо add_row.',
    input_schema: {
      type: 'object',
      properties: {
        tab: { type: 'string' },
        values: {
          type: 'object',
          description: 'Пары {заголовок: значение}. Используй те же заголовки, что вернул read_sheet для этого листа.',
        },
      },
      required: ['tab', 'values'],
    },
  },
  {
    name: 'update_row',
    description: 'Обновить существующую строку в любом листе по номеру (_row из read_sheet/find_row).',
    input_schema: {
      type: 'object',
      properties: {
        tab: { type: 'string' },
        row: { type: 'integer', description: '_row из read_sheet/find_row' },
        values: { type: 'object', description: 'Пары {заголовок: новое значение} — только те колонки, которые меняются' },
      },
      required: ['tab', 'row', 'values'],
    },
  },
];

async function executeTool(name, input) {
  switch (name) {
    case 'read_sheet': {
      const { rows } = await googleSheets.readSheet(input.tab);
      return rows;
    }
    case 'find_row':
      return googleSheets.findRow(input.tab, input.column, input.value);
    case 'add_row':
      await googleSheets.appendRow(input.tab, input.values);
      return { ok: true };
    case 'update_row':
      await googleSheets.updateRow(input.tab, input.row, input.values);
      return { ok: true };
    default:
      return { error: `Неизвестный инструмент: ${name}` };
  }
}

module.exports = { TOOLS, executeTool, STOCK_TAB, SHOWCASE_TAB };
