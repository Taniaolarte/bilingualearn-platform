/* Bilingualearn platform layer, loaded by every page before the page's own script.
   - Student profile (name, email, class code, personal code) kept on this device.
   - Nav bar across all pages.
   - window.BL API used by the practice pages:
       BL.submitObjective(result)        Reading/Listening auto-graded score → coach's gradebook
       BL.mountSend(el, {build})         "Send to my coach" panel (Writing → Google Doc)
       BL.mountTake(el, take, {build})   recording player + send panel (Speaking → audio in Drive)
       BL.rec                            microphone recorder for Speaking
   Everything goes to the Google Apps Script web app set in assets/config.js. */
(function () {
  "use strict";
  const CFG = Object.assign({ apiUrl: "", course: "CELPIP" }, window.BL_CONFIG || {});
  const LS_PROFILE = "bl-platform-student";
  const LS_OUTBOX = "bl-platform-outbox";
  const page = document.body.dataset.page || "";

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const connected = () => !!CFG.apiUrl;
  let student = store.get(LS_PROFILE, null);

  /* ---------- API ---------- */
  const ERR = {
    NOT_CONFIGURED: "La plataforma todavía no está conectada a Google Drive. Avísale a tu coach.",
    NETWORK: "No pudimos conectar con el servidor. Revisa tu internet e inténtalo otra vez.",
    BAD_INPUT: "Revisa tu nombre y tu email.",
    BAD_CODE: "Ese código de clase no es válido. Pídeselo a tu coach.",
    EMAIL_TAKEN: "Este email ya está registrado. Abre «¿Ya te registraste en otro dispositivo?» y escribe tu código personal.",
    BAD_KEY: "El código personal no coincide con ese email. Si no lo recuerdas, pídeselo a tu coach.",
    UNKNOWN_STUDENT: "No encontramos tu registro. Cierra sesión y vuelve a entrar.",
    TOO_LARGE: "La grabación es demasiado grande para enviarla.",
    NOT_SET_UP: "La plataforma no está bien configurada todavía. Avísale a tu coach.",
    SERVER: "Hubo un problema en el servidor. Inténtalo otra vez en un momento.",
  };
  const errText = e => ERR[e && e.code] || ERR.SERVER;

  async function api(action, data) {
    if (!connected()) { const e = new Error("NOT_CONFIGURED"); e.code = "NOT_CONFIGURED"; throw e; }
    let r;
    try {
      // text/plain keeps this a "simple" request: Apps Script can't answer CORS preflights.
      r = await fetch(CFG.apiUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(Object.assign({ action }, data)) });
    } catch (e) { const x = new Error("NETWORK"); x.code = "NETWORK"; throw x; }
    let j = null;
    try { j = await r.json(); } catch (e) {}
    if (!j) { const x = new Error("NETWORK"); x.code = "NETWORK"; throw x; }
    if (!j.ok) { const x = new Error(j.message || j.error); x.code = j.error; throw x; }
    return j;
  }
  const auth = () => ({ email: student.email, key: student.key });

  /* ---------- toast ---------- */
  let toastEl = null, toastT = 0;
  function toast(msg, action) {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "blp-toast"; toastEl.setAttribute("role", "status"); document.body.appendChild(toastEl); }
    toastEl.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button type="button">${esc(action.label)}</button>` : "");
    if (action) toastEl.querySelector("button").onclick = () => { toastEl.hidden = true; action.run(); };
    toastEl.hidden = false; clearTimeout(toastT);
    toastT = setTimeout(() => { toastEl.hidden = true; }, action ? 9000 : 4200);
  }

  /* ---------- sign-in ---------- */
  let dlg = null, pending = null;
  function signInDialog() {
    if (dlg) return dlg;
    dlg = document.createElement("dialog");
    dlg.className = "blp-dialog";
    dlg.innerHTML = `<form method="dialog" novalidate>
      <h2>👋 Entra a tu plataforma</h2>
      <p>Así tus resultados de Reading y Listening, y tus respuestas de Writing y Speaking, le llegan a tu coach para que las corrija.</p>
      <label class="blp-field">Nombre completo<input name="name" autocomplete="name" required maxlength="80"></label>
      <label class="blp-field">Email<input name="email" type="email" autocomplete="email" required maxlength="120"></label>
      <label class="blp-field">Código de clase<input name="group" autocomplete="off" autocapitalize="characters" required maxlength="30"><small>Te lo da tu coach.</small></label>
      <details><summary>¿Ya te registraste en otro dispositivo?</summary>
        <label class="blp-field">Código personal<input name="key" autocomplete="off" autocapitalize="characters" maxlength="12"><small>Aparece en la página de inicio del dispositivo donde te registraste.</small></label></details>
      <p class="blp-err" hidden></p>
      <div class="blp-row"><button class="blp-btn ghost" value="cancel" type="button" data-x>Ahora no</button><button class="blp-btn" type="submit">Entrar</button></div>
    </form>`;
    document.body.appendChild(dlg);
    const f = dlg.querySelector("form"), err = dlg.querySelector(".blp-err"), go = f.querySelector('[type="submit"]');
    dlg.querySelector("[data-x]").onclick = () => dlg.close();
    dlg.addEventListener("close", () => { if (pending) { pending(student); pending = null; } });
    f.addEventListener("submit", async ev => {
      ev.preventDefault();
      const v = Object.fromEntries(new FormData(f));
      err.hidden = true;
      if (!v.name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim()) || !v.group.trim()) { err.textContent = "Completa tu nombre, un email válido y el código de clase."; err.hidden = false; return; }
      go.disabled = true; go.textContent = "Entrando…";
      try {
        const j = await api("register", { name: v.name.trim(), email: v.email.trim(), group: v.group.trim(), key: (v.key || "").trim() });
        setStudent(j.student);
        dlg.close();
        toast(`¡Hola, ${j.student.name.split(" ")[0]}! Ya estás conectado/a.`);
        flush(false);
      } catch (e) { err.textContent = errText(e); err.hidden = false; }
      go.disabled = false; go.textContent = "Entrar";
    });
    return dlg;
  }
  function signIn() {
    const d = signInDialog();
    d.querySelector(".blp-err").hidden = true;
    if (!d.open) d.showModal();
    return new Promise(res => { pending = res; });
  }
  async function requireStudent() { return student || signIn(); }
  function setStudent(s) {
    student = s;
    if (s) store.set(LS_PROFILE, s); else store.del(LS_PROFILE);
    paintWho();
    document.dispatchEvent(new CustomEvent("bl:student", { detail: s }));
  }
  function signOut() { setStudent(null); }

  /* ---------- nav bar ---------- */
  const LINKS = [
    ["index", "index.html", "Inicio"], ["guia", "guia-celpip.html", "Guía CELPIP"], ["onboarding", "onboarding.html", "Onboarding"],
    ["notebook", "notebook.html", "Cuaderno"], ["listening", "listening.html", "Listening"], ["reading", "reading.html", "Reading"],
    ["writing", "writing.html", "Writing"], ["speaking", "speaking.html", "Speaking"], ["results", "results.html", "Mis resultados"],
  ];
  let whoBtn = null;
  function paintWho() {
    if (!whoBtn) return;
    whoBtn.classList.toggle("out", !student);
    whoBtn.textContent = student ? "👤 " + student.name.split(" ")[0] : "Entrar";
    whoBtn.title = student ? `${student.name} · ${student.email}` : "Inicia sesión para enviar tu trabajo";
  }
  function bar() {
    const nav = document.createElement("nav");
    nav.className = "blp-bar";
    nav.setAttribute("aria-label", "Bilingualearn");
    nav.innerHTML = `<a class="blp-brand" href="index.html"><img src="assets/koala/logo.png" alt="" width="34" height="34">Bilingualearn <small>${esc(CFG.course)}</small></a>
      <div class="blp-links">${LINKS.map(([id, href, label]) => `<a href="${href}"${id === page ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</div>
      <button class="blp-who" type="button"></button>`;
    document.body.prepend(nav);
    whoBtn = nav.querySelector(".blp-who");
    whoBtn.onclick = () => { if (student) location.href = "index.html#perfil"; else signIn(); };
    paintWho();
    const cur = nav.querySelector('[aria-current="page"]');
    if (cur) cur.scrollIntoView({ block: "nearest", inline: "center" });
  }
  if (["reading", "writing", "speaking"].includes(page)) document.body.classList.add("blp-pad");
  bar();

  /* ---------- auto-graded results (Reading / Listening) ----------
     Queued on the device first so a score is never lost to a bad connection. */
  let flushing = false, again = null;
  function submitObjective(r) {
    const item = Object.assign({ kind: "objective", course: CFG.course, id: uid(), at: new Date().toISOString(), owner: student ? student.email : "" }, r);
    const box = store.get(LS_OUTBOX, []);
    box.push(item);
    store.set(LS_OUTBOX, box.slice(-100));
    return flush(true);
  }
  async function flush(announce) {
    if (!connected()) return;
    if (!student) {
      if (announce) toast("Inicia sesión para que tu coach vea este puntaje.", { label: "Entrar", run: signIn });
      return;
    }
    if (flushing) { again = { announce: !!(announce || (again && again.announce)) }; return; }
    flushing = true;
    let sent = 0, failed = false, authFailed = false;
    const drop = id => store.set(LS_OUTBOX, store.get(LS_OUTBOX, []).filter(x => x.id !== id));
    for (const item of store.get(LS_OUTBOX, [])) {
      if (item.owner && item.owner !== student.email) continue;
      try {
        await api("submit", Object.assign({}, item, auth()));
        sent++;
        drop(item.id);
      } catch (e) {
        if (e.code === "BAD_INPUT" || e.code === "BAD_ACTION") { drop(item.id); continue; }  // will never succeed
        if (e.code === "UNKNOWN_STUDENT" || e.code === "BAD_KEY") authFailed = true; else failed = true;
        break;
      }
    }
    flushing = false;
    if (authFailed) toast("Tu sesión ya no es válida. Vuelve a entrar para enviar tus puntajes.", { label: "Entrar", run: () => { signOut(); signIn(); } });
    else if (announce) toast(failed ? "Sin conexión: tu puntaje se enviará la próxima vez que abras la plataforma." : "📤 Puntaje guardado. Tu coach ya puede verlo.");
    else if (sent) toast(`📤 ${sent} puntaje${sent > 1 ? "s" : ""} pendiente${sent > 1 ? "s" : ""} enviado${sent > 1 ? "s" : ""}.`);
    if (again && !failed && !authFailed) { const a = again; again = null; return flush(a.announce); }
    again = null;
  }
  const outboxCount = () => store.get(LS_OUTBOX, []).filter(x => !student || !x.owner || x.owner === student.email).length;

  /* ---------- "send to my coach" panel (Writing / Speaking) ---------- */
  function mountSend(el, opts) {
    if (!el) return;
    const id = uid();
    const what = opts.what || "tu respuesta";
    el.innerHTML = `<div class="blp-send">
      <div class="txt"><b>📤 Enviar a mi coach</b><span>${esc(opts.note || "Se guarda en Google Drive para que tu coach la corrija. Verás tu nivel y comentarios en «Mis resultados».")}</span></div>
      <button class="blp-btn" type="button">Enviar</button>
      <p class="st" role="status"></p></div>`;
    const box = el.firstElementChild, btn = box.querySelector("button"), st = box.querySelector(".st");
    if (opts.empty) { btn.disabled = true; st.textContent = `No hay ${what} para enviar.`; }
    else if (!connected()) { btn.disabled = true; st.textContent = ERR.NOT_CONFIGURED; }
    btn.onclick = async () => {
      try {
        if (!await requireStudent()) return;
        btn.disabled = true; btn.textContent = "Enviando…"; st.className = "st"; st.textContent = "";
        const payload = await opts.build();
        const j = await api("submit", Object.assign({ id, course: CFG.course }, payload, auth()));
        box.classList.add("sent");
        btn.textContent = "Enviado ✓";
        st.className = "st ok";
        st.innerHTML = `✅ Enviado. Tu coach lo verá en su Google Drive.` + (j.fileUrl ? ` <a href="${esc(j.fileUrl)}" target="_blank" rel="noopener">Abrir mi archivo</a>` : "");
      } catch (e) {
        btn.disabled = false; btn.textContent = "Reintentar";
        st.className = "st bad"; st.textContent = errText(e);
      }
    };
  }

  /* ---------- microphone recorder (Speaking) ---------- */
  const TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];
  const rec = {
    stream: null, mr: null, t0: 0, asking: null,
    gen: 0,  // bumped by stop()/cancel(): anything still waiting from before must not start recording
    supported: () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder),
    live() { return !!this.stream && this.stream.getAudioTracks().some(t => t.readyState === "live"); },
    // Ask for the microphone early (during preparation) so the prompt doesn't eat speaking time.
    prepare() {
      if (this.live()) return Promise.resolve(true);
      if (this.stream) this.release();  // e.g. iOS ended the track while the phone was locked
      if (!this.supported()) return Promise.resolve(false);
      if (!this.asking) {
        const gen = this.gen;
        const ask = this.asking = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
          .then(s => {
            if (gen !== this.gen) { s.getTracks().forEach(t => t.stop()); return false; }  // answered after the student moved on
            this.stream = s;
            return true;
          }, () => false)
          .finally(() => { if (this.asking === ask) this.asking = null; });
      }
      return this.asking;
    },
    async start() {
      const gen = this.gen;
      this.halt();
      if (!await this.prepare() || gen !== this.gen) return false;
      const mime = TYPES.find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
      const chunks = [];
      try {
        const mr = new MediaRecorder(this.stream, Object.assign({ audioBitsPerSecond: 48000 }, mime ? { mimeType: mime } : {}));
        mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
        mr.start(1000);
        mr.chunks = chunks;
        this.mr = mr;
      } catch (e) { this.release(); return false; }
      this.t0 = Date.now();
      return true;
    },
    stop() {
      this.gen++;
      const mr = this.mr, stream = this.stream, t0 = this.t0;
      this.mr = null;
      if (!mr || mr.state === "inactive") { this.release(stream); return Promise.resolve(null); }
      return new Promise(res => {
        mr.onstop = () => {
          const blob = new Blob(mr.chunks, { type: mr.mimeType || "audio/webm" });
          this.release(stream);
          res(blob.size ? { blob, seconds: Math.round((Date.now() - t0) / 1000) } : null);
        };
        mr.stop();
      });
    },
    cancel() { this.gen++; this.asking = null; this.halt(); this.release(); },
    halt() {
      const mr = this.mr;
      this.mr = null;
      if (mr && mr.state !== "inactive") { mr.onstop = null; mr.ondataavailable = null; try { mr.stop(); } catch (e) {} }
    },
    release(stream = this.stream) {
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (this.stream === stream) this.stream = null;
    },
  };
  const toBase64 = blob => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] || "");
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
  let lastTakeUrl = null;
  function mountTake(el, take, opts) {
    if (!el) return;
    if (lastTakeUrl) { URL.revokeObjectURL(lastTakeUrl); lastTakeUrl = null; }
    if (!take) {
      el.innerHTML = `<p class="nomic">🎙️ Esta vez no se grabó audio (el navegador no dio acceso al micrófono). Permite el micrófono e inténtalo de nuevo, o grábate con el celular.</p>`;
      return;
    }
    const url = lastTakeUrl = URL.createObjectURL(take.blob);
    const ext = /mp4/.test(take.blob.type) ? "m4a" : /ogg/.test(take.blob.type) ? "ogg" : "webm";
    const m = Math.floor(take.seconds / 60), s = String(take.seconds % 60).padStart(2, "0");
    el.innerHTML = `<div class="blp-take">
      <audio controls preload="metadata" src="${url}"></audio>
      <div class="meta"><span>🎧 Tu grabación · ${m}:${s}</span><a href="${url}" download="${esc(opts.filename || "speaking")}.${ext}">Descargar</a></div>
      <div data-send></div></div>`;
    mountSend(el.querySelector("[data-send]"), {
      what: "audio",
      note: "Tu grabación se guarda en Google Drive para que tu coach la escuche y la corrija. Verás tu nivel y comentarios en «Mis resultados».",
      build: async () => Object.assign({ kind: "speaking", mime: take.blob.type || "audio/webm", seconds: take.seconds, audio: await toBase64(take.blob) }, opts.build()),
    });
  }

  window.BL = {
    config: CFG, connected, api, auth, toast, esc,
    get student() { return student; },
    signIn, signOut, requireStudent, setStudent,
    submitObjective, flush, outboxCount,
    mountSend, mountTake, rec,
  };

  // Retry anything that didn't reach the coach last time.
  if (student && connected() && store.get(LS_OUTBOX, []).length) setTimeout(() => flush(false), 1500);
})();
