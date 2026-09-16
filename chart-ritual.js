(function (global) {
  'use strict';

  // A cultural reveal, not a progress estimate. All chart values come from the caller.
  const active = new WeakMap();
  const roots = new WeakMap();
  const DURATION = 3400;
  const TAU = Math.PI * 2;
  const clamp = n => Math.max(0, Math.min(1, n));
  const ease = n => 1 - Math.pow(1 - clamp(n), 3);
  const mix = (a, b, n) => a + (b - a) * n;

  function element(doc, tag, className, text) {
    const node = doc.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function play(container, options = {}) {
    if (!container || !container.ownerDocument || !container.appendChild) {
      throw new TypeError('ZhixingChartRitual.play requires a DOM container');
    }
    const previous = active.get(container);
    if (previous) previous.cancel();
    const previousRoot = roots.get(container);
    if (previousRoot) previousRoot.remove();
    const doc = container.ownerDocument;
    const dayMaster = String(options.dayMaster || '').slice(0, 16);
    const sunLabel = String(options.sunLabel || '').slice(0, 32);
    const root = element(doc, 'div', 'zx-cr');
    const scene = element(doc, 'div', 'zx-cr__scene');
    const canvas = element(doc, 'canvas', 'zx-cr__canvas');
    canvas.setAttribute('aria-hidden', 'true');
    const identity = element(doc, 'div', 'zx-cr__identity');
    identity.setAttribute('aria-hidden', 'true');
    identity.appendChild(element(doc, 'p', 'zx-cr__source', '日主'));
    identity.appendChild(element(doc, 'strong', 'zx-cr__master', dayMaster));
    if (sunLabel) identity.appendChild(element(doc, 'p', 'zx-cr__sun', sunLabel));
    const footer = element(doc, 'div', 'zx-cr__footer');
    const stage = element(doc, 'p', 'zx-cr__stage', '星轨汇聚');
    stage.setAttribute('role', 'status');
    stage.setAttribute('aria-live', 'polite');
    stage.setAttribute('aria-atomic', 'true');
    const skip = element(doc, 'button', 'zx-cr__skip', '直接看图谱');
    skip.type = 'button';
    skip.setAttribute('aria-label', '跳过星轨仪式，直接查看图谱');
    scene.append(canvas, identity);
    footer.append(stage, skip);
    root.append(scene, footer);
    container.appendChild(root);
    roots.set(container, root);

    let ended = false;
    let raf = 0;
    let deadline = 0;
    let resizeObserver;
    let ctx;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let lastTime = 0;
    let phase = '';
    let motion;
    const started = global.performance.now();
    const controller = {cancel: () => stop(false), finish: () => stop(true)};
    active.set(container, controller);

    function cleanup() {
      if (raf) global.cancelAnimationFrame(raf);
      if (deadline) global.clearTimeout(deadline);
      raf = 0;
      deadline = 0;
      if (resizeObserver) resizeObserver.disconnect();
      global.removeEventListener('resize', resize);
      doc.removeEventListener('visibilitychange', visibility);
      container.removeEventListener('keydown', keydown);
      skip.removeEventListener('click', controller.finish);
      canvas.removeEventListener('contextlost', canvasFailed);
      if (motion && motion.removeEventListener) motion.removeEventListener('change', motionChanged);
      else if (motion && motion.removeListener) motion.removeListener(motionChanged);
      if (active.get(container) === controller) active.delete(container);
    }

    function ready() {
      identity.style.opacity = '1';
      identity.style.transform = 'none';
      stage.textContent = '图谱就绪';
      stage.setAttribute('aria-label', ['图谱就绪', dayMaster, sunLabel].filter(Boolean).join('，'));
      root.dataset.phase = 'ready';
    }

    function stop(complete) {
      if (ended) return;
      ended = true;
      cleanup();
      if (!complete) {
        root.remove();
        if (roots.get(container) === root) roots.delete(container);
        return;
      }
      ready();
      // A callback can safely start another reveal: this controller is already retired.
      if (typeof options.onComplete === 'function') options.onComplete();
    }

    function visibility() {
      if (doc.hidden) controller.finish();
    }
    function keydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        controller.finish();
      }
    }
    function motionChanged(event) {
      if (event.matches) controller.finish();
    }
    function staticFallback() {
      if (ended) return;
      if (raf) global.cancelAnimationFrame(raf);
      raf = 0;
      if (deadline) global.clearTimeout(deadline);
      root.classList.add('zx-cr--static');
      ready();
      deadline = global.setTimeout(controller.finish, 120);
    }
    function canvasFailed(event) {
      event.preventDefault();
      staticFallback();
    }
    function resize() {
      if (ended || !ctx) return;
      const bounds = scene.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      dpr = Math.min(2, Math.max(1, global.devicePixelRatio || 1));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Fixed geometry keeps the composition stable on repeated generation.
    const particles = Array.from({length: 64}, (_, i) => ({
      angle: i * 2.39996323,
      spread: .45 + ((i * 37) % 61) / 61,
      depth: ((i * 13) % 23) / 23,
      size: i % 9 === 0 ? 1.8 : .7 + (i % 3) * .25
    }));

    function point(angle, radius, tilt, turn, offset) {
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius * Math.sin(tilt);
      const y = Math.sin(angle) * radius * Math.cos(tilt);
      const perspective = 700 / (700 - z);
      return {
        x: width * .5 + (x * Math.cos(turn) - y * Math.sin(turn) + offset) * perspective,
        y: height * .465 + (x * Math.sin(turn) + y * Math.cos(turn)) * perspective,
        z, perspective
      };
    }

    function strokeOrbit(radius, tilt, turn, offset, alpha, pale, rotate, divisions) {
      const color = pale ? '216,218,208' : '201,168,92';
      // Back and front halves have different light, giving each plate visible depth.
      for (let half = 0; half < 2; half++) {
        ctx.beginPath();
        for (let j = 0; j <= 64; j++) {
          const p = point((half + j / 64) * Math.PI, radius, tilt, turn, offset);
          if (j === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.lineWidth = half === 0 ? 1.1 : .65;
        ctx.strokeStyle = 'rgba(' + color + ',' + alpha * (half === 0 ? .78 : .28) + ')';
        ctx.stroke();
      }
      for (let i = 0; i < divisions; i++) {
        const angle = i * TAU / divisions + rotate;
        const a = point(angle, radius * .965, tilt, turn, offset);
        const b = point(angle, radius * 1.035, tilt, turn, offset);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = 'rgba(' + color + ',' + alpha * .7 + ')';
        ctx.lineWidth = i % 3 === 0 ? 1.2 : .65;
        ctx.stroke();
        if (i % 3 === 0) {
          const p = point(angle, radius * 1.09, tilt, turn, offset);
          ctx.beginPath();ctx.arc(p.x, p.y, 1.5 * p.perspective, 0, TAU);
          ctx.fillStyle = 'rgba(' + color + ',' + alpha * .85 + ')';ctx.fill();
        }
      }
      // A single luminous arc moves along each plate and decelerates into alignment.
      ctx.beginPath();
      for (let j = 0; j <= 24; j++) {
        const p = point(rotate + j / 24 * .48, radius, tilt, turn, offset);
        if (j === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = 'rgba(' + color + ',' + alpha * .8 + ')';
      ctx.lineWidth = 2.2;ctx.stroke();
      const label = point(pale ? 4.02 : -.63, radius * 1.2, tilt, turn, offset);
      ctx.font = '12px "PingFang SC", sans-serif';
      ctx.textAlign = 'center';ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(' + color + ',' + alpha + ')';
      ctx.fillText(pale ? '星盘' : '易理', label.x, label.y);
    }

    function draw(ms) {
      const gather = ease(ms / 1450);
      const align = ease((ms - 720) / 1550);
      const reveal = ease((ms - 2130) / 650);
      const settle = ease((ms - 2720) / 650);
      const radius = Math.min(width * .365, height * .37);
      const cx = width * .5, cy = height * .465;
      ctx.clearRect(0, 0, width, height);

      // Broad, low luminance field; no bright fullscreen flash or pulsing exposure.
      const halo = ctx.createRadialGradient(cx, cy, 4, cx, cy, radius * 1.45);
      halo.addColorStop(0, 'rgba(201,168,92,' + (.08 + align * .035) + ')');
      halo.addColorStop(.45, 'rgba(201,168,92,.035)');
      halo.addColorStop(1, 'rgba(201,168,92,0)');
      ctx.fillStyle = halo;ctx.fillRect(0, 0, width, height);

      // The outer field curls into two oblique streams, rather than a radial scan.
      particles.forEach((particle, index) => {
        const a = particle.angle + gather * (1.25 + particle.depth * .55);
        const r = radius * mix(1.2 + particle.spread, .48 + particle.depth * .65, gather);
        const tilt = index % 2 ? .56 : -.56;
        const xx = Math.cos(a) * r, yy = Math.sin(a) * r * .46;
        const x = cx + xx * Math.cos(tilt) - yy * Math.sin(tilt);
        const y = cy + xx * Math.sin(tilt) + yy * Math.cos(tilt);
        const tail = (1 - gather) * 15 + (1 - align) * 6;
        const alpha = (.28 + particle.depth * .5) * (1 - reveal * .64);
        ctx.beginPath();ctx.moveTo(x - Math.sin(a + tilt) * tail, y + Math.cos(a + tilt) * tail * .5);ctx.lineTo(x, y);
        ctx.strokeStyle = 'rgba(201,168,92,' + alpha * .55 + ')';ctx.lineWidth = .75;ctx.stroke();
        ctx.beginPath();ctx.arc(x, y, particle.size, 0, TAU);
        ctx.fillStyle = 'rgba(234,218,179,' + alpha + ')';ctx.fill();
      });

      const orbitAlpha = ease((ms - 380) / 670) * (1 - settle * .25);
      const rotation = mix(-1.9, -.25, align);
      strokeOrbit(radius, mix(.84, 1.02, align), -.49, -radius * .38 * (1 - align), orbitAlpha, false, rotation, 24);
      strokeOrbit(radius * .88, mix(1.1, .96, align), .62, radius * .44 * (1 - align), orbitAlpha * .7, true, -rotation + .6, 36);

      // A small central mask lets the two real Chinese characters remain the focal point.
      const core = ctx.createRadialGradient(cx, cy, radius * .12, cx, cy, radius * .55);
      core.addColorStop(0, 'rgba(14,18,32,' + reveal * .94 + ')');
      core.addColorStop(1, 'rgba(14,18,32,0)');
      ctx.fillStyle = core;ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
      if (reveal < .95) {
        ctx.beginPath();ctx.arc(cx, cy, 1.8, 0, TAU);
        ctx.fillStyle = 'rgba(242,221,171,' + (1 - reveal) * .7 + ')';ctx.fill();
      }
      identity.style.opacity = String(reveal);
      identity.style.transform = 'translateY(' + ((1 - reveal) * 9).toFixed(2) + 'px) scale(' + (1.08 - reveal * .08).toFixed(3) + ')';
      const nextPhase = ms < 1080 ? 'gather' : ms < 2350 ? 'align' : 'ready';
      if (nextPhase !== phase) {
        phase = nextPhase;
        root.dataset.phase = phase;
        stage.textContent = phase === 'gather' ? '星轨汇聚' : phase === 'align' ? '双盘对位' : '图谱就绪';
      }
    }

    function frame(now) {
      raf = 0;
      if (ended) return;
      if (!root.isConnected) {controller.cancel();return;}
      if (doc.hidden) {controller.finish();return;}
      lastTime = Math.max(lastTime, now - started);
      try {draw(Math.min(lastTime, DURATION));} catch (_) {staticFallback();return;}
      if (lastTime >= DURATION) controller.finish();
      else raf = global.requestAnimationFrame(frame);
    }

    skip.addEventListener('click', controller.finish);
    container.addEventListener('keydown', keydown);
    doc.addEventListener('visibilitychange', visibility);
    canvas.addEventListener('contextlost', canvasFailed);
    try {
      motion = global.matchMedia('(prefers-reduced-motion: reduce)');
      if (motion.addEventListener) motion.addEventListener('change', motionChanged);
      else if (motion.addListener) motion.addListener(motionChanged);
      ctx = canvas.getContext('2d', {alpha: true});
      if (!ctx || motion.matches || !global.requestAnimationFrame) {
        staticFallback();
      } else if (doc.hidden) {
        ready();
        deadline = global.setTimeout(controller.finish, 0);
      } else {
        resize();
        draw(0);
        if (global.ResizeObserver) {
          resizeObserver = new global.ResizeObserver(() => {
            try {resize();} catch (_) {staticFallback();}
          });
          resizeObserver.observe(scene);
        } else global.addEventListener('resize', resize);
        raf = global.requestAnimationFrame(frame);
        // A stalled frame scheduler must not trap the page behind a decorative reveal.
        deadline = global.setTimeout(controller.finish, DURATION + 100);
      }
    } catch (_) {
      staticFallback();
    }
    return controller;
  }

  global.ZhixingChartRitual = Object.freeze({play});
})(window);
