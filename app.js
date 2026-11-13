'use strict';
/* ScanDocument EPS — application (classes, modèles de fiches, scan, résultats). */
const DB = 'scan-document-eps-v1';
let db, photoData = null, editing = null, queueEditing = null, editorTpl = null, batchBusy = false;
let state = { classes: [], students: [], scans: [], queue: [], templates: [] };
const $ = id => document.getElementById(id);
const uid = () => crypto.randomUUID();
const sid = p => p + Math.random().toString(36).slice(2, 8);
const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);

/* ---------- Modèles par défaut ---------- */
const DEFAULT_TEMPLATES = [
  { id: 't2x800', name: 'Demi-fond 2 × 800 m', format: 'auto', minutesMax: 5, cumulative: true,
    blocks: [1, 2].map(i => ({ title: (i === 1 ? '1er' : '2e') + ' 800 m', rows: [['e', 'Estimation'], ['a', '200 m'], ['b', '400 m'], ['c', '600 m'], ['d', '800 m']].map(([k, l]) => ({ id: 'c' + i + k, label: l, type: 'time' })) })) },
  { id: 't3x500', name: 'Demi-fond 3 × 500 m', format: 'auto', minutesMax: 5, cumulative: true,
    blocks: [1, 2, 3].map(i => ({ title: 'Course ' + i, rows: [['e', 'Estimation'], ['a', '250 m'], ['b', '500 m']].map(([k, l]) => ({ id: 'c' + i + k, label: l, type: 'time' })) })) }
];
const tplById = id => state.templates.find(t => t.id === id);
const className = id => state.classes.find(c => c.id === id)?.name || '';

/* ---------- Stockage ---------- */
function openDB() { return new Promise((resolve, reject) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore('state'); r.onsuccess = () => { db = r.result; resolve(); }; r.onerror = () => reject(r.error); }); }
function getState() { return new Promise((resolve, reject) => { const r = db.transaction('state').objectStore('state').get('data'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
function persist() { return new Promise((resolve, reject) => { const t = db.transaction('state', 'readwrite'); t.objectStore('state').put(state, 'data'); t.oncomplete = resolve; t.onerror = () => reject(t.error); }); }

function migrate() {
  state.queue = state.queue || [];
  state.templates = state.templates || [];
  for (const d of DEFAULT_TEMPLATES) if (!tplById(d.id)) state.templates.push(JSON.parse(JSON.stringify(d)));
  for (const s of state.scans) {
    if (s.races && !s.values) {
      s.templateId = 't2x800'; s.values = {};
      s.races.forEach((r, i) => {
        const p = 'c' + (i + 1);
        if (r.est) s.values[p + 'e'] = r.est;
        ['a', 'b', 'c', 'd'].forEach((k, j) => { if (r.passes?.[j]) s.values[p + k] = r.passes[j]; });
        if (r.final && !s.values[p + 'd']) s.values[p + 'd'] = r.final;
      });
      delete s.races;
    }
    s.templateId = s.templateId || 't2x800'; s.values = s.values || {};
  }
  for (const q of state.queue) if (q.read && !q.read.values) q.read = null;
}

/* ---------- Navigation ---------- */
function view(id) { document.querySelectorAll('main section').forEach(s => s.classList.toggle('hidden', s.id !== id)); render(); }
function currentClass() { return $('classSelect').value || state.classes[0]?.id; }
function fillSelect(id, items, keepFirst) {
  const el = $(id), old = el.value;
  el.innerHTML = items.map(([v, l]) => '<option value="' + escapeHtml(v) + '">' + escapeHtml(l) + '</option>').join('');
  if (items.some(([v]) => v === old)) el.value = old; else if (keepFirst && items.length) el.value = items[0][0];
}

function render() {
  const cls = state.classes.map(c => [c.id, c.name]), tpls = state.templates.map(t => [t.id, t.name]);
  ['classSelect', 'scanClass', 'resultClass', 'batchClass'].forEach(id => fillSelect(id, cls, true));
  ['printTpl', 'batchTpl', 'resultTpl', 'scanTpl'].forEach(id => fillSelect(id, tpls, true));
  $('classList').innerHTML = state.classes.map(c => '<span class="pill" style="display:inline-block;margin:8px 5px 0 0">' + escapeHtml(c.name) + ' · ' + state.students.filter(s => s.classId === c.id).length + ' élèves</span>').join('') || '<p class="muted">Aucune classe pour le moment.</p>';
  $('roster').innerHTML = state.students.filter(s => s.classId === currentClass()).sort((a, b) => a.name.localeCompare(b.name, 'fr')).map(s => '<div class="rowcard flex"><span class="grow">' + escapeHtml(s.name) + '</span><button class="secondary" onclick="printStudent(\'' + s.id + '\')">🖨 Fiche</button><button class="secondary" onclick="removeStudent(\'' + s.id + '\')">Retirer</button></div>').join('');
  const previous = $('scanStudent').value;
  $('scanStudent').innerHTML = '<option value="">— Élève non identifié —</option>' + state.students.filter(s => s.classId === $('scanClass').value).sort((a, b) => a.name.localeCompare(b.name, 'fr')).map(s => '<option value="' + s.id + '">' + escapeHtml(s.name) + '</option>').join('');
  $('scanStudent').value = state.students.some(s => s.id === previous && s.classId === $('scanClass').value) ? previous : '';
  renderResults(); renderBatch(); renderEditor(); calculate();
}

/* ---------- Classes et élèves ---------- */
function addClass() { const name = $('className').value.trim(); if (!name) return alert('Indique un nom de classe'); const c = { id: uid(), name }; state.classes.push(c); $('className').value = ''; persist(); render(); $('classSelect').value = c.id; render(); }
function addStudent() { const c = currentClass(), name = $('studentName').value.trim(); if (!c || !name) return alert('Choisis une classe et un nom'); if (state.students.some(s => s.classId === c && s.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return alert('Cet élève existe déjà'); state.students.push({ id: uid(), classId: c, name }); $('studentName').value = ''; persist(); render(); }
async function importRoster(e) {
  const f = e.target.files[0], c = currentClass(); if (!f || !c) return alert('Crée d’abord une classe');
  const text = await f.text(), lines = text.replace(/^﻿/, '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  function parse(line, sep) { const out = []; let value = '', quoted = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (ch === '"') { if (quoted && line[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; } else if (ch === sep && !quoted) { out.push(value.trim()); value = ''; } else value += ch; } out.push(value.trim()); return out; }
  const header = lines[0] || '', sep = header.includes(';') ? ';' : header.includes('\t') ? '\t' : ',';
  const headings = parse(header, sep).map(x => x.toLocaleLowerCase('fr').normalize('NFD').replace(/[̀-ͯ]/g, ''));
  const nameCol = headings.findIndex(x => ['eleves', 'eleve', 'nom prenom', 'nom et prenom'].includes(x)), surnameCol = headings.findIndex(x => x === 'nom'), firstnameCol = headings.findIndex(x => x === 'prenom');
  const hasHeader = nameCol >= 0 || surnameCol >= 0; let n = 0;
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    const cells = parse(line, sep);
    let name = nameCol >= 0 ? cells[nameCol] : surnameCol >= 0 ? (cells[surnameCol] || '') + ' ' + (firstnameCol >= 0 ? cells[firstnameCol] || '' : '') : cells.length > 1 ? cells[0] + ' ' + cells[1] : cells[0];
    name = (name || '').trim();
    if (name && !state.students.some(s => s.classId === c && s.name.toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr'))) { state.students.push({ id: uid(), classId: c, name }); n++; }
  }
  await persist(); e.target.value = ''; render(); alert(n + ' élèves importés (noms et prénoms uniquement)');
}
function removeStudent(id) { if (state.scans.some(x => x.studentId === id)) return alert('Élève lié à une fiche : suppression bloquée'); if (confirm('Supprimer cet élève ?')) { state.students = state.students.filter(x => x.id !== id); persist(); render(); } }

/* ---------- Éditeur de fiches ---------- */
const TYPE_LABEL = { time: 'Temps', number: 'Nombre', choice: 'Choix' };
function curTpl() { if (!tplById(editorTpl)) editorTpl = state.templates[0]?.id; return tplById(editorTpl); }
function tplUsed(t) { return state.scans.some(s => s.templateId === t.id); }
function renderEditor() {
  if (!$('tplForm')) return;
  fillSelect('tplSelect', state.templates.map(t => [t.id, t.name]), true);
  const t = curTpl(); if (!t) { $('tplForm').innerHTML = ''; $('tplPreview').innerHTML = ''; return; }
  $('tplSelect').value = t.id;
  const lock = !!t.locked, dis = lock ? ' disabled' : '';
  $('tplLock').classList.toggle('hidden', !lock);
  $('tplLock').innerHTML = lock ? 'Cette fiche a déjà été imprimée ou utilisée : elle est verrouillée pour que les fiches papier restent lisibles. <b>Duplique-la</b> pour en faire une variante. <button class="mini" onclick="unlockTpl()">Déverrouiller quand même</button>' : '';
  let h = '<label>Nom de la fiche</label><input style="width:100%" value="' + escapeHtml(t.name) + '" onchange="tplSet(\'name\',this.value)"' + dis + '>';
  h += '<div class="flex"><div><label>Format</label><select onchange="tplSet(\'format\',this.value)"' + dis + '>' + [['auto', 'Automatique (A5 sinon A4)'], ['A5', 'A5 (2 par feuille)'], ['A4', 'A4']].map(([v, l]) => '<option value="' + v + '"' + (t.format === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div>';
  h += '<div><label>Minutes</label><select onchange="tplSet(\'minutesMax\',+this.value)"' + dis + '><option value="5"' + (t.minutesMax !== 9 ? ' selected' : '') + '>0 à 5</option><option value="9"' + (t.minutesMax === 9 ? ' selected' : '') + '>0 à 9</option></select></div>';
  h += '<div><label>Temps de passage</label><select onchange="tplSet(\'cumulative\',this.value===\'1\')"' + dis + '><option value="1"' + (t.cumulative !== false ? ' selected' : '') + '>cumulés (chrono qui tourne)</option><option value="0"' + (t.cumulative === false ? ' selected' : '') + '>par fraction</option></select></div></div>';
  h += '<p class="muted">Une ligne de temps nommée « Estimation » sert au calcul de l’écart estimation/réalisation. Le dernier temps d’un bloc est son temps final.</p>';
  t.blocks.forEach((b, bi) => {
    h += '<div class="block"><div class="flex"><input class="grow" value="' + escapeHtml(b.title) + '" placeholder="Titre du bloc (ex. Course 1)" onchange="blockSet(' + bi + ',this.value)"' + dis + '>';
    if (!lock) h += '<button class="mini" onclick="moveBlock(' + bi + ',-1)">↑</button><button class="mini" onclick="moveBlock(' + bi + ',1)">↓</button><button class="mini" onclick="delBlock(' + bi + ')">✕</button>';
    h += '</div>';
    b.rows.forEach((r, ri) => {
      h += '<div class="trow"><input value="' + escapeHtml(r.label) + '" placeholder="Libellé" onchange="rowSet(' + bi + ',' + ri + ',\'label\',this.value)"' + dis + '>';
      h += '<select onchange="rowSet(' + bi + ',' + ri + ',\'type\',this.value)"' + dis + '>' + Object.entries(TYPE_LABEL).map(([v, l]) => '<option value="' + v + '"' + (r.type === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>';
      h += r.type === 'choice' ? '<input value="' + escapeHtml((r.options || []).join(' ')) + '" placeholder="Choix : A B C D" onchange="rowSet(' + bi + ',' + ri + ',\'options\',this.value)"' + dis + '>' : '<span class="muted">' + (r.type === 'time' ? 'min : s' : '0 à 99') + '</span>';
      h += lock ? '<span></span>' : '<span><button class="mini" onclick="moveRow(' + bi + ',' + ri + ',-1)">↑</button><button class="mini" onclick="moveRow(' + bi + ',' + ri + ',1)">↓</button><button class="mini" onclick="delRow(' + bi + ',' + ri + ')">✕</button></span>';
      h += '</div>';
    });
    if (!lock) h += '<div class="flex" style="margin-top:6px"><button class="mini" onclick="addRow(' + bi + ',\'time\')">+ Temps</button><button class="mini" onclick="addRow(' + bi + ',\'number\')">+ Nombre</button><button class="mini" onclick="addRow(' + bi + ',\'choice\')">+ Choix</button></div>';
    h += '</div>';
  });
  if (!lock) h += '<button onclick="addBlock()">+ Ajouter un bloc</button>';
  $('tplForm').innerHTML = h;
  const lay = Fiche.layoutFor(t);
  $('tplPreview').innerHTML = Fiche.ficheSVG({ tpl: t, name: 'NOM Prénom', className: 'Classe', payload: Fiche.studentPayload('apercu', t.id), layout: lay });
  $('tplInfo').textContent = lay.ok ? 'Format ' + lay.fmt + (lay.fmt === 'A5' ? ' · 2 fiches par feuille A4' : ' · 1 fiche par feuille A4') + ' · ' + lay.rows.length + ' lignes' : '⚠ ' + lay.error;
}
async function tplMut(fn) { const t = curTpl(); if (!t || t.locked) return; fn(t); await persist(); render(); }
const tplSet = (k, v) => tplMut(t => { t[k] = k === 'name' ? (v.trim() || 'Sans nom') : v; });
const blockSet = (bi, v) => tplMut(t => { t.blocks[bi].title = v.trim(); });
const rowSet = (bi, ri, k, v) => tplMut(t => {
  const r = t.blocks[bi].rows[ri];
  if (k === 'options') r.options = v.split(/[\s,;]+/).map(x => x.trim().slice(0, 3)).filter(Boolean).slice(0, 12);
  else if (k === 'type') { r.type = v; if (v === 'choice' && !(r.options || []).length) r.options = ['A', 'B', 'C', 'D']; }
  else r.label = v.trim();
});
const addRow = (bi, type) => tplMut(t => t.blocks[bi].rows.push({ id: sid('r'), label: type === 'time' ? (t.blocks[bi].rows.length ? 'Temps' : 'Estimation') : type === 'number' ? 'Nombre' : 'Niveau', type, options: type === 'choice' ? ['A', 'B', 'C', 'D'] : undefined }));
const delRow = (bi, ri) => tplMut(t => t.blocks[bi].rows.splice(ri, 1));
const moveRow = (bi, ri, d) => tplMut(t => { const r = t.blocks[bi].rows, j = ri + d; if (j < 0 || j >= r.length) return; [r[ri], r[j]] = [r[j], r[ri]]; });
const addBlock = () => tplMut(t => t.blocks.push({ title: 'Bloc ' + (t.blocks.length + 1), rows: [{ id: sid('r'), label: 'Estimation', type: 'time' }, { id: sid('r'), label: 'Temps final', type: 'time' }] }));
const delBlock = bi => { if (confirm('Supprimer ce bloc ?')) tplMut(t => t.blocks.splice(bi, 1)); };
const moveBlock = (bi, d) => tplMut(t => { const j = bi + d; if (j < 0 || j >= t.blocks.length) return; [t.blocks[bi], t.blocks[j]] = [t.blocks[j], t.blocks[bi]]; });
async function newTpl() { const t = { id: sid('t'), name: 'Nouvelle fiche', format: 'auto', minutesMax: 5, cumulative: true, blocks: [{ title: 'Course 1', rows: [{ id: sid('r'), label: 'Estimation', type: 'time' }, { id: sid('r'), label: 'Temps final', type: 'time' }] }] }; state.templates.push(t); editorTpl = t.id; await persist(); render(); }
async function dupTpl() { const s = curTpl(); if (!s) return; const t = JSON.parse(JSON.stringify(s)); t.id = sid('t'); t.name = s.name + ' (copie)'; t.locked = false; t.blocks.forEach(b => b.rows.forEach(r => { r.id = sid('r'); })); state.templates.push(t); editorTpl = t.id; await persist(); render(); }
async function delTpl() { const t = curTpl(); if (!t) return; if (tplUsed(t)) return alert('Des fiches lues utilisent ce modèle : suppression impossible.'); if (state.templates.length < 2) return alert('Garde au moins une fiche.'); if (!confirm('Supprimer la fiche « ' + t.name + ' » ?' + (t.locked ? ' Les fiches déjà imprimées ne pourront plus être lues.' : ''))) return; state.templates = state.templates.filter(x => x.id !== t.id); editorTpl = null; await persist(); render(); }
async function unlockTpl() { const t = curTpl(); if (!t) return; if (!confirm('Si tu modifies cette fiche, les exemplaires déjà imprimés ne seront plus lus correctement. Déverrouiller ?')) return; t.locked = false; await persist(); render(); }

/* ---------- Impression ---------- */
function openPrint(list, info) { $('printPages').innerHTML = Fiche.pagesSVG(list).join(''); $('printInfo').textContent = info; $('printView').classList.remove('hidden'); $('printView').scrollTop = 0; }
function closePrint() { $('printView').classList.add('hidden'); $('printPages').innerHTML = ''; }
function printTemplate() { const t = tplById($('printTpl').value); if (!t) { alert('Crée d’abord une fiche'); return null; } const lay = Fiche.layoutFor(t); if (!lay.ok) { alert('Fiche impossible à imprimer : ' + lay.error); return null; } return { t, lay }; }
async function markPrinted(t) { if (!t.locked) { t.locked = true; await persist(); } }
async function printClass() {
  const c = currentClass(); if (!c) return alert('Crée d’abord une classe');
  const p = printTemplate(); if (!p) return;
  const list = state.students.filter(s => s.classId === c).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  if (!list.length) return alert('Aucun élève dans cette classe');
  await markPrinted(p.t);
  const sheets = p.lay.fmt === 'A5' ? Math.ceil(list.length / 2) : list.length;
  openPrint(list.map(s => ({ tpl: p.t, name: s.name, className: className(c), payload: Fiche.studentPayload(s.id, p.t.id) })), list.length + ' fiches ' + p.lay.fmt + ' · ' + sheets + ' feuille(s) A4 · imprimer en taille réelle (100 %)');
}
async function printStudent(id) { const s = state.students.find(x => x.id === id), p = printTemplate(); if (!s || !p) return; await markPrinted(p.t); openPrint([{ tpl: p.t, name: s.name, className: className(s.classId), payload: Fiche.studentPayload(s.id, p.t.id) }], 'Fiche de ' + s.name + ' · ' + p.t.name); }
async function printSpare() {
  const c = currentClass(); if (!c) return alert('Crée d’abord une classe');
  const p = printTemplate(); if (!p) return;
  const n = Math.max(0, Math.min(40, parseInt(prompt('Combien de fiches de secours ?', '4'), 10) || 0)); if (!n) return;
  await markPrinted(p.t);
  openPrint(Array.from({ length: n }, () => ({ tpl: p.t, spare: true, className: className(c), payload: Fiche.sparePayload(c, p.t.id) })), n + ' fiche(s) de secours · ' + p.t.name);
}

/* ---------- Calculs ---------- */
function sec(s) { s = String(s || '').trim().replace(/[’′']/g, ':').replace(/[″"]/g, '').replace(/\s/g, '').replace(',', '.'); if (!s) return null; const m = s.match(/^(?:(\d+):)?(\d{1,2})(?:\.(\d{1,2}))?$/); if (!m) return null; return Number(m[1] || 0) * 60 + Number(m[2]) + Number('0.' + (m[3] || 0)); }
function fmt(v) { if (v == null || !Number.isFinite(v)) return '—'; const sign = v < 0 ? '-' : ''; v = Math.abs(v); return sign + Math.floor(v / 60) + ':' + String(Math.floor(v % 60)).padStart(2, '0') + (v % 1 ? '.' + String(Math.round(v % 1 * 100)).padStart(2, '0') : ''); }
const isEst = r => r.type === 'time' && /^\s*estim/i.test(r.label || '');
function metrics(tpl, values) {
  const blocks = tpl.blocks.map(b => {
    const est = b.rows.find(isEst), times = b.rows.filter(r => r.type === 'time' && r !== est), p = times.map(r => sec(values[r.id]));
    let final = null, segs = [];
    if (tpl.cumulative === false) { if (p.length && p.every(v => v != null)) { final = p.reduce((a, v) => a + v, 0); segs = p; } }
    else { final = p.length ? p[p.length - 1] : null; let last = 0; for (const v of p) { if (v == null || last == null) { segs = null; break; } segs.push(v - last); last = v; } }
    return { title: b.title, hasTime: times.length > 0, est: est ? sec(values[est.id]) : null, hasEst: !!est, p, final, segs };
  });
  const finals = blocks.filter(b => b.hasTime).map(b => b.final), ok = finals.filter(v => v != null);
  const best = ok.length ? Math.min(...ok) : null;
  const withEst = blocks.filter(b => b.hasEst);
  const gap = withEst.length && withEst.every(b => b.est != null && b.final != null) ? withEst.reduce((a, b) => a + Math.abs(b.est - b.final), 0) : null;
  const segLists = blocks.filter(b => b.hasTime).map(b => b.segs);
  let pace = null;
  if (segLists.length && segLists.every(s => s && s.length > 1 && s.length === segLists[0].length)) { const all = segLists.flat(); pace = Math.max(...all) - Math.min(...all); }
  const anomalies = [];
  if (tpl.cumulative !== false) blocks.forEach(b => { for (let j = 1; j < b.p.length; j++) if (b.p[j] != null && b.p[j - 1] != null && b.p[j] < b.p[j - 1]) anomalies.push((b.title || 'Bloc') + ' : passage plus petit que le précédent'); });
  return { blocks, best, gap, pace, anomalies };
}
const round1 = v => Math.round(v * 10) / 10;

/* ---------- Formulaire de vérification ---------- */
function scanTpl() { return tplById($('scanTpl').value) || state.templates[0]; }
function renderScanFields(values) {
  const t = scanTpl(); if (!t) return;
  $('scanFields').innerHTML = t.blocks.map(b => '<div><h3>' + escapeHtml(b.title || 'Bloc') + '</h3><div class="timing">' + b.rows.map(r => {
    const v = escapeHtml(values?.[r.id] ?? ''), lab = '<label>' + escapeHtml(r.label) + '</label>';
    if (r.type === 'choice') return '<div>' + lab + '<select data-row="' + r.id + '" onchange="calculate()"><option value=""></option>' + (r.options || []).map(o => '<option' + (String(values?.[r.id]) === String(o) ? ' selected' : '') + '>' + escapeHtml(o) + '</option>').join('') + '</select></div>';
    return '<div>' + lab + '<input data-row="' + r.id + '" value="' + v + '" placeholder="' + (r.type === 'time' ? '2:56' : '0') + '"' + (r.type === 'number' ? ' inputmode="numeric"' : '') + ' oninput="calculate()"></div>';
  }).join('') + '</div></div>').join('');
  calculate();
}
function formValues() { const v = {}; document.querySelectorAll('#scanFields [data-row]').forEach(el => { if (el.value.trim() !== '') v[el.dataset.row] = el.value.trim(); }); return v; }
function changeScanTpl() { const v = formValues(); renderScanFields(v); }
function calculate() {
  if (!$('scanFields') || !$('scanFields').children.length) { if ($('calculations')) $('calculations').textContent = ''; return; }
  const t = scanTpl(), m = metrics(t, formValues()), parts = [];
  if (m.blocks.some(b => b.hasTime)) parts.push('Meilleur temps : ' + fmt(m.best));
  if (m.blocks.some(b => b.hasEst)) parts.push('Écarts estimation : ' + (m.gap == null ? '—' : round1(m.gap) + ' s'));
  if (m.pace != null) parts.push('Écart entre fractions : ' + round1(m.pace) + ' s');
  $('calculations').textContent = (parts.join(' · ') || 'Aucun temps sur cette fiche') + (m.anomalies.length ? ' ⚠ ' + m.anomalies.join(' ; ') : '');
}
function showIssues(list) { const el = $('scanIssues'); el.classList.toggle('hidden', !list.length); el.textContent = list.length ? '⚠ ' + list.join(' · ') : ''; }
function newScan(tplId) {
  $('appleText').value = ''; $('appleMessage').textContent = 'Aucune donnée validée automatiquement.';
  queueEditing = null; editing = null; $('scanStudent').value = ''; photoData = null; $('photo').value = '';
  $('preview').classList.add('hidden'); $('preview').removeAttribute('src');
  if (tplId && tplById(tplId)) $('scanTpl').value = tplId;
  $('writtenName').value = ''; $('observer').value = ''; $('sessionDate').value = today();
  showIssues([]); renderScanFields({});
}
function setPhoto(src) { photoData = src || null; $('preview').classList.toggle('hidden', !photoData); if (photoData) $('preview').src = photoData; else $('preview').removeAttribute('src'); }
function loadPhoto(e) { const f = e.target.files[0]; if (!f) return; compressPhoto(f).then(setPhoto); }
function parseAppleText() {
  const raw = $('appleText').value.trim(), out = $('appleMessage'); if (!raw) { out.textContent = 'Colle le texte reconnu par ton iPad.'; return; }
  const norm = x => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const hits = state.students.filter(x => x.classId === $('scanClass').value).filter(x => { const s = norm(x.name).split(/\s+/)[0]; return s.length >= 4 && norm(raw).includes(s); });
  if (hits.length === 1) $('writtenName').value = hits[0].name;
  const matches = [...raw.matchAll(/\b(\d{1,2})\s*['’:\-]\s*([0-5]\d)\b/g)].map(x => x[1] + ':' + x[2]);
  out.textContent = (hits.length === 1 ? 'Nom possible : ' + hits[0].name + ' (à confirmer). ' : hits.length > 1 ? 'Plusieurs noms possibles. ' : 'Nom non identifié. ') + 'Temps possibles : ' + (matches.join(' · ') || 'aucun') + '. Reporte-les dans les champs.';
}
async function saveScan(validate) {
  const studentId = $('scanStudent').value; if (!studentId) return alert('Élève non identifié : sélectionne le bon élève avant d’enregistrer.');
  const t = scanTpl(), values = formValues(), m = metrics(t, values);
  if (validate && m.anomalies.length && !confirm('Anomalies détectées : ' + m.anomalies.join('; ') + '\nValider malgré tout ?')) return;
  const existing = state.scans.find(x => x.studentId === studentId && x.templateId === t.id && x.id !== editing);
  if (existing && !confirm('Une fiche « ' + t.name + ' » existe déjà pour cet élève. Enregistrer une nouvelle fiche quand même ?')) return;
  const prev = editing ? state.scans.find(x => x.id === editing) : null, queued = queueEditing ? state.queue.find(x => x.id === queueEditing) : null;
  const record = { id: editing || uid(), studentId, classId: $('scanClass').value, templateId: t.id, values, source: prev?.source || (queued?.read ? 'auto' : 'manual'), issues: validate ? [] : (prev?.issues || queued?.read?.issues || []), writtenName: $('writtenName').value, observer: $('observer').value, date: $('sessionDate').value, status: validate ? 'validated' : 'pending', photo: photoData, updated: new Date().toISOString() };
  if (editing) state.scans = state.scans.map(x => x.id === editing ? record : x); else state.scans.push(record);
  t.locked = true;
  if (queueEditing) state.queue = state.queue.filter(x => x.id !== queueEditing);
  try { await persist(); } catch (e) { return alert('Stockage insuffisant : exporte une sauvegarde puis libère de la place. ' + e.message); }
  alert(validate ? 'Fiche validée' : 'Fiche enregistrée à vérifier');
  $('resultTpl').value = t.id; newScan(t.id); view('results');
}
function editScan(id) {
  const r = state.scans.find(x => x.id === id); if (!r) return;
  view('scan'); $('scanClass').value = r.classId; render(); $('scanTpl').value = r.templateId; newScan(r.templateId);
  editing = id; $('scanStudent').value = r.studentId; setPhoto(r.photo);
  $('writtenName').value = r.writtenName || ''; $('observer').value = r.observer || ''; $('sessionDate').value = r.date || '';
  renderScanFields(r.values); showIssues(r.issues || []);
}

/* ---------- Scan par lot ---------- */
function compressPhoto(file) { return new Promise((resolve, reject) => { const img = new Image(), url = typeof file === 'string' ? file : URL.createObjectURL(file); img.onload = () => { const canvas = document.createElement('canvas'), scale = Math.min(1, 1400 / img.width, 1900 / img.height); canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale); canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height); if (typeof file !== 'string') URL.revokeObjectURL(url); resolve(canvas.toDataURL('image/jpeg', .7)); }; img.onerror = () => reject(Error('Photo illisible')); img.src = url; }); }
function readOpts() { return { templateFor: ref => tplById(ref.tpl || 't2x800'), fallback: tplById($('batchTpl').value) }; }
async function readSafe(src) { try { return await Fiche.read(src, readOpts()); } catch (err) { return { markers: false, ref: null, values: {}, tplId: null, issues: ['Lecture impossible : ' + err.message] }; } }
function addFromRead(read, photo, classId) {
  const st = read.ref?.kind === 'student' ? state.students.find(s => s.id === read.ref.id) : null;
  if (st && read.markers && read.tplId) {
    const issues = [...read.issues];
    if (st.classId !== classId) issues.unshift('Fiche d’une autre classe (' + className(st.classId) + ')');
    const old = state.scans.filter(x => x.studentId === st.id && x.templateId === read.tplId);
    const replace = old.find(x => x.source === 'auto' && x.status !== 'validated');
    if (!replace && old.length) issues.push('Une autre fiche existe déjà pour cet élève');
    const rec = { id: replace?.id || uid(), studentId: st.id, classId: st.classId, templateId: read.tplId, values: read.values, writtenName: '', observer: '', date: today(), status: 'pending', source: 'auto', issues, photo, updated: new Date().toISOString() };
    if (replace) state.scans = state.scans.map(x => x.id === replace.id ? rec : x); else state.scans.push(rec);
    const tu = tplById(read.tplId); if (tu) tu.locked = true;
    return true;
  }
  if (read.ref?.kind === 'spare' && state.classes.some(c => c.id === read.ref.classId)) classId = read.ref.classId;
  state.queue.push({ id: uid(), classId, photo, studentId: null, read, tplId: read.tplId });
  return false;
}
async function captureBatch(e) {
  const files = [...e.target.files], classId = $('batchClass').value; e.target.value = '';
  if (!classId) return alert('Crée une classe');
  let auto = 0, manual = 0; batchBusy = true;
  try {
    for (const [i, file] of files.entries()) {
      $('batchCount').textContent = 'Lecture de la fiche ' + (i + 1) + ' / ' + files.length + '…';
      const read = await readSafe(file), photo = await compressPhoto(file);
      if (addFromRead(read, photo, classId)) auto++; else manual++;
      await persist(); renderBatch();
    }
  } catch (err) { alert('Enregistrement impossible : ' + err.message); }
  batchBusy = false; render();
  $('batchCount').textContent = auto + ' fiche(s) lue(s) et rangée(s) dans les résultats · ' + manual + ' à traiter ci-dessous';
}
async function rereadBatch(id) { const q = state.queue.find(x => x.id === id); if (!q) return; const read = await readSafe(q.photo); state.queue = state.queue.filter(x => x.id !== id); const ok = addFromRead(read, q.photo, q.classId); await persist(); render(); $('batchCount').textContent = ok ? 'Fiche relue et rangée dans les résultats' : 'Fiche toujours à traiter : ' + read.issues.join(' · '); }
async function deleteBatch(id) { if (!confirm('Supprimer cette photo ?')) return; state.queue = state.queue.filter(x => x.id !== id); await persist(); renderBatch(); }
function renderBatch() {
  if (!$('batchClass')) return;
  const c = $('batchClass').value, items = state.queue.filter(x => x.classId === c);
  if (!batchBusy) $('batchCount').textContent = items.length ? items.length + ' fiche(s) à traiter ci-dessous' : 'Aucune fiche en attente. Les fiches lues sont dans l’onglet Résultats.';
  $('batchGallery').innerHTML = items.map(x => '<div class="rowcard"><img class="preview" style="width:100%;max-height:260px" src="' + x.photo + '"><p class="muted">' + escapeHtml(x.read?.issues?.length ? x.read.issues.join(' · ') : 'Lecture non effectuée') + '</p><button onclick="reviewBatch(\'' + x.id + '\')">Vérifier / associer</button> <button class="secondary" onclick="rereadBatch(\'' + x.id + '\')">Relire</button> <button class="secondary" onclick="deleteBatch(\'' + x.id + '\')">Supprimer</button></div>').join('');
}
function reviewBatch(id) {
  const q = state.queue.find(x => x.id === id); if (!q) return;
  view('scan'); $('scanClass').value = q.classId; render();
  const tid = q.tplId || q.read?.tplId || $('batchTpl').value; newScan(tid);
  queueEditing = id; setPhoto(q.photo);
  if (q.read?.ref?.kind === 'student' && state.students.some(s => s.id === q.read.ref.id && s.classId === q.classId)) $('scanStudent').value = q.read.ref.id;
  renderScanFields(q.read?.values || {}); showIssues(q.read?.issues || []);
}

/* ---------- Résultats ---------- */
function scanState(r) { if (!r) return null; if (r.status === 'validated') return 'validated'; const t = tplById(r.templateId); return r.source === 'auto' && !(r.issues || []).length && t && !metrics(t, r.values).anomalies.length ? 'auto' : 'check'; }
function latestScan(studentId, tplId) { return state.scans.filter(x => x.studentId === studentId && x.templateId === tplId).sort((a, b) => b.updated.localeCompare(a.updated))[0]; }
function resultColumns(t) {
  const cols = [];
  t.blocks.forEach(b => {
    if (b.rows.some(r => r.type === 'time' && !isEst(r))) cols.push({ head: b.title || 'Temps', get: (m, v, bi) => fmt(m.blocks[bi].final), bi: t.blocks.indexOf(b) });
    b.rows.filter(r => r.type !== 'time').forEach(r => cols.push({ head: (b.title ? b.title + ' · ' : '') + r.label, get: (m, v) => v[r.id] ?? '—' }));
  });
  const hasTime = t.blocks.some(b => b.rows.some(r => r.type === 'time'));
  if (hasTime && t.blocks.filter(b => b.rows.some(r => r.type === 'time' && !isEst(r))).length > 1) cols.push({ head: 'Meilleur', get: m => fmt(m.best) });
  if (t.blocks.some(b => b.rows.some(isEst))) cols.push({ head: 'Écart estimations', get: m => m.gap == null ? '—' : round1(m.gap) + ' s' });
  if (hasTime) cols.push({ head: 'Écart fractions', get: m => m.pace == null ? '—' : round1(m.pace) + ' s' });
  return cols;
}
function renderResults() {
  const c = $('resultClass').value, t = tplById($('resultTpl').value); if (!t) return;
  const students = state.students.filter(s => s.classId === c).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const cols = resultColumns(t); let validated = 0, pending = 0, autoOk = 0;
  $('resultHead').innerHTML = '<tr><th>Élève</th>' + cols.map(x => '<th>' + escapeHtml(x.head) + '</th>').join('') + '<th>État</th><th>Action</th></tr>';
  $('resultRows').innerHTML = students.map(s => {
    const all = state.scans.filter(x => x.studentId === s.id && x.templateId === t.id), r = latestScan(s.id, t.id), m = r ? metrics(t, r.values) : null, st = scanState(r);
    if (st === 'validated') validated++; else if (st === 'auto') autoOk++; else if (r) pending++;
    return '<tr><td>' + escapeHtml(s.name) + (all.length > 1 ? ' (' + all.length + ' fiches)' : '') + '</td>' + cols.map(x => '<td>' + (m ? escapeHtml(x.get(m, r.values, x.bi)) : '—') + '</td>').join('') + '<td><span class="pill ' + ({ validated: 'ok', auto: 'auto', check: 'warn' }[st] || '') + '">' + ({ validated: 'Validé', auto: 'Lu ✓ à valider', check: 'À vérifier ⚠' }[st] || 'Non scanné') + '</span></td><td>' + (r ? '<button class="secondary" onclick="editScan(\'' + r.id + '\')">Ouvrir</button>' : '—') + '</td></tr>';
  }).join('');
  $('progress').textContent = students.length + ' élèves · ' + validated + ' validés · ' + autoOk + ' lus sans alerte · ' + pending + ' à vérifier · ' + (students.length - validated - pending - autoOk) + ' non scannés';
  $('validateAutoBtn').disabled = !autoOk;
}
async function validateAuto() {
  const c = $('resultClass').value, tid = $('resultTpl').value;
  const list = state.students.filter(s => s.classId === c).map(s => latestScan(s.id, tid)).filter(r => scanState(r) === 'auto');
  if (!list.length) return;
  if (!confirm('Valider ' + list.length + ' fiche(s) lue(s) sans alerte ? Tu peux toujours les rouvrir ensuite.')) return;
  list.forEach(x => { x.status = 'validated'; }); await persist(); render();
}
function download(name, text, type) { const a = document.createElement('a'), url = URL.createObjectURL(new Blob([text], { type })); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
function exportCSV() {
  const c = $('resultClass').value, t = tplById($('resultTpl').value); if (!t) return;
  const rows = t.blocks.flatMap(b => b.rows.map(r => ({ r, head: (b.title ? b.title + ' · ' : '') + r.label })));
  const lines = [['Élève', 'Statut', ...rows.map(x => x.head), 'Meilleur', 'Écart estimations (s)', 'Écart fractions (s)']];
  for (const s of state.students.filter(s => s.classId === c).sort((a, b) => a.name.localeCompare(b.name, 'fr'))) {
    const r = latestScan(s.id, t.id), m = r ? metrics(t, r.values) : null;
    lines.push([s.name, r ? ({ validated: 'validé', auto: 'lu, à valider', check: 'à vérifier' }[scanState(r)]) : 'non scanné', ...rows.map(x => r?.values[x.r.id] ?? ''), m ? fmt(m.best).replace('—', '') : '', m?.gap == null ? '' : round1(m.gap), m?.pace == null ? '' : round1(m.pace)]);
  }
  const slug = t.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  download('resultats-' + slug + '-' + className(c).replace(/\s+/g, '') + '.csv', '﻿' + lines.map(row => row.map(x => '"' + String(x ?? '').replace(/"/g, '""') + '"').join(';')).join('\r\n'), 'text/csv;charset=utf-8');
}

/* ---------- Sauvegarde ---------- */
function backup() { download('sauvegarde-scan-eps-' + today() + '.json', JSON.stringify({ version: 2, ...state }), 'application/json'); }
async function restore(e) {
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!Array.isArray(d.classes) || !Array.isArray(d.students) || !Array.isArray(d.scans)) throw Error('Format invalide');
    if (!confirm('Remplacer les données locales actuelles par cette sauvegarde ?')) return;
    state = { classes: d.classes, students: d.students, scans: d.scans, queue: d.queue || [], templates: d.templates || [] };
    migrate(); await persist(); render(); alert('Sauvegarde restaurée');
  } catch (err) { alert('Restauration impossible : ' + err.message); }
  e.target.value = '';
}

/* ---------- Démarrage ---------- */
(async () => {
  try { await openDB(); state = await getState() || state; migrate(); await persist(); render(); newScan(); }
  catch (e) { alert('Impossible d’ouvrir le stockage local : ' + e.message); }
})();
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(e => console.warn('Mode hors ligne indisponible', e)));
