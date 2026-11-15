/* Sensores do tablet e aparelhos de bordo.
 * Em demonstração, os sinais são gerados com formas e valores fisiológicos realistas,
 * centrados no histórico da pessoa. O tremor usa o acelerómetro real se o aparelho o tiver.
 */
const Sensors = (() => {
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  function fit(cv) { const r = cv.getBoundingClientRect(); cv.width = r.width * DPR; cv.height = r.height * DPR; return cv.getContext('2d'); }
  function grid(ctx, w, h) {
    ctx.strokeStyle = 'rgba(61,214,140,.08)'; ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40 * DPR) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 40 * DPR) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  }
  function trace(ctx, buf, w, h, color, scale = .42, mid = .58) {
    ctx.strokeStyle = color; ctx.lineWidth = 2.5 * DPR; ctx.beginPath();
    buf.forEach((y, i) => { const X = i * w / (buf.length - 1), Y = h * mid - y * h * scale; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
    ctx.stroke();
  }
  // forma de onda de pulso (fotopletismografia): pico sistólico + incisura dicrótica
  const pulse = p => Math.exp(-Math.pow((p - .22) * 9, 2)) + .38 * Math.exp(-Math.pow((p - .48) * 10, 2));

  /* Coração pela câmara (PPG). Manter premido DURATION segundos. */
  function ppg({ canvas, button, ring, targetHr, onUpdate, onDone, onFail, duration = 15 }) {
    const ctx = fit(canvas); const W = canvas.width, H = canvas.height;
    let holding = false, t0 = 0, phase = 0, buf = new Array(320).fill(0), done = false, raf, last = performance.now();
    const hr = targetHr + rand(-2.5, 2.5), resp = rand(13, 16), hrv = Math.round(rand(40, 66));
    const down = e => { e.preventDefault(); if (done) return; holding = true; t0 = performance.now(); button.classList.add('on'); onUpdate({ state: 'measuring' }); };
    const up = () => {
      if (!holding || done) return; holding = false; button.classList.remove('on'); ring.style.strokeDashoffset = 440;
      onFail(L('O dedo saiu da lente antes do fim. Precisamos de pelo menos 15 s de sinal limpo.', 'Your finger left the lens too early. We need at least 15 s of clean signal.'));
    };
    button.addEventListener('pointerdown', down); button.addEventListener('pointerup', up); button.addEventListener('pointerleave', up);
    function loop(now) {
      if (!document.body.contains(canvas)) return;
      const dt = (now - last) / 1000; last = now;
      phase += dt * (hr / 60) * (1 + .03 * Math.sin(now / 1000 * 2 * Math.PI * resp / 60));
      let v;
      if (holding) {
        const el = (now - t0) / 1000;
        v = pulse(phase % 1) * .9 + .12 * Math.sin(now / 1000 * 2 * Math.PI * resp / 60) + rand(-.025, .025);
        ring.style.strokeDashoffset = 440 - 440 * Math.min(1, el / duration);
        if (el > 3) onUpdate({ state: 'measuring', hr: Math.round(hr + rand(-1.5, 1.5)), resp: Math.round(resp), quality: el > 6 ? L('Boa', 'Good') : L('A estabilizar', 'Settling'), good: el > 6, progress: el / duration });
        if (el >= duration && !done) { done = true; holding = false; button.classList.remove('on'); onDone({ hr: Math.round(hr), resp: Math.round(resp), hrv }); }
      } else v = done ? pulse(phase % 1) * .9 : rand(-.03, .03);
      buf.push(v); buf.shift();
      ctx.clearRect(0, 0, W, H); grid(ctx, W, H); trace(ctx, buf, W, H, '#3DD68C');
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }

  /* Tremor da mão: acelerómetro real (se existir) ou sinal simulado com tremor fisiológico de 5–7 Hz */
  function tremor({ canvas, onUpdate, onDone, duration = 10 }) {
    const ctx = fit(canvas); const W = canvas.width, H = canvas.height;
    const f = rand(5.3, 6.4), amp = rand(9, 15);
    const bx = [], by = [], bz = []; let real = false, raf, t0 = performance.now(), crossings = 0, lastSign = 0, samples = [];
    const onMotion = e => { const a = e.accelerationIncludingGravity || e.acceleration; if (!a || a.x == null) return; real = true; samples.push([a.x, a.y, a.z]); };
    window.addEventListener('devicemotion', onMotion);
    function loop(now) {
      if (!document.body.contains(canvas)) { window.removeEventListener('devicemotion', onMotion); return; }
      const t = (now - t0) / 1000;
      let x, y, z;
      if (real && samples.length) { const s = samples[samples.length - 1]; x = s[0] / 3; y = s[1] / 3; z = (s[2] - 9.8) / 3; }
      else {
        const env = 1 + .25 * Math.sin(t * 1.3);
        x = .55 * env * Math.sin(2 * Math.PI * f * t) + rand(-.08, .08);
        y = .35 * env * Math.sin(2 * Math.PI * f * t + 1.1) + rand(-.08, .08);
        z = .2 * Math.sin(2 * Math.PI * .4 * t) + rand(-.05, .05);
      }
      const sg = Math.sign(x); if (sg && sg !== lastSign) { crossings++; lastSign = sg; }
      [bx, by, bz].forEach((b, i) => { b.push([x, y, z][i]); if (b.length > 260) b.shift(); });
      ctx.clearRect(0, 0, W, H); grid(ctx, W, H);
      trace(ctx, bx, W, H, '#3DD68C', .14, .25); trace(ctx, by, W, H, '#6CC4FF', .14, .55); trace(ctx, bz, W, H, '#F7B538', .14, .83);
      onUpdate({ t, progress: t / duration, real });
      if (t >= duration) {
        window.removeEventListener('devicemotion', onMotion);
        const hz = real ? Math.max(3, Math.min(12, crossings / 2 / t)) : f;
        onDone({ hz: Math.round(hz * 10) / 10, amp: Math.round(amp), real }); return;
      }
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }

  /* Medidor de tensão de braço (oscilométrico): insufla até ~165 mmHg e esvazia, com oscilações máximas na tensão média */
  function cuff({ canvas, out, base, onDone, onTick }) {
    const ctx = fit(canvas); const W = canvas.width, H = canvas.height;
    const sys = Math.round(base.sys + rand(-5, 5)), dia = Math.round(base.dia + rand(-4, 4)), map = dia + (sys - dia) / 3;
    const pr = Math.round(base.hr + rand(-3, 3));
    let p = 0, phase = 'inflate', raf, buf = [], last = performance.now(), beat = 0;
    function loop(now) {
      if (!document.body.contains(canvas)) return;
      const dt = (now - last) / 1000; last = now;
      if (phase === 'inflate') { p += 70 * dt; if (p >= 165) phase = 'deflate'; }
      else if (phase === 'deflate') { p -= 8 * dt; if (p <= dia - 12) phase = 'done'; }
      beat += dt * pr / 60;
      const osc = phase === 'deflate' ? Math.exp(-Math.pow((p - map) / 22, 2)) * pulse(beat % 1) * 3.5 : 0;
      buf.push(p + osc); if (buf.length > 300) buf.shift();
      onTick && onTick(Math.max(0, p) / 180, osc);
      ctx.clearRect(0, 0, W, H); grid(ctx, W, H);
      ctx.strokeStyle = '#3DD68C'; ctx.lineWidth = 2 * DPR; ctx.beginPath();
      buf.forEach((v, i) => { const X = i * W / 299, Y = H - v / 180 * H; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.stroke();
      out.innerHTML = phase === 'done' ? `${sys}/${dia} <small class="muted" style="font-size:13px">mmHg, ${L('pulso', 'pulse')} ${pr}</small>`
        : `${Math.round(p)} <small class="muted" style="font-size:13px">mmHg, ${phase === 'inflate' ? L('a insuflar', 'inflating') : L('a esvaziar', 'deflating')}</small>`;
      if (phase === 'done') { onDone({ sys, dia, pr }); return; }
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
  }

  /* Oxímetro de dedo: onda pletismográfica e SpO₂ a estabilizar */
  function oximeter({ canvas, out, base, onDone, onTick, duration = 7 }) {
    const ctx = fit(canvas); const W = canvas.width, H = canvas.height;
    const spo2 = Math.round(Math.min(100, base.spo2 + rand(-.6, .8))), pr = Math.round(base.hr + rand(-3, 3));
    let t0 = performance.now(), last = t0, beat = 0, buf = new Array(300).fill(0), raf;
    function loop(now) {
      if (!document.body.contains(canvas)) return;
      const dt = (now - last) / 1000; last = now; const t = (now - t0) / 1000;
      beat += dt * pr / 60; buf.push(pulse(beat % 1) * .8); buf.shift();
      onTick && onTick(Math.min(1, t / duration), pulse(beat % 1));
      ctx.clearRect(0, 0, W, H); grid(ctx, W, H); trace(ctx, buf, W, H, '#6CC4FF', .5, .75);
      out.innerHTML = t < 2.5 ? '<span class="muted">-- %</span>' : `${t < duration ? spo2 - Math.round(Math.max(0, duration - t) / 3) : spo2} <small class="muted" style="font-size:13px">% SpO₂, ${pr} bpm</small>`;
      if (t >= duration) { onDone({ spo2, pr }); return; }
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
  }

  /* Termómetro timpânico e glicómetro: contagem com leitura progressiva */
  function countdown({ canvas, out, seconds, final, unit, from, decimals, onDone, onTick }) {
    const ctx = fit(canvas); const W = canvas.width, H = canvas.height;
    let t0 = performance.now(), raf;
    function loop(now) {
      if (!document.body.contains(canvas)) return;
      const t = (now - t0) / 1000, k = Math.min(1, t / seconds);
      const v = from + (final - from) * (1 - Math.pow(1 - k, 3));
      onTick && onTick(k);
      ctx.clearRect(0, 0, W, H); grid(ctx, W, H);
      ctx.fillStyle = 'rgba(98,211,148,.25)'; ctx.fillRect(0, H - 14 * DPR, W * k, 14 * DPR);
      ctx.fillStyle = '#3DD68C'; ctx.font = `${12 * DPR}px JetBrains Mono, monospace`; ctx.fillText(k < 1 ? L(`a medir… ${Math.ceil(seconds - t)} s`, `measuring… ${Math.ceil(seconds - t)} s`) : L('leitura concluída', 'reading complete'), 12 * DPR, 22 * DPR);
      out.innerHTML = `${v.toFixed(decimals).replace('.', LANG === 'en' ? '.' : ',')} <small class="muted" style="font-size:13px">${unit}</small>`;
      if (k >= 1) { onDone(final); return; }
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
  }

  /* Dinamómetro de mão: curva de força com subida, patamar com tremor e libertação */
  function grip({ canvas, out, base, onDone, onTick }) {
    const ctx = fit(canvas); const W = canvas.width, H = canvas.height;
    const peak = Math.round((base + rand(-1.5, 1.5)) * 10) / 10, T = 4.2;
    let t0 = performance.now(), raf, buf = [], max = 0;
    function loop(now) {
      if (!document.body.contains(canvas)) return;
      const t = (now - t0) / 1000;
      const f = t < .8 ? peak * Math.pow(t / .8, 1.6) : t < 3.2 ? peak * (1 - .04 * (t - .8)) + rand(-.4, .4) : Math.max(0, peak * .9 * (1 - (t - 3.2) / .8));
      max = Math.max(max, f); buf.push(f); if (buf.length > 260) buf.shift();
      onTick && onTick(Math.min(1, f / (base * 1.15)));
      ctx.clearRect(0, 0, W, H); grid(ctx, W, H);
      ctx.strokeStyle = '#3DD68C'; ctx.lineWidth = 2.5 * DPR; ctx.beginPath();
      buf.forEach((v, i) => { const X = i * W / 259, Y = H - 8 * DPR - v / (base * 1.4) * (H - 16 * DPR); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.stroke();
      out.innerHTML = `${f1(t < 3.2 ? f : max)} <small class="muted" style="font-size:13px">kg ${t < 3.2 ? L('a apertar', 'squeezing') : L('máximo', 'peak')}</small>`;
      if (t >= T) { onDone(Math.round(max * 10) / 10); return; }
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
  }

  return { ppg, tremor, cuff, oximeter, countdown, grip };
})();
