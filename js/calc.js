/* Розрахункове ядро: статистика, апроксимація, еталонні значення, контрольна сума */
(function () {
  "use strict";
  const D = window.TRAINER;

  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const sd = (a, pop) => {
    const m = mean(a);
    const ss = a.reduce((s, x) => s + (x - m) ** 2, 0);
    return Math.sqrt(ss / (a.length - (pop ? 0 : 1)));
  };

  // Лінійна регресія y = c0 + c1 x; R²
  function linfit(x, y) {
    const mx = mean(x), my = mean(y);
    let sxy = 0, sxx = 0;
    for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
    const c1 = sxy / sxx, c0 = my - c1 * mx;
    let ssr = 0, sst = 0;
    for (let i = 0; i < x.length; i++) { ssr += (y[i] - (c0 + c1 * x[i])) ** 2; sst += (y[i] - my) ** 2; }
    return { c0, c1, r2: 1 - ssr / sst };
  }

  // Еталон ПР 5 для варіанта
  function pr5Ref(v) {
    const t = D.pr5.t, data = D.pr5.v[v];
    const groups = data.map((g, i) => {
      const m = mean(g), s = sd(g);
      return { t: t[i], mean: m, sd: s, sdPop: sd(g, true), cv: (s / m) * 100 };
    });
    let iMax = 0;
    groups.forEach((g, i) => { if (g.cv > groups[iMax].cv) iMax = i; });
    const lf = linfit(t.map(Math.log), groups.map((g) => Math.log(g.mean)));
    return { groups, maxCvT: t[iMax], fit: { a: Math.exp(lf.c0), b: lf.c1, r2: lf.r2 } };
  }

  function descRef(values) {
    if (!values.length) return null;
    return { mean: mean(values), min: Math.min(...values), max: Math.max(...values), sd: values.length > 1 ? sd(values) : 0, sdPop: sd(values, true) };
  }

  const pr8Row = (v) => {
    const r = D.works[7].vt.rows[v - 1];
    return { mat: r[0], E: r[1], nu: r[2], sy: r[3], rho: r[4], F: r[5], seq: r[6] };
  };
  function pr8Ref(v) {
    const r = pr8Row(v);
    const n = r.sy / r.seq;
    return { n, ok: n >= 1.5, allow: r.sy / 1.5, row: r };
  }
  const pr8FixedRef = () => ({ n: 355 / 145, ok: 355 / 145 >= 1.5 });

  // Порівняння з допуском
  function close(x, ref, tolAbs, tolRel) {
    if (x === "" || x === null || x === undefined || isNaN(x)) return false;
    return Math.abs(x - ref) <= Math.max(tolAbs || 0, (tolRel || 0) * Math.abs(ref)) + 1e-9;
  }
  const num = (s) => {
    if (s === null || s === undefined) return NaN;
    const t = String(s).trim().replace(/\s/g, "").replace(",", ".");
    return t === "" ? NaN : Number(t);
  };

  // Контрольна сума (cyrb53, 2 проходи → 16 hex)
  function cyrb53(str, seed) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) {
      ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
  }
  const hash = (str) => cyrb53(D.config.salt + "|" + str, 7);
  window.trainerHash = (pin) => cyrb53("PIN|" + pin, 11); // для зміни PIN викладача (див. README)

  const fmt = (x, d) => (x === null || x === undefined || isNaN(x)) ? "—" : Number(x).toFixed(d === undefined ? 2 : d).replace(".", ",");

  window.CALC = { mean, sd, linfit, pr5Ref, descRef, pr8Ref, pr8Row, pr8FixedRef, close, num, hash, pinHash: window.trainerHash, fmt };
})();
