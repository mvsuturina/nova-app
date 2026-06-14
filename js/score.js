function getZone(score) {
  if (score === null) return null;
  if (score >= 100)   return 'catastrophe';
  if (score >= 65)    return 'red';
  if (score >= 45)    return 'yellow';
  return 'green';
}

const ZONE_LABELS = {
  green:       'ВСЁ ОК',
  yellow:      'ЖЁЛТАЯ ЗОНА',
  red:         'КРАСНАЯ ЗОНА',
  catastrophe: 'КАТАСТРОФА',
};

const ZONE_DESCS = {
  green:       'Ты в норме. Можно планировать и развиваться.',
  yellow:      'Будь внимательна — напряжение растёт.',
  red:         'Слишком много негативных событий. Применяй инструменты и проявляй заботу к себе.',
  catastrophe: 'Надо всё бросить и перевести дух.',
};
