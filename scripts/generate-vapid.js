#!/usr/bin/env node
// Генерирует VAPID-ключи для Web Push уведомлений
// Запуск: node scripts/generate-vapid.js  (web-push должен быть установлен)

const webpush = require('web-push');
const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log('\n=== VAPID Keys ===\n');
console.log('VAPID_PUBLIC_KEY (добавь в GitHub Secrets И в js/push.js):');
console.log(publicKey);
console.log('\nVAPID_PRIVATE_KEY (только в GitHub Secrets, не в код!):');
console.log(privateKey);
console.log('\nДобавь в GitHub → Settings → Secrets → Actions:');
console.log('  VAPID_PUBLIC_KEY  =', publicKey);
console.log('  VAPID_PRIVATE_KEY =', privateKey);
console.log('\nВ js/push.js замени строку:');
console.log(`  const VAPID_PUBLIC_KEY = '${publicKey}';`);
