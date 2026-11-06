// Tiny realtime layer: Firebase Realtime Database in production, or a
// localStorage + BroadcastChannel mock (?local) so the whole game can be
// tested in one browser with several tabs / iframes.
import { FIREBASE_CONFIG } from './config.js';

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';

export const isLocal = () =>
  new URLSearchParams(location.search).has('local') || !FIREBASE_CONFIG;

export async function connect() {
  return isLocal() ? mockDb() : firebaseDb();
}

async function firebaseDb() {
  const { initializeApp } = await import(FB + 'firebase-app.js');
  const D = await import(FB + 'firebase-database.js');
  const db = D.getDatabase(initializeApp(FIREBASE_CONFIG));
  const r = p => D.ref(db, p);
  let offset = 0;
  D.onValue(r('.info/serverTimeOffset'), s => { offset = s.val() || 0; });
  return {
    kind: 'firebase',
    now: () => Date.now() + offset,
    get: async p => (await D.get(r(p))).val(),
    set: (p, v) => D.set(r(p), v),
    update: (p, o) => D.update(r(p), o),
    remove: p => D.remove(r(p)),
    watch(p, cb) { return D.onValue(r(p), s => cb(s.val())); },
    onDisconnectUpdate: (p, o) => D.onDisconnect(r(p)).update(o),
    connected(cb) { return D.onValue(r('.info/connected'), s => cb(!!s.val())); },
  };
}

function mockDb() {
  const KEY = 'trivia-mockdb';
  const ch = new BroadcastChannel(KEY);
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const parts = p => p.split('/').filter(Boolean);
  const read = (tree, p) => parts(p).reduce((o, k) => (o == null ? null : o[k] ?? null), tree);
  const write = (tree, p, v) => {
    const ks = parts(p); let o = tree;
    ks.slice(0, -1).forEach(k => { if (typeof o[k] !== 'object' || !o[k]) o[k] = {}; o = o[k]; });
    if (v == null) delete o[ks.at(-1)]; else o[ks.at(-1)] = JSON.parse(JSON.stringify(v));
  };
  const watchers = new Set();
  const notify = () => watchers.forEach(w => w.check());
  const commit = fn => { const t = load(); fn(t); localStorage.setItem(KEY, JSON.stringify(t)); ch.postMessage(1); notify(); };
  ch.onmessage = notify;
  window.addEventListener('storage', e => { if (e.key === KEY) notify(); });
  const disc = [];
  window.addEventListener('pagehide', () => disc.forEach(([p, o]) => commit(t => Object.entries(o).forEach(([k, v]) => write(t, p + '/' + k, v)))));
  return {
    kind: 'local',
    now: () => Date.now(),
    get: async p => read(load(), p),
    async set(p, v) {
      // emulate the "answer once" security rule
      if (/^games\/[^/]+\/answers\/[^/]+\/[^/]+$/.test(p) && read(load(), p) != null) throw new Error('PERMISSION_DENIED');
      commit(t => write(t, p, v));
    },
    async update(p, o) { commit(t => Object.entries(o).forEach(([k, v]) => write(t, p + '/' + k, v))); },
    async remove(p) { commit(t => write(t, p, null)); },
    watch(p, cb) {
      const w = { last: undefined, check() { const v = JSON.stringify(read(load(), p)); if (v !== this.last) { this.last = v; cb(JSON.parse(v)); } } };
      watchers.add(w); setTimeout(() => w.check());
      return () => watchers.delete(w);
    },
    async onDisconnectUpdate(p, o) { disc.push([p, o]); },
    connected(cb) { setTimeout(() => cb(true)); return () => {}; },
  };
}
