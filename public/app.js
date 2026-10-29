let accountMode = "login";
const chatHistory = [];

function openModal(mode) {
    accountMode = mode;
    document.getElementById("accountModal").style.display = "flex";
    const title = document.getElementById("modalTitle");
    const nameInput = document.getElementById("nameInput");
    if (mode === "signup") {
        title.innerText = "CREATE ACCOUNT";
        nameInput.style.display = "block";
    } else {
        title.innerText = "LOGIN";
        nameInput.style.display = "none";
    }
}

function closeModal() {
    document.getElementById("accountModal").style.display = "none";
}

function submitAccount() {
    const name = document.getElementById("nameInput").value.trim();
    const email = document.getElementById("emailInput").value.trim();

    if (accountMode === "signup" && name === "") { alert("Please enter your name."); return; }
    if (email === "") { alert("Please enter your email."); return; }

    let profileName = (accountMode === "signup") ? name : email.split("@")[0];
    localStorage.setItem("lordzUser", profileName);
    showProfile(profileName);
    closeModal();
}

function showProfile(name) {
    document.getElementById("guestButtons").style.display = "none";
    document.getElementById("profile").style.display = "flex";
    document.getElementById("profileName").innerText = name;
    document.getElementById("profileAvatar").innerText = name.charAt(0).toUpperCase();
}

function logout() {
    localStorage.removeItem("lordzUser");
    document.getElementById("guestButtons").style.display = "block";
    document.getElementById("profile").style.display = "none";
    document.getElementById("profileMenu").style.display = "none";
}

function toggleProfileMenu() {
    const menu = document.getElementById("profileMenu");
    menu.style.display = (menu.style.display === "block") ? "none" : "block";
}

window.addEventListener("load", function() {
    const savedUser = localStorage.getItem("lordzUser");
    if (savedUser) showProfile(savedUser);
    
    document.getElementById("userInput").addEventListener("keydown", function(e) {
        if (e.key === "Enter") {
            e.preventDefault();
            sendMessage();
        }
    });
});

let pending = [];
const ICON = {
  regen: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/></svg>',
  flag: '<svg viewBox="0 0 24 24"><path d="M5 21V4m0 0h12l-2 4 2 4H5"/></svg>',
  ok: '<svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"/></svg>'
};

function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function md(t) {
  const blocks = [];
  t = esc(t).replace(/```(\w*)\n?([\s\S]*?)```/g, (m, l, c) => { blocks.push('<pre><code>' + c.replace(/\n$/, '') + '</code></pre>'); return '\u0000' + (blocks.length - 1) + '\u0000'; });
  t = t.replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
  const out = []; let list = null;
  for (const line of t.split('\n')) {
    let m;
    if ((m = line.match(/^\s*[-*]\s+(.*)/))) { if (list !== 'ul') { if (list) out.push('</' + list + '>'); out.push('<ul>'); list = 'ul'; } out.push('<li>' + m[1] + '</li>'); continue; }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { if (list) out.push('</' + list + '>'); out.push('<ol>'); list = 'ol'; } out.push('<li>' + m[1] + '</li>'); continue; }
    if (list) { out.push('</' + list + '>'); list = null; }
    if ((m = line.match(/^#{1,3}\s+(.*)/))) out.push('<h3>' + m[1] + '</h3>');
    else if (line.trim() !== '') out.push('<p>' + line + '</p>');
  }
  if (list) out.push('</' + list + '>');
  return out.join('').replace(/\u0000(\d+)\u0000/g, (m, i) => blocks[i]);
}

function readAs(f, how) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error('Could not read file'));
    how === 'text' ? r.readAsText(f) : r.readAsDataURL(f);
  });
}

async function addFile(f) {
  if (pending.length >= 4) throw new Error('Maximum 4 files at a time');
  if (f.type.startsWith('image/')) {
    const url = await readAs(f, 'url');
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Not a valid image')); i.src = url; });
    const sc = Math.min(1, 1280 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const out = c.toDataURL('image/jpeg', 0.8);
    pending.push({ name: f.name, kind: 'img', mime: 'image/jpeg', data: out.split(',')[1], preview: out });
  } else if (f.type === 'application/pdf') {
    if (f.size > 2500000) throw new Error('PDF too large (max 2.5 MB)');
    pending.push({ name: f.name, kind: 'pdf', mime: 'application/pdf', data: (await readAs(f, 'url')).split(',')[1] });
  } else {
    if (f.size > 200000) throw new Error('Text file too large (max 200 KB)');
    pending.push({ name: f.name, kind: 'text', text: await readAs(f, 'text') });
  }
}

function renderChips() {
  const c = document.getElementById('chips');
  c.innerHTML = '';
  pending.forEach((p, i) => {
    const d = document.createElement('div'); d.className = 'chip'; d.textContent = p.name;
    const x = document.createElement('b'); x.textContent = '\u00d7';
    x.onclick = () => { pending.splice(i, 1); renderChips(); };
    d.appendChild(x); c.appendChild(d);
  });
}

document.getElementById('fileInput').addEventListener('change', async (e) => {
  for (const f of e.target.files) { try { await addFile(f); } catch (err) { alert(f.name + ': ' + err.message); } }
  e.target.value = '';
  renderChips();
});

const IMG_RE = /^(?:\/image|\/img|image:|imagine|(?:generate|create|make|draw|design)\b(?: me)?(?: an?| the)?\s*(?:image|picture|photo|logo|wallpaper|poster)\b(?: of| for)?|draw\b(?: me)?(?: an?| the)?)\s*(.*)$/i;

function imgSize(p) {
  if (/\b(landscape|wide|16:9)\b/i.test(p)) return [1280, 720];
  if (/\b(portrait|vertical|9:16)\b/i.test(p)) return [720, 1280];
  return [1024, 1024];
}

async function dl(url, p) {
  try {
    const r = await fetch(url);
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'lordz-ai-' + p.slice(0, 20).replace(/\W+/g, '-') + '.jpg';
    a.click();
  } catch (e) { window.open(url, '_blank'); }
}

function makeImage(p, msg, tries, quiet) {
  tries = tries || 0;
  const box = document.createElement('div');
  box.className = 'message ai';
  box.textContent = tries ? 'Retrying...' : 'Creating your image...';
  document.getElementById('chatBox').appendChild(box);
  scrollEnd();
  const sz = imgSize(p);
  const url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(p) + '?model=flux&enhance=true&nologo=true&width=' + sz[0] + '&height=' + sz[1] + '&seed=' + Math.floor(Math.random() * 1000000);
  const im = new Image();
  im.onload = () => {
    box.innerHTML = '';
    im.style.cssText = 'max-width:100%;border-radius:12px;display:block';
    const row = document.createElement('div');
    row.className = 'acts';
    row.style.flexWrap = 'wrap';
    const add = (label, fn) => { const b = document.createElement('button'); b.className = 'sug'; b.textContent = label; b.onclick = fn; row.appendChild(b); };
    add('Download', () => dl(url, p));
    add('Regenerate', () => makeImage(p, msg, 0, true));
    ['Realistic', 'Anime', '3D render', 'Oil painting'].forEach(st => add(st, () => makeImage(p + ', ' + st.toLowerCase() + ' style', msg, 0, true)));
    box.append(im, row);
    if (!quiet) {
      chatHistory.push({ role: 'user', content: msg }, { role: 'assistant', content: '[Generated an image: ' + p + ']' });
      saveChat();
    }
    scrollEnd();
  };
  im.onerror = () => {
    if (tries < 1) { box.remove(); setTimeout(() => makeImage(p, msg, tries + 1, quiet), 1500); }
    else box.textContent = 'The image service is busy right now. Please try again in a moment.';
  };
  im.src = url;
}

async function sendMessage() {
  const input = document.getElementById('userInput');
  const msg = input.value.trim();
  if (!msg && !pending.length) return;
  const imgReq = !pending.length && msg.match(IMG_RE);
  if (imgReq && imgReq[1].trim()) {
    document.getElementById('sugs').style.display = 'none';
    appendMessage(msg, 'user');
    input.value = '';
    makeImage(imgReq[1].trim(), msg);
    return;
  }
  const files = pending; pending = []; renderChips();
  const texts = files.filter(p => p.kind === 'text').map(p => '[File: ' + p.name + ']\n' + p.text.slice(0, 20000)).join('\n\n');
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
      body: JSON.stringify({ prompt: prompt, history: chatHistory.slice(-20), attachments: files.filter(p => p.data).map(p => ({ mime: p.mime, data: p.data })), now: new Date().toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'long' }) })
    });
    const data = await response.json();
    const loader = document.getElementById('loadingMsg');
    if (loader) loader.remove();
    if (data.reply) {
      appendMessage(data.reply, 'ai', { reportable: true, type: false, prompt: msg, full: prompt });
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
  row.append(cp, rp, rg);
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
  const b = document.createElement('button');
  b.className = 'sug';
  b.textContent = 'Generate an image of a futuristic city at night';
  b.onclick = () => useSug(b.textContent);
  sg.appendChild(b);
})();

renderHist();

    
