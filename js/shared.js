export const LETTERS = ['א', 'ב', 'ג', 'ד'];
export const AVATARS = ['🦁', '🐶', '🐱', '🦊', '🐼', '🐸', '🦄', '🐵', '🐙', '🐢', '🦋', '🐝',
  '🌻', '⚽', '🎹', '🚢', '🩺', '🍉', '🍕', '🎂', '👑', '😎', '🤓', '👵', '👴', '🦖', '🐬', '⭐'];
export const READ_MS = 4500;      // question shown before answers open
export const ANSWER_MS = 20000;   // time to answer

export const duration = q => ANSWER_MS + (q?.double ? 5000 : 0);

// 1000 for an instant answer down to 500 at the buzzer, x2 on the golden question.
export function points(q, ans, openAt) {
  if (!ans || ans.c !== q.a) return 0;
  const t = Math.min(Math.max(ans.t - openAt, 0), duration(q));
  return Math.round((1000 - 500 * t / duration(q)) * (q.double ? 2 : 1));
}

export function ranked(players) {
  return Object.entries(players || {})
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => (b.score || 0) - (a.score || 0) || (a.joinedAt || 0) - (b.joinedAt || 0));
}

export function confetti(canvas, ms = 6000, colors = ['#f0c87a', '#e4674f', '#2a9d96', '#d9a03a', '#7a5bc0', '#fbf3e4']) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width = innerWidth * devicePixelRatio, H = canvas.height = innerHeight * devicePixelRatio;
  const bits = Array.from({ length: 220 }, () => ({
    x: Math.random() * W, y: -Math.random() * H, w: 8 + Math.random() * 10, h: 12 + Math.random() * 14,
    vy: 2 + Math.random() * 4, vx: -1.5 + Math.random() * 3, r: Math.random() * 6, vr: -.1 + Math.random() * .2,
    c: colors[Math.floor(Math.random() * colors.length)],
  }));
  const end = performance.now() + ms;
  (function frame(now) {
    ctx.clearRect(0, 0, W, H);
    for (const b of bits) {
      b.y += b.vy * devicePixelRatio; b.x += b.vx; b.r += b.vr;
      if (b.y > H && now < end) { b.y = -20; b.x = Math.random() * W; }
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.fillStyle = b.c;
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.r * 2))); ctx.restore();
    }
    if (now < end + 4000) requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
  })(performance.now());
}

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
