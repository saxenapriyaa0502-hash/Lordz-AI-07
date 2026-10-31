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

const SEARCH_RE = /\b(recommend|suggest|suggestion|video|videos|youtube|instagram|reel|reels|link|links|website|channel|latest|news|trending|search|movie|song|course|tutorial|review)\b/i;

function addSources(d, sources, q) {
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

// part 2 (kept in a separate file so each file stays small)
document.write('<script src="/app2.js"><\/script>');
    
