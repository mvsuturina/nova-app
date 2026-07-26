require('dotenv').config();
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const googleSheets = require('./lib/googleSheets');

const TOOLS = [
  {
    name: 'read_sheet',
    description: 'Прочитать все строки указанного листа таблицы Kitchen OS. Возвращает заголовки и строки (с номером строки _row).',
    inputSchema: {
      type: 'object',
      properties: { tab: { type: 'string', description: 'Точное название листа' } },
      required: ['tab'],
    },
  },
  {
    name: 'find_row',
    description: 'Найти строки на листе, где значение в указанной колонке совпадает (без учёта регистра).',
    inputSchema: {
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
    description: 'Добавить новую строку в любой лист. Перед добавлением обязательно проверь через find_row, нет ли уже такой строки.',
    inputSchema: {
      type: 'object',
      properties: {
        tab: { type: 'string' },
        values: { type: 'object', description: 'Пары {заголовок: значение}, используй заголовки из read_sheet' },
      },
      required: ['tab', 'values'],
    },
  },
  {
    name: 'update_row',
    description: 'Обновить существующую строку в любом листе по номеру (_row из read_sheet/find_row).',
    inputSchema: {
      type: 'object',
      properties: {
        tab: { type: 'string' },
        row: { type: 'integer', description: '_row из read_sheet/find_row' },
        values: { type: 'object', description: 'Пары {заголовок: новое значение} — только изменяемые колонки' },
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
      throw new Error(`Неизвестный инструмент: ${name}`);
  }
}

const server = new Server(
  { name: 'kitchen-sheets', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async request => {
  const { name, arguments: input } = request.params;
  try {
    const result = await executeTool(name, input || {});
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (err) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }], isError: true };
  }
});

async function main() {
  if (!googleSheets.isConfigured()) {
    console.error('GOOGLE_SHEET_ID / GOOGLE_SERVICE_ACCOUNT_JSON не заданы в .env — см. README.md');
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP kitchen-sheets сервер запущен (stdio)');
}

main().catch(err => {
  console.error('Фатальная ошибка запуска MCP-сервера:', err);
  process.exit(1);
});
