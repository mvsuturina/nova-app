const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY не заданы в .env');
}

// Service role key обходит RLS — единственный компонент проекта с таким доступом.
// Realtime мы не используем (только select/insert/update/delete), но клиент Supabase
// его всё равно инициализирует и требует WebSocket-конструктор на Node < 22.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false }, realtime: { transport: WebSocket } }
);

module.exports = { supabase };
