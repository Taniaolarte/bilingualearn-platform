/**
 * Bilingualearn platform backend — Google Apps Script bound to the coach's gradebook Sheet.
 *
 * - Registers students (name, email, class code) and gives each a personal code.
 * - Logs auto-graded Reading/Listening scores in the "Entregas" sheet.
 * - Saves Writing answers as Google Docs and Speaking recordings as audio files,
 *   one Drive folder per student, and links them from "Entregas".
 * - The coach grades by filling "Nivel coach" and "Comentarios coach";
 *   students see both on the platform's "Mis resultados" page.
 *
 * Setup: README.md → "Connect Google Drive".
 */

const SUBS = 'Entregas';
const STUDENTS = 'Estudiantes';
const SUB_COLS = ['Fecha', 'ID', 'Curso', 'Estudiante', 'Email', 'Grupo', 'Habilidad', 'Tarea', 'Práctica',
  'Puntaje auto', 'CLB estimado', 'Detalle', 'Autoevaluación', 'Archivo', 'Nivel coach', 'Comentarios coach', 'Estado', 'Corregido el'];
const STUDENT_COLS = ['Registrado', 'Nombre', 'Email', 'Grupo', 'Código personal', 'Última actividad'];
const STATUS = { AUTO: 'Auto', PENDING: 'Pendiente', GRADED: 'Corregido' };
const LEVELS = ['M', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const SKILLS = ['Listening', 'Reading', 'Writing', 'Speaking'];
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

/* ---------------- menu + one-time setup ---------------- */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Bilingualearn')
    .addItem('1 · Configurar la plataforma', 'setup')
    .addItem('Cambiar códigos de clase', 'changeClassCodes')
    .addItem('Compartir archivos con estudiantes: sí/no', 'toggleSharing')
    .addItem('Ver carpeta de entregas', 'showFolder')
    .addItem('Probar: guardar un Writing de prueba en Drive', 'testWritingSave')
    .addToUi();
}

function setup() {
  const ss = SpreadsheetApp.getActive();
  props_().setProperty('SPREADSHEET_ID', ss.getId());
  const subs = ensureSheet_(ss, SUBS, SUB_COLS);
  const stu = ensureSheet_(ss, STUDENTS, STUDENT_COLS);
  const h = headers_(subs), rows = subs.getMaxRows() - 1;

  subs.getRange(2, h['Estado'], rows).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(Object.values(STATUS), true).setAllowInvalid(false).build());
  subs.getRange(2, h['Nivel coach'], rows).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(LEVELS, true).setAllowInvalid(true).setHelpText('Nivel CELPIP/CLB: M, 3–12').build());
  subs.getRange(2, h['Comentarios coach'], rows).setWrap(true);
  subs.setColumnWidth(h['Comentarios coach'], 320);
  subs.setColumnWidth(h['Tarea'], 220);
  subs.setColumnWidth(h['Detalle'], 240);
  stu.getRange(2, headers_(stu)['Código personal'], stu.getMaxRows() - 1).setNumberFormat('@');

  const statusCol = subs.getRange(2, h['Estado'], rows);
  subs.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(STATUS.PENDING).setBackground('#FFF1B8').setRanges([statusCol]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(STATUS.GRADED).setBackground('#E3F5EE').setRanges([statusCol]).build(),
  ]);

  const folder = rootFolder_();
  if (!props_().getProperty('SHARE_WITH_STUDENT')) props_().setProperty('SHARE_WITH_STUDENT', 'yes');
  if (!classCodes_().length) changeClassCodes();

  SpreadsheetApp.getUi().alert('Plataforma lista ✅',
    'Códigos de clase: ' + classCodes_().join(', ') + '\n' +
    'Carpeta de entregas: ' + folder.getName() + '\n\n' +
    'Último paso: Implementar → Nueva implementación → Aplicación web\n' +
    '  · Ejecutar como: Yo\n  · Quién tiene acceso: Cualquier usuario\n' +
    'Copia la URL de la aplicación web en docs/assets/config.js (apiUrl).',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function changeClassCodes() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Códigos de clase',
    'Escribe el código (o varios separados por comas) que tus estudiantes usarán para entrar.\nActuales: ' + (classCodes_().join(', ') || 'ninguno'),
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const codes = r.getResponseText().split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  if (!codes.length) return ui.alert('No se guardó: escribe al menos un código.');
  props_().setProperty('CLASS_CODES', codes.join(','));
  ui.alert('Códigos guardados: ' + codes.join(', '));
}

function toggleSharing() {
  const on = props_().getProperty('SHARE_WITH_STUDENT') !== 'yes';
  props_().setProperty('SHARE_WITH_STUDENT', on ? 'yes' : 'no');
  SpreadsheetApp.getUi().alert(on
    ? 'Activado: cada Google Doc y audio nuevo se comparte con el email del estudiante (puede comentar), y el enlace aparece en «Mis resultados».'
    : 'Desactivado: los archivos nuevos quedan solo en tu Drive.');
}

function showFolder() {
  const f = rootFolder_();
  const html = HtmlService.createHtmlOutput('<p style="font-family:sans-serif"><a href="' + f.getUrl() + '" target="_blank">Abrir «' + f.getName() + '»</a></p>').setWidth(360).setHeight(90);
  SpreadsheetApp.getUi().showModalDialog(html, 'Carpeta de entregas');
}

// Saves a sample Writing exactly like a student submission would (same code path), without touching the sheets.
function testWritingSave() {
  const st = { name: 'Prueba', email: 'prueba@bilingualearn.test', group: 'TEST' };
  const file = saveWriting_(st, {
    task: 'Task 1 · Writing an Email', practice: 1, prompt: 'Prueba de la plataforma: este documento se puede borrar.',
    context: ['Punto 1', 'Punto 2', 'Punto 3'], text: 'Dear Ms. Lee,\n\nThis is a test answer.\n\nKind regards,\nPrueba',
    words: 11, timeUsed: '1:00', timeLimit: '27:00', selfCheck: '5/10',
  });
  const html = HtmlService.createHtmlOutput('<p style="font-family:sans-serif">✅ Se creó el documento de prueba en la carpeta de entregas (subcarpeta «Prueba»).</p>' +
    '<p style="font-family:sans-serif"><a href="' + file.getUrl() + '" target="_blank">Abrir el documento</a></p>').setWidth(420).setHeight(130);
  SpreadsheetApp.getUi().showModalDialog(html, 'Writing → Google Drive');
}

/* ---------------- grading: mark rows as graded when the coach writes a level or comment ---------------- */

function onEdit(e) {
  const sh = e.range.getSheet();
  if (sh.getName() !== SUBS || e.range.getRow() < 2) return;
  const h = headers_(sh);
  const first = e.range.getColumn(), last = first + e.range.getNumColumns() - 1;
  const touches = c => c >= first && c <= last;
  if (!touches(h['Nivel coach']) && !touches(h['Comentarios coach'])) return;
  for (let r = e.range.getRow(); r < e.range.getRow() + e.range.getNumRows(); r++) {
    const status = sh.getRange(r, h['Estado']);
    const graded = sh.getRange(r, h['Nivel coach']).getValue() !== '' || sh.getRange(r, h['Comentarios coach']).getValue() !== '';
    if (graded && status.getValue() === STATUS.PENDING) {
      status.setValue(STATUS.GRADED);
      sh.getRange(r, h['Corregido el']).setValue(new Date());
    } else if (!graded && status.getValue() === STATUS.GRADED) {
      status.setValue(STATUS.PENDING);
      sh.getRange(r, h['Corregido el']).setValue('');
    }
  }
}

/* ---------------- web app ---------------- */

function doGet() {
  return json_({ ok: true, service: 'bilingualearn-platform', configured: classCodes_().length > 0 });
}

function doPost(e) {
  let out;
  try {
    const req = JSON.parse(e.postData.contents);
    switch (req.action) {
      case 'register': out = register_(req); break;
      case 'submit': out = submit_(req); break;
      case 'results': out = results_(req); break;
      case 'ping': out = { ok: true }; break;
      default: fail_('BAD_ACTION');
    }
  } catch (err) {
    if (!err.code) console.error(err);
    out = { ok: false, error: err.code || 'SERVER' };
  }
  return json_(out);
}

function register_(req) {
  const name = text_(req.name, 80);
  const email = email_(req.email);
  const group = text_(req.group, 30).toUpperCase();
  if (!name || !email) fail_('BAD_INPUT');
  if (classCodes_().indexOf(group) < 0) fail_('BAD_CODE');
  return locked_(() => {
    const sh = sheet_(STUDENTS);
    const found = findStudent_(sh, email);
    if (found) {
      const key = text_(req.key, 12).toUpperCase();
      if (!key) fail_('EMAIL_TAKEN');
      if (key !== found.key) fail_('BAD_KEY');
      sh.getRange(found.row, found.h['Última actividad']).setValue(new Date());
      return { ok: true, student: { name: found.name, email: email, group: found.group, key: found.key } };
    }
    const key = newKey_();
    append_(sh, { 'Registrado': new Date(), 'Nombre': safe_(name), 'Email': email, 'Grupo': "'" + group, 'Código personal': key, 'Última actividad': new Date() });
    return { ok: true, student: { name: name, email: email, group: group, key: key } };
  });
}

function submit_(req) {
  const st = auth_(req);
  const kind = String(req.kind || '');
  const skill = SKILLS.indexOf(req.skill) >= 0 ? req.skill : fail_('BAD_INPUT');
  const id = text_(req.id, 40) || Utilities.getUuid();
  const subs = sheet_(SUBS);
  const dup = findById_(subs, id);
  if (dup) return { ok: true, id: id, duplicate: true, fileUrl: shareOn_() ? dup.file : '' };

  let file = null, row;
  const base = {
    'Fecha': when_(req.at), 'ID': id, 'Curso': text_(req.course, 20) || 'CELPIP',
    'Estudiante': safe_(st.name), 'Email': st.email, 'Grupo': "'" + st.group, 'Habilidad': skill,
    'Tarea': safe_(text_(req.task, 120)), 'Práctica': Number(req.practice) || '',
    'Autoevaluación': req.selfCheck ? "'" + text_(req.selfCheck, 12) : '',
  };
  if (kind === 'objective') {
    const c = Math.max(0, Math.round(Number(req.correct) || 0)), n = Math.max(1, Math.round(Number(req.total) || 1));
    row = Object.assign(base, {
      'Puntaje auto': "'" + c + '/' + n, 'CLB estimado': "'" + text_(req.clb, 8),
      'Detalle': safe_(text_(req.detail, 300)), 'Estado': STATUS.AUTO,
    });
  } else if (kind === 'writing') {
    file = saveWriting_(st, req);
    row = Object.assign(base, {
      'Detalle': (Number(req.words) || 0) + ' palabras · ' + text_(req.timeUsed, 8) + ' de ' + text_(req.timeLimit, 8) + (req.timeUp ? ' (tiempo agotado)' : ''),
      'Archivo': file.getUrl(), 'Estado': STATUS.PENDING,
    });
  } else if (kind === 'speaking') {
    file = saveSpeaking_(st, req);
    row = Object.assign(base, {
      'Detalle': (Number(req.seconds) || 0) + ' s de audio' + (req.choice ? ' · Eligió: ' + safe_(text_(req.choice, 80)) : ''),
      'Archivo': file.getUrl(), 'Estado': STATUS.PENDING,
    });
  } else fail_('BAD_INPUT');

  const kept = locked_(() => {
    const again = findById_(subs, id);
    if (again) return again;
    append_(subs, row);
    touch_(st);
    return null;
  });
  if (kept) {  // a retry of a submission that already got through while this one was saving
    if (file) file.setTrashed(true);
    return { ok: true, id: id, duplicate: true, fileUrl: shareOn_() ? kept.file : '' };
  }
  const shared = file ? share_(file, st.email) : false;
  return { ok: true, id: id, fileUrl: shared ? file.getUrl() : '' };
}

function results_(req) {
  const st = auth_(req);
  const sh = sheet_(SUBS);
  const values = sh.getDataRange().getValues();
  const h = headers_(sh), at = name => h[name] - 1;
  const share = shareOn_();
  const rows = [];
  for (let i = values.length - 1; i >= 1 && rows.length < 300; i--) {
    const v = values[i];
    if (String(v[at('Email')]).toLowerCase() !== st.email) continue;
    rows.push({
      date: v[at('Fecha')] instanceof Date ? v[at('Fecha')].toISOString() : String(v[at('Fecha')]),
      skill: String(v[at('Habilidad')]), task: String(v[at('Tarea')]), practice: String(v[at('Práctica')]),
      autoScore: String(v[at('Puntaje auto')]), autoClb: String(v[at('CLB estimado')]),
      detail: String(v[at('Detalle')]), selfCheck: String(v[at('Autoevaluación')]),
      fileUrl: share ? String(v[at('Archivo')]) : '',
      coachLevel: String(v[at('Nivel coach')]), feedback: String(v[at('Comentarios coach')]),
      status: String(v[at('Estado')]),
    });
  }
  return { ok: true, rows: rows };
}

/* ---------------- Drive ---------------- */

function saveWriting_(st, req) {
  const task = text_(req.task, 120), when = stamp_();
  const doc = DocumentApp.create('Writing · ' + task + ' · Práctica ' + (Number(req.practice) || '') + ' · ' + st.name + ' · ' + when);
  const b = doc.getBody();
  const H = DocumentApp.ParagraphHeading;
  const title = b.getParagraphs()[0];
  title.setText('CELPIP Writing — ' + task);
  title.setHeading(H.HEADING1);
  para_(b, st.name + ' · ' + st.email + ' · Grupo ' + st.group + ' · ' + when, true);
  para_(b, 'Tarea').setHeading(H.HEADING2);
  para_(b, text_(req.prompt, 3000));
  // First line is the instruction ("In your email:" / "Choose the option…"); the rest are its points/options.
  const ctx = (Array.isArray(req.context) ? req.context : []).slice(0, 10);
  if (ctx.length) para_(b, text_(ctx[0], 600));
  ctx.slice(1).forEach(x => b.appendListItem(text_(x, 600)).setGlyphType(DocumentApp.GlyphType.BULLET));
  para_(b, 'Respuesta').setHeading(H.HEADING2);
  String(req.text || '').slice(0, 20000).split(/\r?\n/).forEach(p => para_(b, p));
  para_(b, (Number(req.words) || 0) + ' palabras · ' + text_(req.timeUsed, 8) + ' de ' + text_(req.timeLimit, 8) +
    (req.timeUp ? ' (tiempo agotado)' : '') + (req.selfCheck ? ' · Autoevaluación: ' + text_(req.selfCheck, 12) : ''), true);
  para_(b, 'Corrección del coach').setHeading(H.HEADING2);
  const t = b.appendTable([['Criterio', 'Nivel (CLB)', 'Comentarios'],
    ['Content / Coherence', '', ''], ['Vocabulary', '', ''], ['Readability', '', ''], ['Task Fulfillment', '', ''], ['Nivel general', '', '']]);
  t.getRow(0).editAsText().setBold(true);
  doc.saveAndClose();
  const file = DriveApp.getFileById(doc.getId());
  file.moveTo(studentFolder_(st));
  return file;
}

// Appended paragraphs can inherit the previous one's style; start each from plain text.
function para_(body, text, italic) {
  const p = body.appendParagraph(text);
  p.setHeading(DocumentApp.ParagraphHeading.NORMAL);
  const a = {};
  a[DocumentApp.Attribute.ITALIC] = !!italic;
  a[DocumentApp.Attribute.BOLD] = false;
  p.setAttributes(a);
  return p;
}

function saveSpeaking_(st, req) {
  const bytes = Utilities.base64Decode(String(req.audio || ''));
  if (!bytes.length) fail_('BAD_INPUT');
  if (bytes.length > MAX_AUDIO_BYTES) fail_('TOO_LARGE');
  const mime = /^audio\/[\w.+-]+/.exec(String(req.mime || ''));
  const type = mime ? mime[0] : 'audio/webm';
  const ext = /mp4|m4a|aac/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : 'webm';
  const name = 'Speaking · ' + text_(req.task, 120) + ' · Práctica ' + (Number(req.practice) || '') + ' · ' + st.name + ' · ' + stamp_() + '.' + ext;
  const file = studentFolder_(st).createFile(Utilities.newBlob(bytes, type, name));
  file.setDescription('Pregunta: ' + text_(req.prompt, 1500) + (req.choice ? '\nEligió: ' + text_(req.choice, 80) : ''));
  return file;
}

function share_(file, email) {
  if (!shareOn_()) return false;
  try {
    if (file.getMimeType() === MimeType.GOOGLE_DOCS) file.addCommenter(email); else file.addViewer(email);
    return true;
  } catch (err) {
    return false;  // e.g. the email isn't a Google account
  }
}

function rootFolder_() {
  const id = props_().getProperty('ROOT_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (err) {} }
  const f = DriveApp.createFolder('Bilingualearn CELPIP — Entregas');
  props_().setProperty('ROOT_FOLDER_ID', f.getId());
  return f;
}

function studentFolder_(st) {
  const root = rootFolder_(), name = st.name + ' — ' + st.email;
  return locked_(() => {
    const it = root.getFoldersByName(name);
    return it.hasNext() ? it.next() : root.createFolder(name);
  });
}

/* ---------------- sheets ---------------- */

function sheet_(name) {
  const id = props_().getProperty('SPREADSHEET_ID');
  const ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(name);
  if (!sh) fail_('NOT_SET_UP');
  return sh;
}

function ensureSheet_(ss, name, cols) {
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  const have = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String) : [];
  const missing = cols.filter(c => have.indexOf(c) < 0);
  if (missing.length) sh.getRange(1, have.filter(String).length + 1, 1, missing.length).setValues([missing]);
  sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#17153B').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  return sh;
}

function headers_(sh) {
  const map = {};
  sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].forEach((name, i) => { if (name) map[name] = i + 1; });
  return map;
}

function append_(sh, obj) {
  const h = headers_(sh), row = new Array(sh.getLastColumn()).fill('');
  Object.keys(obj).forEach(k => { if (h[k]) row[h[k] - 1] = obj[k]; });
  sh.appendRow(row);
}

function findStudent_(sh, email) {
  const values = sh.getDataRange().getValues(), h = headers_(sh);
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][h['Email'] - 1]).toLowerCase() === email) {
      return { row: i + 1, h: h, name: String(values[i][h['Nombre'] - 1]), group: cellText_(values[i][h['Grupo'] - 1]), key: String(values[i][h['Código personal'] - 1]).toUpperCase() };
    }
  }
  return null;
}

function findById_(sh, id) {
  const h = headers_(sh);
  if (sh.getLastRow() < 2) return null;
  const cell = sh.getRange(2, h['ID'], sh.getLastRow() - 1).createTextFinder(id).matchEntireCell(true).findNext();
  return cell ? { row: cell.getRow(), file: String(sh.getRange(cell.getRow(), h['Archivo']).getValue()) } : null;
}

function auth_(req) {
  const email = email_(req.email), key = text_(req.key, 12).toUpperCase();
  if (!email || !key) fail_('UNKNOWN_STUDENT');
  const st = findStudent_(sheet_(STUDENTS), email);
  if (!st) fail_('UNKNOWN_STUDENT');
  if (st.key !== key) fail_('BAD_KEY');
  return { name: st.name, email: email, group: st.group, row: st.row, h: st.h };
}

function touch_(st) {
  sheet_(STUDENTS).getRange(st.row, st.h['Última actividad']).setValue(new Date());
}

/* ---------------- helpers ---------------- */

function props_() { return PropertiesService.getScriptProperties(); }
function classCodes_() { return String(props_().getProperty('CLASS_CODES') || '').split(',').map(s => s.trim()).filter(Boolean); }
function shareOn_() { return props_().getProperty('SHARE_WITH_STUDENT') === 'yes'; }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function fail_(code) { const e = new Error(code); e.code = code; throw e; }
function cellText_(v) { return v instanceof Date ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'd/M/yy') : String(v); }
function text_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max); }
// Text typed by students must never be read by Sheets as a formula.
function safe_(s) { return /^[=+\-@]/.test(s) ? "'" + s : s; }
function email_(v) { const e = text_(v, 120).toLowerCase(); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : ''; }
// When a queued score was actually done (sent later from the student's device); never in the future.
function when_(iso) {
  const d = new Date(iso), now = new Date();
  return isNaN(d) || d > now || now - d > 90 * 864e5 ? now : d;
}
function stamp_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'); }

function newKey_() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Date.now());
  let k = '';
  for (let i = 0; i < 6; i++) k += abc[(bytes[i] + 256) % abc.length];
  return k;
}

function locked_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}
