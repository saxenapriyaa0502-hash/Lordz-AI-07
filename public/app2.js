function speak(text, btn) {
  const s = window.speechSynthesis;
  if (!s) { alert('Voice playback is not supported in this browser.'); return; }
  if (s.speaking) { s.cancel(); btn.style.color = ''; return; }
  const u = new SpeechSynthesisUtterance(text.replace(/[`*#]/g, ''));
  u.lang = /[\u0900-\u097F]/.test(text) ? 'hi-IN' : 'en-IN';
  u.onend = u.onerror = () => { btn.style.color = ''; };
  btn.style.color = '#E50914';
  s.speak(u);
}

function el(tag, text, css, parent) {
  const e = document.createElement(tag);
  if (text) e.textContent = text;
  if (css) e.style.cssText = css;
  if (parent) parent.appendChild(e);
  return e;
}

function link(label, url, parent) {
  const a = el('a', label, 'text-decoration:none', parent);
  a.className = 'sug'; a.href = url; a.target = '_blank'; a.rel = 'noopener';
}

function renderStructured(kind, d, box) {
  box.innerHTML = '';
  el('h3', d.title || 'Result', 'margin-bottom:6px', box);
  if (kind === 'roadmap') {
    el('div', 'Level: ' + (d.level || ''), 'color:#999;margin-bottom:8px', box);
    (d.weeks || []).forEach(w => {
      const c = el('div', '', 'border:1px solid #2a2a2a;border-radius:12px;padding:10px;margin:8px 0', box);
      el('b', 'Week ' + w.week + ': ' + w.goal, '', c);
      const ul = el('ul', '', 'margin:6px 0 6px 20px', c);
      (w.topics || []).forEach(t => el('li', t, '', ul));
      el('div', 'Project: ' + w.project, 'color:#bbb;font-size:13px', c);
      const row = el('div', '', 'display:flex;gap:8px;flex-wrap:wrap;margin-top:8px', c);
      const q = encodeURIComponent(w.search || w.goal);
      link('YouTube', 'https://www.youtube.com/results?search_query=' + q, row);
      link('Google', 'https://www.google.com/search?q=' + q, row);
    });
  } else {
    const lines = [];
    (d.chapters || []).forEach(c => {
      lines.push(c.time + ' ' + c.title);
      const r = el('div', '', 'margin:8px 0', box);
      el('b', c.time + '  ' + c.title, '', r);
      if (c.summary) el('div', c.summary, 'color:#bbb;font-size:13px', r);
    });
    const b = el('button', 'Copy chapters', '', box);
    b.className = 'sug';
    b.onclick = () => { if (navigator.clipboard) navigator.clipboard.writeText(lines.join('\n')); b.textContent = 'Copied'; };
  }
}

async function structured(kind, text) {
  const box = el('div', kind === 'roadmap' ? 'Building your roadmap...' : 'Creating chapters...', '', document.getElementById('chatBox'));
  box.className = 'message ai';
  scrollEnd();
  const yt = text.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[^\s]+/i);
  try {
    const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: kind, prompt: text, video: yt ? yt[0] : undefined }) });
    const j = await r.json();
    if (!j.data) { box.textContent = j.error || 'Could not build this. Try again.'; return; }
    renderStructured(kind, j.data, box);
  } catch (e) { box.textContent = 'Error connecting to AI backend.'; }
  scrollEnd();
}

async function sendMessage() {
  const input = document.getElementById('userInput');
  const msg = input.value.trim();
  if (!msg && !pending.length) return;
  const rm = !pending.length && msg.match(/^(?:\/roadmap|(?:give me|make|create|generate)(?: me)?(?: a)?(?: learning| study)? roadmap(?: for| to learn| of)?)\s*(.+)$/i);
  const cm = !pending.length && msg.match(/^\/chapters\s+([\s\S]+)/i);
  if (rm || cm) {
    document.getElementById('sugs').style.display = 'none';
    appendMessage(msg, 'user');
    input.value = '';
    structured(rm ? 'roadmap' : 'chapters', (rm || cm)[1].trim());
    return;
  }
  const imgReq = !pending.length && msg.match(IMG_RE);
  if (imgReq && imgReq[1].trim()) {
    document.getElementById('sugs').style.display = 'none';
    appendMessage(msg, 'user');
    input.value = '';
    makeImage(imgReq[1].trim(), msg);
    return;
  }
  const files = pending; pending = []; renderChips();
  const texts = files.filter(p => p.kind === 'text').map(p => '<untrusted_file name="' + p.name.replace(/"/g, '') + '">\n' + p.text.slice(0, 20000).split('</untrusted_file>').join('') + '\n</untrusted_file>').join('\n\n');
  const prompt = (msg + (texts ? '\n\n' + texts : '')).trim();
  document.getElementById('sugs').style.display = 'none';
  appendMessage(msg || '(attachment)', 'user', { images: files.filter(p => p.kind === 'img').map(p => p.preview), files: files.filter(p => p.kind !== 'img').map(p => p.name) });
  input.value = '';
  ask(prompt, files, msg);
}

async function ask(prompt, files, msg) {
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'message ai';
  loadingDiv.id = 'loadingMsg';
  loadingDiv.innerText = 'LORDZ AI is thinking...';
  document.getElementById('chatBox').appendChild(loadingDiv);
  scrollEnd();
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ search: SEARCH_RE.test(msg || ''), prompt: prompt, history: chatHistory.slice(-20), attachments: files.filter(p => p.data).map(p => ({ mime: p.mime, data: p.data })), now: new Date().toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'long' }) })
    });
    const data = await response.json();
    const loader = document.getElementById('loadingMsg');
    if (loader) loader.remove();
    if (data.reply) {
      appendMessage(data.reply, 'ai', { reportable: true, type: false, prompt: msg, full: prompt, search: SEARCH_RE.test(msg || ''), sources: data.sources });
      chatHistory.push({ role: 'user', content: msg || '(sent a file)' }, { role: 'assistant', content: data.reply });
      saveChat();
    } else {
      appendMessage(data.error || 'Error: Server responded without reply.', 'ai');
    }
  } catch (error) {
    const loader = document.getElementById('loadingMsg');
    if (loader) loader.remove();
    appendMessage('Error connecting to AI backend.', 'ai');
  }
}

function mkAct(svg, title) {
  const b = document.createElement('button');
  b.className = 'act'; b.title = title; b.innerHTML = svg;
  return b;
}

function scrollEnd() { const a = document.querySelector('.chat-area'); a.scrollTop = a.scrollHeight; }

function appendMessage(text, sender, opts) {
  opts = opts || {};
  const d = document.createElement('div');
  d.className = 'message ' + sender;
  if (sender === 'ai') d.innerHTML = opts.type ? '' : md(text); else d.textContent = text;
  if (sender === 'ai' && opts.search) addSources(d, opts.sources, opts.prompt || text.slice(0, 80));
  if (opts.files && opts.files.length) {
    const s = document.createElement('div');
    s.style.cssText = 'font-size:12px;opacity:.85;margin-bottom:6px';
    s.textContent = 'Attached: ' + opts.files.join(', ');
    d.prepend(s);
  }
  (opts.images || []).forEach(src => { const im = document.createElement('img'); im.className = 'thumb'; im.src = src; d.prepend(im); });
  document.getElementById('chatBox').appendChild(d);
  if (sender === 'ai' && opts.type) typeInto(d, text, opts);
  else if (opts.reportable) addActs(d, text, opts);
  scrollEnd();
}

function typeInto(d, text, opts) {
  let n = 0;
  const step = Math.max(3, Math.ceil(text.length / 120));
  const t = setInterval(() => {
    n += step;
    if (n >= text.length) { clearInterval(t); d.innerHTML = md(text); if (opts.reportable) addActs(d, text, opts); }
    else d.innerHTML = md(text.slice(0, n));
    scrollEnd();
  }, 25);
}

function addActs(d, text, opts) {
  document.querySelectorAll('.rg').forEach(b => b.remove());
  const row = document.createElement('div'); row.className = 'acts';
  const cp = mkAct(ICON.copy, 'Copy');
  cp.onclick = () => { if (navigator.clipboard) navigator.clipboard.writeText(text); cp.innerHTML = ICON.ok; setTimeout(() => cp.innerHTML = ICON.copy, 1500); };
  const rp = mkAct(ICON.flag, 'Report this reply');
  rp.onclick = () => reportMessage(rp, opts.prompt, text);
  const rg = mkAct(ICON.regen, 'Regenerate'); rg.classList.add('rg');
  rg.onclick = () => { d.remove(); chatHistory.splice(-2); ask(opts.full || opts.prompt, [], opts.prompt); };
  const sp = mkAct(ICON.speak, 'Listen');
  sp.onclick = () => speak(text, sp);
  row.append(cp, sp, rp, rg);
  d.appendChild(row);
}

async function reportMessage(btn, prompt, reply) {
  const note = window.prompt('What is wrong with this reply? (optional)', '');
  if (note === null) return;
  try {
    const r = await fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: prompt, reply: reply, note: note }) });
    const j = await r.json();
    if (j.ok) { btn.innerHTML = ICON.ok; btn.disabled = true; btn.title = 'Reported'; } else alert('Could not send report.');
  } catch (e) { alert('Could not send report.'); }
}
let chats = [];
try { chats = JSON.parse(localStorage.getItem('lordzChats') || '[]'); } catch (e) {}
let cur = null;

function persist() { try { localStorage.setItem('lordzChats', JSON.stringify(chats.slice(0, 30))); } catch (e) {} }

function saveChat() {
  let c = chats.find(x => x.id === cur);
  if (!c) { cur = Date.now(); c = { id: cur, title: chatHistory[0].content.slice(0, 40) }; chats.unshift(c); }
  c.msgs = chatHistory.slice(-60);
  persist(); renderHist();
}

function renderHist() {
  const l = document.getElementById('histList'); l.innerHTML = '';
  chats.forEach(c => {
    const it = document.createElement('div'); it.className = 'hist-item';
    const sp = document.createElement('span'); sp.textContent = c.title; it.appendChild(sp);
    const x = document.createElement('b'); x.textContent = '\u00d7';
    x.onclick = (e) => { e.stopPropagation(); chats = chats.filter(y => y.id !== c.id); persist(); if (cur === c.id) newChat(); renderHist(); };
    it.appendChild(x);
    it.onclick = () => openChat(c.id);
    l.appendChild(it);
  });
}

function toggleHist() { document.getElementById('hist').classList.toggle('open'); }

function newChat() {
  chatHistory.length = 0; cur = null;
  document.getElementById('chatBox').innerHTML = '';
  document.getElementById('sugs').style.display = 'flex';
  document.getElementById('hist').classList.remove('open');
}

function openChat(id) {
  const c = chats.find(x => x.id === id); if (!c) return;
  newChat(); cur = id;
  document.getElementById('sugs').style.display = 'none';
  let last = '';
  c.msgs.forEach(m => {
    chatHistory.push(m);
    if (m.role === 'user') { last = m.content; appendMessage(m.content, 'user'); }
    else appendMessage(m.content, 'ai', { reportable: true, prompt: last });
  });
}

function useSug(t) { const i = document.getElementById('userInput'); i.value = t; i.focus(); }

function mic() {
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!R) { alert('Voice input is not supported in this browser.'); return; }
  const btn = document.getElementById('micBtn'), inp = document.getElementById('userInput');
  const r = new R(); r.lang = 'hi-IN'; r.interimResults = false;
  btn.classList.add('on');
  r.onresult = e => { inp.value = (inp.value + ' ' + e.results[0][0].transcript).trim(); };
  r.onend = r.onerror = () => btn.classList.remove('on');
  r.start();
}

(function () {
  const sg = document.getElementById('sugs');
  ['Generate an image of a futuristic city at night', 'Roadmap to learn Python', '/chapters https://www.youtube.com/watch?v=...'].forEach(t => {
    const b = document.createElement('button');
    b.className = 'sug';
    b.textContent = t;
    b.onclick = () => useSug(t);
    sg.appendChild(b);
  });
})();

renderHist();

                                                                                                                                                                                                                                             
