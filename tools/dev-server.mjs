// Local preview of the platform, no dependencies.
//   node tools/dev-server.mjs          → serves docs/ using the real assets/config.js
//   node tools/dev-server.mjs --mock   → also fakes the Apps Script API at /api (class code: DEMO),
//                                        storing students, submissions and files in .dev-data/
// In mock mode, http://localhost:5180/dev/grade?id=<ID>&level=8&feedback=... grades a submission.
import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "docs");
const DATA = path.join(ROOT, ".dev-data");
const MOCK = process.argv.includes("--mock");
const PORT = Number(process.env.PORT) || 5180;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".png": "image/png", ".json": "application/json", ".mp3": "audio/mpeg", ".webm": "audio/webm", ".m4a": "audio/mp4" };

let db = { students: [], subs: [] };
const dbFile = path.join(DATA, "db.json");
if (MOCK) {
  await mkdir(path.join(DATA, "files"), { recursive: true });
  if (existsSync(dbFile)) db = JSON.parse(await readFile(dbFile, "utf8"));
}
const saveDb = () => writeFile(dbFile, JSON.stringify(db, null, 2));
const fail = code => { const e = new Error(code); e.code = code; throw e; };

function auth(req) {
  const st = db.students.find(s => s.email === String(req.email || "").toLowerCase());
  if (!st) fail("UNKNOWN_STUDENT");
  if (st.key !== String(req.key || "").toUpperCase()) fail("BAD_KEY");
  return st;
}

async function handle(req) {
  switch (req.action) {
    case "register": {
      const email = String(req.email || "").trim().toLowerCase(), group = String(req.group || "").trim().toUpperCase();
      if (!req.name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail("BAD_INPUT");
      if (group !== "DEMO") fail("BAD_CODE");
      const found = db.students.find(s => s.email === email);
      if (found) {
        if (!req.key) fail("EMAIL_TAKEN");
        if (String(req.key).toUpperCase() !== found.key) fail("BAD_KEY");
        return { ok: true, student: found };
      }
      const st = { name: String(req.name).trim(), email, group, key: crypto.randomBytes(3).toString("hex").toUpperCase() };
      db.students.push(st); await saveDb();
      return { ok: true, student: st };
    }
    case "submit": {
      const st = auth(req);
      if (db.subs.some(s => s.id === req.id)) return { ok: true, duplicate: true };
      const row = { id: req.id || crypto.randomUUID(), date: new Date().toISOString(), email: st.email, skill: req.skill, task: req.task, practice: String(req.practice || ""), selfCheck: req.selfCheck || "", coachLevel: "", feedback: "" };
      let file = "";
      if (req.kind === "objective") Object.assign(row, { autoScore: `${req.correct}/${req.total}`, autoClb: String(req.clb || ""), detail: req.detail || "", status: "Auto" });
      else if (req.kind === "writing") {
        file = `files/${row.id}.txt`;
        await writeFile(path.join(DATA, file), `${req.task} · Práctica ${req.practice}\n\n${req.prompt}\n${(req.context || []).map(x => "- " + x).join("\n")}\n\n---\n${req.text}\n`);
        Object.assign(row, { detail: `${req.words} palabras · ${req.timeUsed} de ${req.timeLimit}`, status: "Pendiente" });
      } else if (req.kind === "speaking") {
        file = `files/${row.id}.${/mp4/.test(req.mime) ? "m4a" : "webm"}`;
        await writeFile(path.join(DATA, file), Buffer.from(req.audio || "", "base64"));
        Object.assign(row, { detail: `${req.seconds} s de audio${req.choice ? " · Eligió: " + req.choice : ""}`, status: "Pendiente" });
      } else fail("BAD_INPUT");
      row.fileUrl = file ? "/dev/" + file : "";
      db.subs.push(row); await saveDb();
      return { ok: true, id: row.id, fileUrl: row.fileUrl };
    }
    case "results": {
      const st = auth(req);
      return { ok: true, rows: db.subs.filter(s => s.email === st.email).reverse() };
    }
    default: fail("BAD_ACTION");
  }
}

const readBody = req => new Promise((res, rej) => { let b = ""; req.on("data", c => (b += c)); req.on("end", () => res(b)); req.on("error", rej); });

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (MOCK && url.pathname === "/api" && req.method === "POST") {
      let out;
      try { out = await handle(JSON.parse(await readBody(req))); }
      catch (e) { out = { ok: false, error: e.code || "SERVER", message: e.code ? "" : String(e.message) }; }
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(out));
    }
    if (MOCK && url.pathname === "/dev/grade") {
      const s = db.subs.find(x => x.id === url.searchParams.get("id"));
      if (!s) { res.writeHead(404); return res.end("no such submission"); }
      Object.assign(s, { coachLevel: url.searchParams.get("level") || "", feedback: url.searchParams.get("feedback") || "", status: "Corregido" });
      await saveDb();
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("graded " + s.id);
    }
    if (MOCK && url.pathname.startsWith("/dev/files/")) {
      const f = path.join(DATA, "files", path.basename(url.pathname));
      res.writeHead(200);
      return res.end(await readFile(f));
    }
    if (MOCK && url.pathname === "/assets/config.js") {
      res.writeHead(200, { "Content-Type": TYPES[".js"] });
      // Real config (so the access keys work the same), pointed at the fake backend.
      return res.end((await readFile(path.join(SITE, "assets/config.js"), "utf8")) + 'window.BL_CONFIG.apiUrl = "/api";\n');
    }
    let p = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
    if (!p || p.endsWith("/")) p += "index.html";
    const file = path.join(SITE, p);
    if (!file.startsWith(SITE + path.sep)) { res.writeHead(403); return res.end(); }
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch (e) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
}).listen(PORT, () => console.log(`Bilingualearn platform → http://localhost:${PORT}${MOCK ? "  (mock API, class code DEMO)" : ""}`));
