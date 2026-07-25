// Таймзона фиксируется явно (не Intl.resolvedOptions() как в SPA, т.к. процесс бота
// не привязан ни к одному устройству пользователя — он один, а устройств, с которых
// пишут боту, может быть несколько, каждое со своей TZ в системных настройках).
// Бот сам ничего не угадывает по устройству — "сегодня" всегда одно и то же,
// определяется только этим значением. Если не задано — падаем в UTC (осознанно
// "плохой", но явно неверный дефолт, а не правдоподобный-но-неверный часовой пояс).
const TZ = process.env.NOVA_TIMEZONE || 'UTC';

function todayKey(date = new Date()) {
  return date.toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
}

function tomorrowKey(date = new Date()) {
  const [y, m, d] = todayKey(date).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

function nowHHMM(date = new Date()) {
  return date.toLocaleTimeString('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

module.exports = { TZ, todayKey, tomorrowKey, nowHHMM };
