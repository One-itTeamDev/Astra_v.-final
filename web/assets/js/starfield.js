/* Céu estrelado desenhado em 2D (sem perspectiva nem 3D).
 * Uso: starfield(elemento, { density, band, twinkle })
 * Desenha num <canvas> por trás do conteúdo do elemento; redesenha ao mudar de tamanho.
 */
function starfield(host, { density = 1, band = true, twinkle = true } = {}) {
  const cv = document.createElement('canvas');
  cv.className = 'starfield';
  cv.setAttribute('aria-hidden', 'true');
  host.prepend(cv);
  const ctx = cv.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let stars = [], bg = null, raf = 0;

  // gerador determinístico: o céu é sempre o mesmo
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  function build() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px';
    seed = 7;
    const off = document.createElement('canvas'); off.width = cv.width; off.height = cv.height;
    const o = off.getContext('2d');
    // céu: azul-noite com um ligeiro clarão num canto
    const g = o.createLinearGradient(0, 0, off.width, off.height);
    g.addColorStop(0, '#0B1526'); g.addColorStop(.55, '#0E1A2E'); g.addColorStop(1, '#141B33');
    o.fillStyle = g; o.fillRect(0, 0, off.width, off.height);
    // faixa da Via Láctea: diagonal, feita de nuvens muito ténues
    const ang = -0.42, cx = off.width * .5, cy = off.height * .55, len = Math.hypot(off.width, off.height);
    if (band) {
      for (let i = 0; i < 70; i++) {
        const t = (rnd() - .5) * len, s = (rnd() - .5) * off.height * .16;
        const x = cx + Math.cos(ang) * t - Math.sin(ang) * s, y = cy + Math.sin(ang) * t + Math.cos(ang) * s;
        const r = (60 + rnd() * 160) * dpr;
        const rg = o.createRadialGradient(x, y, 0, x, y, r);
        const warm = rnd() < .35;
        rg.addColorStop(0, warm ? 'rgba(214,176,150,.045)' : 'rgba(150,175,230,.05)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
        o.fillStyle = rg; o.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
    // estrelas: muitas pequenas e fracas, poucas grandes
    const n = Math.round(w * h / 1400 * density);
    stars = [];
    for (let i = 0; i < n; i++) {
      let x = rnd() * off.width, y = rnd() * off.height;
      if (band && rnd() < .45) { // concentrar parte das estrelas na faixa
        const t = (rnd() - .5) * len, s = (rnd() - .5) * (rnd() * off.height * .22);
        x = cx + Math.cos(ang) * t - Math.sin(ang) * s; y = cy + Math.sin(ang) * t + Math.cos(ang) * s;
      }
      const m = Math.pow(rnd(), 5);             // magnitude: a maioria é fraca
      const r = (.35 + m * 1.5) * dpr, a = .25 + m * .75;
      const hue = rnd(); const col = hue < .15 ? '255,214,180' : hue < .45 ? '205,220,255' : '255,255,255';
      o.fillStyle = `rgba(${col},${a})`; o.beginPath(); o.arc(x, y, r, 0, 6.283); o.fill();
      if (m > .55) { // as mais brilhantes têm um halo discreto
        const hg = o.createRadialGradient(x, y, 0, x, y, r * 6);
        hg.addColorStop(0, `rgba(${col},.22)`); hg.addColorStop(1, 'rgba(0,0,0,0)');
        o.fillStyle = hg; o.fillRect(x - r * 6, y - r * 6, r * 12, r * 12);
      }
      if (twinkle && m > .25 && rnd() < .5) stars.push({ x, y, r, col, a, p: rnd() * 6.283, s: .4 + rnd() * 1.2 });
    }
    bg = off;
    draw(0);
  }
  function draw(t) {
    if (!bg || !bg.width) return;
    ctx.drawImage(bg, 0, 0);
    if (!twinkle || still) return;
    for (const s of stars) {
      const k = .5 + .5 * Math.sin(t / 1000 * s.s + s.p);
      ctx.fillStyle = `rgba(${s.col},${s.a * k * .8})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 1.1, 0, 6.283); ctx.fill();
    }
  }
  let last = 0;
  function loop(t) { raf = requestAnimationFrame(loop); if (t - last < 80) return; last = t; draw(t); }
  build();
  new ResizeObserver(() => build()).observe(host);
  if (twinkle && !still) raf = requestAnimationFrame(loop);
  return { stop: () => cancelAnimationFrame(raf) };
}
