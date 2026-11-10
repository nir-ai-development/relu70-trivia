import { connect } from './net.js';
import { QUESTIONS } from './questions.js';
import { LETTERS, AVATARS, READ_MS, confetti, esc } from './shared.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const KEY = 'trivia-me' + (params.get('sim') || '');   // ?sim=N lets several test phones share one browser
const db = await connect();

let me = load(), gid = null, state = null, player = null, myAns = null;
let unsub = [], ansUnsub = null, ansQ = null;
function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(me)); } catch {} }

function show(id) { document.querySelectorAll('.scr').forEach(s => s.classList.toggle('on', s.id === 's-' + id)); }

// ---------- join form ----------
let avatar = me?.avatar || AVATARS[Math.floor(Math.random() * AVATARS.length)];
$('avatars').innerHTML = AVATARS.map(a => `<button type="button" class="${a === avatar ? 'sel' : ''}">${a}</button>`).join('');
$('avatars').addEventListener('click', e => {
  if (e.target.tagName !== 'BUTTON') return;
  avatar = e.target.textContent;
  $('avatars').querySelectorAll('button').forEach(b => b.classList.toggle('sel', b === e.target));
});
$('name').value = me?.name || '';
$('name').addEventListener('keydown', e => { if (e.key === 'Enter') $('name').blur(); });
$('join').addEventListener('click', async () => {
  const name = $('name').value.trim().replace(/\s+/g, ' ');
  if (!name) { $('joinerr').textContent = 'צריך לכתוב שם 🙂'; $('name').focus(); return; }
  $('join').disabled = true;
  const pid = Math.random().toString(36).slice(2, 10);
  me = { gid, pid, name, avatar }; save();
  await db.set(`games/${gid}/players/${pid}`, { name, avatar, score: 0, joinedAt: db.now(), online: true });
  $('join').disabled = false; $('joinerr').textContent = '';
  attach();
});
$('leave').addEventListener('click', async () => {
  if (me?.pid) await db.remove(`games/${gid}/players/${me.pid}`);
});

// ---------- follow the current game ----------
db.watch('current/game', g => {
  if (!g || g === gid) return;
  gid = g;
  if (me?.gid !== gid) me = me ? { name: me.name, avatar: me.avatar } : null;
  attach();
});

let presenceSet = false;
function attach() {
  unsub.forEach(f => f()); unsub = [];
  unsub.push(db.watch(`games/${gid}/state`, s => { state = s; render(); }));
  if (me?.pid && me.gid === gid) {
    const P = `games/${gid}/players/${me.pid}`;
    let seen = false;
    unsub.push(db.watch(P, p => {
      if (!p && seen) { me = { name: me.name, avatar: me.avatar }; save(); player = null; attach(); return; } // removed by host
      if (!p) { player = null; me.pid = null; save(); render(); return; }  // stale session
      seen = true; player = p; render();
    }));
    // presence: back online after a refresh / network drop, offline when the tab goes away
    unsub.push(db.connected(ok => {
      $('offline').classList.toggle('hidden', ok);
      if (ok && me?.pid) { db.update(P, { online: true }); db.onDisconnectUpdate(P, { online: false }); }
    }));
  } else { player = null; render(); }
}

function watchAnswer(q) {
  if (ansQ === q) return;
  ansUnsub?.(); ansQ = q; myAns = null;
  if (q >= 0 && me?.pid) ansUnsub = db.watch(`games/${gid}/answers/${q}/${me.pid}`, a => { myAns = a; render(); });
}

// ---------- answering ----------
$('btns').addEventListener('click', async e => {
  const b = e.target.closest('button');
  if (!b || myAns || state?.phase !== 'question' || state.paused) return;
  const c = +b.dataset.c;
  myAns = { c, t: db.now() }; render();
  navigator.vibrate?.(30);
  try { await db.set(`games/${gid}/answers/${state.q}/${me.pid}`, myAns); }
  catch { /* already answered from another refresh: keep the stored answer */ }
});

// ---------- render ----------
let lastKey = '', celebrated = false;
function render() {
  if (!gid || !state) return show('loading');
  $('paused').classList.toggle('hidden', !state.paused);
  if (!player) { show('join'); return; }
  const q = QUESTIONS[state.q];
  watchAnswer(state.phase === 'question' || state.phase === 'reveal' ? state.q : -1);
  const key = `${state.phase}:${state.q}`;
  const fresh = key !== lastKey; lastKey = key;

  if (state.phase === 'lobby') {
    $('w-av').textContent = player.avatar; $('w-name').textContent = player.name;
    return show('wait');
  }
  if (state.phase === 'question') {
    const lockTitle = document.querySelector('#s-locked h2');
    if (myAns) {
      lockTitle.textContent = 'התשובה נקלטה!';
      $('l-pick').className = `picked c${myAns.c}`;
      $('l-pick').innerHTML = `${LETTERS[myAns.c]} · ${esc(q.opts[myAns.c])}`;
      return show('locked');
    }
    if (db.now() >= state.endsAt) {
      lockTitle.textContent = 'הזמן נגמר ⏰'; $('l-pick').className = 'hidden';
      return show('locked');
    }
    if (db.now() < state.openAt) {
      $('r-n').textContent = `שאלה ${state.q + 1} מתוך ${QUESTIONS.length}${q.double ? ' · ✨ ניקוד כפול' : ''}`;
      $('r-q').textContent = q.q;
      return show('read');
    }
    if (fresh || !$('btns').children.length || $('btns').dataset.q != state.q) {
      $('btns').dataset.q = state.q;
      $('a-n').textContent = `שאלה ${state.q + 1}/${QUESTIONS.length}`;
      $('a-q').textContent = q.q;
      $('btns').innerHTML = q.opts.map((o, i) => `<button class="c${i}" data-c="${i}"><span class="L">${LETTERS[i]}</span>${esc(o)}</button>`).join('');
    }
    return show('answer');
  }
  if (state.phase === 'reveal' || state.phase === 'board') {
    const mine = player.lastQ === state.q;
    const ok = mine && player.correct;
    $('s-result').className = 'scr on ' + (ok ? 'good' : 'bad');
    $('res-ico').textContent = ok ? '🎉' : mine && player.answered ? '😅' : '⏰';
    $('res-title').textContent = ok ? 'נכון!' : mine && player.answered ? 'לא נורא!' : 'לא הספקת';
    $('res-pts').textContent = ok ? `+${player.gain}` : '';
    $('res-extra').innerHTML = ok
      ? (player.bonus ? `🔥 ${player.streak} ברצף! (+${player.bonus} בונוס)` : '')
      : `התשובה: <b>${esc(q.opts[q.a])}</b>`;
    const mv = state.q > 0 ? (player.prevRank || player.rank) - player.rank : 0;
    $('res-rank').textContent = player.rank || '–';
    $('res-of').textContent = `מתוך ${state.total || ''}${mv > 0 ? ` · ▲ עלית ${mv}` : ''}`;
    $('res-score').textContent = player.score || 0;
    if (fresh && state.phase === 'reveal') navigator.vibrate?.(ok ? [40, 60, 40] : 120);
    return show('result');
  }
  if (state.phase === 'podium' || state.phase === 'finale') {
    const r = player.rank || 0;
    $('f-medal').textContent = ['🥇', '🥈', '🥉'][r - 1] || '🏅';
    $('f-title').textContent = r ? `סיימתם במקום ${r}!` : 'תודה שהשתתפתם!';
    $('f-score').textContent = player.score || 0;
    show('final');
    if (!celebrated) { celebrated = true; confetti($('confetti'), 5000); }
  }
}

// timers on the phone: switch from "read" to buttons, and show seconds left
setInterval(() => {
  if (state?.phase !== 'question' || !player) return;
  const now = state.paused ? state.pausedAt : db.now();
  $('r-bar').style.width = `${Math.min(100, 100 * (1 - (state.openAt - now) / READ_MS))}%`;
  $('a-secs').textContent = Math.max(0, Math.ceil((state.endsAt - Math.max(now, state.openAt)) / 1000));
  const want = myAns ? 's-locked' : now < state.openAt ? 's-read' : now >= state.endsAt ? 's-locked' : 's-answer';
  if (!$(want).classList.contains('on')) render();
}, 150);

if (!me?.pid) show('loading');
