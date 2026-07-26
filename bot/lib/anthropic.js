const Anthropic = require('@anthropic-ai/sdk');
const { TOOLS, executeTool } = require('./pantryTools');

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
const MAX_TOOL_ITERATIONS = 20; // очень длинный чек (20+ позиций) не укладывался и в 10 шагов

// Серверный инструмент Anthropic — поиск в интернете выполняет сама Anthropic,
// нам не нужно ничего исполнять/логировать самим (в отличие от наших 4 инструментов
// над Google Sheets). Помогает расшифровывать сокращённые названия на чеках
// (типа "ORGNC BS BST" у Costco) без лишних уточняющих вопросов к пользователю.
// cache_control на последнем инструменте кеширует весь блок tools (Anthropic кеширует всё,
// что идёт ДО и ВКЛЮЧАЯ помеченный блок) — инструменты никогда не меняются, дорого пересылать
// их заново на каждой из 10-20 итераций одного и того же запроса.
const WEB_SEARCH_TOOL = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 2,
  cache_control: { type: 'ephemeral' },
};
const ALL_TOOLS = [...TOOLS, WEB_SEARCH_TOOL];

let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY не задан в .env');
  }
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

// history — массив ПРОСТЫХ прошлых реплик [{role, content}] (только финальные вопрос/ответ,
// без промежуточных tool_use/tool_result — их сохранять в долгую память незачем, каждый
// новый вопрос агент и так перечитает таблицу заново). userContent — content нового
// сообщения (строка или массив content-блоков для фото). Возвращает только {reply}.
function describeAction(name, input, result) {
  if (name === 'add_row') {
    const pairs = Object.entries(input.values || {}).map(([k, v]) => `${k}: ${v}`).join(', ');
    return result?.error ? `⚠️ Не удалось добавить в "${input.tab}": ${result.error}` : `➕ Добавлено в «${input.tab}» — ${pairs}`;
  }
  if (name === 'update_row') {
    const pairs = Object.entries(input.values || {}).map(([k, v]) => `${k}: ${v}`).join(', ');
    return result?.error ? `⚠️ Не удалось обновить в "${input.tab}": ${result.error}` : `✏️ Обновлено в «${input.tab}» (строка ${input.row}) — ${pairs}`;
  }
  return null;
}

async function runAgent(systemPrompt, history, userContent) {
  const anthropic = getClient();
  const messages = [...history, { role: 'user', content: userContent }];
  const actionLog = []; // человекочитаемые описания реально выполненных add_row/update_row
  // Текст со ВСЕХ шагов, не только последнего — иначе, если модель проговаривает
  // содержательный ответ (например меню) в шаге, за которым идут ещё вызовы инструментов
  // (запись в историю и т.п.), этот текст никогда не попадал бы пользователю: возвращался
  // только текст самого последнего хода (обычно короткое итоговое подтверждение).
  const textParts = [];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 16000, // длинный текст (меню/разбор чека) + вызовы инструментов в одном ходе — 8192 не хватало
      // Системный промпт одинаков на всех итерациях одного запроса и почти всегда одинаков
      // между разными сообщениями в течение дня (меняется только дата) — кешируем его тоже.
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      tools: ALL_TOOLS,
      messages,
    });

    console.log(
      '[pantry-agent] iteration', i,
      'stop_reason:', response.stop_reason,
      'blocks:', response.content.map(b => b.type + (b.type === 'text' ? `(${b.text.length} chars)` : '')).join(',')
    );

    messages.push({ role: 'assistant', content: response.content });

    const stepText = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();

    if (response.stop_reason === 'max_tokens') {
      // Ответ оборван на середине (обычно из-за серии web_search внутри одного хода) —
      // текст ЭТОГО шага мог оборваться на полуслове, не включаем его, но весь текст
      // из предыдущих (завершённых) шагов — легитимный, отдаём как есть.
      console.log('[pantry-agent] ОБОРВАНО по max_tokens, partial text:', stepText.slice(0, 200));
      const prior = textParts.length ? textParts.join('\n\n') + '\n\n' : '';
      const suffix = actionLog.length ? '\n\nУспел сделать:\n' + actionLog.join('\n') : '';
      return { reply: prior + '⚠️ Дальше ответ оборвался на середине из-за длины — попробуй переформулировать проще.' + suffix };
    }

    if (stepText) textParts.push(stepText);

    if (response.stop_reason !== 'tool_use') {
      if (textParts.length) return { reply: textParts.join('\n\n') };
      // Модель завершила ход без единого слова текста — Telegram не разрешает пустое
      // сообщение, и просто "Готово" ничего не объясняет. Показываем реально сделанное.
      if (actionLog.length) return { reply: actionLog.join('\n') };
      return { reply: 'Не понял, что нужно сделать — переформулируй, пожалуйста.' };
    }

    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      console.log('[pantry-tool]', block.name, JSON.stringify(block.input));
      let result;
      try {
        result = await executeTool(block.name, block.input);
      } catch (err) {
        result = { error: err.message };
      }
      const action = describeAction(block.name, block.input, result);
      if (action) actionLog.push(action);
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  const prior = textParts.length ? textParts.join('\n\n') + '\n\n' : '';
  const suffix = actionLog.length ? '\n\nУспел сделать:\n' + actionLog.join('\n') : '';
  return { reply: prior + 'Слишком много шагов подряд — попробуй переформулировать вопрос попроще или разбить на части.' + suffix };
}

module.exports = { runAgent };
