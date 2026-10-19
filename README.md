# Bilingualearn Platform — CELPIP

Student practice platform for Bilingualearn's CELPIP coaching.

| Page | What it does |
|---|---|
| `index.html` | Home: sign-in, skills, resources |
| `guia-celpip.html` | Todo sobre el CELPIP |
| `onboarding.html` | CELPIP Onboarding (gap calculator, habits, session timer) |
| `notebook.html` | Study Notebook (saved on the student's device, JSON export/import) |
| `listening.html` | Listening Practice Task + Parts 1–6 with recorded audio (`docs/a/*.mp3`). **Auto-graded.** The score goes to the coach's gradebook |
| `reading.html` | Reading Practice Task + Parts 1–4. **Auto-graded.** The score goes to the coach's gradebook |
| `writing.html` | Writing Tasks 1–2. Students tap **Enviar a mi coach**, and the answer is saved as a **Google Doc** |
| `speaking.html` | Speaking Tasks 1–8. Students record in the browser, and the **audio** is saved to **Google Drive** |
| `mock.html` | **Simulacro completo**: 5 full CELPIP mock tests (Listening → Reading → Writing → Speaking, same parts, question counts and timings as the real exam). Mock N uses practice N of every part, so no mock repeats another. Sections open as `listening.html?mock=N` etc. in exam mode |
| `results.html` | **Mis resultados**: auto scores, the coach's CLB level and comments |

The site is static HTML/CSS/JS with no build step. The backend is a **Google Apps Script** that runs as the coach, inside a Google Sheet. That Sheet is the gradebook, and all files go into the coach's Drive.

```
docs/                 the website (deploy this folder)
  assets/config.js    ← paste the Apps Script URL here
  assets/platform.js  sign-in, nav bar, sending work, microphone recorder
apps-script/Code.gs   backend: paste into the Sheet's Apps Script editor
tools/dev-server.mjs  local preview, with a fake backend
```

## Try it locally

```bash
npm run dev     # http://localhost:5180 with a fake backend; class code: DEMO
npm start       # same, but uses the real apiUrl from docs/assets/config.js
```

In `npm run dev`, submissions are stored in `.dev-data/`. To simulate the coach grading one, open
`http://localhost:5180/dev/grade?id=<ID>&level=8&feedback=Great%20job`. The IDs are in `.dev-data/db.json`.

## Connect Google Drive (once, from the coach's Google account)

1. **Create a Google Sheet**, e.g. "Bilingualearn CELPIP — Notas".
2. Open **Extensions → Apps Script**. Replace the contents of `Code.gs` with [`apps-script/Code.gs`](apps-script/Code.gs) and save.
   Optional: in Project Settings, turn on "Show appsscript.json" and paste [`apps-script/appsscript.json`](apps-script/appsscript.json). It sets the time zone to Australia/Sydney.
3. Reload the Sheet. A **Bilingualearn** menu appears. Choose **1 · Configurar la plataforma**.
   - Google asks for permissions. Because this is your own script, it shows "Google hasn't verified this app". Click **Advanced → Go to … (unsafe)** and continue.
   - Enter the **class code** your students will use, e.g. `CELPIP-OCT26`. You can set several, separated by commas.
   - This creates the **Entregas** and **Estudiantes** tabs and a Drive folder called **Bilingualearn CELPIP — Entregas**.
4. In the Apps Script editor, go to **Deploy → New deployment → Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**

   Click **Deploy** and copy the URL that ends in `/exec`.
5. Paste that URL into `docs/assets/config.js` as `apiUrl` and publish the site.
6. Check that Writing reaches Drive: in the Sheet choose **Bilingualearn → Probar: guardar un Writing de prueba en Drive**. It creates a sample Doc in the **Prueba** subfolder and shows its link. You can delete it afterwards.

After any later change to `Code.gs`, go to **Deploy → Manage deployments → ✏️ → Version: New version**. This keeps the same URL.

## How grading works

- **Reading / Listening**: graded instantly in the browser. Each part adds a row to **Entregas** with the score (e.g. `8/11`), the estimated CLB level (from the 38-question table) and the question numbers the student missed. Status: `Auto`.
- **Writing**: becomes a Google Doc in `Entregas/<student>/`. The Doc contains the task, the response, the word count, the time used, and a scoring table (Content/Coherence, Vocabulary, Readability, Task Fulfillment). Status: `Pendiente`, highlighted yellow.
- **Speaking**: the recording (webm, or m4a on iPhone) goes into the same folder. The file description holds the question.
- **To grade**: open the link in the **Archivo** column, then fill in **Nivel coach** (M, 3–12) and **Comentarios coach**. The status changes to `Corregido` automatically, and the student sees the level and comments in **Mis resultados**.
- **Sharing with students**: on by default. Each new Doc is shared with the student's email as a commenter, and each audio file as a viewer. If the student has a Google account, they can read your Doc comments and get an "Abrir mi documento" link. To keep files private to your Drive, use **Bilingualearn → Compartir archivos con estudiantes: sí/no**.

## Full mock test

- Students pick Simulacro 1–5 on `mock.html` and do the sections in order. Inside a section the parts run back to back, with no guides, part pickers or answers shown until the end, like the real exam. They can pause between sections; leaving in the middle of a part asks first, and that part restarts.
- Everything still reaches the gradebook like normal practice, with tasks labelled `Simulacro N · …`. Listening and Reading also add a `TOTAL` row (out of 38, with the CLB estimate). Writing and Speaking answers are sent to the coach automatically after each task.
- Mock progress is saved on the student's device (`bl-mock` in the browser).

## Students

- Students sign in once per device with their name, email and the **class code**. They then get a 6-character **personal code**, shown on the home page.
- To sign in on another device, they use the same email plus that personal code. If they lose it, the coach can find it in the **Estudiantes** tab.
- If the platform isn't connected yet (empty `apiUrl`), everything still works for practice. Nothing is sent.
- Reading scores are queued on the device first. If the connection drops, they're sent the next time the student opens the platform.

## Publishing the site

The site is published with **GitHub Pages** from the `docs/` folder of `main`:
GitHub → repo → **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/docs` → Save**.
After that, every push to `main` republishes the site within a minute or two at
`https://taniaolarte.github.io/bilingualearn-platform/`.

Any other static host works too, as long as it uses **HTTPS**; browsers block the microphone on plain HTTP.

## Still to do

- **Privacy**: the platform now collects student names, emails, writing and voice recordings, all stored in the coach's Google account. Mention this in the privacy policy you give students.
- Practice content (tasks, answers, sample responses) lives in each page's `TASKS` array. Edit it there.
