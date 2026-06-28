/* ============================================================
   Income & Emotional Well-Being — interactions
   ============================================================ */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── progress rail ─────────────────────────────────────── */
  const fill = $("#progressFill");
  const onScroll = () => {
    const h = document.documentElement;
    const p = h.scrollTop / (h.scrollHeight - h.clientHeight || 1);
    fill.style.width = (p * 100).toFixed(1) + "%";
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ── scroll reveals + one-shot triggers ────────────────── */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("is-in");
      if (e.target.dataset.count !== undefined) runCount(e.target);
      if (e.target.id === "bars") e.target.classList.add("is-in");
      io.unobserve(e.target);
    });
  }, { threshold: 0.18 });
  document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));

  /* counters share a softer observer (fire a bit earlier) */
  const ioCount = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { runCount(e.target); ioCount.unobserve(e.target); }
    });
  }, { threshold: 0.6 });
  document.querySelectorAll("[data-count]").forEach((el) => ioCount.observe(el));

  $("#bars") && new IntersectionObserver((es, o) => {
    es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); o.disconnect(); } });
  }, { threshold: 0.4 }).observe($("#bars"));

  function runCount(el) {
    if (el._done) return; el._done = true;
    const target = +el.dataset.count;
    const suffix = target <= 10 ? "×" : "";
    if (reduceMotion) { el.textContent = target.toLocaleString() + suffix; return; }
    const dur = 1400, t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(target * e).toLocaleString() + suffix;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ── hero experience-sampling echo ─────────────────────── */
  const esm = $("#esmRange"), echo = $("#esmEcho");
  const echoes = [
    "A rough moment. The study caught plenty of these.",
    "Not a great one. Noted, honestly.",
    "Somewhere in the middle — where most reports landed.",
    "A pretty good moment.",
    "Riding high. The top of the scale.",
  ];
  let touched = false;
  const updateEcho = () => {
    const v = +esm.value;
    echo.textContent = echoes[Math.min(4, Math.floor(v / 20))];
  };
  esm.addEventListener("input", () => { touched = true; updateEcho(); });

  /* ════════════════════════════════════════════════════════
     CHART MODEL — reconstructed from Fig 2 / Table 1
     ════════════════════════════════════════════════════════ */
  const I0 = 15000, I1 = 500000, KNOT = 100000, K = 3.5;
  const L0 = Math.log(I0), L1 = Math.log(I1), LK = Math.log(KNOT);
  const lx = (inc) => (Math.log(inc) - L0) / (L1 - L0);
  const Y_MIN = 42, Y_MAX = 94;

  // baseline t (0 = often down … 1 = usually good) → quantile-regression slopes
  const STOPS = [
    { t: 0.00, a: 46, lo: 1.90, hi: 0.34 }, // ~15th pctl
    { t: 0.30, a: 57, lo: 1.32, hi: 1.21 }, // ~30th
    { t: 0.50, a: 61, lo: 1.25, hi: 1.47 }, // ~50th
    { t: 0.72, a: 66, lo: 1.18, hi: 1.92 }, // ~70th
    { t: 1.00, a: 73, lo: 0.78, hi: 1.99 }, // ~85th
  ];
  function paramsAt(t) {
    let i = 0; while (i < STOPS.length - 2 && t > STOPS[i + 1].t) i++;
    const A = STOPS[i], B = STOPS[i + 1];
    const k = (t - A.t) / (B.t - A.t || 1);
    return { a: A.a + (B.a - A.a) * k, lo: A.lo + (B.lo - A.lo) * k, hi: A.hi + (B.hi - A.hi) * k };
  }
  function happy(inc, p) {
    const L = Math.log(inc);
    return inc <= KNOT
      ? p.a + K * p.lo * (L - L0)
      : p.a + K * p.lo * (LK - L0) + K * p.hi * (L - LK);
  }
  // mood color for a given baseline t — sampled along the page's gradient
  function moodColor(t) {
    const stops = [[66, 64, 143], [198, 92, 132], [240, 178, 74]]; // indigo→rose→gold
    const seg = t < 0.5 ? 0 : 1, k = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
    const c = stops[seg].map((v, i) => Math.round(v + (stops[seg + 1][i] - v) * k));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  /* ── HiDPI canvas helper ───────────────────────────────── */
  function fit(cv, ratio) {
    const dpr = Math.min(devicePixelRatio || 1, 2.5);
    const w = cv.clientWidth, h = Math.max(240, Math.min(360, w * ratio));
    cv.style.height = h + "px";
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  const PAD = { l: 30, r: 22, t: 18, b: 34 };
  const TICKS = [15000, 30000, 60000, 100000, 250000, 500000];
  const fmt$ = (n) => "$" + (n >= 1000 ? (n / 1000) + "k" : n);

  function plotBox(w, h) { return { x: PAD.l, y: PAD.t, w: w - PAD.l - PAD.r, h: h - PAD.t - PAD.b }; }
  function px(box, inc) { return box.x + lx(inc) * box.w; }
  function py(box, val) { return box.y + (1 - (val - Y_MIN) / (Y_MAX - Y_MIN)) * box.h; }

  function axes(ctx, box, w, h) {
    // mood gradient strip = the vertical (feeling) axis
    const g = ctx.createLinearGradient(0, box.y, 0, box.y + box.h);
    g.addColorStop(0, "#f0b24a"); g.addColorStop(0.5, "#c65c84"); g.addColorStop(1, "#42408f");
    ctx.fillStyle = g;
    ctx.fillRect(box.x - 12, box.y, 5, box.h);
    // x ticks
    ctx.font = "500 10px 'IBM Plex Mono', monospace";
    ctx.fillStyle = "rgba(26,28,46,.5)"; ctx.textAlign = "center";
    TICKS.forEach((inc, i) => {
      const x = px(box, inc);
      ctx.strokeStyle = "rgba(26,28,46,.07)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, box.y); ctx.lineTo(x, box.y + box.h); ctx.stroke();
      ctx.textAlign = i === 0 ? "left" : (i === TICKS.length - 1 ? "right" : "center");
      ctx.fillText(fmt$(inc), x, box.y + box.h + 18);
    });
    // axis captions
    ctx.fillStyle = "rgba(26,28,46,.4)"; ctx.textAlign = "left";
    ctx.fillText("income →", box.x, h - 4);
  }

  function curve(ctx, box, p, color, width, alpha) {
    ctx.beginPath();
    for (let s = 0; s <= 100; s++) {
      const inc = Math.exp(L0 + (L1 - L0) * (s / 100));
      const x = px(box, inc), y = py(box, happy(inc, p));
      s ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke(); ctx.globalAlpha = 1;
  }

  function knotLine(ctx, box) {
    const x = px(box, KNOT);
    ctx.setLineDash([3, 4]); ctx.strokeStyle = "rgba(26,28,46,.32)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, box.y); ctx.lineTo(x, box.y + box.h); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "500 9px 'IBM Plex Mono', monospace"; ctx.fillStyle = "rgba(26,28,46,.5)";
    ctx.textAlign = "center"; ctx.fillText("$100k", x, box.y - 6 + 6);
  }

  /* ── main morphing chart ───────────────────────────────── */
  const mainCv = $("#mainChart"), dial = $("#baseline");
  const verdict = $("#verdict"), detail = $("#detail");

  function drawMain() {
    const { ctx, w, h } = fit(mainCv, 0.66);
    const box = plotBox(w, h);
    ctx.clearRect(0, 0, w, h);
    axes(ctx, box, w, h);
    knotLine(ctx, box);
    // faint family of the five reference curves
    STOPS.forEach((s) => curve(ctx, box, s, "#1a1c2e", 1.25, 0.12));
    // active interpolated curve
    const t = +dial.value / 100, p = paramsAt(t), col = moodColor(t);
    curve(ctx, box, p, col, 3.4, 1);
    // endpoint marker
    const ex = px(box, I1), ey = py(box, happy(I1, p));
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(ex, ey, 4.5, 0, 7); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke();
    readout(t, p);
  }

  function readout(t, p) {
    const below = happy(KNOT, p) - happy(I0, p);
    const above = happy(I1, p) - happy(KNOT, p);
    let v, d;
    if (t < 0.22) {
      v = "Money helps — then quietly stops.";
      d = `Mood climbs until about $100k, then the line goes nearly flat (+${above.toFixed(1)} pts across the whole upper range). More income barely moves it.`;
    } else if (t < 0.6) {
      v = "Money keeps helping.";
      d = `Each step up in income adds a little more mood — about +${below.toFixed(1)} points up to $100k and another +${above.toFixed(1)} beyond it. No plateau.`;
    } else {
      v = "Money keeps helping — and speeds up.";
      d = `For people who are usually good, mood rises faster above $100k (+${above.toFixed(1)} pts) than below it (+${below.toFixed(1)}). The opposite of a plateau.`;
    }
    verdict.textContent = v; detail.textContent = d;
  }
  dial.addEventListener("input", drawMain);

  /* ── flip chart: happiness vs unhappiness ──────────────── */
  const flipCv = $("#flipChart"), flipCap = $("#flipCap");
  const bHappy = $("#flipHappy"), bUnhappy = $("#flipUnhappy");
  let flipMode = "happy";

  // happiness: a representative rising curve (the happier-majority pattern)
  const HAP = { a: 60, lo: 1.30, hi: 1.45 };
  // unhappiness: high at low income, falls steeply, then flat after $100k
  function unhappy(inc) {
    const L = Math.log(inc), drop = 1.9;
    return inc <= KNOT ? 86 - K * drop * (L - L0) : 86 - K * drop * (LK - L0) - 0.18 * K * (L - LK);
  }

  function drawFlip() {
    const { ctx, w, h } = fit(flipCv, 0.62);
    const box = plotBox(w, h);
    ctx.clearRect(0, 0, w, h);
    axes(ctx, box, w, h);
    knotLine(ctx, box);
    if (flipMode === "happy") {
      curve(ctx, box, HAP, "#f0b24a", 3.4, 1);
    } else {
      ctx.beginPath();
      for (let s = 0; s <= 100; s++) {
        const inc = Math.exp(L0 + (L1 - L0) * (s / 100));
        const x = px(box, inc), y = py(box, unhappy(inc));
        s ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.strokeStyle = "#42408f"; ctx.lineWidth = 3.4; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke();
    }
  }
  function setFlip(mode) {
    flipMode = mode;
    const happy = mode === "happy";
    bHappy.classList.toggle("is-active", happy); bHappy.setAttribute("aria-selected", happy);
    bUnhappy.classList.toggle("is-active", !happy); bUnhappy.setAttribute("aria-selected", !happy);
    flipCap.innerHTML = happy
      ? "Measured as <strong>happiness</strong>, the line keeps climbing for most people. No plateau."
      : "Measured as <strong>unhappiness</strong>, the fall stops near $100k — the original “$75k plateau,” just relabeled. Both studies were right about different things.";
    drawFlip();
  }
  bHappy.addEventListener("click", () => setFlip("happy"));
  bUnhappy.addEventListener("click", () => setFlip("unhappy"));

  /* ── responsive redraw ─────────────────────────────────── */
  let rt;
  const redraw = () => { drawMain(); drawFlip(); };
  addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(redraw, 120); });
  // initial paint (fonts may still be loading — repaint once they settle)
  function boot() { drawMain(); setFlip("happy"); }
  boot();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);

  /* ════════════════════════════════════════════════════════
     PDF reader — lazy render via pdf.js
     ════════════════════════════════════════════════════════ */
  const reader = $("#reader"), hint = $("#readerHint"), pages = $("#readerPages");
  let pdfStarted = false;
  new IntersectionObserver((es, o) => {
    es.forEach((e) => { if (e.isIntersecting && !pdfStarted) { pdfStarted = true; renderPDF(); o.disconnect(); } });
  }, { rootMargin: "400px" }).observe(reader);

  async function renderPDF() {
    if (!window.pdfjsLib) { hint.textContent = "Couldn't load the viewer — use “Open PDF” above."; return; }
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    try {
      const pdf = await pdfjsLib.getDocument("paper.pdf").promise;
      hint.style.display = "none";
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const targetW = Math.min(pages.clientWidth, 820);
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const scale = (targetW / base.width);
        const vp = page.getViewport({ scale: scale * dpr });
        const cv = document.createElement("canvas");
        cv.width = vp.width; cv.height = vp.height;
        cv.style.width = targetW + "px";
        pages.appendChild(cv);
        await page.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
      }
    } catch (err) {
      hint.style.display = "block";
      hint.textContent = "Couldn't render inline — use “Open PDF” above to read it.";
    }
  }
})();
