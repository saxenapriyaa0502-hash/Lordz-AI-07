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
  speak: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4zM16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11"/></svg>',
  ok: '<svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"/></svg>'
};

function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function md(t) {
  const blocks = [];
  t = esc(t).replace(/```(\w*)\n?([\s\S]*?)```/g, (m, l, c) => { blocks.push('<pre><code class="lang-' + l + '">' + c.replace(/\n$/, '') + '</code></pre>'); return '\u0000' + (blocks.length - 1) + '\u0000'; });
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

const SEARCH_RE = /\b(recommend|suggest|suggestion|video|videos|youtube|instagram|reel|reels|link|links|website|channel|latest|news|trending|search|movie|song|course|tutorial|review)\b/i;

function addSources(d, sources, q, text) {
  const ids = [];
  String(text || '').replace(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/g, (m, id) => { if (!ids.includes(id)) ids.push(id); });
  ids.slice(0, 4).forEach(id => {
    const a = document.createElement('a');
    a.href = 'https://www.youtube.com/watch?v=' + id; a.target = '_blank'; a.rel = 'noopener';
    a.style.cssText = 'display:block;margin-top:10px;text-decoration:none;color:inherit';
    const im = new Image();
    im.src = 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg';
    im.style.cssText = 'width:100%;max-width:320px;border-radius:10px;display:block';
    im.onerror = () => a.remove();
    const t = document.createElement('div');
    t.textContent = 'Watch on YouTube';
    t.style.cssText = 'font-size:13px;margin-top:4px;color:#E50914';
    a.append(im, t);
    d.appendChild(a);
  });
  const row = document.createElement('div');
  row.style.cssText = 'margin-top:10px;display:flex;flex-wrap:wrap;gap:8px';
  const mk = (label, url) => { const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.className = 'sug'; a.style.textDecoration = 'none'; a.textContent = label; row.appendChild(a); };
  (sources || []).forEach(s => mk(String(s.title).slice(0, 28), s.url));
  const e = encodeURIComponent(String(q).slice(0, 100));
  mk('YouTube', 'https://www.youtube.com/results?search_query=' + e);
  mk('Instagram', 'https://www.google.com/search?q=site%3Ainstagram.com+' + e);
  mk('Google', 'https://www.google.com/search?q=' + e);
  d.appendChild(row);
}

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

let lastImg = 0;

async function hordeImage(p) {
  const h = { 'Content-Type': 'application/json', apikey: '0000000000' };
  const r = await fetch('https://aihorde.net/api/v2/generate/async', { method: 'POST', headers: h, body: JSON.stringify({ prompt: p, params: { width: 512, height: 512, steps: 20, n: 1 }, nsfw: false, censor_nsfw: true, r2: true }) });
  const j = await r.json();
  if (!j.id) throw new Error('queue');
  for (let i = 0; i < 40; i++) {
    await new Promise(s => setTimeout(s, 3000));
    const c = await (await fetch('https://aihorde.net/api/v2/generate/check/' + j.id)).json();
    if (c.done) {
      const f = await (await fetch('https://aihorde.net/api/v2/generate/status/' + j.id)).json();
      const g = f.generations && f.generations[0];
      if (g && g.img) return g.img;
      throw new Error('empty');
    }
    if (c.faulted) break;
  }
  throw new Error('timeout');
}

function makeImage(p, msg, tries, quiet, viaHorde) {
  tries = tries || 0;
  if (!tries && !viaHorde && 45000 - (Date.now() - lastImg) > 0) viaHorde = true;
  if (!viaHorde) lastImg = Date.now();
  const box = document.createElement('div');
  box.className = 'message ai';
  box.textContent = tries ? 'Retrying...' : 'Creating your image...';
  document.getElementById('chatBox').appendChild(box);
  scrollEnd();
  const sz = imgSize(p);
  let url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(p) + '?model=flux&enhance=true&nologo=true&width=' + sz[0] + '&height=' + sz[1] + '&seed=' + Math.floor(Math.random() * 1000000);
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
    if (viaHorde) { box.textContent = 'Image services are busy right now. Please try again in a minute.'; return; }
    box.remove();
    if (tries < 1) setTimeout(() => makeImage(p, msg, tries + 1, quiet), 1500);
    else makeImage(p, msg, 0, quiet, true);
  };
  if (viaHorde) {
    box.textContent = 'Using the backup image service (can take 1-2 minutes)...';
    hordeImage(p).then(u => { url = u; im.src = u; }).catch(() => { box.textContent = 'Image services are busy right now. Please try again in a minute.'; });
  } else im.src = url;
}

// ---- Knowledge base: semantic search + similarity graph, stored in this browser ----
function botSay(t) {
  const b = document.createElement('div');
  b.className = 'message ai';
  b.textContent = t;
  document.getElementById('chatBox').appendChild(b);
  scrollEnd();
  return b;
}

function kbLoad() { try { return JSON.parse(localStorage.getItem('lordzKB')) || { chunks: [] }; } catch (e) { return { chunks: [] }; } }

async function embed(texts) {
  const r = await fetch('/api/embed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texts: texts }) });
  const j = await r.json();
  if (!j.vectors) throw new Error(j.error || 'embedding failed');
  return j.vectors;
}

function cos(a, b) {
  let d = 0, x = 0, y = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; }
  return d / (Math.sqrt(x * y) || 1);
}

async function kbAdd(files) {
  const kbd = kbLoad(), fresh = [];
  files.forEach(f => { for (let i = 0; i < f.text.length && fresh.length < 120; i += 700) fresh.push({ src: f.name, t: f.text.slice(i, i + 900) }); });
  for (let i = 0; i < fresh.length; i += 20) {
    const v = await embed(fresh.slice(i, i + 20).map(c => c.t));
    v.forEach((vec, k) => { fresh[i + k].v = vec.map(x => Math.round(x * 10000) / 10000); });
  }
  kbd.chunks = kbd.chunks.concat(fresh).slice(-200);
  kbd.chunks.forEach((c, i) => { c.n = kbd.chunks.map((o, j) => [j, i === j ? -1 : cos(c.v, o.v)]).filter(x => x[1] > 0.7).sort((a, b) => b[1] - a[1]).slice(0, 2).map(x => x[0]); });
  localStorage.setItem('lordzKB', JSON.stringify(kbd));
  return fresh.length;
}

async function kbSearch(q, kbd) {
  const qv = (await embed([q]))[0];
  const top = kbd.chunks.map((c, i) => [i, cos(qv, c.v)]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]);
  const set = new Set(top);
  top.forEach(i => (kbd.chunks[i].n || []).forEach(j => set.add(j)));
  return Array.from(set).slice(0, 7).map(i => '[' + kbd.chunks[i].src + '] ' + kbd.chunks[i].t).join('\n---\n');
}

async function kbCommand(cmd, arg, files) {
  if (cmd === 'kb') {
    if (/^clear$/i.test(arg)) { localStorage.removeItem('lordzKB'); botSay('Knowledge base cleared.'); return; }
    const texts = files.filter(f => f.kind === 'text');
    if (!texts.length) { botSay('Attach a text file (.txt, .md, .csv) and send "/kb add". Then ask with "/ask your question". "/kb clear" deletes everything.'); return; }
    const box = botSay('Reading and indexing your file...');
    try { box.textContent = 'Added ' + (await kbAdd(texts)) + ' chunks. Now ask with /ask <question>.'; } catch (e) { box.textContent = 'Could not index the file: ' + e.message; }
    return;
  }
  const kbd = kbLoad();
  if (!arg) { botSay('Write your question after /ask.'); return; }
  if (!kbd.chunks.length) { botSay('Knowledge base is empty. Attach a text file and send "/kb add" first.'); return; }
  const box = botSay('Searching your knowledge base...');
  try {
    const ctx = await kbSearch(arg, kbd);
    box.remove();
    ask('<kb_context>\n' + ctx + '\n</kb_context>\nAnswer using only the context above. If the answer is not there, say you could not find it.\n\nQuestion: ' + arg, [], arg);
  } catch (e) { box.textContent = 'Search failed: ' + e.message; }
}

// part 2 (kept in a separate file so each file stays small)
document.write('<script src="/app2.js"><\/script>');
                  
