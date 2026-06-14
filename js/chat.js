function showChat() { setScreen('chat'); }

function sendFromHome() {
  const input = document.getElementById('home-input');
  const text  = input.value.trim();
  if (!text) return;
  input.value = '';
  sendMessage(text);
}

function sendChat() {
  const input = document.getElementById('chat-input');
  const text  = input.value.trim();
  if (!text || isLoading) return;
  input.value = '';
  sendMessage(text);
}

async function sendMessage(text) {
  if (isLoading || !text?.trim()) return;
  showChat();
  messages.push({ role: 'user', content: text });
  renderChatMessages();
  isLoading = true;

  await sb.from('chat_messages').insert({ user_id: currentUser.id, role: 'user', content: text });

  const systemPrompt = `Ты NOVA — персональный AI-ассистент. Помогаешь ${profile.name || 'пользователю'} отслеживать состояние здоровья и самочувствие.

Профиль:
- Имя: ${profile.name || 'не указано'}
- Фокус: ${profile.focus || 'не указан'}
- Вызовы: ${profile.challenges || 'не указаны'}
- Цели: ${(profile.goals || []).join(', ')}

Текущий скор состояния: ${todayScore !== null ? todayScore + '/60' : 'ещё не рассчитан (первый опрос не пройден)'}

Стиль:
- Всегда на русском языке
- Конкретно, тепло, прямо
- Максимум 4 абзаца или список`;

  const apiKey = profile.groq_api_key || localStorage.getItem('nova_api_key');
  if (!apiKey) {
    messages.push({ role: 'assistant', content: '⚠️ Нужен API ключ Groq. Зайди в ⚙️ настройки.' });
    isLoading = false; renderChatMessages(); return;
  }

  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        max_tokens: 1000, temperature: 0.8
      })
    });
    const data = await resp.json();
    if (data.error) {
      messages.push({ role: 'assistant', content: '❌ Ошибка: ' + data.error.message });
    } else {
      const reply = data.choices?.[0]?.message?.content || 'Что-то пошло не так.';
      messages.push({ role: 'assistant', content: reply });
      await sb.from('chat_messages').insert({ user_id: currentUser.id, role: 'assistant', content: reply });
      if (messages.length > 40) messages = messages.slice(-40);
    }
  } catch(e) {
    messages.push({ role: 'assistant', content: 'Ошибка соединения: ' + e.message });
  }

  isLoading = false;
  renderChatMessages();
}

function renderChatMessages() {
  const container = document.getElementById('chat-messages');
  const empty     = document.getElementById('chat-empty');
  if (!container) return;
  if (!messages.length) { if (empty) empty.style.display = 'block'; return; }
  if (empty) empty.style.display = 'none';
  container.innerHTML = '';
  messages.forEach(m => {
    const wrapper = document.createElement('div');
    wrapper.className = 'msg ' + m.role;
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = m.content;
    wrapper.appendChild(bubble);
    container.appendChild(wrapper);
  });
  if (isLoading) {
    const typing = document.createElement('div');
    typing.className = 'typing';
    typing.innerHTML = "<div class='dot'></div><div class='dot'></div><div class='dot'></div>";
    container.appendChild(typing);
  }
  requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
}
