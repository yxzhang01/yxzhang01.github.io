(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

  /* ---------- email (assembled here so scrapers don't see it in the HTML) ---------- */
  var address = ['yongxu.zhang', 'yale.edu'].join('@');
  document.querySelectorAll('.js-email').forEach(function (a) {
    a.href = 'mailto:' + address;
    if (a.hasAttribute('data-show-address')) a.textContent = address;
  });

  /* ---------- light / dark toggle ---------- */
  var toggle = document.querySelector('.theme-toggle');
  function isDark() {
    var t = root.getAttribute('data-theme');
    return t ? t === 'dark' : darkQuery.matches;
  }
  function syncToggleLabel() {
    if (toggle) toggle.setAttribute('aria-label', isDark() ? 'Switch to light theme' : 'Switch to dark theme');
  }
  if (toggle) {
    toggle.addEventListener('click', function () {
      var next = isDark() ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      syncToggleLabel();
      plot.refreshColors();
    });
  }
  darkQuery.addEventListener && darkQuery.addEventListener('change', function () {
    syncToggleLabel();
    plot.refreshColors();
  });
  syncToggleLabel();

  /* ---------- highlight the section in view ---------- */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav a'));
  var nav = document.querySelector('.nav');
  function markCurrent(link) {
    navLinks.forEach(function (a) { a.removeAttribute('aria-current'); });
    if (!link) return;
    link.setAttribute('aria-current', 'true');
    // on narrow screens the nav scrolls sideways; keep the current link visible
    if (nav && nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: Math.max(0, link.offsetLeft - nav.offsetLeft - 16), behavior: 'auto' });
  }
  function atBottom() { return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4; }
  if ('IntersectionObserver' in window && navLinks.length) {
    var byId = {};
    navLinks.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        if (atBottom()) return markCurrent(navLinks[navLinks.length - 1]);
        var id = e.target.id === 'news' ? 'about' : e.target.id === 'teaching' ? 'talks' : e.target.id;
        markCurrent(byId[id]);
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll('main section[id]').forEach(function (s) { spy.observe(s); });
    // the last section is short, so mark it when the page is scrolled to the bottom
    window.addEventListener('scroll', function () {
      if (atBottom()) {
        markCurrent(navLinks[navLinks.length - 1]);
      }
    }, { passive: true });
  }

  /* ---------- the switching-dynamics figure ----------
     Three regimes, each a stable limit cycle around its own center.
     The state follows the active regime's flow and switches to another
     regime after a random dwell time, like a switching dynamical system. */
  var plot = (function () {
    var canvas = document.getElementById('latent-plot');
    var button = document.querySelector('.plot-toggle');
    var noop = { refreshColors: function () {} };
    if (!canvas || !canvas.getContext) return noop;
    var ctx = canvas.getContext('2d');

    var regimes = [
      { c: [-0.92, -0.42], R: 0.44, w: 2.3 },
      { c: [0.92, -0.42], R: 0.44, w: -2.5 },
      { c: [0.0, 0.70], R: 0.38, w: 2.8 }
    ];
    var dt = 0.012, alpha = 2.4, noise = 0.0035;
    var TRAIL = 1500;                 // points kept on screen
    var xs = [], ys = [], ks = [];
    var x = -0.92 + 0.44, y = -0.42, k = 0, dwell = 380;

    function randn() {
      var u = 1 - Math.random(), v = Math.random();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    function step() {
      var r = regimes[k];
      var dx = x - r.c[0], dy = y - r.c[1];
      var rad = Math.max(Math.hypot(dx, dy), 1e-3);
      var radial = alpha * (r.R - rad) / rad;
      x += dt * (radial * dx - r.w * dy) + noise * randn();
      y += dt * (radial * dy + r.w * dx) + noise * randn();
      if (--dwell <= 0) {
        k = (k + 1 + Math.floor(Math.random() * 2)) % 3;   // jump to one of the other two
        dwell = 300 + Math.floor(Math.random() * 360);
      }
      xs.push(x); ys.push(y); ks.push(k);
      if (xs.length > TRAIL) { xs.shift(); ys.shift(); ks.shift(); }
    }

    var colors = {};
    function refreshColors() {
      var cs = getComputedStyle(root);
      colors = {
        k: [cs.getPropertyValue('--a').trim(), cs.getPropertyValue('--b').trim(), cs.getPropertyValue('--c').trim()],
        rule: cs.getPropertyValue('--rule').trim(),
        slate: cs.getPropertyValue('--slate').trim(),
        surface: cs.getPropertyValue('--surface').trim()
      };
      if (!running) draw();
    }

    var W = 0, H = 0, dpr = 1;
    function resize() {
      var rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = rect.width; H = rect.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    // world -> screen. World box: x in [-1.7, 1.7], y in [-1.15, 1.3]
    var pad = { l: 34, r: 14, t: 14, b: 50 };
    function sx(v) { var pw = W - pad.l - pad.r; return pad.l + (v + 1.7) / 3.4 * pw; }
    function sy(v) { var ph = H - pad.t - pad.b; return pad.t + (1.3 - v) / 2.45 * ph; }

    function draw() {
      if (!W) return;
      ctx.clearRect(0, 0, W, H);
      var plotBottom = H - pad.b;

      // axes
      ctx.strokeStyle = colors.rule; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, plotBottom); ctx.lineTo(W - pad.r, plotBottom);
      ctx.stroke();
      ctx.fillStyle = colors.slate;
      ctx.font = '500 11px "Hanken Grotesk", system-ui, sans-serif';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('latent 1', W - pad.r - 46, plotBottom - 6);
      ctx.save(); ctx.translate(pad.l - 10, pad.t + 46); ctx.rotate(-Math.PI / 2);
      ctx.fillText('latent 2', 0, 0); ctx.restore();

      // regime attractors: faint dashed cycles + center marks
      var scale = (W - pad.l - pad.r) / 3.4;
      var scaleY = (H - pad.t - pad.b) / 2.45;
      var active = ks.length ? ks[ks.length - 1] : 0;
      regimes.forEach(function (r, i) {
        ctx.save();
        ctx.globalAlpha = i === active ? 0.55 : 0.22;
        ctx.strokeStyle = colors.k[i];
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.ellipse(sx(r.c[0]), sy(r.c[1]), r.R * scale, r.R * scaleY, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 1.5;
        var cx = sx(r.c[0]), cy = sy(r.c[1]);
        ctx.beginPath(); ctx.moveTo(cx - 4, cy); ctx.lineTo(cx + 4, cy); ctx.moveTo(cx, cy - 4); ctx.lineTo(cx, cy + 4); ctx.stroke();
        ctx.restore();
      });

      // trajectory, fading with age, colored by regime
      var n = xs.length;
      if (n > 1) {
        ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        var BUCKETS = 14;
        var i = 1;
        while (i < n) {
          var kk = ks[i], b = Math.floor((i / n) * BUCKETS);
          ctx.beginPath();
          ctx.moveTo(sx(xs[i - 1]), sy(ys[i - 1]));
          while (i < n && ks[i] === kk && Math.floor((i / n) * BUCKETS) === b) {
            ctx.lineTo(sx(xs[i]), sy(ys[i])); i++;
          }
          ctx.globalAlpha = 0.08 + 0.92 * Math.pow((b + 1) / BUCKETS, 1.6);
          ctx.strokeStyle = colors.k[kk];
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // head
        var hx = sx(xs[n - 1]), hy = sy(ys[n - 1]);
        ctx.fillStyle = colors.k[ks[n - 1]];
        ctx.beginPath(); ctx.arc(hx, hy, 4, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.25;
        ctx.beginPath(); ctx.arc(hx, hy, 9, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }

      // state strip: which regime was active, oldest on the left
      var stripY = H - 22, stripH = 10, x0 = pad.l, x1 = W - pad.r;
      ctx.fillStyle = colors.rule;
      ctx.fillRect(x0, stripY, x1 - x0, stripH);
      if (n) {
        var j = 0;
        while (j < n) {
          var s = ks[j], start = j;
          while (j < n && ks[j] === s) j++;
          var a0 = x0 + (start / TRAIL) * (x1 - x0) + (TRAIL - n) / TRAIL * (x1 - x0);
          var a1 = x0 + (j / TRAIL) * (x1 - x0) + (TRAIL - n) / TRAIL * (x1 - x0);
          ctx.fillStyle = colors.k[s];
          ctx.fillRect(a0, stripY, Math.max(a1 - a0, 1), stripH);
        }
      }
      ctx.fillStyle = colors.slate;
      ctx.font = '500 10px "Hanken Grotesk", system-ui, sans-serif';
      ctx.fillText('time', x1 - 22, stripY - 5);
      ctx.fillText('state', x0, stripY - 5);
    }

    var running = false, visible = true, userPaused = false, raf = 0;
    function frame() {
      raf = 0;
      if (!running) return;
      step(); step();          // two integration steps per frame
      draw();
      raf = requestAnimationFrame(frame);
    }
    function updateRunning() {
      var shouldRun = !userPaused && visible && !document.hidden;
      if (shouldRun && !running) { running = true; raf = requestAnimationFrame(frame); }
      if (!shouldRun && running) { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; draw(); }
    }
    function setPaused(p) {
      userPaused = p;
      if (button) { button.textContent = p ? 'Play' : 'Pause'; button.setAttribute('aria-pressed', p ? 'true' : 'false'); }
      updateRunning();
    }

    // warm up so there is already a short trail on load
    for (var w = 0; w < 1100; w++) step();
    // with reduced motion this settled picture stays still until Play is pressed

    refreshColors();
    resize();
    window.addEventListener('resize', resize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
    if (button) button.addEventListener('click', function () { setPaused(!userPaused); });
    document.addEventListener('visibilitychange', updateRunning);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (e) { visible = e[0].isIntersecting; updateRunning(); }).observe(canvas);
    }
    setPaused(reduceMotion.matches);

    return { refreshColors: refreshColors };
  })();
})();
