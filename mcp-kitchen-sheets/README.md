# kitchen-sheets MCP server

MCP-сервер для **Claude Desktop** — та же таблица Kitchen OS (Google Sheets), что читает и
пишет Telegram-бот из `../bot/`, но здесь доступ идёт напрямую из обычного чата в приложении
Claude, без Telegram и без Anthropic API ключа (Claude Desktop сам обращается к своей модели).

Не связан с ботом по коду (`lib/googleSheets.js` — самостоятельная копия), но использует те же
самые credentials сервисного аккаунта и ту же таблицу.

## Инструменты

Те же 4, что у бота: `read_sheet`, `find_row`, `add_row`, `update_row` — без ограничения по
листам (можно писать в любой). Никакого системного промпта с профилем питания/сценариями
заготовок здесь нет — это просто мост к таблице, вся логика/творчество остаётся на модели
в самом чате Claude Desktop (можно попросить её вести себя как ассистент по кухне прямо в
разговоре, или закрепить это в Project Instructions / custom instructions Claude Desktop).

## Настройка (уже сделана)

`.env` заполнен теми же значениями, что и `bot/.env` (`GOOGLE_SERVICE_ACCOUNT_JSON`,
`GOOGLE_SHEET_ID`). Сервер зарегистрирован в
`~/Library/Application Support/Claude/claude_desktop_config.json` под именем `kitchen-sheets`
(старые записи `avito`/`mcp-hub` не затронуты — есть бэкап `claude_desktop_config.json.backup-*`
рядом, на случай отката).

## Проверка вручную (без Claude Desktop)

```bash
npm install
node index.js
```
Сервер общается по stdio (JSON-RPC), поэтому просто так запущенный в терминале — будет молча
ждать ввода. Это нормально, Claude Desktop сам его запускает и общается с ним по этому протоколу.

## Как включить в Claude Desktop

1. Полностью закрыть Claude Desktop (не просто свернуть — через меню Quit).
2. Открыть заново.
3. В новом чате должен появиться доступный инструмент/сервер `kitchen-sheets` (обычно значок
   инструментов рядом с полем ввода, или в настройках MCP-серверов).
4. Проверить, например: «прочитай мой лист 03 Запасы» или «что у меня есть на кухне?».

## Если что-то не работает

- Проверить логи Claude Desktop (обычно Help → View Logs или похожий пункт меню).
- Убедиться, что `.env` в этой папке не пустой и JSON-ключ валиден:
  `node -e "require('dotenv').config(); JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON); console.log('OK')"`
- Убедиться, что путь к `node` в конфиге совпадает с тем, что использует эта система
  (`which node`) — если Claude Desktop не находит `node` в своём PATH, можно прописать
  в `command` полный путь вместо просто `"node"`.
