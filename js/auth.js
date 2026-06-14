async function signInWithGoogle() {
  await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
}

async function sendMagicLink() {
  const email  = document.getElementById('auth-email').value.trim();
  const status = document.getElementById('auth-status');
  const btn    = document.getElementById('auth-btn');
  if (!email) { status.textContent = 'Введи email'; return; }
  btn.disabled = true; btn.textContent = 'Отправляю...';

  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href }
  });

  if (error) {
    status.innerHTML = `<span style="color:var(--red)">Ошибка: ${error.message}</span>`;
    btn.disabled = false; btn.textContent = 'ВОЙТИ ПО ССЫЛКЕ →';
  } else {
    status.innerHTML = `✉️ Ссылка отправлена на <strong style="color:var(--purple-light)">${email}</strong><br><br>Открой письмо и нажми кнопку.`;
  }
}

async function saveProfile() {
  const apiKey = document.getElementById('s-apikey').value.trim();
  const newProfile = {
    id:         currentUser.id,
    name:       document.getElementById('s-name').value.trim(),
    focus:      document.getElementById('s-focus').value.trim(),
    challenges: document.getElementById('s-challenges').value.trim(),
    goals:      [0,1,2,3].map(i => document.getElementById('g'+i).value.trim()),
    role:       'Software Engineer',
    groq_api_key: apiKey || profile.groq_api_key || '',
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from('profiles').upsert(newProfile);
  if (!error) {
    profile = newProfile;
    if (apiKey) localStorage.setItem('nova_api_key', apiKey);
    const btn = document.querySelector('#setup-screen .save-btn');
    if (btn) { btn.textContent = '✓ СОХРАНЕНО'; setTimeout(() => btn.textContent = 'СОХРАНИТЬ →', 1500); }
    showHome();
  }
}

function showSetup() {
  document.getElementById('s-name').value       = profile.name || '';
  document.getElementById('s-focus').value      = profile.focus || '';
  document.getElementById('s-challenges').value = profile.challenges || '';
  document.getElementById('s-apikey').value     = profile.groq_api_key || '';
  (profile.goals || []).forEach((g, i) => {
    const el = document.getElementById('g'+i);
    if (el) el.value = g;
  });
  setScreen('setup');
}
