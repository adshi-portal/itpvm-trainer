/* ІТПВМ · Тренажер — режим викладача: імпорт файлів здачі, автоперевірка, оцінювання, відомість */
(function () {
  "use strict";
  const D = window.TRAINER, C = window.CALC, CFG = D.config;
  const SUBS_KEY = "itpvm-teacher-subs", GR_KEY = "itpvm-teacher-grades";
  let tab = "subs", SUBS = loadSubs(), GR = loadGr(), sel = null, filter = { q: "", work: "" };

  function loadSubs() { try { return JSON.parse(localStorage.getItem(SUBS_KEY)) || []; } catch (e) { return []; } }
  function saveSubs() { try { localStorage.setItem(SUBS_KEY, JSON.stringify(SUBS)); } catch (e) { window.APP.toast("Файли не вміщаються у сховище браузера — вони доступні до закриття вкладки", "warn"); } }
  function loadGr() { try { return JSON.parse(localStorage.getItem(GR_KEY)) || {}; } catch (e) { return {}; } }
  function saveGr() { try { localStorage.setItem(GR_KEY, JSON.stringify(GR)); } catch (e) { /* ігнор */ } }
  const sKey = (sub) => `${sub.profile.name}|${sub.profile.variant}`;
  const gKey = (sub, id) => `${sKey(sub)}|${id}`;
  const authed = () => { try { return sessionStorage.getItem("itpvm-teacher") === "1"; } catch (e) { return window.__itpvmT === 1; } };
  const setAuthed = () => { try { sessionStorage.setItem("itpvm-teacher", "1"); } catch (e) { window.__itpvmT = 1; } };

  function verify(sub) {
    const copy = JSON.parse(JSON.stringify(sub)); const h = copy.hash; delete copy.hash; delete copy._file; delete copy._loaded;
    return h && C.hash(JSON.stringify(copy)) === h;
  }

  function render(main) {
    const { el } = window.APP;
    main.innerHTML = "";
    if (!authed()) {
      let pin = "";
      main.append(el("form", { class: "card onboard", onsubmit: (e) => { e.preventDefault(); if (C.pinHash(pin) === CFG.teacherPinHash) { setAuthed(); render(main); } else window.APP.toast("Невірний PIN", "err"); } },
        el("div", { class: "eyebrow" }, "Режим викладача"), el("h1", null, "Перевірка робіт"),
        el("p", { class: "muted" }, "Введіть PIN викладача. Режим дає змогу завантажити файли здачі (.json), переглянути відповіді з еталонними значеннями, виставити бали за критеріями методичних вказівок і сформувати відомість."),
        el("input", { class: "inp", type: "password", inputmode: "numeric", placeholder: "PIN", oninput: (e) => (pin = e.target.value), autofocus: true }),
        el("div", { class: "actions" }, el("button", { class: "btn primary", type: "submit" }, "Увійти"))));
      return;
    }
    main.append(el("header", { class: "work-hero" }, el("div", { class: "eyebrow" }, "Режим викладача"), el("h1", null, "Перевірка практичних робіт"),
      el("div", { class: "tabs" }, [["subs", "Роботи здобувачів"], ["keys", "Ключі відповідей"], ["help", "Довідка"]].map(([k, t]) => el("button", { class: "tab" + (tab === k ? " on" : ""), onclick: () => { tab = k; sel = null; render(main); } }, t)))));
    if (tab === "keys") return main.append(keysView());
    if (tab === "help") return main.append(helpView());
    if (sel) return main.append(detailView(sel.sub, sel.id, main));
    main.append(subsView(main));
  }

  // ---------- список ----------
  function addFiles(files, main) {
    let n = 0, bad = 0; const arr = [...files];
    if (!arr.length) return;
    let left = arr.length;
    arr.forEach((f) => {
      const r = new FileReader();
      r.onload = () => {
        try {
          const sub = JSON.parse(String(r.result).replace(/^﻿/, ""));
          if (sub.format !== "itpvm-trainer-submission") throw 0;
          sub._file = f.name; sub._loaded = new Date().toISOString(); sub._ok = verify(sub);
          const i = SUBS.findIndex((q) => sKey(q) === sKey(sub));
          if (i >= 0) {
            // об'єднати: новіші версії робіт замінюють старі
            const old = SUBS[i];
            Object.keys(sub.works).forEach((id) => { old.works[id] = sub.works[id]; });
            old.exportedAt = sub.exportedAt; old.log = sub.log; old._file = f.name; old._ok = old._ok && sub._ok; old.assigned = sub.assigned; old.profile = sub.profile;
          } else SUBS.push(sub);
          n++;
        } catch (e) { bad++; }
        if (--left === 0) { saveSubs(); render(main); window.APP.toast(`Завантажено файлів: ${n}${bad ? `, не розпізнано: ${bad}` : ""}`, bad ? "warn" : "ok"); }
      };
      r.readAsText(f, "utf-8");
    });
  }

  function rowsAll() {
    const out = [];
    SUBS.forEach((sub) => Object.keys(sub.works).forEach((id) => out.push({ sub, id: Number(id) })));
    return out.sort((a, b) => a.sub.profile.name.localeCompare(b.sub.profile.name, "uk") || a.id - b.id);
  }
  function grade(sub, id) { const g = GR[gKey(sub, id)]; if (!g) return null; return { total: g.scores.reduce((s, q) => s + (Number(q) || 0), 0), g }; }
  function progOf(sub, id) { return window.APP.stateFor(sub)(() => window.APP.workProgress(id, Number(sub.profile.variant))); }

  function subsView(main) {
    const { el, fmtDate } = window.APP;
    const inp = el("input", { type: "file", accept: ".json,application/json", multiple: true, hidden: true, onchange: (e) => addFiles(e.target.files, main) });
    const drop = el("div", { class: "drop big", onclick: () => inp.click(),
      ondragover: (e) => { e.preventDefault(); drop.classList.add("over"); }, ondragleave: () => drop.classList.remove("over"),
      ondrop: (e) => { e.preventDefault(); drop.classList.remove("over"); addFiles(e.dataTransfer.files, main); } },
      el("div", { class: "drop-ic" }, "⤒"), el("div", null, el("b", null, "Перетягніть файли здачі .json"), " або натисніть, щоб обрати (можна кілька одразу)"), inp);
    const rows = rowsAll().filter((r) => (!filter.work || String(r.id) === filter.work) && (!filter.q || r.sub.profile.name.toLowerCase().includes(filter.q.toLowerCase())));
    const tb = el("tbody", null, rows.map(({ sub, id }) => {
      const st = sub.works[id], p = progOf(sub, id), g = grade(sub, id);
      return el("tr", { class: "click", onclick: () => { sel = { sub, id }; render(main); window.scrollTo(0, 0); } },
        el("td", null, el("b", null, sub.profile.name), el("div", { class: "muted sm" }, sub.profile.group || "")),
        el("td", { class: "c" }, sub.profile.variant), el("td", { class: "c" }, sub.profile.studentNo), el("td", { class: "c" }, el("span", { class: "pr-no sm" }, "ПР " + id)),
        el("td", null, bar(p.pct), el("span", { class: "sm" }, ` ${p.done}/${p.total}`)),
        el("td", { class: "c" }, p.checks ? el("span", { class: "pill " + (p.passed === p.checks ? "ok" : "bad") }, `${p.passed}/${p.checks}`) : "—"),
        el("td", { class: "c" }, st.quiz ? `${st.quiz.best}/5` : "—"),
        el("td", { class: "c" }, st.ai && (st.ai.none || st.ai.tools) ? "✓" : "—"),
        el("td", { class: "c" }, el("span", { class: "pill " + (sub._ok ? "ok" : "bad"), title: sub._ok ? "Контрольна сума збігається" : "Файл змінено поза тренажером" }, sub._ok ? "✓" : "змінено")),
        el("td", { class: "c" }, g ? el("b", { class: "grade" }, g.total) : el("span", { class: "muted" }, "—")),
        el("td", { class: "sm muted" }, fmtDate(sub.exportedAt)));
    }));
    const workSel = el("select", { class: "inp sm", onchange: (e) => { filter.work = e.target.value; render(main); } }, el("option", { value: "" }, "Усі ПР"), D.works.map((w) => el("option", { value: String(w.id) }, "ПР " + w.id)));
    workSel.value = filter.work;
    return el("div", null,
      el("section", { class: "card" }, drop),
      el("section", { class: "card" },
        el("div", { class: "toolbar" },
          el("input", { class: "inp sm", placeholder: "Пошук за прізвищем", value: filter.q, oninput: (e) => { filter.q = e.target.value; clearTimeout(window.__tq); window.__tq = setTimeout(() => render(main), 300); } }), workSel,
          el("span", { class: "grow" }),
          el("button", { class: "btn ghost sm", onclick: exportMatrix }, "⬇ Відомість (CSV)"),
          el("button", { class: "btn ghost sm", onclick: exportDetailed }, "⬇ Детально (CSV)"),
          el("button", { class: "btn ghost sm danger", onclick: () => { if (confirm("Видалити всі завантажені роботи з цього браузера? Виставлені бали збережуться.")) { SUBS = []; saveSubs(); render(main); } } }, "Очистити список")),
        rows.length ? el("div", { class: "tbl-wrap" }, el("table", { class: "grid list" },
          el("thead", null, el("tr", null, ["Здобувач", "Вар.", "№", "Робота", "Задачі", "Розрахунки", "Тест", "AI", "Цілісність", "Бал", "Експорт"].map((h) => el("th", null, h)))), tb))
          : el("p", { class: "muted" }, "Ще немає завантажених робіт. Здобувачі надсилають файли, створені кнопкою «Файл для здачі (.json)».")),
      matrixView());
  }
  function bar(p) { const { el } = window.APP; return el("span", { class: "bar" }, el("i", { style: `width:${p}%` })); }

  function matrixView() {
    const { el } = window.APP;
    if (!SUBS.length) return null;
    const subs = SUBS.slice().sort((a, b) => a.profile.name.localeCompare(b.profile.name, "uk"));
    return el("section", { class: "card" }, el("div", { class: "card-tag" }, "Зведення"), el("h3", null, "Відомість балів за практичні роботи"),
      el("div", { class: "tbl-wrap" }, el("table", { class: "grid list matrix" },
        el("thead", null, el("tr", null, el("th", null, "Здобувач"), el("th", null, "Вар."), D.works.map((w) => el("th", { class: "c" }, "ПР" + w.id)), el("th", { class: "c" }, "Середній"))),
        el("tbody", null, subs.map((sub) => {
          const g = D.works.map((w) => (sub.works[w.id] ? grade(sub, w.id) : null));
          const done = g.filter((q) => q); const avg = done.length ? done.reduce((s, q) => s + q.total, 0) / done.length : null;
          return el("tr", null, el("td", null, sub.profile.name), el("td", { class: "c" }, sub.profile.variant),
            g.map((q, i) => el("td", { class: "c" }, q ? el("b", null, q.total) : sub.works[i + 1] ? el("span", { class: "muted" }, "здано") : "")),
            el("td", { class: "c" }, avg === null ? "—" : C.fmt(avg, 1)));
        })))));
  }

  // ---------- деталі ----------
  function detailView(sub, id, main) {
    const { el, esc, fmtDate, answerHTML, workById, vtHTML, words } = window.APP;
    const w = workById(id), st = sub.works[id], v = Number(sub.profile.variant), set = window.APP.assignedOf(sub);
    const p = progOf(sub, id);
    const gk = gKey(sub, id); const g = GR[gk] || { scores: w.rubric.map(() => ""), comment: "" };
    const all = rowsAll(); const idx = all.findIndex((r) => r.sub === sub && r.id === id);
    const go = (k) => { const r = all[idx + k]; if (r) { sel = r; render(main); window.scrollTo(0, 0); } };

    const tasks = set.slice(); Object.keys(st.answers || {}).forEach((k) => { const n = +k.split(".")[0]; if (!tasks.includes(n) && window.APP.stateFor(sub)(() => window.APP.taskState(id, n, v)).started) tasks.push(n); }); tasks.sort((a, b) => a - b);
    const body = el("div", { class: "rev-body" });
    body.append(el("section", { class: "card" }, el("div", { class: "card-tag" }, "Вихідні дані"), el("div", { class: "a-wrap", html: vtHTML(w, v) })));
    tasks.forEach((n) => {
      const t = w.tasks[n - 1];
      const ts = window.APP.stateFor(sub)(() => window.APP.taskState(id, n, v));
      const html = t.parts.map((pt, i) => answerHTML(w, n, i, pt, (st.answers || {})[n + "." + i], v, { ref: true, meta: true, ck: (st.checks || {})[n], chart: true })).join("");
      body.append(el("section", { class: "card task lvl" + window.APP.levelOf(n) }, el("div", { class: "task-head" }, el("span", { class: "badge big" }, n), el("span", { class: "lvl-tag" }, D.LEVELS[window.APP.levelOf(n)]),
        set.includes(n) ? null : el("span", { class: "lvl-tag gray" }, "додаткова"),
        el("span", { class: "tstatus " + (ts.done ? "done" : ts.started ? "prog" : "") }, ts.done ? "Виконано" : ts.started ? "Частково" : "Не виконано")),
        el("p", { class: "task-text" }, t.text), el("div", { class: "a-wrap", html })));
    });
    const ai = st.ai || {};
    body.append(el("section", { class: "card" }, el("div", { class: "card-tag" }, "Завершення"),
      el("h4", null, "Використання AI"), el("p", null, ai.none ? "Не використовувався" : ai.tools || ai.purpose ? `${ai.tools || "—"} — ${ai.purpose || "—"}` : "Не зазначено"),
      el("h4", null, `Висновки (${words(st.conclusions)} слів)`), el("div", { class: "a-wrap", html: (st.conclusions || "—").split(/\n{2,}/).map((q) => `<p>${esc(q)}</p>`).join("") }),
      el("h4", null, "Тест"), el("p", null, st.quiz ? `Найкращий: ${st.quiz.best}/5, остання спроба: ${st.quiz.last}/5, спроб: ${st.quiz.attempts}` : "Не пройдено"),
      el("details", null, el("summary", null, "Журнал дій здобувача"), el("ul", { class: "log" }, (sub.log || []).slice().reverse().map((q) => el("li", null, el("span", { class: "muted" }, fmtDate(q.t)), " ", q.ev))))));

    const totalEl = el("b", { class: "grade big" });
    const updTotal = () => { totalEl.textContent = g.scores.reduce((s, q) => s + (Number(q) || 0), 0); };
    const panel = el("aside", { class: "rev-panel card" },
      el("div", { class: "card-tag" }, "Оцінювання"),
      el("div", { class: "rev-who" }, el("b", null, sub.profile.name), el("span", null, `Варіант ${v} · здобувач № ${sub.profile.studentNo} · задачі ${set.join(", ")}`)),
      el("div", { class: "rev-stats" },
        el("div", null, el("small", null, "Задачі"), el("b", null, `${p.done}/${p.total}`)),
        el("div", null, el("small", null, "Розрахунки"), el("b", null, p.checks ? `${p.passed}/${p.checks}` : "—")),
        el("div", null, el("small", null, "Тест"), el("b", null, st.quiz ? `${st.quiz.best}/5` : "—")),
        el("div", null, el("small", null, "Файл"), el("b", { class: sub._ok ? "ok" : "bad" }, sub._ok ? "цілісний" : "змінено"))),
      el("div", { class: "muted sm" }, `Розпочато: ${fmtDate(st.started)} · оновлено: ${fmtDate(st.updated)} · експорт: ${fmtDate(sub.exportedAt)}`),
      el("div", { class: "rubric-form" }, w.rubric.map((r, i) => el("label", { class: "rf" }, el("span", null, r[0]),
        el("input", { class: "num", type: "number", min: 0, max: r[1], value: g.scores[i], oninput: (e) => { let q = Number(e.target.value); if (q > r[1]) { q = r[1]; e.target.value = q; } g.scores[i] = e.target.value === "" ? "" : q; updTotal(); } }),
        el("small", null, "/ " + r[1])))),
      el("div", { class: "rev-total" }, "Разом: ", totalEl, " / 100"),
      el("label", { class: "lbl" }, "Коментар для здобувача"),
      el("textarea", { rows: 4, value: g.comment || "", oninput: (e) => (g.comment = e.target.value) }),
      el("div", { class: "actions" },
        el("button", { class: "btn primary", onclick: () => { g.at = new Date().toISOString(); GR[gk] = g; saveGr(); window.APP.toast("Оцінку збережено", "ok"); } }, "Зберегти оцінку"),
        el("button", { class: "btn ghost", onclick: () => printReview(sub, id, g) }, "🖨 Друк")),
      el("div", { class: "actions" },
        el("button", { class: "btn ghost sm", disabled: idx <= 0, onclick: () => go(-1) }, "← Попередня"),
        el("button", { class: "btn ghost sm", onclick: () => { sel = null; render(main); } }, "До списку"),
        el("button", { class: "btn ghost sm", disabled: idx >= all.length - 1, onclick: () => go(1) }, "Наступна →")));
    updTotal();
    return el("div", null,
      el("div", { class: "crumbs" }, el("a", { href: "#/teacher", onclick: (e) => { e.preventDefault(); sel = null; render(main); } }, "Список робіт"), " / ", sub.profile.name, " / ", `ПР ${id}`),
      el("h2", { class: "rev-title" }, `ПР ${id}. ${w.title}`),
      el("div", { class: "review" }, body, panel));
  }

  function printReview(sub, id, g) {
    const w = window.APP.workById(id);
    const tot = g.scores.reduce((s, q) => s + (Number(q) || 0), 0);
    const grade = `<section class="r-body"><h3>Оцінювання викладачем</h3><table class="a-tbl"><thead><tr><th>Вид діяльності</th><th>Макс.</th><th>Бал</th></tr></thead><tbody>${w.rubric.map((r, i) => `<tr><td>${window.APP.esc(r[0])}</td><td>${r[1]}</td><td>${g.scores[i] === "" ? "—" : g.scores[i]}</td></tr>`).join("")}<tr class="tot"><td>Разом</td><td>100</td><td><b>${tot}</b></td></tr></tbody></table>${g.comment ? `<p><b>Коментар:</b> ${window.APP.esc(g.comment)}</p>` : ""}</section>`;
    window.APP.printHTML(window.APP.reportHTML(sub, [id], { ref: true }) + grade);
  }

  // ---------- ключі ----------
  function keysView() {
    const { el } = window.APP;
    const f = (x, d) => C.fmt(x, d);
    const pr5 = el("section", { class: "card" }, el("div", { class: "card-tag" }, "ПР 5"), el("h3", null, "Задача 4: x̄, s (n − 1), CV за товщинами; задача 5: σср = a·tᵇ (регресія в ln-координатах)"),
      el("div", { class: "tbl-wrap" }, el("table", { class: "grid list keys" },
        el("thead", null, el("tr", null, el("th", null, "Вар."), D.pr5.t.map((t) => el("th", { class: "c" }, `t = ${t} мм: x̄ / s / CV%`)), el("th", { class: "c" }, "max CV, t"), el("th", { class: "c" }, "a"), el("th", { class: "c" }, "b"), el("th", { class: "c" }, "R²"))),
        el("tbody", null, Array.from({ length: 10 }, (_, i) => i + 1).map((v) => {
          const r = C.pr5Ref(v);
          return el("tr", null, el("td", { class: "c" }, el("b", null, v)), r.groups.map((g) => el("td", { class: "c sm" }, `${f(g.mean, 2)} / ${f(g.sd, 2)} / ${f(g.cv, 2)}`)),
            el("td", { class: "c" }, r.maxCvT), el("td", { class: "c" }, f(r.fit.a, 1)), el("td", { class: "c" }, f(r.fit.b, 4)), el("td", { class: "c" }, f(r.fit.r2, 4)));
        })))),
      el("p", { class: "muted sm" }, "Задача 1 (будь-які 10 значень) перевіряється автоматично за набором, який обрав здобувач; обрані значення видно у звіті. Допуски: x̄, s, CV — ±0,05; a — ±1,5 %; b — ±0,006; R² — ±0,0006."));
    const pr8 = el("section", { class: "card" }, el("div", { class: "card-tag" }, "ПР 8"), el("h3", null, "Задачі 3, 4, 5: коефіцієнт запасу та допустиме напруження ([n] = 1,5)"),
      el("p", null, `Задача 3 (спільна для всіх): n = 355 / 145 = ${f(355 / 145, 2)} → запас достатній.`),
      el("div", { class: "tbl-wrap" }, el("table", { class: "grid list keys" },
        el("thead", null, el("tr", null, ["Вар.", "Матеріал", "σт, МПа", "σекв, МПа", "n = σт/σекв", "Висновок (з. 5)", "[σ] = σт/1,5, МПа (з. 4)"].map((h) => el("th", null, h)))),
        el("tbody", null, Array.from({ length: 10 }, (_, i) => i + 1).map((v) => { const r = C.pr8Ref(v);
          return el("tr", null, el("td", { class: "c" }, el("b", null, v)), el("td", null, r.row.mat), el("td", { class: "c" }, r.row.sy), el("td", { class: "c" }, r.row.seq), el("td", { class: "c" }, f(r.n, 2)),
            el("td", { class: "c" }, el("span", { class: "pill " + (r.ok ? "ok" : "bad") }, r.ok ? "достатній" : "недостатній")), el("td", { class: "c" }, f(r.allow, 1))); })))));
    const pr1 = el("section", { class: "card" }, el("div", { class: "card-tag" }, "ПР 1"), el("h3", null, "Задача 4: інтегральний показник цифровізації"),
      el("p", null, `I = Σbᵢ / (2·N) · 100 %, N = ${D.pr1Directions.length}. Оцінки bᵢ ставить здобувач; тренажер перевіряє арифметику (допуск ±0,15 %), а обґрунтованість оцінок оцінює викладач.`),
      el("ol", { class: "sm" }, D.pr1Directions.map((d) => el("li", null, d))));
    return el("div", null, el("div", { class: "actions" }, el("button", { class: "btn ghost sm", onclick: () => { document.body.classList.add("print-keys"); window.print(); setTimeout(() => document.body.classList.remove("print-keys"), 500); } }, "🖨 Друк ключів")), pr5, pr8, pr1);
  }

  function helpView() {
    const { el } = window.APP;
    return el("section", { class: "card how" }, el("div", { class: "card-tag" }, "Довідка"), el("h3", null, "Як перевіряти роботи"),
      el("ol", null,
        el("li", null, "Здобувач виконує роботу в тренажері й натискає «Файл для здачі (.json)». Файл надсилається вам будь-яким каналом (Moodle, пошта, Teams)."),
        el("li", null, "Перетягніть один або кілька файлів у вкладку «Роботи здобувачів». Повторно завантажений файл того самого здобувача оновлює його роботи."),
        el("li", null, "У таблиці видно повноту виконання, результати автоперевірки розрахункових задач, тест, декларацію AI та цілісність файлу."),
        el("li", null, "Відкрийте роботу: відповіді показано разом з еталонними значеннями (сірим) і кількістю спроб. Праворуч — бали за критеріями методичних вказівок і коментар."),
        el("li", null, "«Відомість (CSV)» відкривається в Excel: рядок — здобувач, стовпці — ПР 1–8. «Детально (CSV)» містить бали за кожним критерієм і коментарі.")),
      el("p", { class: "muted sm" }, "Позначка «змінено» означає, що вміст файлу редагувався поза тренажером (контрольна сума не збігається). Це навчальний захист від випадкових чи ручних правок, а не криптографічний. Бали зберігаються лише в цьому браузері — регулярно вивантажуйте відомість."));
  }

  // ---------- CSV ----------
  const csvCell = (s) => { s = String(s === undefined || s === null ? "" : s); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  function exportMatrix() {
    const subs = SUBS.slice().sort((a, b) => a.profile.name.localeCompare(b.profile.name, "uk"));
    const lines = [["ПІБ", "Група", "№ здобувача", "Варіант"].concat(D.works.map((w) => "ПР" + w.id), ["Середній бал"]).join(";")];
    subs.forEach((sub) => {
      const g = D.works.map((w) => (sub.works[w.id] ? grade(sub, w.id) : null)); const done = g.filter((q) => q);
      lines.push([sub.profile.name, sub.profile.group || "", sub.profile.studentNo, sub.profile.variant].concat(g.map((q) => (q ? q.total : ""))).concat([done.length ? C.fmt(done.reduce((s, q) => s + q.total, 0) / done.length, 1) : ""]).map(csvCell).join(";"));
    });
    window.APP.downloadText(`ITPVM_vidomist_${new Date().toISOString().slice(0, 10)}.csv`, lines.join("\r\n"));
  }
  function exportDetailed() {
    const lines = [["ПІБ", "Група", "№ здобувача", "Варіант", "ПР", "Виконано задач", "Автоперевірка", "Тест", "Цілісність", "Бали за критеріями", "Разом", "Коментар", "Експорт файлу"].join(";")];
    rowsAll().forEach(({ sub, id }) => {
      const p = progOf(sub, id), g = grade(sub, id), st = sub.works[id];
      lines.push([sub.profile.name, sub.profile.group || "", sub.profile.studentNo, sub.profile.variant, id, `${p.done}/${p.total}`, p.checks ? `${p.passed}/${p.checks}` : "", st.quiz ? `${st.quiz.best}/5` : "", sub._ok ? "так" : "змінено",
        g ? g.g.scores.join(" + ") : "", g ? g.total : "", g ? g.g.comment : "", sub.exportedAt || ""].map(csvCell).join(";"));
    });
    window.APP.downloadText(`ITPVM_detalno_${new Date().toISOString().slice(0, 10)}.csv`, lines.join("\r\n"));
  }

  window.TEACHER = { render };
})();
