/* ІТПВМ · Тренажер — інтерфейс здобувача */
(function () {
  "use strict";
  const D = window.TRAINER, C = window.CALC, CFG = D.config;
  const KEY = "itpvm-trainer-v1";
  const APP_VERSION = "1.0";

  // ---------------- утиліти ----------------
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "html") e.innerHTML = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (k === "value") e.value = v;
      else e.setAttribute(k, v === true ? "" : v);
    }
    kids.flat(9).forEach((c) => { if (c === null || c === undefined || c === false) return; e.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return e;
  }
  const esc = (s) => String(s === undefined || s === null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const words = (s) => (String(s || "").trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu) || []).length;
  const nowISO = () => new Date().toISOString();
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleString("uk-UA", { dateStyle: "short", timeStyle: "short" }) : "—";
  const workById = (id) => D.works.find((w) => w.id === Number(id));
  const levelOf = (n) => (n <= 3 ? 1 : n <= 7 ? 2 : 3);
  const nd = (x) => (x === undefined || x === null ? "" : String(x));

  function toast(msg, kind) {
    document.querySelectorAll(".toast").forEach((q) => q.remove());
    const t = el("div", { class: "toast " + (kind || "") }, msg);
    document.body.append(t);
    setTimeout(() => t.classList.add("show"), 10);
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 2600);
  }

  // ---------------- стан ----------------
  let S = load();
  function blank() { return { app: "itpvm-trainer", version: APP_VERSION, profile: null, works: {}, log: [] }; }
  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.app === "itpvm-trainer") return s; } catch (e) { /* немає сховища */ }
    return blank();
  }
  let saveTimer = null;
  function save(now) {
    clearTimeout(saveTimer);
    const doit = () => {
      try { localStorage.setItem(KEY, JSON.stringify(S)); setSaved(true); }
      catch (e) { setSaved(false); toast("Не вдалося зберегти у браузері (замало місця?). Експортуйте файл роботи.", "err"); }
    };
    if (now) doit(); else { setSaved(null); saveTimer = setTimeout(doit, 350); }
  }
  function setSaved(ok) {
    const b = document.getElementById("save-state"); if (!b) return;
    b.textContent = ok === null ? "Збереження…" : ok ? "Збережено" : "Не збережено";
    b.className = "save-state " + (ok === null ? "pending" : ok ? "ok" : "err");
  }
  function logEv(ev) { S.log.push({ t: nowISO(), ev }); if (S.log.length > 400) S.log = S.log.slice(-400); }
  function W(wid) {
    if (!S.works[wid]) S.works[wid] = { answers: {}, checks: {}, quiz: null, ai: { tools: "", purpose: "", none: false }, conclusions: "", showAll: false, started: nowISO(), updated: nowISO() };
    return S.works[wid];
  }
  function touch(wid) { W(wid).updated = nowISO(); save(); refreshStatus(wid); }
  const variant = () => (S.profile ? Number(S.profile.variant) : 1);
  function assigned() {
    const n = S.profile && S.profile.studentNo;
    return n && CFG.taskSets[n] ? CFG.taskSets[n] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  }

  // ---------------- повнота ----------------
  function tableRows(part, val) {
    const fixed = part.fixed || [];
    if (fixed.length) return fixed.map((f, i) => (val && val[i]) || [f].concat(Array(part.cols.length - 1).fill("")));
    return val && val.length ? val : Array.from({ length: Math.max(part.min || 1, 1) }, () => Array(part.cols.length).fill(""));
  }
  function rowFilled(part, row) {
    const cells = part.fixed ? row.slice(1) : row;
    return part.loose ? cells.some((c) => String(c || "").trim()) : cells.every((c) => String(c || "").trim());
  }
  function partState(wid, n, i, part, val, v) {
    switch (part.k) {
      case "text": { const w = words(val); return { started: w > 0, done: w >= Math.max(part.min, 1), info: `${w} / ${part.min} сл.` }; }
      case "code": { const lines = String(val || "").split("\n").filter((l) => l.trim()).length; return { started: lines > 0, done: lines >= 5, info: `${lines} рядк.` }; }
      case "image": return { started: !!val, done: part.required ? !!val : true, optional: !part.required, info: val ? "додано" : part.required ? "потрібне зображення" : "необов'язково" };
      case "table": {
        const rows = tableRows(part, val), need = part.fixed ? part.fixed.length : part.min;
        const filled = rows.filter((r) => rowFilled(part, r)).length;
        const started = rows.some((r) => (part.fixed ? r.slice(1) : r).some((c) => String(c || "").trim()));
        return { started, done: filled >= need, info: `${filled} / ${need} рядк.` };
      }
      case "wm": {
        const x = val || {}; const alts = (x.alts || []).filter((a) => String(a || "").trim()).length;
        let scored = alts >= part.minAlt;
        (x.alts || []).forEach((a, ai) => part.criteria.forEach((c, ci) => { if (!(x.s && x.s[ai] && x.s[ai][ci])) scored = false; }));
        let wOk = true; if (part.weights) { const sw = (x.w || []).reduce((s, q) => s + (C.num(q) || 0), 0); wOk = Math.abs(sw - 1) < 0.011; }
        return { started: alts > 0, done: scored && wOk, info: `${alts} / ${part.minAlt} альтерн.${part.weights && !wOk ? ", Σw ≠ 1" : ""}` };
      }
      case "calc": return CALCS[part.m].state(val || {}, v, wid, n);
    }
    return { started: false, done: false };
  }
  function taskState(wid, n, v) {
    const w = workById(wid), t = w.tasks[n - 1], st = S.works[wid] || { answers: {}, checks: {} };
    let started = false, done = true;
    t.parts.forEach((p, i) => { const s = partState(wid, n, i, p, st.answers[n + "." + i], v); if (s.started) started = true; if (!s.done) done = false; });
    const ck = st.checks[n];
    return { started, done, check: ck ? (ck.passed ? "pass" : "fail") : null, attempts: ck ? ck.attempts : 0 };
  }
  function workProgress(wid, v) {
    const set = assigned(); let done = 0, started = false, checks = 0, passed = 0;
    set.forEach((n) => { const s = taskState(wid, n, v); if (s.done) done++; if (s.started) started = true; if (CHECKED[wid + "." + n]) { checks++; if (s.check === "pass") passed++; } });
    const st = S.works[wid];
    return { done, total: set.length, pct: Math.round((done / set.length) * 100), started: started || !!(st && st.quiz), checks, passed, quiz: st && st.quiz ? st.quiz.best : null };
  }
  // задачі з автоматичною перевіркою
  const CHECKED = { "1.4": 1, "5.1": 1, "5.4": 1, "5.5": 1, "8.3": 1, "8.4": 1, "8.5": 1 };

  // ---------------- перевірка ----------------
  function runCheck(wid, n, items, val) {
    const st = W(wid); const ck = st.checks[n] || { attempts: 0, passed: false, fields: {} };
    ck.attempts++; ck.fields = {};
    items.forEach((it) => { ck.fields[it.key] = it.ok; });
    ck.passed = items.every((it) => it.ok); ck.last = nowISO();
    if (ck.passed && !ck.firstPass) ck.firstPass = { at: nowISO(), attempt: ck.attempts };
    st.checks[n] = ck; logEv(`ПР${wid} задача ${n}: перевірка #${ck.attempts} — ${ck.passed ? "правильно" : "є помилки"}`);
    touch(wid);
    return ck;
  }
  function checkBox(ck) {
    if (!ck) return el("div", { class: "check-res muted" }, "Ще не перевірено. Кількість спроб фіксується й буде видна викладачу.");
    return el("div", { class: "check-res " + (ck.passed ? "ok" : "bad") },
      ck.passed ? `✓ Усі значення правильні (спроба ${ck.firstPass ? ck.firstPass.attempt : ck.attempts}).` : `✗ Є неправильні значення — перевірте позначені поля. Спроб: ${ck.attempts}.`);
  }
  function numInput(obj, key, onchange, ph, ckFields) {
    const state = ckFields && key in ckFields ? (ckFields[key] ? " ok" : " bad") : "";
    return el("input", { class: "num" + state, inputmode: "decimal", value: nd(obj[key]), placeholder: ph || "", "data-key": key,
      oninput: (e) => { obj[key] = e.target.value; e.target.classList.remove("ok", "bad"); onchange(); } });
  }
  function selInput(obj, key, opts, onchange, ckFields) {
    const state = ckFields && key in ckFields ? (ckFields[key] ? " ok" : " bad") : "";
    const s = el("select", { class: "sel" + state, onchange: (e) => { obj[key] = e.target.value; e.target.classList.remove("ok", "bad"); onchange(); } },
      el("option", { value: "" }, "— оберіть —"), opts.map((o) => el("option", { value: o[0] }, o[1])));
    s.value = nd(obj[key]); return s;
  }

  // ---------------- розрахункові модулі ----------------
  const CALCS = {
    pr1Index: {
      state: (x) => { const sc = x.scores || []; const all = D.pr1Directions.every((_, i) => sc[i] !== undefined && sc[i] !== ""); return { started: sc.some((q) => q !== undefined && q !== ""), done: all && nd(x.I) !== "", info: all ? "оцінено" : "оцінки не повні" }; },
      ref: (x) => { const sc = (x.scores || []).map(Number); const N = D.pr1Directions.length; const sum = sc.reduce((s, q) => s + (q || 0), 0); return { sum, I: (sum / (2 * N)) * 100 }; },
      render(box, x, ctx) {
        x.scores = x.scores || []; x.notes = x.notes || [];
        const ck = ctx.check(); const f = ck ? ck.fields : null;
        const rows = D.pr1Directions.map((d, i) => el("tr", null, el("td", { class: "c-num" }, i + 1), el("td", null, d),
          el("td", null, (() => { const s = el("select", { class: "sel", onchange: (e) => { x.scores[i] = e.target.value; ctx.change(); } }, el("option", { value: "" }, "—"), ["0", "1", "2"].map((o) => el("option", { value: o }, o))); s.value = nd(x.scores[i]); return s; })()),
          el("td", null, el("input", { class: "cell", value: nd(x.notes[i]), placeholder: "коротке обґрунтування", oninput: (e) => { x.notes[i] = e.target.value; ctx.change(); } }))));
        box.append(
          el("div", { class: "formula" }, el("div", { class: "f-main", html: "I = <span>Σ b<sub>i</sub></span> / (2 · N) · 100 %" }), el("div", { class: "f-vars" }, `b_i ∈ {0; 1; 2} — оцінка i-го напряму; N = ${D.pr1Directions.length} — кількість напрямів; I — інтегральний показник цифровізації, %`)),
          el("table", { class: "grid" }, el("thead", null, el("tr", null, el("th", null, "№"), el("th", null, "Напрям цифровізації"), el("th", null, "Бал"), el("th", null, "Обґрунтування"))), el("tbody", null, rows)),
          el("div", { class: "calc-row" }, el("label", null, "Ваш розрахунок: I ="), numInput(x, "I", ctx.change, "%", f), el("span", null, "%"),
            el("button", { class: "btn primary", onclick: () => {
              const r = this.ref(x); const ok = C.close(C.num(x.I), r.I, 0.15, 0);
              ctx.run([{ key: "I", ok }]); ctx.rerender(); } }, "Перевірити")),
          checkBox(ck));
      },
      items: (x) => { const r = CALCS.pr1Index.ref(x); return [{ key: "I", label: "Інтегральний показник I, %", val: x.I, ref: r.I, d: 1 }]; }
    },

    pr1Maturity: {
      state: (x) => ({ started: !!(x.cur || x.tgt), done: !!(x.cur && x.tgt && words(x.why) >= 30), info: x.cur && x.tgt ? `рівень ${x.cur} → ${x.tgt}` : "рівні не обрано" }),
      render(box, x, ctx) {
        const L = [["1", "1 — Початкова цифровізація"], ["2", "2 — Часткова автоматизація"], ["3", "3 — Інтегровані інформаційні системи"], ["4", "4 — Smart Manufacturing"], ["5", "5 — Повністю цифрове підприємство"]];
        const scale = el("div", { class: "maturity" }, L.map((l) => el("div", { class: "m-step" + (x.cur === l[0] ? " cur" : "") + (x.tgt === l[0] ? " tgt" : "") }, el("b", null, l[0]), el("span", null, l[1].slice(4)))));
        box.append(scale,
          el("div", { class: "calc-row" }, el("label", null, "Поточний рівень"), selInput(x, "cur", L, () => { ctx.change(); ctx.rerender(); }), el("label", null, "Цільовий рівень"), selInput(x, "tgt", L, () => { ctx.change(); ctx.rerender(); })),
          el("label", { class: "lbl" }, "Аргументація вибору рівнів (≥ 30 слів)"),
          textArea(x, "why", ctx.change, 3, 30));
      }
    },

    compareVariant: {
      state: (x) => ({ started: !!x.other, done: !!x.other, info: x.other ? `варіант ${x.other}` : "оберіть варіант" }),
      render(box, x, ctx) {
        const me = variant(); const w = D.works[0];
        const opts = Array.from({ length: CFG.variants }, (_, i) => i + 1).filter((i) => i !== me).map((i) => [String(i), `Варіант ${i} — ${w.vt.rows[i - 1][0]}`]);
        const cmp = el("div", { class: "cmp" });
        const draw = () => {
          cmp.innerHTML = "";
          if (!x.other) return;
          [me, Number(x.other)].forEach((v, k) => cmp.append(el("div", { class: "cmp-card" }, el("div", { class: "tag" }, k ? "Варіант для порівняння" : "Мій варіант", " · ", v), w.vt.rows[v - 1].map((c, i) => el("div", null, el("small", null, w.vt.cols[i]), el("b", null, c))))));
        };
        box.append(el("div", { class: "calc-row" }, el("label", null, "Варіант для порівняння (за узгодженням із викладачем)"), selInput(x, "other", opts, () => { draw(); ctx.change(); })), cmp);
        draw();
      }
    },

    pr5Desc: {
      vals(v) { const d = D.pr5.v[v], out = []; d.forEach((g, i) => g.forEach((s, j) => out.push({ id: i * 3 + j, t: D.pr5.t[i], j: j + 1, s }))); return out; },
      state: (x) => { const k = (x.pick || []).length; const all = ["mean", "min", "max", "sd"].every((q) => nd(x[q]) !== ""); return { started: k > 0 || all, done: k === 10 && all, info: `обрано ${k} / 10` }; },
      items(x, v) {
        const pick = (x.pick || []).map((id) => this.vals(v).find((q) => q.id === id).s); const r = C.descRef(pick) || {};
        return [
          { key: "mean", label: "Середнє x̄, МПа", val: x.mean, ref: r.mean, tol: [0.051, 0.001], d: 2 },
          { key: "min", label: "Мінімум, МПа", val: x.min, ref: r.min, tol: [0.001, 0], d: 1 },
          { key: "max", label: "Максимум, МПа", val: x.max, ref: r.max, tol: [0.001, 0], d: 1 },
          { key: "sd", label: "Станд. відхилення s, МПа", val: x.sd, ref: r.sd, tol: [0.051, 0.002], d: 2, pop: r.sdPop }
        ];
      },
      render(box, x, ctx) {
        x.pick = x.pick || []; const v = ctx.v, ck = ctx.check(), f = ck ? ck.fields : null;
        const counter = el("span", { class: "pill" }, `Обрано: ${x.pick.length} / 10`);
        const chips = el("div", { class: "chips" }, this.vals(v).map((q) => el("button", {
          class: "chip" + (x.pick.includes(q.id) ? " on" : ""), title: `t = ${q.t} мм, вимір ${q.j}`,
          onclick: (e) => {
            const i = x.pick.indexOf(q.id);
            if (i >= 0) x.pick.splice(i, 1); else { if (x.pick.length >= 10) { toast("Потрібно рівно 10 значень", "err"); return; } x.pick.push(q.id); }
            e.currentTarget.classList.toggle("on"); counter.textContent = `Обрано: ${x.pick.length} / 10`; ctx.change();
          } }, el("small", null, `t=${q.t}`), C.fmt(q.s, 1))));
        const items = this.items(x, v);
        box.append(el("p", { class: "hint" }, "Позначте рівно 10 значень σ (МПа) зі своєї таблиці, обчисліть показники та введіть результати. Стандартне відхилення — вибіркове (знаменник n − 1). Допуск — ±0,05 МПа."),
          el("div", { class: "calc-row" }, counter), chips,
          el("div", { class: "fields" }, items.map((it) => el("div", { class: "field" }, el("label", null, it.label), numInput(x, it.key, ctx.change, "", f)))),
          el("div", { class: "calc-row" }, el("button", { class: "btn primary", onclick: () => {
            if (x.pick.length !== 10) { toast("Оберіть рівно 10 значень", "err"); return; }
            const res = this.items(x, v).map((it) => ({ key: it.key, ok: C.close(C.num(it.val), it.ref, it.tol[0], it.tol[1]) }));
            const sdIt = this.items(x, v)[3];
            const ck2 = ctx.run(res); ctx.rerender();
            if (!ck2.fields.sd && C.close(C.num(x.sd), sdIt.pop, 0.051, 0.002)) toast("Підказка: ви обчислили генеральне s (знаменник n). Потрібне вибіркове — n − 1.", "warn");
          } }, "Перевірити")),
          checkBox(ck));
      }
    },

    pr5Groups: {
      state: (x) => { const g = x.g || []; let all = true, any = false; for (let i = 0; i < 5; i++) ["m", "s", "cv"].forEach((k) => { const q = g[i] && g[i][k]; if (nd(q) === "") all = false; else any = true; }); return { started: any, done: all && !!x.maxT, info: all ? "таблицю заповнено" : "заповніть таблицю" }; },
      items(x, v) {
        const r = C.pr5Ref(v), g = x.g || [], out = [];
        r.groups.forEach((q, i) => {
          out.push({ key: `m${i}`, label: `x̄ (t=${q.t})`, val: g[i] && g[i].m, ref: q.mean, tol: [0.051, 0.0005], d: 2 });
          out.push({ key: `s${i}`, label: `s (t=${q.t})`, val: g[i] && g[i].s, ref: q.sd, tol: [0.051, 0.002], d: 2, pop: q.sdPop });
          out.push({ key: `c${i}`, label: `CV (t=${q.t}), %`, val: g[i] && g[i].cv, ref: q.cv, tol: [0.051, 0.003], d: 2 });
        });
        out.push({ key: "maxT", label: "t з найбільшим CV, мм", val: x.maxT, ref: r.maxCvT, tol: [0, 0], d: 0, sel: true });
        return out;
      },
      render(box, x, ctx) {
        x.g = x.g || [{}, {}, {}, {}, {}]; const v = ctx.v, ck = ctx.check(), f = ck ? ck.fields : null; const data = D.pr5.v[v];
        const mk = (i, k, key) => { const o = x.g[i]; const st = f && key in f ? (f[key] ? " ok" : " bad") : ""; return el("input", { class: "num" + st, inputmode: "decimal", value: nd(o[k]), oninput: (e) => { o[k] = e.target.value; e.target.classList.remove("ok", "bad"); ctx.change(); } }); };
        box.append(el("p", { class: "hint" }, "Для кожної товщини: x̄ — середнє, s — вибіркове стандартне відхилення (n − 1), CV = s / x̄ · 100 %. Допуск — ±0,05 (або 0,2–0,3 % відносно)."),
          el("table", { class: "grid num-grid" }, el("thead", null, el("tr", null, ["t, мм", "σ₁", "σ₂", "σ₃", "x̄, МПа", "s, МПа", "CV, %"].map((h) => el("th", null, h)))),
            el("tbody", null, D.pr5.t.map((t, i) => el("tr", null, el("td", { class: "c-num" }, t), data[i].map((s) => el("td", { class: "ro" }, C.fmt(s, 1))), el("td", null, mk(i, "m", `m${i}`)), el("td", null, mk(i, "s", `s${i}`)), el("td", null, mk(i, "cv", `c${i}`)))))),
          el("div", { class: "calc-row" }, el("label", null, "Найбільший розкид (за CV) — при t ="), selInput(x, "maxT", D.pr5.t.map((t) => [String(t), t + " мм"]), ctx.change, f),
            el("button", { class: "btn primary", onclick: () => {
              const its = this.items(x, v); const res = its.map((it) => ({ key: it.key, ok: it.sel ? String(it.val) === String(it.ref) : C.close(C.num(it.val), it.ref, it.tol[0], it.tol[1]) }));
              const ck2 = ctx.run(res); ctx.rerender();
              if (its.some((it) => it.pop !== undefined && !ck2.fields[it.key] && C.close(C.num(it.val), it.pop, 0.051, 0.002))) toast("Підказка: для s потрібен знаменник n − 1 (вибіркове відхилення).", "warn");
            } }, "Перевірити")),
          checkBox(ck));
      }
    },

    pr5Fit: {
      state: (x) => { const all = ["a", "b", "r2"].every((k) => nd(x[k]) !== ""); return { started: ["a", "b", "r2"].some((k) => nd(x[k]) !== ""), done: all, info: all ? "параметри введено" : "введіть a, b, R²" }; },
      items(x, v) {
        const r = C.pr5Ref(v).fit;
        return [
          { key: "a", label: "a", val: x.a, ref: r.a, tol: [0, 0.015], d: 1 },
          { key: "b", label: "b", val: x.b, ref: r.b, tol: [0.006, 0], d: 4 },
          { key: "r2", label: "R²", val: x.r2, ref: r.r2, tol: [0.0006, 0], d: 4 }
        ];
      },
      render(box, x, ctx) {
        const v = ctx.v, ck = ctx.check(), f = ck ? ck.fields : null;
        const chart = el("div", { class: "chart" });
        const redraw = () => { chart.innerHTML = pr5Chart(v, x); };
        box.append(
          el("div", { class: "formula" }, el("div", { class: "f-main", html: "σ<sub>ср</sub> = a · t<sup>b</sup> &nbsp;⇔&nbsp; ln σ<sub>ср</sub> = ln a + b · ln t" }),
            el("div", { class: "f-vars" }, "σср — середнє напруження для товщини t (МПа); t — товщина (мм); a, b — параметри; R² — коефіцієнт детермінації лінійної регресії в координатах (ln t; ln σср). Апроксимуються 5 середніх значень. Excel: лінія тренду «Степенева»; Python: np.polyfit(np.log(t), np.log(m), 1).")),
          el("div", { class: "fields" }, this.items(x, v).map((it) => el("div", { class: "field" }, el("label", null, it.label), numInput(x, it.key, () => { ctx.change(); redraw(); }, "", f)))),
          el("div", { class: "calc-row" }, el("button", { class: "btn primary", onclick: () => {
            const res = this.items(x, v).map((it) => ({ key: it.key, ok: C.close(C.num(it.val), it.ref, it.tol[0], it.tol[1]) })); ctx.run(res); ctx.rerender();
          } }, "Перевірити")),
          checkBox(ck), chart);
        redraw();
      }
    },

    pr8Fixed: {
      state: (x) => ({ started: nd(x.n) !== "", done: nd(x.n) !== "" && !!x.ok, info: nd(x.n) !== "" ? "введено" : "обчисліть n" }),
      items: (x) => { const r = C.pr8FixedRef(); return [{ key: "n", label: "n", val: x.n, ref: r.n, tol: [0.011, 0], d: 2 }, { key: "ok", label: "Висновок", val: x.ok, ref: r.ok ? "yes" : "no", sel: true }]; },
      render(box, x, ctx) {
        const ck = ctx.check(), f = ck ? ck.fields : null;
        box.append(safetyFormula(355, 145),
          el("div", { class: "calc-row" }, el("label", null, "n ="), numInput(x, "n", ctx.change, "", f), el("label", null, "За [n] = 1,5 запас"), selInput(x, "ok", [["yes", "достатній"], ["no", "недостатній"]], ctx.change, f),
            el("button", { class: "btn primary", onclick: () => { const it = this.items(x); ctx.run([{ key: "n", ok: C.close(C.num(x.n), it[0].ref, 0.011, 0) }, { key: "ok", ok: x.ok === it[1].ref }]); ctx.rerender(); } }, "Перевірити")),
          checkBox(ck));
      }
    },

    pr8Var: {
      state: (x) => ({ started: nd(x.n) !== "", done: nd(x.n) !== "" && !!x.ok, info: nd(x.n) !== "" ? "введено" : "обчисліть n" }),
      items: (x, v) => { const r = C.pr8Ref(v); return [{ key: "n", label: "n", val: x.n, ref: r.n, tol: [0.011, 0], d: 2 }, { key: "ok", label: "Висновок", val: x.ok, ref: r.ok ? "yes" : "no", sel: true }]; },
      render(box, x, ctx) {
        const ck = ctx.check(), f = ck ? ck.fields : null, r = C.pr8Row(ctx.v);
        box.append(safetyFormula(r.sy, r.seq, r.mat),
          el("div", { class: "calc-row" }, el("label", null, "n ="), numInput(x, "n", ctx.change, "", f), el("label", null, "Порівняно з [n] = 1,5 запас"), selInput(x, "ok", [["yes", "достатній"], ["no", "недостатній"]], ctx.change, f),
            el("button", { class: "btn primary", onclick: () => { const it = this.items(x, ctx.v); ctx.run([{ key: "n", ok: C.close(C.num(x.n), it[0].ref, 0.011, 0) }, { key: "ok", ok: x.ok === it[1].ref }]); ctx.rerender(); } }, "Перевірити")),
          checkBox(ck));
      }
    },

    pr8Allow: {
      state: (x) => ({ started: nd(x.s) !== "", done: nd(x.s) !== "", info: nd(x.s) !== "" ? "введено" : "обчисліть [σ]" }),
      items: (x, v) => [{ key: "s", label: "[σ], МПа", val: x.s, ref: C.pr8Ref(v).allow, tol: [0.51, 0], d: 1 }],
      render(box, x, ctx) {
        const ck = ctx.check(), f = ck ? ck.fields : null, r = C.pr8Row(ctx.v);
        box.append(el("div", { class: "formula" }, el("div", { class: "f-main", html: "[σ] = σ<sub>т</sub> / [n]" }), el("div", { class: "f-vars" }, `σт = ${r.sy} МПа (${r.mat}); [n] = 1,5 — нормативний коефіцієнт запасу; [σ] — допустиме напруження для обмеження задачі оптимізації, МПа`)),
          el("div", { class: "calc-row" }, el("label", null, "[σ] ="), numInput(x, "s", ctx.change, "МПа", f), el("span", null, "МПа"),
            el("button", { class: "btn primary", onclick: () => { const it = this.items(x, ctx.v)[0]; ctx.run([{ key: "s", ok: C.close(C.num(x.s), it.ref, it.tol[0], 0) }]); ctx.rerender(); } }, "Перевірити")),
          checkBox(ck));
      }
    }
  };
  function safetyFormula(sy, seq, mat) {
    return el("div", { class: "formula" }, el("div", { class: "f-main", html: "n = σ<sub>т</sub> / σ<sub>екв</sub> &nbsp; ≥ &nbsp; [n] = 1,5" }),
      el("div", { class: "f-vars" }, `σт = ${sy} МПа — границя текучості${mat ? " (" + mat + ")" : ""}; σекв = ${seq} МПа — максимальні еквівалентні напруження; n — коефіцієнт запасу міцності (безрозмірний). Відповідь — з точністю до 0,01.`));
  }

  // ---------------- графік ПР 5 ----------------
  function pr5Chart(v, x) {
    const W0 = 640, H0 = 340, L = 58, R = 18, T = 26, B = 46;
    const data = D.pr5.v[v], t = D.pr5.t;
    const ymax = Math.ceil(Math.max(...data.flat()) * 1.1 / 50) * 50;
    const X = (q) => L + ((q - 3) / 10) * (W0 - L - R), Y = (q) => T + (1 - q / ymax) * (H0 - T - B);
    let s = `<svg viewBox="0 0 ${W0} ${H0}" class="svgchart" role="img" aria-label="Залежність напружень від товщини">`;
    for (let q = 0; q <= ymax; q += 50) s += `<line x1="${L}" x2="${W0 - R}" y1="${Y(q)}" y2="${Y(q)}" class="gl"/><text x="${L - 8}" y="${Y(q) + 4}" class="tk" text-anchor="end">${q}</text>`;
    t.forEach((q) => { s += `<text x="${X(q)}" y="${H0 - B + 18}" class="tk" text-anchor="middle">${q}</text>`; });
    s += `<line x1="${L}" x2="${W0 - R}" y1="${H0 - B}" y2="${H0 - B}" class="ax"/><line x1="${L}" x2="${L}" y1="${T}" y2="${H0 - B}" class="ax"/>`;
    s += `<text x="${(L + W0 - R) / 2}" y="${H0 - 8}" class="al" text-anchor="middle">Товщина деталі t, мм</text><text transform="translate(16 ${(T + H0 - B) / 2}) rotate(-90)" class="al" text-anchor="middle">Напруження σ, МПа</text>`;
    const a = C.num(x.a), b = C.num(x.b);
    if (isFinite(a) && isFinite(b) && a > 0) {
      let p = ""; for (let q = 3.5; q <= 12.9; q += 0.1) { const yy = a * Math.pow(q, b); if (yy > 0 && yy < ymax * 1.2) p += (p ? "L" : "M") + X(q).toFixed(1) + " " + Y(Math.min(yy, ymax)).toFixed(1); }
      s += `<path d="${p}" class="fitline"/>`;
    }
    data.forEach((g, i) => g.forEach((q) => { s += `<circle cx="${X(t[i])}" cy="${Y(q)}" r="3.5" class="pt"/>`; }));
    data.forEach((g, i) => { const m = C.mean(g); s += `<rect x="${X(t[i]) - 5}" y="${Y(m) - 5}" width="10" height="10" transform="rotate(45 ${X(t[i])} ${Y(m)})" class="mn"/>`; });
    s += `<g transform="translate(${W0 - R - 214} ${T + 4})"><rect width="210" height="62" rx="8" class="lg"/>` +
      `<circle cx="16" cy="16" r="4" class="pt"/><text x="30" y="20" class="lt">Виміри σ₁–σ₃</text>` +
      `<rect x="11" y="28" width="10" height="10" transform="rotate(45 16 33)" class="mn"/><text x="30" y="37" class="lt">Середні σср</text>` +
      `<line x1="8" x2="24" y1="50" y2="50" class="fitline"/><text x="30" y="54" class="lt">σ = a·tᵇ (ваші a, b)</text></g>`;
    return s + `</svg><div class="cap">Рис. — Залежність напружень від товщини деталі, варіант ${v}</div>`;
  }

  // ---------------- компоненти ----------------
  function autosize(t) { t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight + 2, 640) + "px"; }
  function textArea(obj, key, onchange, rows, min) {
    const cnt = el("div", { class: "wc" });
    const upd = () => { const w = words(obj[key]); cnt.textContent = min ? `${w} / ${min} слів` : `${w} слів`; cnt.classList.toggle("ok", !min || w >= min); };
    const t = el("textarea", { rows: rows || 4, value: nd(obj[key]), oninput: (e) => { obj[key] = e.target.value; upd(); autosize(e.target); onchange(); } });
    upd(); setTimeout(() => autosize(t), 0);
    return el("div", { class: "ta-wrap" }, t, cnt);
  }

  function renderPart(wid, n, i, part, holder, v) {
    const st = W(wid), key = n + "." + i;
    const change = () => { touch(wid); updPartInfo(); };
    const box = el("div", { class: "part part-" + part.k });
    const info = el("span", { class: "pinfo" });
    const updPartInfo = () => { const s = partState(wid, n, i, part, st.answers[key], v); info.textContent = part.k === "text" ? "" : s.info || ""; info.className = "pinfo " + (s.done ? "ok" : s.started ? "prog" : ""); };
    const head = el("div", { class: "part-head" }, el("span", { class: "plabel" }, part.label || (part.k === "calc" ? (CHECKED[wid + "." + n] ? "Розрахунок і автоперевірка" : "Вибір і порівняння") : "")), info);
    holder.append(box);
    const draw = () => {
      box.innerHTML = ""; box.append(head);
      if (part.k === "text") {
        const o = { v: nd(st.answers[key]) };
        const proxy = {}; Object.defineProperty(proxy, "v", { get: () => nd(st.answers[key]), set: (q) => { st.answers[key] = q; } });
        box.append(textArea(proxy, "v", change, 4, part.min));
      } else if (part.k === "code") {
        const t = el("textarea", { class: "code", rows: 10, spellcheck: "false", value: nd(st.answers[key]), placeholder: part.lang === "python" ? "import pandas as pd\nimport numpy as np\n…" : "ПОЧАТОК\n  …\nКІНЕЦЬ",
          oninput: (e) => { st.answers[key] = e.target.value; autosize(e.target); change(); },
          onkeydown: (e) => { if (e.key === "Tab") { e.preventDefault(); const s = e.target.selectionStart; e.target.setRangeText("    ", s, e.target.selectionEnd, "end"); st.answers[key] = e.target.value; change(); } } });
        setTimeout(() => autosize(t), 0); box.append(t);
      } else if (part.k === "image") {
        box.append(imageInput(st.answers[key], (val) => { st.answers[key] = val; change(); draw(); }));
      } else if (part.k === "table") {
        box.append(tableInput(part, st.answers[key], (val, structural) => { st.answers[key] = val; change(); if (structural) draw(); }));
      } else if (part.k === "wm") {
        st.answers[key] = st.answers[key] || null;
        box.append(wmInput(part, st.answers[key], (val, structural) => { st.answers[key] = val; change(); if (structural) draw(); }));
      } else if (part.k === "calc") {
        const x = st.answers[key] = st.answers[key] || {};
        const ctx = { v, change, rerender: () => draw(), check: () => W(wid).checks[n], run: (items) => runCheck(wid, n, items, x) };
        CALCS[part.m].render(box, x, ctx);
      }
      updPartInfo();
    };
    draw();
  }

  function tableInput(part, val, onchange) {
    let rows = tableRows(part, val).map((r) => r.slice());
    const commit = (structural) => onchange(rows, structural);
    const cols = part.cols.map((c) => (typeof c === "string" ? { h: c } : c));
    const tb = el("tbody");
    const foot = el("div", { class: "tfoot" });
    const updFoot = () => {
      foot.innerHTML = "";
      if (part.score !== undefined) {
        const sum = rows.reduce((s, r) => s + (parseInt(r[part.score], 10) || 0), 0), max = rows.length * part.scoreMax;
        foot.append(el("span", { class: "pill gold" }, `Σ = ${sum} з ${max} балів · ${C.fmt((sum / max) * 100, 1)} %`));
      }
    };
    rows.forEach((r, ri) => {
      const tr = el("tr");
      cols.forEach((c, ci) => {
        if (part.fixed && ci === 0) { tr.append(el("th", { class: "rowh" }, r[0])); return; }
        let inp;
        if (c.type === "select") {
          inp = el("select", { class: "sel", onchange: (e) => { rows[ri][ci] = e.target.value; commit(); updFoot(); } }, el("option", { value: "" }, "—"), c.opts.map((o) => el("option", { value: o }, o)));
          inp.value = nd(r[ci]);
        } else {
          inp = el("textarea", { class: "cell", rows: 1, value: nd(r[ci]), oninput: (e) => { rows[ri][ci] = e.target.value; autosize(e.target); commit(); if (part.delta) updDelta(); } });
          setTimeout(() => autosize(inp), 0);
        }
        tr.append(el("td", null, inp));
      });
      if (part.delta) tr.append(el("td", { class: "delta", "data-r": ri }));
      if (!part.fixed) tr.append(el("td", { class: "rm" }, el("button", { class: "icon", title: "Видалити рядок", onclick: () => { if (rows.length <= 1) return; rows.splice(ri, 1); commit(true); } }, "×")));
      tb.append(tr);
    });
    const updDelta = () => tb.querySelectorAll("td.delta").forEach((td) => {
      const r = rows[+td.dataset.r]; const a = C.num(r[part.delta[0]]), b = C.num(r[part.delta[1]]);
      td.textContent = isFinite(a) && isFinite(b) && a !== 0 ? (b >= a ? "+" : "") + C.fmt(((b - a) / Math.abs(a)) * 100, 1) + " %" : "—";
    });
    const thead = el("thead", null, el("tr", null, cols.map((c) => el("th", null, c.h)), part.delta ? el("th", null, "Зміна, %") : null, part.fixed ? null : el("th", { class: "rm" })));
    const wrap = el("div", { class: "tbl-wrap" }, el("table", { class: "grid edit" }, thead, tb));
    const out = el("div", null, wrap, el("div", { class: "tbl-actions" },
      part.fixed ? null : el("button", { class: "btn ghost sm", onclick: () => { rows.push(Array(cols.length).fill("")); commit(true); } }, "+ Додати рядок"),
      part.fixed ? null : el("span", { class: "muted sm" }, `мінімум рядків: ${part.min}`), foot));
    if (part.delta) setTimeout(updDelta, 0);
    updFoot();
    return out;
  }

  function wmInput(part, val, onchange) {
    const nc = part.criteria.length;
    const x = val ? JSON.parse(JSON.stringify(val)) : { alts: Array(part.minAlt).fill(""), w: part.weights ? Array(nc).fill("") : [], s: Array.from({ length: part.minAlt }, () => Array(nc).fill("")) };
    const commit = (structural) => onchange(x, structural);
    const res = el("div", { class: "wm-res" });
    const calcRes = () => {
      res.innerHTML = "";
      const sw = part.weights ? x.w.reduce((s, q) => s + (C.num(q) || 0), 0) : null;
      const tot = x.alts.map((a, ai) => part.criteria.reduce((s, c, ci) => s + (part.weights ? (C.num(x.w[ci]) || 0) : 1) * (Number(x.s[ai] && x.s[ai][ci]) || 0), 0));
      const best = tot.indexOf(Math.max(...tot));
      if (part.weights) res.append(el("span", { class: "pill " + (Math.abs(sw - 1) < 0.011 ? "ok" : "bad") }, `Σ ваг = ${C.fmt(sw, 2)}${Math.abs(sw - 1) < 0.011 ? " ✓" : " — має дорівнювати 1"}`));
      x.alts.forEach((a, ai) => res.append(el("span", { class: "pill" + (ai === best && tot[ai] > 0 ? " gold" : "") }, `${a || "Альтернатива " + (ai + 1)}: ${part.weights ? "I = " + C.fmt(tot[ai], 2) : "Σ = " + tot[ai] + " (сер. " + C.fmt(tot[ai] / nc, 2) + ")"}`)));
    };
    const head = el("tr", null, el("th", null, "Критерій"), part.weights ? el("th", null, "Вага w") : null,
      x.alts.map((a, ai) => el("th", null, el("input", { class: "cell hd", value: a, placeholder: `Альтернатива ${ai + 1}`, oninput: (e) => { x.alts[ai] = e.target.value; commit(); calcRes(); } }),
        x.alts.length > part.minAlt ? el("button", { class: "icon", title: "Видалити", onclick: () => { x.alts.splice(ai, 1); x.s.splice(ai, 1); commit(true); } }, "×") : null)));
    const body = part.criteria.map((c, ci) => el("tr", null, el("th", { class: "rowh" }, c),
      part.weights ? el("td", null, el("input", { class: "num", value: nd(x.w[ci]), inputmode: "decimal", oninput: (e) => { x.w[ci] = e.target.value; commit(); calcRes(); } })) : null,
      x.alts.map((a, ai) => { const s = el("select", { class: "sel", onchange: (e) => { x.s[ai][ci] = e.target.value; commit(); calcRes(); } }, el("option", { value: "" }, "—"), [1, 2, 3, 4, 5].map((q) => el("option", { value: String(q) }, q))); s.value = nd(x.s[ai][ci]); return el("td", null, s); })));
    calcRes();
    return el("div", null,
      part.weights ? el("div", { class: "formula" }, el("div", { class: "f-main", html: "I<sub>j</sub> = Σ w<sub>i</sub> · x<sub>ij</sub>, &nbsp; Σ w<sub>i</sub> = 1" }), el("div", { class: "f-vars" }, "wᵢ — вага i-го критерію; xᵢⱼ — оцінка j-ї альтернативи за i-м критерієм (1–5); Iⱼ — інтегральний показник. Найкраща — альтернатива з max Iⱼ.")) : null,
      el("div", { class: "tbl-wrap" }, el("table", { class: "grid edit wm" }, el("thead", null, head), el("tbody", null, body))),
      el("div", { class: "tbl-actions" }, el("button", { class: "btn ghost sm", onclick: () => { x.alts.push(""); x.s.push(Array(nc).fill("")); commit(true); } }, "+ Альтернатива"), el("span", { class: "muted sm" }, `мінімум: ${part.minAlt}`)), res);
  }

  function imageInput(val, onchange) {
    const file = el("input", { type: "file", accept: "image/*", hidden: true, onchange: (e) => e.target.files[0] && readImg(e.target.files[0]) });
    const readImg = (f) => {
      const r = new FileReader();
      r.onload = () => { const im = new Image(); im.onload = () => {
        const k = Math.min(1, 1600 / Math.max(im.width, im.height)); const cv = document.createElement("canvas");
        cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
        const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(im, 0, 0, cv.width, cv.height);
        onchange(cv.toDataURL("image/jpeg", 0.82)); }; im.src = r.result; };
      r.readAsDataURL(f);
    };
    if (val) return el("div", { class: "img-box" }, el("img", { src: val, alt: "Схема" }), el("div", { class: "tbl-actions" }, el("button", { class: "btn ghost sm", onclick: () => file.click() }, "Замінити"), el("button", { class: "btn ghost sm danger", onclick: () => onchange(null) }, "Видалити")), file);
    const drop = el("div", { class: "drop", tabindex: "0", onclick: () => file.click(),
      ondragover: (e) => { e.preventDefault(); drop.classList.add("over"); }, ondragleave: () => drop.classList.remove("over"),
      ondrop: (e) => { e.preventDefault(); drop.classList.remove("over"); const f = e.dataTransfer.files[0]; if (f && f.type.startsWith("image/")) readImg(f); },
      onpaste: (e) => { const it = [...(e.clipboardData || {}).items || []].find((q) => q.type.startsWith("image/")); if (it) readImg(it.getAsFile()); } },
      el("div", { class: "drop-ic" }, "⤒"), el("div", null, el("b", null, "Перетягніть зображення схеми"), " або натисніть, щоб обрати файл"), el("small", null, "PNG/JPG з draw.io, Visio, PowerPoint. Можна вставити з буфера (Ctrl+V), клацнувши тут."));
    return el("div", null, drop, file);
  }

  // ---------------- вихідні дані ----------------
  function variantCard(w, v, compact) {
    const card = el("section", { class: "card vcard" }, el("div", { class: "card-tag" }, "Вихідні дані · варіант ", el("b", null, v)));
    card.append(el("h3", null, w.vt.title));
    if (w.vt.kind === "pr5") {
      const d = D.pr5.v[v];
      card.append(el("div", { class: "tbl-wrap" }, el("table", { class: "grid data" }, el("thead", null, el("tr", null, ["t, мм", "σ₁, МПа", "σ₂, МПа", "σ₃, МПа"].map((h) => el("th", null, h)))),
        el("tbody", null, D.pr5.t.map((t, i) => el("tr", null, el("td", { class: "c-num" }, t), d[i].map((s) => el("td", null, C.fmt(s, 1)))))))));
      card.append(el("div", { class: "tbl-actions" }, el("button", { class: "btn ghost sm", onclick: () => { copyText(["t\ts1\ts2\ts3"].concat(D.pr5.t.map((t, i) => [t].concat(d[i]).join("\t"))).join("\n")); } }, "Копіювати як таблицю (для Excel)"),
        el("button", { class: "btn ghost sm", onclick: () => downloadText(`PR5_variant_${v}.csv`, "t;sigma1;sigma2;sigma3\n" + D.pr5.t.map((t, i) => [t].concat(d[i]).join(";")).join("\n")) }, "Завантажити CSV")));
    } else {
      const r = w.vt.rows[v - 1];
      card.append(el("div", { class: "vgrid" }, w.vt.cols.map((c, i) => el("div", { class: "vcell" }, el("small", null, c), el("b", null, typeof r[i] === "number" ? C.fmt(r[i], c === "ν" ? 2 : 0) : r[i])))));
    }
    if (w.vt.note) card.append(el("p", { class: "note" }, w.vt.note));
    return card;
  }
  function copyText(s) { try { navigator.clipboard.writeText(s).then(() => toast("Скопійовано", "ok")); } catch (e) { toast("Не вдалося скопіювати", "err"); } }
  function downloadText(name, text, type) {
    const blob = new Blob(["﻿" + text], { type: type || "text/csv;charset=utf-8" });
    const a = el("a", { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---------------- тест ----------------
  function quizBlock(w) {
    const st = W(w.id); const box = el("section", { class: "card quiz", id: "quiz" });
    const draw = (mode) => {
      box.innerHTML = "";
      box.append(el("div", { class: "card-tag" }, "Самоперевірка"), el("h3", null, "Тест за темою роботи · 5 запитань"));
      if (st.quiz) box.append(el("p", { class: "muted" }, `Найкращий результат: ${st.quiz.best} / 5 · спроб: ${st.quiz.attempts}`));
      if (mode !== "run") { box.append(el("button", { class: "btn " + (st.quiz ? "ghost" : "primary"), onclick: () => draw("run") }, st.quiz ? "Пройти ще раз" : "Почати тест")); return; }
      const order = w.quiz.map((q) => shuffle(q.o.map((_, i) => i)));
      const ans = Array(w.quiz.length).fill(null);
      const qs = w.quiz.map((q, qi) => el("div", { class: "q" }, el("div", { class: "qt" }, el("span", { class: "badge" }, qi + 1), q.q),
        el("div", { class: "opts" }, order[qi].map((oi) => el("label", { class: "opt" }, el("input", { type: "radio", name: `q${w.id}_${qi}`, onchange: () => { ans[qi] = oi; } }), el("span", null, q.o[oi])))),
        el("div", { class: "qe", hidden: true })));
      const btn = el("button", { class: "btn primary", onclick: () => {
        if (ans.some((a) => a === null)) { toast("Дайте відповідь на всі запитання", "err"); return; }
        let sc = 0; w.quiz.forEach((q, qi) => { const ok = ans[qi] === q.a; if (ok) sc++; const e = qs[qi].querySelector(".qe"); e.hidden = false; e.className = "qe " + (ok ? "ok" : "bad"); e.textContent = (ok ? "✓ " : "✗ Правильно: «" + q.o[q.a] + "». ") + q.e; qs[qi].querySelectorAll("input").forEach((i) => (i.disabled = true)); });
        st.quiz = { best: Math.max(sc, st.quiz ? st.quiz.best : 0), last: sc, attempts: (st.quiz ? st.quiz.attempts : 0) + 1, at: nowISO() };
        logEv(`ПР${w.id}: тест — ${sc}/5`); touch(w.id);
        btn.replaceWith(el("div", { class: "quiz-score" }, `Результат: ${sc} / 5`, el("button", { class: "btn ghost sm", onclick: () => draw("run") }, "Ще раз")));
      } }, "Завершити тест");
      box.append(...qs, btn);
    };
    draw();
    return box;
  }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // ---------------- сторінка роботи ----------------
  function renderWork(wid) {
    const w = workById(wid); if (!w) return renderHome();
    const v = variant(), st = W(wid), set = assigned();
    const main = document.getElementById("main"); main.innerHTML = "";
    const list = st.showAll ? w.tasks.map((_, i) => i + 1) : set;
    const hdr = el("header", { class: "work-hero" },
      el("div", { class: "crumbs" }, el("a", { href: "#/" }, "Мої роботи"), " / ", `Практична робота № ${w.id}`),
      el("h1", null, el("span", { class: "pr-no" }, `ПР ${w.id}`), w.title),
      el("p", { class: "goal" }, el("b", null, "Мета. "), w.goal),
      el("div", { class: "hero-meta" },
        el("span", { class: "pill" }, `Варіант ${v}`),
        el("span", { class: "pill" }, S.profile.studentNo === "all" ? "Усі задачі" : `Здобувач № ${S.profile.studentNo}: задачі ${set.join(", ")}`),
        el("label", { class: "switch" }, el("input", { type: "checkbox", checked: st.showAll, onchange: (e) => { st.showAll = e.target.checked; save(); renderWork(wid); } }), el("span", null, "Показати всі 10 задач теми"))),
      el("details", { class: "rubric" }, el("summary", null, "Критерії оцінювання (100 балів)"), el("ul", null, w.rubric.map((r) => el("li", null, el("span", null, r[0]), el("b", null, r[1]))))));
    main.append(hdr, variantCard(w, v));
    // навігація задач
    main.append(el("nav", { class: "task-nav" }, list.map((n) => el("a", { href: `#t${n}`, class: "tn", "data-tn": n, onclick: (e) => { e.preventDefault(); document.getElementById("t" + n).scrollIntoView({ behavior: "smooth", block: "start" }); } }, n)),
      el("a", { href: "#quiz", class: "tn wide", onclick: (e) => { e.preventDefault(); document.getElementById("quiz").scrollIntoView({ behavior: "smooth" }); } }, "Тест"),
      el("a", { href: "#submit", class: "tn wide", onclick: (e) => { e.preventDefault(); document.getElementById("submit").scrollIntoView({ behavior: "smooth" }); } }, "Здача")));
    list.forEach((n) => {
      const t = w.tasks[n - 1], lvl = levelOf(n), extra = !set.includes(n);
      const card = el("section", { class: "card task lvl" + lvl + (extra ? " extra" : ""), id: "t" + n, "data-tn": n },
        el("div", { class: "task-head" }, el("span", { class: "badge big" }, n), el("span", { class: "lvl-tag" }, `Складність: ${D.LEVELS[lvl]}`),
          extra ? el("span", { class: "lvl-tag gray" }, "додаткова (не входить у ваш набір)") : null, CHECKED[wid + "." + n] ? el("span", { class: "lvl-tag gold" }, "автоперевірка") : null,
          el("span", { class: "tstatus", "data-ts": n })),
        el("p", { class: "task-text" }, t.text));
      const holder = el("div", { class: "parts" }); card.append(holder);
      t.parts.forEach((p, i) => renderPart(wid, n, i, p, holder, v));
      main.append(card);
    });
    main.append(quizBlock(w), submitBlock(w));
    refreshStatus(wid);
    if (!st.opened) { st.opened = nowISO(); logEv(`ПР${wid}: відкрито`); save(); }
    window.scrollTo(0, 0);
  }

  function submitBlock(w) {
    const st = W(w.id), v = variant();
    const box = el("section", { class: "card submit", id: "submit" }, el("div", { class: "card-tag" }, "Завершення роботи"), el("h3", null, "Висновки, використання AI та здача"));
    const ai = st.ai;
    const chk = el("div", { class: "checklist" });
    const updChk = () => {
      const p = workProgress(w.id, v); chk.innerHTML = "";
      const items = [
        [p.done === p.total, `Задачі виконано: ${p.done} / ${p.total}`],
        [p.checks === 0 || p.passed === p.checks, p.checks ? `Автоперевірка: ${p.passed} / ${p.checks} задач правильно` : "Автоперевірка: у вашому наборі немає розрахункових задач"],
        [!!st.quiz, st.quiz ? `Тест: ${st.quiz.best} / 5` : "Тест не пройдено"],
        [ai.none || (words(ai.tools) >= 1 && words(ai.purpose) >= 5), "Зазначено використання AI (вимога академічної доброчесності)"],
        [words(st.conclusions) >= 80, `Висновки: ${words(st.conclusions)} / 80 слів`]
      ];
      items.forEach(([ok, t]) => chk.append(el("div", { class: "ci " + (ok ? "ok" : "") }, el("span", { class: "dot" }, ok ? "✓" : "•"), t)));
    };
    const ch = () => { touch(w.id); updChk(); };
    const aiTools = textArea(ai, "tools", ch, 1);
    const aiPurp = textArea(ai, "purpose", ch, 2);
    box.append(
      el("div", { class: "two" },
        el("div", null, el("label", { class: "lbl" }, "Використані інструменти AI"), aiTools,
          el("label", { class: "lbl" }, "Для яких завдань і як перевірялися результати"), aiPurp,
          el("label", { class: "chk" }, el("input", { type: "checkbox", checked: ai.none, onchange: (e) => { ai.none = e.target.checked; ch(); } }), "AI під час виконання не використовувався")),
        el("div", null, el("label", { class: "lbl" }, "Висновки до роботи (≥ 80 слів)"), textArea(st, "conclusions", ch, 7, 80))),
      el("h4", null, "Готовність до здачі"), chk,
      el("div", { class: "actions" },
        el("button", { class: "btn primary", onclick: () => exportSubmission([w.id]) }, "⬇ Файл для здачі (.json)"),
        el("button", { class: "btn gold", onclick: () => printReport([w.id]) }, "🖨 Звіт для друку / PDF")),
      el("p", { class: "muted sm" }, "Надішліть викладачу файл .json (через Moodle, пошту або Teams) — він відкриває його у режимі викладача з автоматичною перевіркою. Звіт PDF оформлено за вимогами методичних вказівок (титульний аркуш за додатком А)."),
      st.exportedAt ? el("p", { class: "muted sm" }, `Останній експорт: ${fmtDate(st.exportedAt)}`) : null);
    updChk();
    return box;
  }

  function refreshStatus(wid) {
    const v = variant();
    document.querySelectorAll("[data-ts]").forEach((e) => {
      const s = taskState(wid, +e.dataset.ts, v);
      e.className = "tstatus " + (s.done ? "done" : s.started ? "prog" : "");
      e.textContent = (s.done ? "Виконано" : s.started ? "В роботі" : "Не розпочато") + (s.check ? (s.check === "pass" ? " · ✓ перевірено" : ` · ✗ спроб: ${s.attempts}`) : "");
    });
    document.querySelectorAll(".tn[data-tn]").forEach((e) => { const s = taskState(wid, +e.dataset.tn, v); e.className = "tn " + (s.done ? "done" : s.started ? "prog" : ""); });
    renderSide();
  }

  // ---------------- головна ----------------
  function ring(pct, size) {
    const r = 18, c = 2 * Math.PI * r;
    return `<svg viewBox="0 0 44 44" width="${size || 44}" height="${size || 44}" class="ring"><circle cx="22" cy="22" r="${r}" class="rb"/>${pct > 0 ? "" : "<!--"}<circle cx="22" cy="22" r="${r}" class="rf" stroke-dasharray="${(c * pct) / 100} ${c}" transform="rotate(-90 22 22)"/>${pct > 0 ? "" : "-->"}<text x="22" y="26" text-anchor="middle">${pct}</text></svg>`;
  }
  function renderHome() {
    const main = document.getElementById("main"); main.innerHTML = "";
    if (!S.profile) return renderOnboarding();
    const v = variant(), set = assigned();
    const progs = D.works.map((w) => workProgress(w.id, v));
    const total = Math.round(progs.reduce((s, p) => s + p.pct, 0) / 8);
    main.append(
      el("header", { class: "home-hero" },
        el("div", null, el("div", { class: "eyebrow" }, `${CFG.courseShort} · практичні роботи 1–8`), el("h1", null, `Вітаємо, ${S.profile.name.split(" ")[1] || S.profile.name}!`),
          el("p", null, `Варіант ${v} · ${S.profile.studentNo === "all" ? "усі задачі" : `здобувач № ${S.profile.studentNo} (задачі ${set.join(", ")})`} · ${S.profile.group || ""}`)),
        el("div", { class: "hero-ring", html: ring(total, 96) + "<span>загальний прогрес, %</span>" })),
      el("div", { class: "works-grid" }, D.works.map((w, i) => {
        const p = progs[i];
        return el("a", { class: "wcard" + (p.pct === 100 ? " full" : ""), href: `#/work/${w.id}` },
          el("div", { class: "wc-top" }, el("span", { class: "pr-no" }, `ПР ${w.id}`), el("span", { html: ring(p.pct) })),
          el("h3", null, w.short),
          el("div", { class: "wc-meta" },
            el("span", null, `Задачі: ${p.done}/${p.total}`),
            p.checks ? el("span", { class: p.passed === p.checks ? "ok" : "" }, `Розрахунки: ${p.passed}/${p.checks}`) : null,
            el("span", { class: p.quiz !== null ? "ok" : "" }, p.quiz !== null ? `Тест: ${p.quiz}/5` : "Тест: —")));
      })),
      el("section", { class: "card" }, el("div", { class: "card-tag" }, "Файли"), el("h3", null, "Збереження та здача"),
        el("p", { class: "muted" }, "Відповіді автоматично зберігаються в цьому браузері. Щоб продовжити на іншому комп'ютері або зробити резервну копію — експортуйте файл і відкрийте його там."),
        el("div", { class: "actions" },
          el("button", { class: "btn primary", onclick: () => exportSubmission(D.works.map((w) => w.id).filter((id) => S.works[id])) }, "⬇ Експортувати всі роботи"),
          el("button", { class: "btn ghost", onclick: () => importBackup() }, "⤒ Відновити з файлу"),
          el("button", { class: "btn ghost", onclick: () => printReport(D.works.map((w) => w.id).filter((id) => S.works[id])) }, "🖨 Звіт за всіма роботами"),
          el("button", { class: "btn ghost danger", onclick: () => { if (confirm("Видалити всі відповіді з цього браузера? Дію неможливо скасувати.")) { S = blank(); save(true); renderHome(); renderSide(); } } }, "Очистити дані"))),
      el("section", { class: "card how" }, el("div", { class: "card-tag" }, "Як працювати"), el("ol", null,
        el("li", null, "Відкрийте практичну роботу, ознайомтеся з метою і вихідними даними свого варіанта."),
        el("li", null, "Виконайте задачі свого набору: заповніть таблиці, тексти, схеми; розрахункові задачі перевіряються автоматично."),
        el("li", null, "Пройдіть тест для самоперевірки, зазначте використання AI та сформулюйте висновки."),
        el("li", null, "Експортуйте файл для здачі (.json) і надішліть викладачу; за потреби роздрукуйте звіт у PDF."))));
    renderSide();
  }

  function renderOnboarding(edit) {
    const main = document.getElementById("main"); main.innerHTML = "";
    const p = Object.assign({ name: "", group: "", studentNo: "1", variant: "1" }, S.profile || {});
    const f = el("form", { class: "card onboard", onsubmit: (e) => {
      e.preventDefault();
      if (words(p.name) < 2) { toast("Вкажіть прізвище та ім'я", "err"); return; }
      if (S.profile && String(S.profile.variant) !== String(p.variant)) logEv(`Змінено варіант: ${S.profile.variant} → ${p.variant}`);
      if (S.profile && String(S.profile.studentNo) !== String(p.studentNo)) logEv(`Змінено номер здобувача: ${S.profile.studentNo} → ${p.studentNo}`);
      if (!S.profile) { p.startedAt = nowISO(); logEv("Створено профіль"); }
      S.profile = p; save(true); location.hash = "#/"; renderHome();
    } },
      el("div", { class: "eyebrow" }, CFG.courseShort + " · тренажер практичних робіт"),
      el("h1", null, edit ? "Профіль здобувача" : "Ласкаво просимо"),
      el("p", { class: "muted" }, `«${CFG.course}» — ${CFG.specialty}. Вкажіть свої дані: від них залежать вихідні дані та набір задач.`),
      el("label", { class: "lbl" }, "Прізвище, ім'я, по батькові"), el("input", { class: "inp", value: p.name, required: true, placeholder: "Петренко Олена Іванівна", oninput: (e) => (p.name = e.target.value.trim()) }),
      el("label", { class: "lbl" }, "Курс / група / рік вступу (необов'язково)"), el("input", { class: "inp", value: p.group, placeholder: "1 курс, аспірантура 2026", oninput: (e) => (p.group = e.target.value) }),
      el("div", { class: "two" },
        el("div", null, el("label", { class: "lbl" }, "Номер здобувача (набір задач)"), (() => { const s = el("select", { class: "inp", onchange: (e) => (p.studentNo = e.target.value) },
          Object.keys(CFG.taskSets).map((k) => el("option", { value: k }, `№ ${k} — задачі ${CFG.taskSets[k].join(", ")}`)), el("option", { value: "all" }, "Усі задачі 1–10")); s.value = String(p.studentNo); return s; })()),
        el("div", null, el("label", { class: "lbl" }, "Варіант вихідних даних"), (() => { const s = el("select", { class: "inp", onchange: (e) => (p.variant = e.target.value) },
          Array.from({ length: CFG.variants }, (_, i) => el("option", { value: String(i + 1) }, `Варіант ${i + 1}`))); s.value = String(p.variant); return s; })())),
      el("p", { class: "muted sm" }, "Номер здобувача та варіант призначає викладач. Зміна варіанта після початку роботи фіксується в журналі."),
      el("div", { class: "actions" }, el("button", { class: "btn primary", type: "submit" }, edit ? "Зберегти" : "Почати роботу"), edit ? el("a", { class: "btn ghost", href: "#/" }, "Скасувати") : null));
    main.append(f);
    renderSide();
  }

  function renderSide() {
    const side = document.getElementById("side"); if (!side) return;
    side.innerHTML = "";
    const v = variant(), route = location.hash;
    side.append(el("a", { class: "side-link" + (route === "#/" || route === "" ? " on" : ""), href: "#/" }, el("span", { class: "si" }, "⌂"), "Мої роботи"));
    side.append(el("div", { class: "side-h" }, "Практичні роботи"));
    D.works.forEach((w) => {
      const p = S.profile ? workProgress(w.id, v) : { pct: 0 };
      side.append(el("a", { class: "side-link" + (route === `#/work/${w.id}` ? " on" : ""), href: `#/work/${w.id}` },
        el("span", { class: "si num" + (p.pct === 100 ? " full" : p.pct ? " part" : "") }, w.id), el("span", { class: "st" }, w.short), el("span", { class: "sp" }, p.pct ? p.pct + "%" : "")));
    });
    side.append(el("div", { class: "side-h" }, "Викладачу"), el("a", { class: "side-link" + (route.startsWith("#/teacher") ? " on" : ""), href: "#/teacher" }, el("span", { class: "si" }, "✓"), "Перевірка робіт"));
    const chip = document.getElementById("who");
    if (chip) chip.innerHTML = S.profile ? `<b>${esc(S.profile.name)}</b><span>Варіант ${esc(S.profile.variant)} · № ${esc(S.profile.studentNo)}</span>` : "<span>Профіль не створено</span>";
  }

  // ---------------- експорт / імпорт ----------------
  function buildSubmission(ids) {
    const v = variant();
    const works = {};
    ids.forEach((id) => {
      const st = W(id); const p = workProgress(id, v);
      works[id] = { answers: st.answers, checks: st.checks, quiz: st.quiz, ai: st.ai, conclusions: st.conclusions, started: st.started, updated: st.updated, opened: st.opened, progress: p };
      st.exportedAt = nowISO();
    });
    const payload = { format: "itpvm-trainer-submission", version: APP_VERSION, exportedAt: nowISO(), profile: S.profile, assigned: assigned(), works, log: S.log.slice(-200) };
    payload.hash = C.hash(JSON.stringify(payload));
    save(true);
    return payload;
  }
  function exportSubmission(ids) {
    if (!S.profile) return;
    if (!ids.length) { toast("Ще немає виконаних робіт", "err"); return; }
    const p = buildSubmission(ids);
    const sur = (S.profile.name.split(" ")[0] || "zdobuvach").replace(/[^\p{L}\p{N}_-]/gu, "");
    const name = `ITPVM_${ids.length === 1 ? "PR" + ids[0] : ids.length === 8 ? "PR_usi" : "PR" + ids.join("+")}_V${S.profile.variant}_${sur}.json`;
    downloadText(name, JSON.stringify(p, null, 1), "application/json");
    logEv("Експорт: " + name); save();
    toast("Файл збережено: " + name, "ok");
  }
  function importBackup() {
    const f = el("input", { type: "file", accept: ".json,application/json", onchange: (e) => {
      const file = e.target.files[0]; if (!file) return; const r = new FileReader();
      r.onload = () => {
        try {
          const p = JSON.parse(String(r.result).replace(/^﻿/, ""));
          if (p.format !== "itpvm-trainer-submission") throw new Error("format");
          if (!confirm(`Відновити ${Object.keys(p.works).length} роб. для «${p.profile.name}»? Поточні відповіді для цих робіт буде замінено.`)) return;
          S.profile = p.profile; Object.keys(p.works).forEach((id) => { const x = p.works[id]; S.works[id] = Object.assign(W(id), { answers: x.answers || {}, checks: x.checks || {}, quiz: x.quiz, ai: x.ai || { tools: "", purpose: "", none: false }, conclusions: x.conclusions || "" }); });
          logEv("Відновлено з файлу " + file.name); save(true); renderHome(); toast("Дані відновлено", "ok");
        } catch (err) { toast("Це не файл тренажера ІТПВМ", "err"); }
      };
      r.readAsText(file, "utf-8");
    } });
    f.click();
  }

  // ---------------- статичне подання відповіді (звіт, викладач) ----------------
  function answerHTML(w, n, i, part, val, v, opt) {
    opt = opt || {};
    const cap = part.label ? `<div class="a-lbl">${esc(part.label)}</div>` : "";
    const empty = `<p class="a-empty">— не заповнено —</p>`;
    const para = (s) => s ? String(s).split(/\n{2,}/).map((q) => `<p>${esc(q).replace(/\n/g, "<br>")}</p>`).join("") : empty;
    if (part.k === "text") return cap + para(val) + (opt.meta ? `<div class="a-meta">${words(val)} слів (мін. ${part.min})</div>` : "");
    if (part.k === "code") return cap + (val ? `<pre class="a-code">${esc(val)}</pre>` : empty);
    if (part.k === "image") return cap + (val ? `<img class="a-img" src="${val}" alt="Схема">` : part.required ? empty : `<p class="a-empty">— не додано (необов'язково) —</p>`);
    if (part.k === "table") {
      const cols = part.cols.map((c) => (typeof c === "string" ? c : c.h)); const rows = tableRows(part, val);
      let s = cap + `<table class="a-tbl"><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}${part.delta ? "<th>Зміна, %</th>" : ""}</tr></thead><tbody>`;
      rows.forEach((r) => {
        s += "<tr>" + r.map((c, ci) => `<td${part.fixed && ci === 0 ? ' class="rh"' : ""}>${esc(c).replace(/\n/g, "<br>")}</td>`).join("");
        if (part.delta) { const a = C.num(r[part.delta[0]]), b = C.num(r[part.delta[1]]); s += `<td>${isFinite(a) && isFinite(b) && a ? C.fmt(((b - a) / Math.abs(a)) * 100, 1) : "—"}</td>`; }
        s += "</tr>";
      });
      s += "</tbody></table>";
      if (part.score !== undefined) { const sum = rows.reduce((q, r) => q + (parseInt(r[part.score], 10) || 0), 0); s += `<div class="a-meta">Σ = ${sum} з ${rows.length * part.scoreMax} балів</div>`; }
      return s;
    }
    if (part.k === "wm") {
      if (!val) return cap + empty;
      const tot = val.alts.map((a, ai) => part.criteria.reduce((q, c, ci) => q + (part.weights ? (C.num(val.w[ci]) || 0) : 1) * (Number(val.s[ai] && val.s[ai][ci]) || 0), 0));
      let s = cap + `<table class="a-tbl"><thead><tr><th>Критерій</th>${part.weights ? "<th>w</th>" : ""}${val.alts.map((a) => `<th>${esc(a)}</th>`).join("")}</tr></thead><tbody>`;
      part.criteria.forEach((c, ci) => { s += `<tr><td class="rh">${esc(c)}</td>${part.weights ? `<td>${esc(val.w[ci])}</td>` : ""}${val.alts.map((a, ai) => `<td>${esc(val.s[ai] && val.s[ai][ci])}</td>`).join("")}</tr>`; });
      s += `<tr class="tot"><td class="rh">${part.weights ? "Інтегральний показник I" : "Сума балів"}</td>${part.weights ? "<td></td>" : ""}${tot.map((q) => `<td><b>${C.fmt(q, 2)}</b></td>`).join("")}</tr></tbody></table>`;
      if (part.weights) { const sw = val.w.reduce((q, x) => q + (C.num(x) || 0), 0); s += `<div class="a-meta">Σ ваг = ${C.fmt(sw, 2)}</div>`; }
      return s;
    }
    if (part.k === "calc") return calcHTML(w, n, part, val || {}, v, opt);
    return "";
  }
  function calcHTML(w, n, part, x, v, opt) {
    const m = CALCS[part.m]; let s = "";
    if (part.m === "pr1Index") {
      s += `<table class="a-tbl"><thead><tr><th>№</th><th>Напрям</th><th>Бал</th><th>Обґрунтування</th></tr></thead><tbody>` +
        D.pr1Directions.map((d, i) => `<tr><td>${i + 1}</td><td>${esc(d)}</td><td>${esc(nd((x.scores || [])[i]))}</td><td>${esc(nd((x.notes || [])[i]))}</td></tr>`).join("") + "</tbody></table>";
      const r = m.ref(x); s += `<p>Сума балів Σ = ${r.sum}; I = Σ / (2·${D.pr1Directions.length}) · 100 % = <b>${esc(x.I || "—")} %</b>${opt.ref ? ` <span class="ref">(еталон за оцінками: ${C.fmt(r.I, 2)} %)</span>` : ""}</p>`;
      return s;
    }
    if (part.m === "pr1Maturity") return `<p>Поточний рівень цифрової зрілості: <b>${esc(x.cur || "—")}</b>; цільовий рівень: <b>${esc(x.tgt || "—")}</b>.</p><p>${esc(x.why || "")}</p>`;
    if (part.m === "compareVariant") return `<p>Варіант для порівняння: <b>${esc(x.other || "—")}</b>${x.other ? " — " + esc(D.works[0].vt.rows[x.other - 1].join("; ")) : ""}.</p>`;
    if (part.m === "pr5Desc") {
      const vals = m.vals(v).filter((q) => (x.pick || []).includes(q.id));
      s += `<p>Обрані значення (${vals.length}): ${vals.map((q) => C.fmt(q.s, 1)).join("; ")} МПа.</p>`;
    }
    if (part.m === "pr5Groups") {
      const g = x.g || [], d = D.pr5.v[v], r = C.pr5Ref(v);
      s += `<table class="a-tbl"><thead><tr><th>t, мм</th><th>σ₁</th><th>σ₂</th><th>σ₃</th><th>x̄, МПа</th><th>s, МПа</th><th>CV, %</th></tr></thead><tbody>` +
        D.pr5.t.map((t, i) => `<tr><td>${t}</td>${d[i].map((q) => `<td>${C.fmt(q, 1)}</td>`).join("")}${["m", "s", "cv"].map((k, ki) => `<td>${esc(nd(g[i] && g[i][k]))}${opt.ref ? `<br><span class="ref">${C.fmt([r.groups[i].mean, r.groups[i].sd, r.groups[i].cv][ki], 2)}</span>` : ""}</td>`).join("")}</tr>`).join("") + "</tbody></table>";
      s += `<p>Найбільший розкид (за CV) — при t = <b>${esc(x.maxT || "—")} мм</b>${opt.ref ? ` <span class="ref">(еталон: ${r.maxCvT} мм)</span>` : ""}.</p>`;
      return s + checkLine(opt);
    }
    if (part.m === "pr5Fit") s += `<p>Апроксимація σ<sub>ср</sub> = a·t<sup>b</sup> (лінійна регресія в координатах ln t, ln σ<sub>ср</sub>).</p>` + (opt.chart ? `<div class="a-chart">${pr5Chart(v, x)}</div>` : "");
    if (part.m === "pr8Fixed" || part.m === "pr8Var") { const r = part.m === "pr8Fixed" ? { sy: 355, seq: 145 } : C.pr8Row(v); s += `<p>n = σт / σекв = ${r.sy} / ${r.seq}</p>`; }
    if (part.m === "pr8Allow") { const r = C.pr8Row(v); s += `<p>[σ] = σт / [n] = ${r.sy} / 1,5</p>`; }
    const its = m.items ? m.items(x, v) : [];
    if (its.length) {
      s += `<table class="a-tbl narrow"><thead><tr><th>Величина</th><th>Значення здобувача</th>${opt.ref ? "<th>Еталон</th>" : ""}</tr></thead><tbody>` +
        its.map((it) => `<tr><td>${esc(it.label)}</td><td>${esc(it.sel ? ({ yes: "достатній", no: "недостатній" }[it.val] || it.val || "—") : nd(it.val) || "—")}</td>${opt.ref ? `<td class="ref">${it.sel ? ({ yes: "достатній", no: "недостатній" }[it.ref] || it.ref) : C.fmt(it.ref, it.d)}</td>` : ""}</tr>`).join("") + "</tbody></table>";
    }
    return s + checkLine(opt);
  }
  const checkLine = (opt) => opt.ck ? `<div class="a-meta ${opt.ck.passed ? "ok" : "bad"}">Автоперевірка: ${opt.ck.passed ? "✓ правильно" : "✗ є помилки"}; спроб: ${opt.ck.attempts}${opt.ck.firstPass ? `; правильно з ${opt.ck.firstPass.attempt}-ї спроби` : ""}</div>` : "";

  // ---------------- друк звіту ----------------
  function vtHTML(w, v) {
    if (w.vt.kind === "pr5") return `<table class="a-tbl"><caption>${esc(w.vt.title)}</caption><thead><tr><th>t, мм</th><th>σ₁, МПа</th><th>σ₂, МПа</th><th>σ₃, МПа</th></tr></thead><tbody>${D.pr5.t.map((t, i) => `<tr><td>${t}</td>${D.pr5.v[v][i].map((q) => `<td>${C.fmt(q, 1)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    const r = w.vt.rows[v - 1];
    return `<table class="a-tbl"><caption>${esc(w.vt.title)} (варіант ${v})</caption><thead><tr>${w.vt.cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody><tr>${r.map((c) => `<td>${esc(typeof c === "number" ? String(c).replace(".", ",") : c)}</td>`).join("")}</tr></tbody></table>${w.vt.note ? `<p class="small">${esc(w.vt.note)}</p>` : ""}`;
  }
  function reportHTML(sub, ids, opt) {
    const prof = sub.profile, v = Number(prof.variant), set = sub.assigned || assigned();
    let s = "";
    ids.forEach((id) => {
      const w = workById(id), st = sub.works[id]; if (!st) return;
      s += `<section class="r-title"><div>Міністерство освіти і науки України</div><div>${esc(CFG.university)}</div><div>${esc(CFG.faculty)}</div><div>${esc(CFG.department)}</div>
        <div class="r-big">ЗВІТ</div><div>з практичної роботи № ${id}</div><div>з дисципліни «${esc(CFG.course)}»</div>
        <div class="r-theme">Тема: ${esc(w.title)}</div>
        <div class="r-who"><p>Виконав(ла): здобувач(ка) ${esc(prof.group || "__ курсу")}<br>спеціальності ${esc(CFG.specialty)}<br>${esc(prof.name)} · варіант ${v}</p>
        <p>Перевірив(ла): ${esc(CFG.teacher)}<br>_____________________ /_______________/</p><p>Оцінка: ____________</p></div>
        <div class="r-city">${esc(CFG.city)} ${CFG.year}</div></section>`;
      s += `<section class="r-body"><h2>Практична робота № ${id}. ${esc(w.title)}</h2><h3>Мета роботи</h3><p>${esc(w.goal)}</p><h3>Вихідні дані</h3>${vtHTML(w, v)}`;
      const list = set.slice(); Object.keys(st.answers || {}).forEach((k) => { const n = +k.split(".")[0]; if (!list.includes(n) && window.APP.stateFor(sub)(() => taskState(id, n, v)).started) list.push(n); }); list.sort((a, b) => a - b);
      list.forEach((n) => {
        const t = w.tasks[n - 1];
        s += `<div class="r-task"><h3>Задача ${n}${set.includes(n) ? "" : " (додаткова)"}</h3><p class="r-q">${esc(t.text)}</p>`;
        t.parts.forEach((p, i) => { s += answerHTML(w, n, i, p, st.answers[n + "." + i], v, { ck: (st.checks || {})[n], chart: true, ref: opt && opt.ref, meta: opt && opt.meta }); });
        s += "</div>";
      });
      if (st.quiz) s += `<p><b>Тест самоперевірки:</b> найкращий результат ${st.quiz.best} / 5 (спроб: ${st.quiz.attempts}).</p>`;
      const ai = st.ai || {};
      s += `<h3>Використання засобів штучного інтелекту</h3><p>${ai.none ? "Засоби штучного інтелекту під час виконання роботи не використовувалися." : `Інструменти: ${esc(ai.tools || "—")}. Призначення та перевірка: ${esc(ai.purpose || "—")}`}</p>`;
      s += `<h3>Висновки</h3>${st.conclusions ? st.conclusions.split(/\n{2,}/).map((q) => `<p>${esc(q)}</p>`).join("") : "<p>—</p>"}</section>`;
    });
    return s;
  }
  function printReport(ids) {
    if (!ids.length) { toast("Немає даних для звіту", "err"); return; }
    const sub = { profile: S.profile, assigned: assigned(), works: {} }; ids.forEach((id) => (sub.works[id] = W(id)));
    printHTML(reportHTML(sub, ids));
  }
  function printHTML(html) {
    let root = document.getElementById("print-root"); if (!root) { root = el("div", { id: "print-root" }); document.body.append(root); }
    root.innerHTML = html; document.body.classList.add("printing");
    setTimeout(() => { window.print(); }, 80);
  }
  window.addEventListener("afterprint", () => { document.body.classList.remove("printing"); const r = document.getElementById("print-root"); if (r) r.innerHTML = ""; });

  // ---------------- маршрутизація ----------------
  function route() {
    const h = location.hash || "#/";
    document.body.classList.remove("nav-open");
    if (h.startsWith("#/teacher")) { window.TEACHER.render(document.getElementById("main")); renderSide(); return; }
    if (!S.profile) return renderOnboarding();
    const m = h.match(/^#\/work\/(\d)/);
    if (m) return renderWork(Number(m[1]));
    if (h === "#/profile") return renderOnboarding(true);
    renderHome();
  }

  // спільні функції для режиму викладача
  window.APP = { el, esc, words, fmtDate, workById, answerHTML, reportHTML, printHTML, partState, taskState, tableRows, CALCS, CHECKED, downloadText, toast, pr5Chart, ring, levelOf, vtHTML };

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("menu-btn").addEventListener("click", () => document.body.classList.toggle("nav-open"));
    document.getElementById("who").addEventListener("click", () => { location.hash = "#/profile"; });
    window.addEventListener("hashchange", route);
    route();
    setSaved(true);
  });

  // — функції, яким потрібен «поточний» стан для обчислень у режимі викладача —
  window.APP.stateFor = function (sub) {
    // тимчасово підміняє стан для обчислення повноти чужої роботи
    return function (fn) { const keep = S; S = { app: "itpvm-trainer", profile: sub.profile, works: sub.works, log: [] }; try { return fn(); } finally { S = keep; } };
  };
  window.APP.workProgress = workProgress;
  window.APP.assignedOf = (sub) => sub.assigned || CFG.taskSets[sub.profile.studentNo] || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
})();
