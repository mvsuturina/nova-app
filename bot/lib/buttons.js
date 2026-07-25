// Общие фабрики строк inline-клавиатуры для задач — используются и в /today
// (список сразу нескольких задач в одном сообщении), и в напоминаниях/callbacks.js.
const doneSkipRow = taskId => [
  { text: '✅', callback_data: `done:${taskId}` },
  { text: '⏩', callback_data: `skip:${taskId}` },
];

const undoRow = taskId => [{ text: '↩️ Отменить', callback_data: `undo:${taskId}` }];

module.exports = { doneSkipRow, undoRow };
