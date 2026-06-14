function openJournal(taskId, toolWeight) {
  journalTaskId = taskId;
  journalWeight = toolWeight;
  audioBlob     = null;
  audioChunks   = [];

  const task    = dailyTasks.find(t => t.id === taskId);
  const entry   = todayJournal[taskId];
  const viewMode = task?.is_complete && !!entry;

  renderJournalContent(entry, viewMode);
  document.getElementById('journal-overlay').style.display = 'flex';
}

function closeJournal() {
  if (isRecording) stopRecording();
  audioBlob = null;
  document.getElementById('journal-overlay').style.display = 'none';
}

function renderJournalContent(entry, viewMode) {
  const body = document.getElementById('journal-body');

  if (viewMode) {
    body.innerHTML = `
      <div style="font-family:'Cormorant Garamond',serif;font-size:22px;color:var(--text);margin-bottom:20px;font-weight:300;">Запись дня</div>
      ${entry?.audio_url ? `
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:16px;">
          <div style="font-size:10px;letter-spacing:2px;color:var(--text-faint);margin-bottom:8px;">ГОЛОСОВАЯ ЗАПИСЬ</div>
          <audio controls src="${entry.audio_url}" style="width:100%;"></audio>
        </div>` : ''}
      ${entry?.text ? `
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:16px;font-size:15px;color:var(--text-dim);line-height:1.7;font-family:'Cormorant Garamond',serif;">
          ${entry.text}
        </div>` : ''}
      <button onclick="closeJournal()" class="save-btn" style="margin-top:24px;">ЗАКРЫТЬ</button>
      <button onclick="deleteJournalEntry()"
              style="background:none;border:none;color:var(--text-faint);font-size:12px;
                     font-family:'Jost',sans-serif;display:block;margin:12px auto 0;
                     cursor:pointer;padding:8px;letter-spacing:1px;">
        удалить запись
      </button>`;
    return;
  }

  body.innerHTML = `
    <div style="font-family:'Cormorant Garamond',serif;font-size:22px;color:var(--text);margin-bottom:20px;font-weight:300;">Как ты себя чувствуешь?</div>
    <textarea id="journal-text" placeholder="Напиши что угодно..."
              style="width:100%;min-height:120px;background:var(--bg2);border:1px solid #2d2550;border-radius:14px;
                     padding:14px 16px;color:var(--text);font-size:15px;font-family:'Jost',sans-serif;
                     outline:none;resize:none;margin-bottom:16px;line-height:1.6;
                     -webkit-appearance:none;box-sizing:border-box;"></textarea>
    <div id="journal-audio-player" style="display:none;background:var(--bg2);border:1px solid var(--border);
                                          border-radius:12px;padding:14px 16px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div style="font-size:10px;letter-spacing:2px;color:var(--text-faint);">ЗАПИСЬ</div>
        <button onclick="clearRecording()"
                style="background:none;border:none;color:var(--text-faint);font-size:11px;
                       font-family:'Jost',sans-serif;cursor:pointer;letter-spacing:1px;padding:0;">
          удалить ✕
        </button>
      </div>
      <audio id="journal-audio-preview" controls style="width:100%;"></audio>
    </div>
    <button id="journal-mic-btn" onclick="toggleRecording()"
            style="width:100%;background:var(--bg2);border:1px solid #2d2550;border-radius:14px;padding:14px;
                   color:var(--text-dim);font-size:13px;font-family:'Jost',sans-serif;cursor:pointer;
                   margin-bottom:20px;letter-spacing:2px;transition:all 0.2s;">
      🎤  ЗАПИСАТЬ ГОЛОС
    </button>
    <button onclick="submitJournal()" class="save-btn" style="margin-bottom:12px;">ГОТОВО →</button>
    <button onclick="closeJournal()"
            style="background:none;border:none;color:var(--text-faint);font-size:13px;
                   font-family:'Jost',sans-serif;display:block;margin:0 auto;cursor:pointer;
                   padding:8px;letter-spacing:1px;">
      ПОЗЖЕ →
    </button>`;
}

async function toggleRecording() {
  if (isRecording) { await stopRecording(); return; }

  try {
    currentStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
                   : MediaRecorder.isTypeSupported('audio/webm')              ? 'audio/webm'
                   :                                                             'audio/mp4';
    audioChunks   = [];
    mediaRecorder = new MediaRecorder(currentStream, { mimeType });
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.start(500);
    isRecording = true;

    const btn = document.getElementById('journal-mic-btn');
    if (btn) { btn.textContent = '⏹  ОСТАНОВИТЬ'; btn.style.borderColor = 'var(--red)'; btn.style.color = 'var(--red)'; }
  } catch(e) {
    alert('Нет доступа к микрофону: ' + e.message);
  }
}

// Resolves AFTER onstop fires and audioBlob is ready
function stopRecording() {
  return new Promise(resolve => {
    isRecording = false;

    const btn = document.getElementById('journal-mic-btn');
    if (btn) { btn.textContent = '🎤  ЗАПИСАТЬ ГОЛОС'; btn.style.borderColor = '#2d2550'; btn.style.color = 'var(--text-dim)'; }

    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      currentStream?.getTracks().forEach(t => t.stop());
      currentStream = null;
      resolve();
      return;
    }

    mediaRecorder.onstop = () => {
      audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
      const url = URL.createObjectURL(audioBlob);
      const preview = document.getElementById('journal-audio-preview');
      if (preview) {
        preview.src = url;
        document.getElementById('journal-audio-player').style.display = 'block';
      }
      currentStream?.getTracks().forEach(t => t.stop());
      currentStream = null;
      resolve();
    };
    mediaRecorder.stop();
  });
}

function clearRecording() {
  audioBlob = null;
  audioChunks = [];
  const preview = document.getElementById('journal-audio-preview');
  if (preview) preview.src = '';
  document.getElementById('journal-audio-player').style.display = 'none';
}

async function submitJournal() {
  if (isRecording) await stopRecording();

  const text = document.getElementById('journal-text')?.value.trim() || '';

  let audioUrl = null;
  if (audioBlob) {
    const ext      = audioBlob.type.includes('mp4') ? 'mp4' : 'webm';
    const fileName = `${currentUser.id}/${todayKey()}_${Date.now()}.${ext}`;
    const { error } = await sb.storage.from('journal-audio')
      .upload(fileName, audioBlob, { contentType: audioBlob.type });
    if (!error) {
      audioUrl = sb.storage.from('journal-audio').getPublicUrl(fileName).data.publicUrl;
    }
  }

  const { data: entry } = await sb.from('journal_entries').insert({
    user_id:   currentUser.id,
    date:      todayKey(),
    text:      text || null,
    audio_url: audioUrl,
    source:    audioBlob ? 'voice' : 'text',
    task_id:   journalTaskId,
  }).select('task_id, text, audio_url, source').single();

  if (entry) todayJournal[journalTaskId] = entry;

  await completeTask(journalTaskId, journalWeight);
  closeJournal();
}

async function deleteJournalEntry() {
  if (!confirm('Удалить запись из дневника?')) return;
  const { data: row } = await sb.from('journal_entries')
    .select('id').eq('task_id', journalTaskId).maybeSingle();
  if (row?.id) await sb.from('journal_entries').delete().eq('id', row.id);
  delete todayJournal[journalTaskId];
  closeJournal();
  renderDailyTasks();
}
