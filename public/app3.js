function runJs(code) {
  return new Promise(res => {
    let out = '';
    const src = 'console.log=(...a)=>postMessage({l:a.map(String).join(" ")});try{' + code + '\n}catch(e){postMessage({l:"Error: "+e.message})}postMessage({end:1})';
    const w = new Worker(URL.createObjectURL(new Blob([src])));
    const t = setTimeout(() => { w.terminate(); res(out + '\n(stopped after 5 seconds)'); }, 5000);
    w.onmessage = e => { if (e.data.end) { clearTimeout(t); w.terminate(); res(out || '(no output)'); } else out += e.data.l + '\n'; };
    w.onerror = e => { clearTimeout(t); w.terminate(); res(out + 'Error: ' + e.message); };
  });
}

let pyP = null;
async function runPy(code) {
  try {
    if (!pyP) pyP = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js'; s.onload = () => loadPyodide().then(res, rej); s.onerror = () => rej(new Error('Could not load Python')); document.head.appendChild(s); });
    const py = await pyP;
    let out = '';
    py.setStdout({ batched: x => { out += x + '\n'; } });
    py.setStderr({ batched: x => { out += x + '\n'; } });
    await py.runPythonAsync(code);
    return out || '(no output)';
  } catch (e) { return 'Error: ' + e.message; }
}

function addRun(d) {
  d.querySelectorAll('pre code').forEach(c => {
    const lang = ((c.className.match(/lang-(\w+)/) || [])[1] || '').toLowerCase();
    if (!/^(js|javascript|python|py)$/.test(lang)) return;
    const b = el('button', 'Run code', '', null);
    b.className = 'sug';
    b.style.marginTop = '6px';
    const out = el('pre', '', 'margin-top:6px;white-space:pre-wrap;display:none', null);
    b.onclick = async () => {
      out.style.display = 'block';
      out.textContent = 'Running...';
      out.textContent = /^(js|javascript)$/.test(lang) ? await runJs(c.textContent) : await runPy(c.textContent);
    };
    c.parentNode.after(b, out);
  });
}

async function backupAnswer(prompt, msg, why) {
  try {
    const r = await fetch('https://text.pollinations.ai/' + encodeURIComponent(prompt.slice(0, 1500)) + '?system=' + encodeURIComponent('You are LORDZ AI, a helpful assistant. Reply in the same language as the user.'));
    const t = (await r.text()).trim();
    if (!r.ok || !t || t.length > 6000) throw new Error('backup failed');
    appendMessage('(Backup AI answered because the main AI was busy)\n\n' + t, 'ai', { reportable: true, prompt: msg, full: prompt });
    chatHistory.push({ role: 'user', content: msg || '(sent a file)' }, { role: 'assistant', content: t });
    saveChat();
  } catch (e) { appendMessage(why || 'AI service is unavailable right now. Try again.', 'ai'); }
}

const STOP = /^(this|that|with|what|have|from|about|your|please|which|there|their|would|could|should|give|tell|make|know|want|need|like|more|some|when|where|then|than|them|into|just|also|will|does|show)$/;

function showStats() {
  const words = {}, days = {};
  let n = 0, len = 0;
  chats.forEach(c => {
    const d = new Date(c.id).toLocaleDateString('en-IN');
    days[d] = (days[d] || 0) + 1;
    (c.msgs || []).forEach(m => {
      if (m.role !== 'user') return;
      n++; len += m.content.length;
      (m.content.toLowerCase().match(/[a-z\u0900-\u097f]{4,}/g) || []).forEach(w => { if (!STOP.test(w)) words[w] = (words[w] || 0) + 1; });
    });
  });
  let t = 'Your usage (stored only on this device)\nChats: ' + chats.length + '\nYour questions: ' + n + '\nAverage question length: ' + (n ? Math.round(len / n) : 0) + ' characters\n\nTop topics:\n';
  Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([w, k]) => { t += w + ' ' + '\u2588'.repeat(Math.min(k, 20)) + ' ' + k + '\n'; });
  t += '\nChats per day:\n' + Object.entries(days).slice(-7).map(([d, k]) => d + ': ' + k).join('\n');
  botSay(t).style.whiteSpace = 'pre-wrap';
}

function exportData() {
  const lines = [];
  chats.forEach(c => (c.msgs || []).forEach((m, i, a) => {
    if (m.role === 'assistant' && a[i - 1] && a[i - 1].role === 'user') lines.push(JSON.stringify({ messages: [{ role: 'user', content: a[i - 1].content }, { role: 'model', content: m.content }] }));
  }));
  if (!lines.length) { botSay('No chats to export yet.'); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'application/jsonl' }));
  a.download = 'lordz-training-data.jsonl';
  a.click();
  botSay('Exported ' + lines.length + ' question-answer pairs as lordz-training-data.jsonl (ready for fine-tuning).');
}

async function extraCommand(c, arg) {
  if (c === 'stats') { showStats(); return; }
  if (c === 'export') { exportData(); return; }
  if (!arg) { botSay('Write the task after /team, for example: /team plan a 7 day study schedule for exams'); return; }
  const box = botSay('Agents are working: Planner, Expert, Critic...');
  try {
    const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'team', prompt: arg }) });
    const j = await r.json();
    if (!j.reply) { box.textContent = j.error || 'The agents could not finish. Try again.'; return; }
    box.remove();
    appendMessage(j.reply, 'ai', { reportable: true, prompt: arg });
    const last = document.getElementById('chatBox').lastChild;
    const dt = el('details', '', 'margin-top:8px;color:#aaa;font-size:13px', last);
    el('summary', 'See what the agents did', '', dt);
    el('div', 'Planner:\n' + j.notes.plan, 'white-space:pre-wrap;margin-top:6px', dt);
  } catch (e) { box.textContent = 'Error connecting to AI backend.'; }
}
