#!/usr/bin/env node
// Генерирует VAPID-ключи для Web Push уведомлений
// Запуск: node scripts/generate-vapid.js

const crypto = require('crypto');

function toBase64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  publicKeyEncoding:  { type: 'spki',  format: 'der' },
  privateKeyEncoding: { type: 'pkcs8', format: 'der' },
});

// Берём только 65 байт публичного ключа (uncompressed point)
const pubRaw  = toBase64url(publicKey.slice(-65));
// Берём только 32 байта приватного ключа
const privRaw = toBase64url(privateKey.slice(-32));

console.log('\n=== VAPID Keys ===\n');
console.log('VAPID_PUBLIC_KEY (добавь в GitHub Secrets И в js/push.js):');
console.log(pubRaw);
console.log('\nVAPID_PRIVATE_KEY (только в GitHub Secrets, не в код!):');
console.log(privRaw);
console.log('\nДобавь в GitHub → Settings → Secrets → Actions:');
console.log('  VAPID_PUBLIC_KEY  =', pubRaw);
console.log('  VAPID_PRIVATE_KEY =', privRaw);
console.log('\nВ js/push.js замени строку:');
console.log(`  const VAPID_PUBLIC_KEY = '${pubRaw}';`);
