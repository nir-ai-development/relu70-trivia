import { connect } from './net.js';
import { QUESTIONS, NICKNAMES } from './questions.js';
import { PLAY_URL } from './config.js';
import { LETTERS, READ_MS, duration, points, ranked, confetti, esc } from './shared.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const db = await connect();
const local = db.kind === 'local';

// ---------- stage scaling ----------
function fit() {
  const s = Math.min(innerWidth / 1920, innerHeight / 1080);
  $('stage').style.transform = `translate(-50%,-50%) scale(${s})`;
}
addEventListener('resize', fit); fit();

// ---------- game bootstrap ----------
let gid = await db.get('current/game');
if (!gid || params.has('new')) gid = await newGame();
async function newGame() {
  const id = Date.now().toString(36);
  await db.set(`games/${id}/state`, { phase: 'lobby', q: -1, at: db.now() });
  await db.set('current/game', id);
  return id;
}
const G = p => `games/${gid}/${p}`;

let state = { phase: 'lobby', q: -1 }, players = {}, answers = {}, unAns = null, ansQ = null;
db.watch(G('state'), s => { if (s) { state = s; onState(); } });
db.watch(G('players'), p => { players = p || {}; render(); });
db.watch('current/game', g => { if (g && g !== gid) location.reload(); });

function watchAnswers(q) {
  if (ansQ === q) return;
  unAns?.(); ansQ = q; answers = {};
  if (q >= 0) unAns = db.watch(G(`answers/${q}`), a => { answers = a || {}; render(); });
}

// ---------- sound (tiny synth, no files) ----------
let ac = null, soundOn = true;
const tone = (f, t = .12, type = 'sine', vol = .15, when = 0) => {
  if (!soundOn) return;
  ac ??= new AudioContext();
  const o = ac.createOscillator(), g = ac.createGain(), t0 = ac.currentTime + when;
  o.type = type; o.frequency.value = f; g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(.001, t0 + t);
  o.connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + t);
};
const sfx = {
  join: () => { tone(880, .1, 'triangle', .1); tone(1320, .15, 'triangle', .08, .07); },
  tick: () => tone(1000, .05, 'square', .04),
  open: () => [523, 659, 784].forEach((f, i) => tone(f, .25, 'triangle', .1, i * .08)),
  reveal: () => [392, 523, 659, 1046].forEach((f, i) => tone(f, .5, 'sine', .14, i * .11)),
  fanfare: () => [523, 523, 523, 698, 880, 784, 1046].forEach((f, i) => tone(f, .45, 'triangle', .12, [0, .15, .3, .5, .85, 1.1, 1.35][i])),
};

// ---------- actions ----------
const Q = () => QUESTIONS[state.q];
const set = s => db.set(G('state'), { ...s, at: db.now() });

function goQuestion(i) {
  if (i >= QUESTIONS.length) return set({ phase: 'podium', q: QUESTIONS.length - 1 });
  const openAt = db.now() + READ_MS;
  set({ phase: 'question', q: i, openAt, endsAt: openAt + duration(QUESTIONS[i]), paused: false });
}

let revealing = false;
async function reveal() {
  if (state.phase !== 'question' || revealing) return;
  revealing = true;
  const q = Q(), qi = state.q;
  const ans = (await db.get(G(`answers/${qi}`))) || {};
  const before = ranked(players);
  const upd = {};
  const scores = {};
  for (const p of before) {
    const a = ans[p.id], gain = points(q, a, state.openAt);
    const streak = gain ? (p.streak || 0) + 1 : 0;
    const bonus = gain && streak >= 3 ? 100 : 0;
    scores[p.id] = (p.score || 0) + gain + bonus;
    Object.assign(upd, {
      [`${p.id}/gain`]: gain + bonus, [`${p.id}/bonus`]: bonus, [`${p.id}/streak`]: streak,
      [`${p.id}/correct`]: !!gain, [`${p.id}/answered`]: !!a, [`${p.id}/lastQ`]: qi,
      [`${p.id}/prevRank`]: before.indexOf(p) + 1,
    });
  }
  const after = ranked(Object.fromEntries(before.map(p => [p.id, { ...p, score: scores[p.id] }])));
  after.forEach((p, i) => { upd[`${p.id}/score`] = scores[p.id]; upd[`${p.id}/rank`] = i + 1; });
  if (before.length) await db.update(G('players'), upd);
  await set({ ...state, phase: 'reveal', paused: false, total: after.length });
  revealing = false;
}

function next() {
  const s = state.phase;
  if (s === 'lobby') goQuestion(0);
  else if (s === 'question') reveal();
  else if (s === 'reveal') set({ ...state, phase: 'board' });
  else if (s === 'board') goQuestion(state.q + 1);
  else if (s === 'podium') set({ ...state, phase: 'finale' });
}
function skip() { if (state.phase === 'question' || state.phase === 'reveal' || state.phase === 'board') goQuestion(state.q + 1); }
function pause() {
  const now = db.now();
  if (!state.paused) return set({ ...state, paused: true, pausedAt: now });
  const d = now - (state.pausedAt || now), s = { ...state, paused: false };
  if (s.phase === 'question') { s.openAt += d; s.endsAt += d; }
  delete s.pausedAt; set(s);
}
async function fresh() {
  if (!confirm('להתחיל משחק חדש? כל השחקנים והניקוד יימחקו.')) return;
  gid = await newGame(); location.reload();
}

const ACT = { next, skip, pause, new: fresh,
  full: () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(),
  sound: () => { soundOn = !soundOn; $('soundbtn').textContent = soundOn ? '🔊' : '🔇'; } };
$('controls').addEventListener('click', e => { const a = e.target.dataset.act; if (a) { ACT[a](); e.target.blur(); } });
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === ' ' || k === 'enter' || k === 'arrowleft' || k === 'pagedown') { e.preventDefault(); next(); }
  else if (k === 'p' || k === 'פ') pause();
  else if (k === 's' || k === 'ד') skip();
  else if (k === 'f' || k === 'כ') ACT.full();
  else if (k === 'm' || k === 'צ') ACT.sound();
});
let idleT; const wake = () => {
  $('controls').classList.remove('idle'); document.body.classList.remove('noctl');
  clearTimeout(idleT); idleT = setTimeout(() => { $('controls').classList.add('idle'); document.body.classList.add('noctl'); }, 3000);
};
addEventListener('mousemove', wake); wake();

// ---------- per-frame clock ----------
let lastSec = null, wasOpen = true;
setInterval(() => {
  if (state.phase !== 'question') return;
  const now = state.paused ? state.pausedAt : db.now();
  const open = now >= state.openAt;
  $('tiles').classList.toggle('closed', !open);
  $('ready').style.opacity = open ? 0 : 1;
  $('readybar').style.width = `${Math.min(100, 100 * (1 - (state.openAt - now) / READ_MS))}%`;
  const total = state.endsAt - state.openAt, left = Math.max(0, state.endsAt - Math.max(now, state.openAt));
  $('ring').style.strokeDashoffset = 326.7 * (1 - left / total);
  const sec = Math.ceil(left / 1000);
  $('secs').textContent = sec;
  document.querySelector('.timer').classList.toggle('low', open && sec <= 5);
  if (open && !wasOpen) sfx.open();
  wasOpen = open;
  if (sec !== lastSec) { if (open && sec <= 5 && sec > 0 && !state.paused) sfx.tick(); lastSec = sec; }
  if (state.paused) return;
  const online = Object.entries(players).filter(([id, p]) => p.online || answers[id]);
  const everyone = online.length > 0 && online.every(([id]) => answers[id]);
  if (now >= state.endsAt || (open && everyone)) reveal();
}, 100);

// ---------- rendering ----------
let shownPhase = null, shownQ = null;
function onState() {
  watchAnswers(state.phase === 'question' || state.phase === 'reveal' ? state.q : -1);
  if (state.phase !== shownPhase || state.q !== shownQ) enter();
  $('paused').classList.toggle('hidden', !state.paused);
  render();
}

function show(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === id)); }

function enter() {
  const prev = shownPhase; shownPhase = state.phase; shownQ = state.q;
  show(state.phase);
  const q = Q();
  if (state.phase === 'question') {
    $('qbg').style.backgroundImage = `url(media/${q.bg}_bg.jpg)`;
    $('era').textContent = q.era;
    $('qnum').textContent = `שאלה ${state.q + 1} מתוך ${QUESTIONS.length}`;
    $('double').classList.toggle('hidden', !q.double);
    $('qtext').textContent = q.q; $('qtext').style.animation = 'none'; $('qtext').offsetWidth; $('qtext').style.animation = '';
    $('tiles').innerHTML = q.opts.map((o, i) => `<div class="tile c${i}"><span class="L">${LETTERS[i]}</span><span>${esc(o)}</span></div>`).join('');
    lastSec = null; wasOpen = db.now() >= state.openAt;
  }
  if (state.phase === 'reveal') {
    sfx.reveal();
    const v = $('rvideo'); v.src = `media/${q.video}.mp4`; v.playbackRate = .85; v.currentTime = 0; v.play().catch(() => {});
    $('ranswer').textContent = q.opts[q.a];
    $('rfact').textContent = q.fact;
  }
  if (state.phase === 'board') boardPrev = prev === 'reveal';
  if (state.phase === 'podium') podium();
  if (state.phase === 'finale') finale();
}

function render() {
  const ps = ranked(players);
  if (state.phase === 'lobby') {
    $('pcount').textContent = ps.length;
    $('chips').classList.toggle('many', ps.length > 20);
    const box = $('chips'), have = new Set([...box.children].map(c => c.dataset.id));
    ps.slice().sort((a, b) => a.joinedAt - b.joinedAt).forEach(p => {
      let c = box.querySelector(`[data-id="${p.id}"]`);
      if (!c) { c = document.createElement('div'); c.className = 'chip'; c.dataset.id = p.id; box.append(c); if (shownPhase === 'lobby') sfx.join(); }
      c.innerHTML = `<span class="av">${esc(p.avatar)}</span>${esc(p.name)}`;
      c.classList.toggle('off', !p.online); have.delete(p.id);
    });
    have.forEach(id => box.querySelector(`[data-id="${id}"]`).remove());
  }
  if (state.phase === 'question') {
    const ids = Object.keys(answers);
    $('acount').textContent = ids.length;
    $('atotal').textContent = `מתוך ${ps.filter(p => p.online || answers[p.id]).length} ענו`;
    $('who').innerHTML = ids.map(id => `<span>${esc(players[id]?.avatar || '•')}</span>`).join('');
  }
  if (state.phase === 'reveal') {
    const q = Q(), counts = [0, 0, 0, 0];
    Object.values(answers).forEach(a => counts[a.c]++);
    const max = Math.max(1, ...counts);
    $('dist').innerHTML = q.opts.map((o, i) => `<div class="drow c${i} ${i === q.a ? '' : 'wrong'}"><span class="L">${LETTERS[i]}</span>
      <span class="bar"><i style="width:0" data-w="${100 * counts[i] / max}"></i></span><span class="n num">${counts[i]}</span></div>`).join('');
    requestAnimationFrame(() => requestAnimationFrame(() => $('dist').querySelectorAll('i').forEach(i => i.style.width = i.dataset.w + '%')));
    const fast = Object.entries(answers).filter(([, a]) => a.c === q.a).sort((x, y) => x[1].t - y[1].t).slice(0, 3)
      .map(([id, a]) => players[id] ? `${esc(players[id].avatar)} <b>${esc(players[id].name)}</b> ${((a.t - state.openAt) / 1000).toFixed(1)} שנ׳` : '').filter(Boolean);
    $('fast').innerHTML = fast.length ? `⚡ הכי מהירים: ${fast.join(' · ')}` : 'אף אחד לא ידע… עכשיו כולם יודעים!';
  }
  if (state.phase === 'board') board(ps);
}

// ---------- leaderboard with animated reordering ----------
let boardPrev = false;
function board(ps) {
  $('bsub').textContent = `אחרי שאלה ${state.q + 1} מתוך ${QUESTIONS.length}`;
  const n = ps.length, cols = n > 10 ? 2 : 1, perCol = Math.ceil(n / cols) || 1;
  const W = (1700 - (cols - 1) * 40) / cols, rowH = Math.min(96, Math.floor(830 / perCol)), gap = rowH > 60 ? 10 : 4;
  const fs = Math.min(40, rowH * .45);
  const box = $('blist'), old = new Set([...box.children].map(c => c.dataset.id));
  const pos = i => { const c = Math.floor(i / perCol), r = i % perCol; return [1700 - W - c * (W + 40), r * (rowH)]; };
  ps.forEach((p, i) => {
    let el = box.querySelector(`[data-id="${p.id}"]`);
    if (!el) { el = document.createElement('div'); el.className = 'brow'; el.dataset.id = p.id; box.append(el); }
    old.delete(p.id);
    const mv = state.q > 0 ? (p.prevRank || i + 1) - (i + 1) : 0;
    el.className = 'brow' + (i < 3 ? ` top${i + 1}` : '');
    el.style.cssText += `;width:${W}px;height:${rowH - gap}px;font-size:${fs}px;left:0;top:0`;
    el.innerHTML = `<span class="rk num">${['🥇', '🥈', '🥉'][i] || i + 1}</span><span class="av">${esc(p.avatar)}</span>
      <span class="nm">${esc(p.name)}</span>
      <span class="mv ${mv > 0 ? 'up' : mv < 0 ? 'down' : ''}">${mv > 0 ? '▲' + mv : mv < 0 ? '▼' + -mv : ''}</span>
      <span class="gain num">${p.gain ? '+' + p.gain + (p.bonus ? ' 🔥' : '') : ''}</span><span class="sc num">${p.score || 0}</span>`;
    const [x, y] = pos(i);
    if (boardPrev && p.prevRank && !el.dataset.placed) {
      // start at the old place, then glide to the new one
      const [ox, oy] = pos(Math.min(p.prevRank - 1, n - 1));
      el.style.transition = 'none'; el.style.transform = `translate(${ox}px,${oy}px)`; el.offsetWidth; el.style.transition = '';
      setTimeout(() => { el.style.transform = `translate(${x}px,${y}px)`; }, 700);
    } else el.style.transform = `translate(${x}px,${y}px)`;
    el.dataset.placed = 1;
  });
  old.forEach(id => box.querySelector(`[data-id="${id}"]`).remove());
  if (boardPrev) setTimeout(() => box.querySelectorAll('.brow').forEach(e => delete e.dataset.placed), 50);
  boardPrev = false;
}

// ---------- podium & finale ----------
function podium() {
  const ps = ranked(players), order = [1, 0, 2];
  $('pods').innerHTML = order.map(i => ps[i] ? `<div class="pod p${i + 1}"><div class="av">${esc(ps[i].avatar)}</div>
    <div class="nm">${esc(ps[i].name)}</div><div class="sc num">${ps[i].score || 0}</div><div class="block">${i + 1}</div></div>` : '').join('');
  $('prest').innerHTML = ps.slice(3, 10).map((p, i) => `<span><b class="num">${i + 4}</b> ${esc(p.avatar)} ${esc(p.name)}</span>`).join('<i> · </i>');
  [3, 2, 1].forEach((place, k) => setTimeout(() => {
    $('pods').querySelector(`.p${place}`)?.classList.add('show');
    if (place === 1) { sfx.fanfare(); confetti($('confetti'), 9000); } else tone(523 + k * 120, .3, 'triangle', .12);
  }, 900 + k * 1700));
}
function finale() {
  const box = $('fphotos');
  box.innerHTML = Array.from({ length: 10 }, (_, i) => `<img src="media/lobby${String(i).padStart(2, '0')}.jpg">`).join('');
  let k = 0; const imgs = box.querySelectorAll('img');
  const step = () => { imgs.forEach((im, i) => im.classList.toggle('on', i === k % imgs.length)); k++; };
  step(); clearInterval(finale.t); finale.t = setInterval(step, 4000);
  confetti($('confetti'), 15000); sfx.fanfare();
}

// ---------- lobby decoration ----------
(function lobbyDecor() {
  const spots = [[40, 60, -6], [1520, 40, 5], [80, 640, 4], [1500, 610, -4], [760, 720, 3], [1150, 700, -5], [470, 30, 4], [1200, 20, -3]];
  $('collage').innerHTML = spots.map(([x, y, r], i) => `<div class="ph" style="left:${x}px;top:${y}px;--r:${r}deg;--dx:${(i % 2 ? 1 : -1) * 30}px;--dy:${(i % 3 - 1) * 25}px;animation-delay:-${i * 3}s">
    <img src="media/lobby${String(i).padStart(2, '0')}.jpg"></div>`).join('');
  let n = 0; setInterval(() => { const el = $('nick'); el.style.opacity = 0; setTimeout(() => { el.textContent = NICKNAMES[++n % NICKNAMES.length]; el.style.opacity = 1; }, 500); }, 3000);
  const playUrl = local ? new URL('play.html?local', location.href).href : PLAY_URL;
  $('qrurl').textContent = playUrl.replace(/^https?:\/\//, '');
  if (local) $('localbadge').classList.remove('hidden');
  $('chips').addEventListener('click', e => {
    const c = e.target.closest('.chip');
    if (c && confirm(`להוציא את ${c.textContent.trim()} מהמשחק?`)) db.remove(G(`players/${c.dataset.id}`));
  });
})();

window.__host = { db, get state() { return state; }, get players() { return players; }, next, skip, pause, gid: () => gid };
