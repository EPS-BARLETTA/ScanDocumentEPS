'use strict';
/* ScanDocument EPS — application (classes, modèles de fiches, scan, résultats). */
const DB = 'scan-document-eps-v1';
let db, photoData = null, editing = null, queueEditing = null, editorTpl = null, editorOpen = false, batchBusy = false;
let state = { classes: [], students: [], scans: [], queue: [], templates: [] };
const $ = id => document.getElementById(id);
const uid = () => crypto.randomUUID();
const sid = p => p + Math.random().toString(36).slice(2, 8);
const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);

/* ---------- Bibliothèque de modèles ---------- */
const LIBRARY = [
  { id: 't2x800', name: 'Demi-fond 2 × 800 m', format: 'auto', minutesMax: 5, cumulative: true, bareme: 'ca1-2x800',
    blocks: [1, 2].map(i => ({ title: (i === 1 ? '1er' : '2e') + ' 800 m', rows: [['e', 'Estimation'], ['a', '200 m'], ['b', '400 m'], ['c', '600 m'], ['d', '800 m']].map(([k, l]) => ({ id: 'c' + i + k, label: l, type: 'time' })) })) },
  { id: 't3x500', name: 'Demi-fond 3 × 500 m', format: 'auto', minutesMax: 5, cumulative: true,
    blocks: [1, 2, 3].map(i => ({ title: 'Course ' + i, rows: [['e', 'Estimation'], ['a', '250 m'], ['b', '500 m']].map(([k, l]) => ({ id: 'c' + i + k, label: l, type: 'time' })) })) }
];
const LIB_DESC = { t2x800: '2 courses · estimation + passages 200, 400, 600 et 800 m (cumulés) · A5', t3x500: '3 courses · estimation + passages 250 et 500 m (cumulés) · A5' };
/* ---------- Barèmes ---------- */
const mmss = x => { const [m, s] = x.split(':').map(Number); return m * 60 + s; };
const BAREMES = {
  'ca1-2x800': {
    name: 'CA1 Demi-fond 2 × 800 m — CCF (Lycée Vauban, session 2027)',
    // AFL1 performance /6 : meilleur des deux 800 m
    perf: {
      F: ['5:06', '4:59', '4:52', '4:45', '4:38', '4:32', '4:26', '4:20', '4:14', '4:08', '4:02', '3:56', '3:50', '3:45', '3:40', '3:35', '3:30', '3:25', '3:20', '3:15', '3:10', '3:05', '3:00', '2:55'].map(mmss),
      G: ['4:02', '3:57', '3:52', '3:47', '3:42', '3:37', '3:32', '3:27', '3:22', '3:17', '3:12', '3:08', '3:04', '3:00', '2:56', '2:52', '2:48', '2:45', '2:42', '2:39', '2:36', '2:33', '2:30', '2:27'].map(mmss)
    },
    // AFL1 efficacité technique /6 : écart entre le 200 m le plus rapide et le plus lent (deux 800 m)
    regul: [[20, 0.5], [18, 1], [16, 1.5], [14, 2], [12, 2.5], [10, 3], [9, 3.5], [8, 4], [7, 4.5], [6, 5], [5, 5.5]],
    // AFL2 « estimer ses performances » : écarts cumulés annoncés / réalisés → degré
    afl2: [[8, 2], [15, 1.5], [25, 1]]
  }
};
const CHOIX = { '2-6': [2, 6], '4-4': [4, 4], '6-2': [6, 2] }; // points max AFL2 / AFL3 selon le choix de l'élève
function perfPts(table, t) { let p = 0; table.forEach((lim, i) => { if (t <= lim + 0.001) p = (i + 1) * 0.25; }); return p; }
function regulPts(B, e) { if (e < 4) return 6; for (let i = B.regul.length - 1; i >= 0; i--) if (e <= B.regul[i][0]) return B.regul[i][1]; return 0; }
function afl2Pts(B, g) { for (const [lim, p] of B.afl2) if (g <= lim) return p; return 0.5; }
function grade(t, s, m) {
  const B = BAREMES[t.bareme]; if (!B) return null;
  const n = (s.notes || {})[t.id] || {}, has = v => v !== undefined && v !== null && v !== '';
  const choix = CHOIX[n.choix] ? n.choix : null, [max2, max3] = choix ? CHOIX[choix] : [null, null];
  const perf = m && m.best != null && B.perf[s.sex] ? perfPts(B.perf[s.sex], m.best) : null;
  const reg = m && m.pace != null ? regulPts(B, m.pace) : null;
  const afl1 = perf != null && reg != null ? perf + reg : null;
  const dEst = m && m.gap != null ? Math.round(afl2Pts(B, m.gap) * 2) : null;                     // AFL2 · estimer (temps) : degré 1-4
  const d2 = has(n.d2) ? +n.d2 : dEst, d2auto = !has(n.d2) && dEst != null;                       // AFL2 : un seul degré, proposé d'après les écarts cumulés
  const d3 = has(n.d3) ? +n.d3 : has(n.afl3) ? Math.round(n.afl3 * 2) : null;                    // AFL3 · rôle : degré 1-4 (prof)
  const p2 = max2 && d2 != null ? d2 * max2 / 4 : null;
  const p3 = max3 && d3 != null ? d3 * max3 / 4 : null;
  const total = afl1 != null && p2 != null && p3 != null ? afl1 + p2 + p3 : null;
  const acquired = [afl1, p2, p3].reduce((a, v) => a + (v || 0), 0);
  const missing = [!s.sex && 'F/G', !m && 'fiche', !choix && 'choix', d2 == null && 'AFL2', d3 == null && 'AFL3'].filter(Boolean);
  return { perf, reg, afl1, dEst, d2, d2auto, d3, p2, p3, max2, max3, role: n.role || '', choix, total, acquired, missing, noSex: !B.perf[s.sex], best: m?.best, pace: m?.pace, gap: m?.gap };
}
const nf = v => v == null ? '—' : String(Math.round(v * 100) / 100).replace('.', ',');
async function setNote(sid, tid, k, v) {
  const s = state.students.find(x => x.id === sid); if (!s) return;
  if (k === 'sex') s.sex = s.sex === v ? undefined : (v || undefined);
  else { s.notes = s.notes || {}; s.notes[tid] = s.notes[tid] || {}; const cur = s.notes[tid][k]; s.notes[tid][k] = String(cur) === String(v) ? '' : v; if (k === 'd2tr') delete s.notes[tid].afl2tr; if (k === 'd3') delete s.notes[tid].afl3; }
  await persist(); renderResults();
}
const schoolYear = () => { const d = new Date(), y = d.getFullYear(); return d.getMonth() >= 7 ? y + '-' + (y + 1) : (y - 1) + '-' + y; };
const tplById = id => state.templates.find(t => t.id === id);
const className = id => state.classes.find(c => c.id === id)?.name || '';

/* ---------- Stockage ---------- */
function openDB() { return new Promise((resolve, reject) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore('state'); r.onsuccess = () => { db = r.result; resolve(); }; r.onerror = () => reject(r.error); }); }
function getState() { return new Promise((resolve, reject) => { const r = db.transaction('state').objectStore('state').get('data'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
function persist() { return new Promise((resolve, reject) => { const t = db.transaction('state', 'readwrite'); t.objectStore('state').put(state, 'data'); t.oncomplete = resolve; t.onerror = () => reject(t.error); }); }

function migrate() {
  state.queue = state.queue || [];
  state.templates = state.templates || [];
  // modèles de la bibliothèque (2 × 800, 3 × 500) toujours disponibles, sauf si supprimés volontairement
  state.removedLib = state.removedLib || [];
  for (const lib of LIBRARY) if (!tplById(lib.id) && (!state.removedLib.includes(lib.id) || state.scans.some(s => s.races || s.templateId === lib.id))) state.templates.push(Object.assign(JSON.parse(JSON.stringify(lib)), { createdAt: today() }));
  for (const c of state.classes) c.folder = c.folder || schoolYear();
  for (const t of state.templates) { t.printedFor = t.printedFor || []; t.createdAt = t.createdAt || today(); if (t.id === 't2x800' && !('bareme' in t)) t.bareme = 'ca1-2x800'; }
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
function view(id) { document.querySelectorAll('main section').forEach(s => s.classList.toggle('hidden', s.id !== id)); render(); window.scrollTo(0, 0); }
function currentClass() { return $('classSelect').value || state.classes[0]?.id; }
function fillSelect(id, items, keepFirst) {
  const el = $(id), old = el.value;
  el.innerHTML = items.map(([v, l]) => '<option value="' + escapeHtml(v) + '">' + escapeHtml(l) + '</option>').join('');
  if (items.some(([v]) => v === old)) el.value = old; else if (keepFirst && items.length) el.value = items[0][0];
}

function render() {
  const cls = state.classes.map(c => [c.id, c.name]), tpls = state.templates.map(t => [t.id, t.name]);
  ['classSelect', 'scanClass', 'batchClass'].forEach(id => fillSelect(id, cls, true));
  fillSelect('resultClass', [['*', '— Toutes les classes —'], ...cls], false); if (!$('resultClass').value) $('resultClass').value = cls[0]?.[0] || '*';
  ['batchTpl', 'resultTpl', 'scanTpl'].forEach(id => fillSelect(id, tpls, true));
  renderDirectory();
  $('roster').innerHTML = state.students.filter(s => s.classId === currentClass()).sort((a, b) => a.name.localeCompare(b.name, 'fr')).map(s => '<div class="rowcard flex"><span class="grow">' + escapeHtml(s.name) + '</span><select onchange="setNote(\'' + s.id + '\',null,\'sex\',this.value);render()"><option value="">Fille / Garçon ?</option><option value="F"' + (s.sex === 'F' ? ' selected' : '') + '>Fille</option><option value="G"' + (s.sex === 'G' ? ' selected' : '') + '>Garçon</option></select><button class="secondary" onclick="openEval({studentId:\'' + s.id + '\'})">🖨 Réimprimer sa fiche</button><button class="secondary" onclick="removeStudent(\'' + s.id + '\')">Retirer</button></div>').join('');
  const previous = $('scanStudent').value;
  $('scanStudent').innerHTML = '<option value="">— Élève non identifié —</option>' + state.students.filter(s => s.classId === $('scanClass').value).sort((a, b) => a.name.localeCompare(b.name, 'fr')).map(s => '<option value="' + s.id + '">' + escapeHtml(s.name) + '</option>').join('');
  $('scanStudent').value = state.students.some(s => s.id === previous && s.classId === $('scanClass').value) ? previous : '';
  renderResults(); renderBatch(); renderLibrary(); renderEditor(); calculate();
}

/* ---------- Répertoire des classes ---------- */
const folders = () => [...new Set(state.classes.map(c => c.folder || schoolYear()))].sort((a, b) => b.localeCompare(a, 'fr'));
function classWork(cid) {
  const studs = state.students.filter(s => s.classId === cid);
  return state.templates.map(t => {
    const latest = studs.map(s => latestScan(s.id, t.id)).filter(Boolean);
    const printed = (t.printedFor || []).some(p => p.classId === cid);
    if (!latest.length && !printed) return null;
    return { t, total: studs.length, read: latest.length, valid: latest.filter(r => r.status === 'validated').length };
  }).filter(Boolean);
}
function renderDirectory() {
  $('folderList').innerHTML = folders().map(f => '<option value="' + escapeHtml(f) + '">').join('');
  if (!$('classFolder').value) $('classFolder').value = folders()[0] || schoolYear();
  const sel = currentClass();
  $('classDetail').classList.toggle('hidden', !state.classes.length);
  $('directory').innerHTML = folders().map(f => {
    const cls = state.classes.filter(c => (c.folder || schoolYear()) === f).sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }));
    return '<div class="folder"><div class="flex"><h3 class="grow">📁 ' + escapeHtml(f) + ' <span class="muted">· ' + cls.length + ' classe(s)</span></h3><button class="mini" onclick="renameFolder(\'' + escapeHtml(f).replace(/'/g, "\\'") + '\')">Renommer</button></div><div class="cards" style="margin-top:8px">' + cls.map(c => {
      const n = state.students.filter(s => s.classId === c.id).length, work = classWork(c.id);
      return '<div class="cls' + (c.id === sel ? ' sel' : '') + '"><div class="flex"><b class="grow">' + escapeHtml(c.name) + '</b><span class="pill">' + n + ' élèves</span></div>' +
        '<div class="muted" style="margin:6px 0">' + (work.length ? work.map(w => escapeHtml(w.t.name) + ' : ' + w.valid + ' validées · ' + w.read + ' lues / ' + w.total).join('<br>') : 'Aucune fiche pour le moment') + '</div>' +
        '<button class="mini" onclick="openClass(\'' + c.id + '\')">Ouvrir</button></div>';
    }).join('') + '</div></div>';
  }).join('') || '<p class="muted">Aucune classe pour le moment : crée-en une ou importe un CSV PRONOTE.</p>';
}
function openClass(id) { $('classSelect').value = id; render(); $('classDetail').scrollIntoView({ behavior: 'smooth' }); }
async function moveClass(id) { const c = state.classes.find(x => x.id === id); const f = prompt('Dossier de la classe ' + c.name + ' :', c.folder); if (f && f.trim()) { c.folder = f.trim(); await persist(); render(); } }
async function renameClass(id) { const c = state.classes.find(x => x.id === id); const n = prompt('Nouveau nom :', c.name); if (n && n.trim()) { c.name = n.trim(); await persist(); render(); } }
async function renameFolder(f) { const n = prompt('Nouveau nom du dossier :', f); if (!n || !n.trim()) return; state.classes.forEach(c => { if (c.folder === f) c.folder = n.trim(); }); await persist(); render(); }
async function deleteClass(id) {
  const c = state.classes.find(x => x.id === id);
  if (!c) return;
  const nsc = state.scans.filter(x => x.classId === id).length, nst = state.students.filter(s => s.classId === id).length;
  if (!confirm('Supprimer la classe ' + c.name + ' ?\n\n' + nst + ' élève(s)' + (nsc ? ', ' + nsc + ' fiche(s) lue(s) et leurs notes' : '') + ' seront effacés de cet appareil.' + (nsc ? '\nPense à exporter l’archive avant si tu veux garder une trace.' : ''))) return;
  if (nsc && !confirm('Confirmer la suppression définitive de ' + c.name + ' ?')) return;
  const ids = new Set(state.students.filter(s => s.classId === id).map(s => s.id));
  state.scans = state.scans.filter(x => x.classId !== id && !ids.has(x.studentId));
  state.classes = state.classes.filter(x => x.id !== id); state.students = state.students.filter(s => s.classId !== id); state.queue = state.queue.filter(q => q.classId !== id);
  state.templates.forEach(t => { t.printedFor = (t.printedFor || []).filter(p => p.classId !== id); });
  await persist(); render();
}

/* ---------- Bibliothèque ---------- */
function thumb(t) { const lay = Fiche.layoutFor(t); return '<div class="thumb">' + Fiche.ficheSVG({ tpl: t, name: 'NOM Prénom', className: 'Classe', payload: Fiche.studentPayload('apercu', t.id || 'x'), layout: lay }) + '</div>'; }
function renderLibrary() {
  if (!$('libraryCards')) return;
  $('libraryCards').innerHTML = LIBRARY.map((t, i) => '<div class="card">' + thumb(t) + '<h4>' + escapeHtml(t.name) + '</h4><div class="muted">' + escapeHtml(LIB_DESC[t.id] || '') + '</div><div class="acts"><button onclick="useModel(' + i + ')">Utiliser ce modèle</button></div></div>').join('');
  $('myCards').innerHTML = state.templates.map(t => {
    const lay = Fiche.layoutFor(t), sc = state.scans.filter(x => x.templateId === t.id);
    const pc = [...new Set((t.printedFor || []).map(p => className(p.classId)).filter(Boolean))];
    const sclasses = [...new Set(sc.map(x => className(x.classId)).filter(Boolean))];
    const info = [(lay.ok ? lay.fmt : '⚠') + ' · ' + t.blocks.reduce((a, b) => a + b.rows.length, 0) + ' lignes', 'Créée le ' + new Date(t.createdAt || today()).toLocaleDateString('fr-FR'), pc.length ? 'Imprimée pour : ' + pc.join(', ') : 'Jamais imprimée', sc.length ? sc.length + ' fiche(s) lue(s), ' + sc.filter(x => x.status === 'validated').length + ' validée(s)' + (sclasses.length ? ' · ' + sclasses.join(', ') : '') : 'Aucune fiche lue'];
    return '<div class="card">' + thumb(t) + '<h4>' + escapeHtml(t.name) + (t.locked ? ' 🔒' : '') + '</h4><div class="muted">' + info.map(escapeHtml).join('<br>') + '</div><div class="acts"><button onclick="openEval({tplId:\'' + t.id + '\'})">🖨 Imprimer</button><button class="secondary" onclick="editTpl(\'' + t.id + '\')">Ouvrir</button></div></div>';
  }).join('') || '<p class="muted">Aucune fiche : choisis un modèle ci-dessus ou crée une fiche vierge.</p>';
}
async function useModel(i) {
  const t = JSON.parse(JSON.stringify(LIBRARY[i])); t.id = sid('t'); t.createdAt = today(); t.printedFor = []; t.locked = false;
  const same = state.templates.filter(x => x.name === t.name || x.name.startsWith(t.name + ' (')).length; if (same) t.name += ' (' + (same + 1) + ')';
  state.templates.push(t); await persist(); editTpl(t.id);
}
function editTpl(id) { editorTpl = id; editorOpen = true; render(); $('tplEditor').scrollIntoView({ behavior: 'smooth' }); }
function closeEditor() { editorOpen = false; render(); }


/* ---------- Classes et élèves ---------- */
function addClass() { const name = $('className').value.trim(); if (!name) return alert('Indique un nom de classe'); const c = { id: uid(), name, folder: $('classFolder').value.trim() || schoolYear() }; state.classes.push(c); $('className').value = ''; persist(); render(); $('classSelect').value = c.id; render(); }
function addStudent() { const c = currentClass(), name = $('studentName').value.trim(); if (!c || !name) return alert('Choisis une classe et un nom'); if (state.students.some(s => s.classId === c && s.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return alert('Cet élève existe déjà'); state.students.push({ id: uid(), classId: c, name }); $('studentName').value = ''; persist(); render(); }
async function importRoster(e) {
  const f = e.target.files[0]; let c = currentClass(); if (!f) return;
  const text = await f.text(), lines = text.replace(/^﻿/, '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  function parse(line, sep) { const out = []; let value = '', quoted = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (ch === '"') { if (quoted && line[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; } else if (ch === sep && !quoted) { out.push(value.trim()); value = ''; } else value += ch; } out.push(value.trim()); return out; }
  const header = lines[0] || '', sep = header.includes(';') ? ';' : header.includes('\t') ? '\t' : ',';
  const headings = parse(header, sep).map(x => x.toLocaleLowerCase('fr').normalize('NFD').replace(/[̀-ͯ]/g, ''));
  const nameCol = headings.findIndex(x => ['eleves', 'eleve', 'nom prenom', 'nom et prenom'].includes(x)), surnameCol = headings.findIndex(x => x === 'nom'), firstnameCol = headings.findIndex(x => x === 'prenom');
  const classCol = headings.findIndex(x => x === 'classe' || x === 'classes' || x === 'division');
  const sexOfCell = v => { v = String(v || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); return /^(F|FILLE|FEMININ|FEMME)$/.test(v) ? 'F' : /^(M|G|GARCON|MASCULIN|H|HOMME)$/.test(v) ? 'G' : undefined; };
  let sexCol = headings.findIndex(x => /^(sexe|genre|sex|fille\/garcon|f\/g)$/.test(x));
  if (sexCol < 0) { // pas d'en-tête reconnu : colonne dont presque toutes les valeurs sont F/M/G/Fille/Garçon
    const data = lines.slice(1, 60).map(l => parse(l, sep));
    const ncol = Math.max(0, ...data.map(r => r.length));
    for (let k = 0; k < ncol && sexCol < 0; k++) { const vals = data.map(r => r[k]).filter(Boolean); if (vals.length >= 2 && vals.filter(v => sexOfCell(v)).length / vals.length > 0.9) sexCol = k; }
  }
  const hasHeader = nameCol >= 0 || surnameCol >= 0; let n = 0; const created = [];
  if (classCol < 0 && !c) { e.target.value = ''; return alert('Crée d’abord une classe, ou importe un fichier avec une colonne « Classe »'); }
  const folder = $('classFolder').value.trim() || schoolYear();
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    const cells = parse(line, sep);
    if (classCol >= 0) {
      const cn = (cells[classCol] || '').trim(); if (!cn) continue;
      let cl = state.classes.find(x => x.name.toLocaleLowerCase('fr') === cn.toLocaleLowerCase('fr') && x.folder === folder);
      if (!cl) { cl = { id: uid(), name: cn, folder }; state.classes.push(cl); created.push(cn); }
      c = cl.id;
    }
    let name = nameCol >= 0 ? cells[nameCol] : surnameCol >= 0 ? (cells[surnameCol] || '') + ' ' + (firstnameCol >= 0 ? cells[firstnameCol] || '' : '') : cells.length > 1 ? cells[0] + ' ' + cells[1] : cells[0];
    name = (name || '').trim();
    const sx = sexCol >= 0 ? sexOfCell(cells[sexCol]) : undefined;
    const ex = state.students.find(s => s.classId === c && s.name.toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr'));
    if (name && !ex) { state.students.push({ id: uid(), classId: c, name, sex: sx }); n++; } else if (ex && sx && !ex.sex) ex.sex = sx;
  }
  const nsex = sexCol >= 0 ? state.students.filter(s => s.sex).length : 0;
  await persist(); e.target.value = ''; render(); alert(n + ' élèves importés' + (sexCol >= 0 ? ' · fille/garçon renseigné' : ' · colonne Sexe non trouvée : fille/garçon à indiquer') + (created.length ? '\n' + created.length + ' classe(s) créée(s) dans « ' + folder + ' » : ' + created.join(', ') : ''));
}
function removeStudent(id) { if (state.scans.some(x => x.studentId === id)) return alert('Élève lié à une fiche : suppression bloquée'); if (confirm('Supprimer cet élève ?')) { state.students = state.students.filter(x => x.id !== id); persist(); render(); } }

/* ---------- Éditeur de fiches ---------- */
const TYPE_LABEL = { time: 'Temps', number: 'Nombre', choice: 'Choix' };
function curTpl() { if (!tplById(editorTpl)) editorTpl = state.templates[0]?.id; return tplById(editorTpl); }
function tplUsed(t) { return state.scans.some(s => s.templateId === t.id); }
function renderEditor() {
  if (!$('tplForm')) return;
  $('tplEditor').classList.toggle('hidden', !editorOpen || !state.templates.length);
  if (!editorOpen) return;
  fillSelect('tplSelect', state.templates.map(t => [t.id, t.name]), true);
  const t = curTpl(); if (!t) { $('tplForm').innerHTML = ''; $('tplPreview').innerHTML = ''; return; }
  $('tplSelect').value = t.id;
  const lock = !!t.locked, dis = lock ? ' disabled' : '';
  $('tplLock').classList.toggle('hidden', !lock);
  $('tplLock').innerHTML = lock ? 'Cette fiche a déjà été imprimée ou utilisée : elle est verrouillée pour que les fiches papier restent lisibles. <b>Duplique-la</b> pour en faire une variante. <button class="mini" onclick="unlockTpl()">Déverrouiller quand même</button>' : '';
  let h = '<label>Nom de la fiche</label><input style="width:100%" value="' + escapeHtml(t.name) + '" onchange="tplSet(\'name\',this.value)"' + dis + '>';
  h += '<div class="flex"><div><label>Format</label><select onchange="tplSet(\'format\',this.value)"' + dis + '>' + [['auto', 'Automatique (A5 sinon A4)'], ['A5', 'A5 (2 par feuille)'], ['A4', 'A4']].map(([v, l]) => '<option value="' + v + '"' + (t.format === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div>';
  h += '<div><label>Minutes</label><select onchange="tplSet(\'minutesMax\',+this.value)"' + dis + '><option value="5"' + (t.minutesMax !== 9 ? ' selected' : '') + '>0 à 5</option><option value="9"' + (t.minutesMax === 9 ? ' selected' : '') + '>0 à 9</option></select></div>';
  h += '<div><label>QR code</label><select onchange="tplSet(\'qrColor\',this.value)"' + dis + '><option value="#000"' + (t.qrColor !== '#1a4f9c' ? ' selected' : '') + '>Noir</option><option value="#1a4f9c"' + (t.qrColor === '#1a4f9c' ? ' selected' : '') + '>Bleu</option></select></div>';
  h += '<div><label>Temps de passage</label><select onchange="tplSet(\'cumulative\',this.value===\'1\')"' + dis + '><option value="1"' + (t.cumulative !== false ? ' selected' : '') + '>cumulés (chrono qui tourne)</option><option value="0"' + (t.cumulative === false ? ' selected' : '') + '>par fraction</option></select></div></div>';
  h += '<label>Barème (note)</label><select onchange="tplBareme(this.value)"><option value="">Aucun</option>' + Object.entries(BAREMES).map(([k, b]) => '<option value="' + k + '"' + (t.bareme === k ? ' selected' : '') + '>' + escapeHtml(b.name) + '</option>').join('') + '</select>';
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
async function tplBareme(v) { const t = curTpl(); if (!t) return; t.bareme = v || undefined; await persist(); render(); }
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
async function newTpl() { const t = { id: sid('t'), name: 'Nouvelle fiche', createdAt: today(), printedFor: [], format: 'auto', minutesMax: 5, cumulative: true, blocks: [{ title: 'Course 1', rows: [{ id: sid('r'), label: 'Estimation', type: 'time' }, { id: sid('r'), label: 'Temps final', type: 'time' }] }] }; state.templates.push(t); await persist(); editTpl(t.id); }
async function dupTpl() { const s = curTpl(); if (!s) return; const t = JSON.parse(JSON.stringify(s)); t.id = sid('t'); t.name = s.name + ' (copie)'; t.locked = false; t.printedFor = []; t.createdAt = today(); t.blocks.forEach(b => b.rows.forEach(r => { r.id = sid('r'); })); state.templates.push(t); await persist(); editTpl(t.id); }
async function delTpl() { const t = curTpl(); if (!t) return; if (tplUsed(t)) return alert('Des fiches lues utilisent ce modèle : suppression impossible.'); if (!confirm('Supprimer la fiche « ' + t.name + ' » ?' + (t.locked ? ' Les fiches déjà imprimées ne pourront plus être lues.' : ''))) return; state.templates = state.templates.filter(x => x.id !== t.id); if (LIBRARY.some(l => l.id === t.id)) state.removedLib.push(t.id); editorTpl = null; editorOpen = false; await persist(); render(); }
async function unlockTpl() { const t = curTpl(); if (!t) return; if (!confirm('Si tu modifies cette fiche, les exemplaires déjà imprimés ne seront plus lus correctement. Déverrouiller ?')) return; t.locked = false; await persist(); render(); }

/* ---------- Évaluation : impression et dossier ---------- */
let evCtx = {};
function openPrintPages(pages, info) { $('printPages').innerHTML = pages.join(''); $('printInfo').textContent = info; $('printView').classList.remove('hidden'); $('printView').scrollTop = 0; }
function closePrint() { $('printView').classList.add('hidden'); $('printPages').innerHTML = ''; }
function openEval(ctx) {
  evCtx = ctx || {};
  view('prep');
  $('evDone').classList.add('hidden');
  fillSelect('evTpl', state.templates.map(t => [t.id, t.name]), true);
  if (evCtx.tplId) $('evTpl').value = evCtx.tplId;
  const st = evCtx.studentId ? state.students.find(x => x.id === evCtx.studentId) : null;
  $('evNoClass').classList.toggle('hidden', !!state.classes.length);
  $('evClassBox').classList.toggle('hidden', !!st); $('evStudentBox').classList.toggle('hidden', !st); $('evZipBtn').classList.toggle('hidden', !!st);
  if (st) $('evStudentBox').textContent = 'Fiche de ' + st.name + ' (' + className(st.classId) + ')';
  const pre = evCtx.classId;
  $('evClasses').innerHTML = folders().map(f => '<h4>📁 ' + escapeHtml(f) + '</h4>' + state.classes.filter(c => c.folder === f).sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true })).map(c => '<label><input type="checkbox" value="' + c.id + '"' + (c.id === pre ? ' checked' : '') + ' onchange="evInfo()"> ' + escapeHtml(c.name) + ' <span class="muted">(' + state.students.filter(s => s.classId === c.id).length + ' élèves)</span></label>').join('')).join('') || '<p class="muted">Aucune classe.</p>';
  evInfo();
}
function closeEval() {}
function evTiles() {
  $('evTplCards').innerHTML = state.templates.map(t => { const lay = Fiche.layoutFor(t); return '<button class="' + (t.id === $('evTpl').value ? 'on' : '') + '" onclick="$(\'evTpl\').value=\'' + t.id + '\';evInfo()"><b>' + escapeHtml(t.name) + '</b><span class="muted">' + (lay.ok ? lay.fmt + ' · ' + t.blocks.length + ' bloc(s)' : '⚠ incomplète') + '</span></button>'; }).join('');
}
function evSelection() {
  const t = tplById($('evTpl').value), lay = t ? Fiche.layoutFor(t) : null;
  if (evCtx.studentId) { const s = state.students.find(x => x.id === evCtx.studentId); return { t, lay, groups: [{ c: s.classId, list: [{ tpl: t, name: s.name, className: className(s.classId), payload: Fiche.studentPayload(s.id, t.id) }] }] }; }
  const spare = Math.max(0, Math.min(10, parseInt($('evSpare').value, 10) || 0));
  const cids = [...document.querySelectorAll('#evClasses input:checked')].map(x => x.value);
  const groups = cids.map(c => ({ c, list: state.students.filter(s => s.classId === c).sort((a, b) => a.name.localeCompare(b.name, 'fr')).map(s => ({ tpl: t, name: s.name, className: className(c), payload: Fiche.studentPayload(s.id, t.id) })).concat(Array.from({ length: spare }, () => ({ tpl: t, spare: true, className: className(c), payload: Fiche.sparePayload(c, t.id) }))) }));
  return { t, lay, groups };
}
function evInfo() {
  evTiles(); $('evDone').classList.add('hidden');
  const { lay, groups } = evSelection();
  if (!lay || !lay.ok) { $('evInfo').textContent = '⚠ ' + (lay ? lay.error : 'Choisis une fiche'); return; }
  if (!groups.length) { $('evInfo').textContent = 'Coche au moins une classe.'; return; }
  const n = groups.reduce((a, g) => a + g.list.length, 0), sheets = groups.reduce((a, g) => a + (lay.fmt === 'A5' ? Math.ceil(g.list.length / 2) : g.list.length), 0);
  $('evInfo').textContent = n + ' fiche(s) ' + lay.fmt + ' · ' + sheets + ' feuille(s) A4' + (lay.fmt === 'A5' ? ' (2 fiches par feuille, à couper)' : '');
}
async function evMark(t, groups) { t.locked = true; t.printedFor = t.printedFor || []; for (const g of groups) if (!t.printedFor.some(p => p.classId === g.c)) t.printedFor.push({ classId: g.c, date: today() }); await persist(); render(); }
async function evPrint() {
  const { t, lay, groups } = evSelection(); if (!lay?.ok) return alert('Fiche impossible à imprimer : ' + (lay?.error || ''));
  if (!groups.length || !groups.some(g => g.list.length)) return alert('Coche au moins une classe');
  await evMark(t, groups); closeEval();
  const pages = groups.flatMap(g => Fiche.pagesSVG(g.list));
  openPrintPages(pages, t.name + ' · ' + groups.map(g => className(g.c)).join(', ') + ' · ' + pages.length + ' feuille(s) A4 · imprimer en taille réelle (100 %)');
}
const slug = x => String(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'fiche';
function printableHTML(title, pages) {
  return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escapeHtml(title) + '</title><style>@page{size:A4 portrait;margin:0}body{margin:0;background:#5b6b7c;font-family:system-ui,sans-serif}.note{background:#123d66;color:#fff;padding:10px 14px}svg{display:block;width:min(96vw,210mm);height:auto;margin:12px auto;background:#fff}@media print{body{background:none}.note{display:none}svg{width:210mm;height:297mm;margin:0;break-after:page;page-break-after:always}}</style></head><body><div class="note">' + escapeHtml(title) + ' — imprimer en taille réelle (100 %), recto seul.</div>' + pages.join('') + '</body></html>';
}
async function evDownload() {
  const { t, lay, groups } = evSelection(); if (!lay?.ok) return alert('Fiche impossible à imprimer : ' + (lay?.error || ''));
  if (!groups.length) return alert('Coche au moins une classe');
  await evMark(t, groups);
  const dir = slug(t.name) + '_' + today() + '/', enc = new TextEncoder(), files = [];
  for (const g of groups) files.push({ name: dir + slug(className(g.c)) + '.html', data: enc.encode(printableHTML(t.name + ' — ' + className(g.c), Fiche.pagesSVG(g.list))) });
  files.push({ name: dir + 'LISEZ-MOI.txt', data: enc.encode(t.name + '\r\nPréparé le ' + new Date().toLocaleDateString('fr-FR') + '\r\n\r\nUn fichier par classe. Ouvrir, puis imprimer en taille réelle (100 %), recto seul.\r\n' + (lay.fmt === 'A5' ? 'Deux fiches A5 par feuille A4 : couper le long des pointillés.\r\n' : '') + 'Après l\'épreuve : photographier les fiches entières dans ScanDocument EPS (étape 3).\r\n\r\nClasses : ' + groups.map(g => className(g.c) + ' (' + g.list.length + ' fiches)').join(', ') + '\r\n') });
  download(slug(t.name) + '_' + today() + '.zip', makeZip(files), 'application/zip');
  $('evDone').textContent = '✓ Dossier téléchargé : un fichier par classe. Ouvre-le et imprime en taille réelle (100 %).'; $('evDone').classList.remove('hidden');
}
/* ZIP sans compression (méthode « stockée ») */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(d) { let c = 0xFFFFFFFF; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function makeZip(files) {
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  const d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF, dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, dt, true); h.setUint16(12, dd, true);
    h.setUint32(14, crc, true); h.setUint32(18, f.data.length, true); h.setUint32(22, f.data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), name, f.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, dt, true); c.setUint16(14, dd, true);
    c.setUint32(16, crc, true); c.setUint32(20, f.data.length, true); c.setUint32(24, f.data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + f.data.length;
  }
  const size = central.reduce((a, x) => a + x.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/zip' });
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
  if (m.pace != null) parts.push('Écart entre 200 m : ' + round1(m.pace) + ' s');
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
  let studentId = $('scanStudent').value; if (!studentId) return alert('Choisis l’élève dans la liste « Élève » avant d’enregistrer.');
  if (studentId.startsWith('__new:')) { const st = { id: uid(), classId: $('scanClass').value, name: studentId.slice(6) }; state.students.push(st); studentId = st.id; }
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
async function deleteScan() {
  if (queueEditing) { if (!confirm('Supprimer cette photo ?')) return; state.queue = state.queue.filter(x => x.id !== queueEditing); await persist(); newScan(); view('batch'); return; }
  if (!editing) return alert('Cette fiche n’est pas encore enregistrée.');
  if (!confirm('Supprimer définitivement cette fiche (valeurs et photo) ?')) return;
  state.scans = state.scans.filter(x => x.id !== editing); await persist(); newScan(); view('results');
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
function readOpts() { return { templateFor: ref => tplById(ref.tpl || 't2x800') || LIBRARY.find(l => l.id === (ref.tpl || 't2x800')), fallback: tplById($('batchTpl').value) }; }
async function readSafe(src) { try { return await Fiche.read(src, readOpts()); } catch (err) { return { markers: false, ref: null, values: {}, tplId: null, issues: ['Lecture impossible : ' + err.message] }; } }
function addFromRead(read, photo, classId) {
  const norm = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  let st = read.ref?.kind === 'student' ? state.students.find(s => s.id === read.ref.id) : null;
  if (read.ref?.kind === 'name') { const m = state.students.filter(s => norm(s.name) === norm(read.ref.name) || norm(s.name).split(' ')[0] === norm(read.ref.name)); if (m.length === 1) st = m[0]; else read.issues.unshift('Fiche au nom de ' + read.ref.name + ' : ' + (m.length ? 'plusieurs élèves possibles' : 'élève absent de tes classes') + ', choisis l’élève'); }
  if (read.tplId && !tplById(read.tplId)) { const lib = LIBRARY.find(l => l.id === read.tplId); if (lib) state.templates.push(Object.assign(JSON.parse(JSON.stringify(lib)), { createdAt: today(), printedFor: [], locked: true })); }
  if (st && read.markers && read.tplId && read.tplId === (read.ref.tpl || 't2x800')) {
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
  if (read.ref?.kind === 'student' && !st) read.issues.unshift('Élève introuvable dans tes classes : choisis l’élève');
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
  $('batchCount').textContent = [auto ? '✓ ' + auto + ' fiche(s) lue(s) et rangée(s) dans les Résultats' : '', manual ? manual + ' fiche(s) à vérifier ci-dessous' : ''].filter(Boolean).join(' · ') + '.';
}
function valuesSummary(tid, values) { const t = tplById(tid) || LIBRARY.find(l => l.id === tid); if (!t) return Object.values(values).join(' · '); return t.blocks.map(b => (b.title ? b.title + ' : ' : '') + b.rows.map(r => values[r.id] ?? '—').join(' / ')).join(' · '); }
async function rereadBatch(id) { const q = state.queue.find(x => x.id === id); if (!q) return; const read = await readSafe(q.photo); state.queue = state.queue.filter(x => x.id !== id); const ok = addFromRead(read, q.photo, q.classId); await persist(); render(); $('batchCount').textContent = ok ? 'Fiche relue et rangée dans les résultats' : 'Fiche toujours à traiter : ' + read.issues.join(' · '); }
async function deleteBatch(id) { if (!confirm('Supprimer cette photo ?')) return; state.queue = state.queue.filter(x => x.id !== id); await persist(); renderBatch(); }
function renderBatch() {
  if (!$('batchClass')) return;
  const c = $('batchClass').value, items = state.queue.filter(x => x.classId === c);
  if (!batchBusy) $('batchCount').textContent = items.length ? items.length + ' fiche(s) à vérifier ci-dessous.' : 'Les fiches reconnues vont directement dans les Résultats.';
  $('batchGallery').innerHTML = items.map(x => '<div class="rowcard"><img class="preview" style="width:100%;max-height:260px" src="' + x.photo + '"><p class="muted">' + escapeHtml(x.read?.issues?.length ? x.read.issues.join(' · ') : 'Lecture non effectuée') + '</p>' + (x.read && Object.keys(x.read.values || {}).length ? '<p><b>Valeurs lues :</b> ' + escapeHtml(valuesSummary(x.read.tplId, x.read.values)) + '</p>' : '') + '<button onclick="reviewBatch(\'' + x.id + '\')">Vérifier / associer</button> <button class="secondary" onclick="rereadBatch(\'' + x.id + '\')">Relire</button> <button class="secondary" onclick="deleteBatch(\'' + x.id + '\')">Supprimer</button></div>').join('');
}
function reviewBatch(id) {
  const q = state.queue.find(x => x.id === id); if (!q) return;
  view('scan'); $('scanClass').value = q.classId; render();
  const tid = q.tplId || q.read?.tplId || $('batchTpl').value; newScan(tid);
  queueEditing = id; setPhoto(q.photo);
  if (q.read?.ref?.kind === 'student' && state.students.some(s => s.id === q.read.ref.id && s.classId === q.classId)) $('scanStudent').value = q.read.ref.id;
  if (q.read?.ref?.kind === 'name') {
    const nm = q.read.ref.name, hit = state.students.find(s => s.classId === q.classId && s.name.toLowerCase().startsWith(nm.toLowerCase()));
    if (hit) $('scanStudent').value = hit.id;
    else { const o = document.createElement('option'); o.value = '__new:' + nm; o.textContent = '➕ Ajouter « ' + nm + ' » à cette classe'; $('scanStudent').appendChild(o); $('scanStudent').value = o.value; }
  }
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
  if (hasTime) cols.push({ head: 'Écart 200 m (régularité)', get: m => m.pace == null ? '—' : round1(m.pace) + ' s' });
  return cols;
}
function classesUsing(t) { return state.classes.filter(c => state.scans.some(x => x.classId === c.id && x.templateId === t.id) || (t.printedFor || []).some(p => p.classId === c.id)).sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true })).map(c => c.id); }
function resultStudents(c, t) { const cids = c === '*' ? classesUsing(t) : [c]; return cids.flatMap(cid => state.students.filter(s => s.classId === cid).sort((a, b) => a.name.localeCompare(b.name, 'fr'))); }
function renderResults() {
  const c = $('resultClass').value, t = tplById($('resultTpl').value);
  if (!t) { $('resultHead').innerHTML = ''; $('resultRows').innerHTML = ''; $('progress').textContent = 'Ajoute d’abord une fiche depuis la Bibliothèque.'; return; }
  const students = resultStudents(c, t);
  const cols = resultColumns(t); let validated = 0, pending = 0, autoOk = 0;
  const B = BAREMES[t.bareme];
  $('santorinBtn').classList.toggle('hidden', !B);
  $('resultsTable').classList.toggle('gt', !!B);
  if (B) $('resultHead').innerHTML = gradeHead(true);
  else $('resultHead').innerHTML = '<tr><th>Élève</th>' + cols.map(x => '<th>' + escapeHtml(x.head) + '</th>').join('') + '<th>État</th><th>Action</th></tr>';
  $('resultRows').innerHTML = students.map(s => {
    const all = state.scans.filter(x => x.studentId === s.id && x.templateId === t.id), r = latestScan(s.id, t.id), m = r ? metrics(t, r.values) : null, st = scanState(r);
    if (st === 'validated') validated++; else if (st === 'auto') autoOk++; else if (r) pending++;
    if (B) return gradeRow(t, s, r, m, st, true, c === '*');
    return '<tr><td>' + (c === '*' ? '<span class="muted">' + escapeHtml(className(s.classId)) + '</span> ' : '') + escapeHtml(s.name) + (all.length > 1 ? ' (' + all.length + ' fiches)' : '') + '</td>' + cols.map(x => '<td>' + (m ? escapeHtml(x.get(m, r.values, x.bi)) : '—') + '</td>').join('') + '<td><span class="pill ' + ({ validated: 'ok', auto: 'auto', check: 'warn' }[st] || '') + '">' + ({ validated: 'Validé', auto: 'Lu ✓ à valider', check: 'À vérifier ⚠' }[st] || 'Non scanné') + '</span></td><td>' + (r ? '<button class="secondary" onclick="editScan(\'' + r.id + '\')">Ouvrir</button>' : '—') + '</td></tr>';
  }).join('');
  $('progress').textContent = students.length + ' élèves · ' + validated + ' validés · ' + autoOk + ' lus sans alerte · ' + pending + ' à vérifier · ' + (students.length - validated - pending - autoOk) + ' non scannés';
  $('validateAutoBtn').disabled = !autoOk;
}
const GRADE_CSS = '.gt{border-collapse:collapse;width:100%;min-width:980px}.gt th,.gt td{border:1px solid #d5e0ea;padding:6px 7px;text-align:center;vertical-align:middle;font-size:14px}.gt td.nm{text-align:left;min-width:150px}.gt th{background:#edf3fa}.gt .a1{background:#e6f3fc}.gt .a2{background:#edf6e4}.gt .a3{background:#fff8d6}.gt th.a1{background:#8cc8ef}.gt th.a2{background:#a9cf86}.gt th.a3{background:#f3dd5e}.gt th.a1s{background:#cfe8f9}.gt th.a2s{background:#d6eac4}.gt th.a3s{background:#faeea6}.gt .sub{font-size:11px;color:#5a6f85;display:block;margin-top:2px}.gt .big{font-size:18px;font-weight:800}.gt .of{font-size:12px;color:#5a6f85}.gt .note{font-size:22px;font-weight:900;color:#123d66}.seg{display:inline-flex;border:1px solid #9fb6cf;border-radius:9px;overflow:hidden;background:#fff}.seg button{background:#fff;color:#18314c;border:0;border-left:1px solid #d5e0ea;padding:5px 7px;border-radius:0;font-size:13px;line-height:1.15;min-height:0;min-width:34px}.seg button:first-child{border-left:0}.seg button{white-space:nowrap}.seg button.on{background:#123d66;color:#fff}.seg button small{display:block;font-size:10px;opacity:.75}.deg{display:inline-block;background:#123d66;color:#fff;border-radius:6px;padding:2px 6px;font-weight:700}.miss{font-size:11px;color:#b83246;display:block}';
(() => { const st = document.createElement('style'); st.textContent = GRADE_CSS; document.head.appendChild(st); })();
const ROLE = { P: 'Partenaire', S: 'Starter / chrono' };
function gradeHead(screen) {
  return '<tr><th rowspan="2">Élève</th><th rowspan="2">F/G</th><th rowspan="2">Choix<br>AFL2-AFL3</th><th colspan="3" class="a1">AFL1 · Produire une performance /12</th><th colspan="3" class="a2">AFL2 · S’entraîner</th><th colspan="3" class="a3">AFL3 · Assumer un rôle</th><th rowspan="2">Note<br>/20</th></tr>' +
    '<tr><th class="a1s">Performance /6<span class="sub">meilleur 800 m</span></th><th class="a1s">Régularité /6<span class="sub">écart des 200 m</span></th><th class="a1s">AFL1</th>' +
    '<th class="a2s">Écarts cumulés<span class="sub">estimation / réalisé</span></th><th class="a2s">Degré<span class="sub">proposé d’après les temps</span></th><th class="a2s">AFL2</th>' +
    '<th class="a3s">Rôle</th><th class="a3s">Degré<span class="sub">1 à 4</span></th><th class="a3s">AFL3</th></tr>';
}
function gradeRow(t, s, r, m, st, screen, showClass) {
  const g = grade(t, s, m), seg = (k, opts, cur) => '<span class="seg">' + opts.map(([v, l]) => '<button class="' + (String(cur ?? '') === String(v) ? 'on' : '') + '" onclick="setNote(\'' + s.id + '\',\'' + t.id + '\',\'' + k + '\',\'' + v + '\')">' + l + '</button>').join('') + '</span>';
  const degBtns = (k, cur, max) => seg(k, [1, 2, 3, 4].map(d => [d, (max ? nf(d * max / 4) : 'D' + d) + (max ? '<small>D' + d + '</small>' : '')]), cur);
  const degTxt = (d, max) => d == null ? '—' : '<span class="deg">D' + d + '</span>' + (max ? ' ' + nf(d * max / 4) : '');
  const lab = { validated: 'Validé', auto: 'Lu, à valider', check: 'À vérifier' }, pill = { validated: 'ok', auto: 'auto', check: 'warn' };
  const finals = m ? m.blocks.filter(b => b.hasTime).map(b => fmt(b.final)).join(' · ') : '';
  const name = '<td class="nm"><b>' + escapeHtml(s.name) + '</b>' + (showClass ? ' <span class="of">' + escapeHtml(className(s.classId)) + '</span>' : '') + '<span class="sub">' + (finals ? '800 m : ' + finals : 'non scanné') + '</span>' +
    (screen ? '<span class="sub"><span class="pill ' + (pill[st] || '') + '">' + (lab[st] || 'Non scanné') + '</span>' + (r ? ' <button class="mini" onclick="editScan(\'' + r.id + '\')">Ouvrir</button>' : '') + '</span>' : '') + '</td>';
  const tot = (v, max) => '<span class="big">' + nf(v) + '</span>' + (max ? '<span class="of"> /' + max + '</span>' : '');
  return '<tr>' + name +
    '<td>' + (screen ? seg('sex', [['F', 'F'], ['G', 'G']], s.sex) : (s.sex || '?')) + '</td>' +
    '<td>' + (screen ? seg('choix', Object.keys(CHOIX).map(k => [k, k]), g.choix) : (g.choix || '—')) + '</td>' +
    '<td class="a1">' + (g.noSex && m ? '<span class="miss">F/G ?</span>' : '<b>' + nf(g.perf) + '</b>') + '<span class="sub">' + (g.best != null ? fmt(g.best) : '') + '</span></td>' +
    '<td class="a1"><b>' + nf(g.reg) + '</b><span class="sub">' + (g.pace != null ? round1(g.pace) + ' s' : '') + '</span></td>' +
    '<td class="a1">' + tot(g.afl1, 12) + '</td>' +
    '<td class="a2"><b>' + (g.gap != null ? round1(g.gap) + ' s' : '—') + '</b>' + (g.dEst != null ? '<span class="sub">→ degré ' + g.dEst + '</span>' : '') + '</td>' +
    '<td class="a2">' + (screen ? degBtns('d2', g.d2, g.max2) : degTxt(g.d2, g.max2)) + (g.d2auto ? '<span class="sub">proposé (temps)</span>' : '') + '</td>' +
    '<td class="a2">' + tot(g.p2, g.max2) + '</td>' +
    '<td class="a3">' + (screen ? seg('role', [['P', 'Partenaire'], ['S', 'Chrono']], g.role) : (ROLE[g.role] || '—')) + '</td>' +
    '<td class="a3">' + (screen ? degBtns('d3', g.d3, g.max3) : degTxt(g.d3, g.max3)) + '</td>' +
    '<td class="a3">' + tot(g.p3, g.max3) + '</td>' +
    '<td>' + (g.total != null ? '<span class="note">' + nf(g.total) + '</span>' : '<span class="of">' + nf(g.acquired) + ' acquis</span><span class="miss">manque : ' + g.missing.join(', ') + '</span>') + '</td></tr>';
}
function splitName(full) { const tk = String(full).trim().split(/\s+/); let i = 0; while (i < tk.length - 1 && /\p{Lu}/u.test(tk[i]) && tk[i] === tk[i].toLocaleUpperCase('fr')) i++; if (i === 0) i = 1; return [tk.slice(0, i).join(' '), tk.slice(i).join(' ')]; }
async function validateAuto() {
  const c = $('resultClass').value, tid = $('resultTpl').value;
  const list = resultStudents(c, tplById(tid)).map(s => latestScan(s.id, tid)).filter(r => scanState(r) === 'auto');
  if (!list.length) return;
  if (!confirm('Valider ' + list.length + ' fiche(s) lue(s) sans alerte ? Tu peux toujours les rouvrir ensuite.')) return;
  list.forEach(x => { x.status = 'validated'; }); await persist(); render();
}
function download(name, text, type) { const a = document.createElement('a'), url = URL.createObjectURL(new Blob([text], { type })); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
function exportCSV() {
  const c = $('resultClass').value, t = tplById($('resultTpl').value); if (!t) return;
  const rows = t.blocks.flatMap(b => b.rows.map(r => ({ r, head: (b.title ? b.title + ' · ' : '') + r.label })));
  const B = BAREMES[t.bareme];
  const lines = [['Élève', 'Statut', ...rows.map(x => x.head), 'Meilleur', 'Écart estimations (s)', 'Écart 200 m (s)', ...(B ? ['Sexe', 'AFL1 Performance /6', 'AFL1 Régularité /6', 'AFL1 /12', 'Choix AFL2-AFL3', 'Écarts cumulés (s)', 'AFL2 degré', 'AFL2 points', 'AFL3 Rôle', 'AFL3 (degré)', 'AFL3 points', 'Note /20'] : [])]];
  lines[0].unshift('Classe');
  for (const s of resultStudents(c, t)) {
    const r = latestScan(s.id, t.id), m = r ? metrics(t, r.values) : null;
    lines.push([className(s.classId), s.name, r ? ({ validated: 'validé', auto: 'lu, à valider', check: 'à vérifier' }[scanState(r)]) : 'non scanné', ...rows.map(x => r?.values[x.r.id] ?? ''), m ? fmt(m.best).replace('—', '') : '', m?.gap == null ? '' : round1(m.gap), m?.pace == null ? '' : round1(m.pace), ...(B ? (g => [s.sex || '', g.perf ?? '', g.reg ?? '', g.afl1 ?? '', g.choix || '', g.gap != null ? round1(g.gap) : '', g.d2 ?? '', g.p2 ?? '', ROLE[g.role] || '', g.d3 ?? '', g.p3 ?? '', g.total ?? ''])(grade(t, s, m)) : [])]);
  }
  const slug = t.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  download('resultats-' + slug + '-' + (c === '*' ? 'toutes-classes' : className(c).replace(/\s+/g, '')) + '.csv', '﻿' + lines.map(row => row.map(x => '"' + String(x ?? '').replace(/"/g, '""') + '"').join(';')).join('\r\n'), 'text/csv;charset=utf-8');
}

function resultsHTML(t, cid) {
  const students = state.students.filter(s => s.classId === cid).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const cols = resultColumns(t), rows = t.blocks.flatMap(b => b.rows.map(r => ({ r, head: (b.title ? b.title + ' · ' : '') + r.label })));
  const lab = { validated: 'Validé', auto: 'Lu, à valider', check: 'À vérifier' };
  let v = 0, rd = 0;
  const B = BAREMES[t.bareme];
  const main = students.map(s => {
    const r = latestScan(s.id, t.id), m = r ? metrics(t, r.values) : null, st = scanState(r), g = B ? grade(t, s, m) : null;
    if (r) rd++; if (st === 'validated') v++;
    if (B) return gradeRow(t, s, r, m, st, false, false);
    const gc = '';
    return '<tr><td>' + escapeHtml(s.name) + '</td>' + cols.map(x => '<td>' + (m ? escapeHtml(x.get(m, r.values, x.bi)) : '—') + '</td>').join('') + gc + '<td class="st ' + (st || 'none') + '">' + (lab[st] || 'Non scanné') + '</td></tr>';
  }).join('');

  const detail = students.map(s => { const r = latestScan(s.id, t.id), m = r ? metrics(t, r.values) : null, st = scanState(r); return '<tr><td>' + escapeHtml(s.name) + '</td>' + rows.map(x => '<td>' + escapeHtml(r?.values[x.r.id] ?? '') + '</td>').join('') + '<td>' + (m ? fmt(m.best) : '') + '</td><td>' + (m?.gap != null ? round1(m.gap) + ' s' : '') + '</td><td>' + (m?.pace != null ? round1(m.pace) + ' s' : '') + '</td><td class="st ' + (st || 'none') + '">' + (lab[st] || 'Non scanné') + '</td></tr>'; }).join('');
  return '<section><h2>' + escapeHtml(className(cid)) + '</h2><p class="sub">' + students.length + ' élèves · ' + rd + ' fiches lues · ' + v + ' validées</p>' +
    '<table' + (B ? ' class="gt"' : '') + '><thead>' + (B ? gradeHead(false) : '<tr><th>Élève</th>' + cols.map(x => '<th>' + escapeHtml(x.head) + '</th>').join('') + '<th>État</th></tr>') + '</thead><tbody>' + main + '</tbody></table>' + (B ? '<h3>Temps relevés</h3>' : '<details><summary>Détail de toutes les valeurs</summary>') + '<table class="small"><thead><tr><th>Élève</th>' + rows.map(x => '<th>' + escapeHtml(x.head) + '</th>').join('') + '<th>Meilleur</th><th>Écarts estimation</th><th>Écart des 200 m</th><th>État</th></tr></thead><tbody>' + detail + '</tbody></table>' + (B ? '' : '</details>') + '</section>';
}
function exportHTML() {
  const t = tplById($('resultTpl').value); if (!t) return;
  const all = $('resultClass').value === '*', cids = all ? classesUsing(t) : [$('resultClass').value];
  if (!cids.length) return alert('Aucune classe n’a encore utilisé cette fiche.');
  const date = new Date().toLocaleDateString('fr-FR');
  const B = BAREMES[t.bareme];
  const css = GRADE_CSS + '.gt .seg,.gt button{display:none}body{font-family:system-ui,-apple-system,sans-serif;color:#18314c;margin:24px}h1{margin:0 0 4px;color:#123d66}h2{margin:26px 0 2px;color:#123d66}.sub{color:#5a6f85;margin:0 0 10px}table{border-collapse:collapse;width:100%;margin:6px 0 10px}th,td{border:1px solid #d5e0ea;padding:6px 8px;text-align:left;font-size:14px}th{background:#edf3fa}.small td,.small th{font-size:12px}tr:nth-child(even) td{background:#fafcfe}.st.validated{color:#16683d;font-weight:600}.st.check{color:#855500;font-weight:600}.st.auto{color:#124f8a}.st.none{color:#999}summary{cursor:pointer;color:#1267a5;margin:4px 0}@media print{details{display:none}section{break-inside:avoid-page}section+section{break-before:page}}';
  const doc = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escapeHtml(t.name) + ' — archive</title><style>' + css + '</style></head><body><h1>' + escapeHtml(t.name) + '</h1><p class="sub">Archive complète · exportée le ' + date + ' · ScanDocument EPS' + (B ? ' · ' + escapeHtml(B.name) : '') + '</p>' + cids.map(c => resultsHTML(t, c)).join('') + (B ? baremeLegend(B) : '') + '</body></html>';
  download('archive-' + slug(t.name) + '-' + (all ? 'toutes-classes' : slug(className(cids[0]))) + '.html', doc, 'text/html;charset=utf-8');
}

function baremeLegend(B) {
  const row = (lab, cells, cls) => '<tr><th class="' + cls + '">' + lab + '</th>' + cells.map(c => '<td>' + c + '</td>').join('') + '</tr>';
  return '<section><h2>Rappel du barème</h2><table class="gt" style="min-width:0;width:auto"><thead><tr><th>Points max</th><th>Degré 1</th><th>Degré 2</th><th>Degré 3</th><th>Degré 4</th></tr></thead><tbody>' +
    [[2, 'a1s'], [4, 'a2s'], [6, 'a3s']].map(([n, c]) => row('/' + n, [1, 2, 3, 4].map(d => nf(d * n / 4)), c)).join('') + '</tbody></table>' +
    '<p class="sub">Choix de l’élève : 2-6 (AFL2 /2, AFL3 /6) · 4-4 (AFL2 /4, AFL3 /4) · 6-2 (AFL2 /6, AFL3 /2). AFL1 /12 = performance /6 (meilleur des deux 800 m, table fille/garçon) + régularité /6 (écart entre le 200 m le plus rapide et le plus lent des deux 800 m). AFL2 et AFL3 : un seul degré (1 à 4) par AFL, converti en points selon le choix de l’élève. Le degré AFL2 est proposé d’après les écarts cumulés entre temps annoncés et réalisés (≤ 8 s D4, 9-15 s D3, 16-25 s D2, > 25 s D1) et peut être ajusté par l’enseignant.</p></section>';
}
function exportSantorin() {
  const t = tplById($('resultTpl').value); if (!t || !BAREMES[t.bareme]) return;
  const all = $('resultClass').value === '*', cids = all ? classesUsing(t) : [$('resultClass').value];
  if (!cids.length) return alert('Aucune classe n’a encore utilisé cette fiche.');
  const css = 'body{font-family:system-ui,-apple-system,sans-serif;color:#18314c;margin:24px}h1{margin:0;color:#123d66}h2{color:#123d66;margin:28px 0 8px}p{color:#5a6f85}table{border-collapse:collapse;min-width:640px}th,td{border:1px solid #c9d6e3;padding:9px 12px;font-size:17px;text-align:center}td.l{text-align:left}th{background:#edf3fa}.a1{background:#e6f3fc}.a2{background:#edf6e4}.a3{background:#fff8d6}th.a1{background:#8cc8ef}th.a2{background:#a9cf86}th.a3{background:#f3dd5e}.n{font-weight:900;font-size:19px}.vide{background:#fde8eb!important}@media print{section+section{break-before:page}}';
  const sec = cid => {
    const studs = state.students.filter(s => s.classId === cid).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    const rows = studs.map(s => { const r = latestScan(s.id, t.id), m = r ? metrics(t, r.values) : null, g = grade(t, s, m), [nom, pre] = splitName(s.name), c = (v, cls) => '<td class="' + cls + (v == null ? ' vide' : '') + '">' + (v == null ? '' : nf(v)) + '</td>';
      return '<tr><td class="l"><b>' + escapeHtml(nom) + '</b></td><td class="l">' + escapeHtml(pre) + '</td><td' + (g.choix ? '' : ' class="vide"') + '>' + (g.choix || '') + '</td>' + c(g.afl1, 'a1') + c(g.p2, 'a2') + c(g.p3, 'a3') + c(g.total, 'n') + '</tr>'; }).join('');
    return '<section><h2>' + escapeHtml(className(cid)) + '</h2><table><thead><tr><th>Nom</th><th>Prénom</th><th>Choix AFL</th><th class="a1">AFL1 /12</th><th class="a2">AFL2</th><th class="a3">AFL3</th><th>Note /20</th></tr></thead><tbody>' + rows + '</tbody></table></section>';
  };
  const doc = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Santorin — ' + escapeHtml(t.name) + '</title><style>' + css + '</style></head><body><h1>Saisie Santorin · ' + escapeHtml(t.name) + '</h1><p>Exporté le ' + new Date().toLocaleDateString('fr-FR') + ' · cases rouges = à compléter avant la saisie.</p>' + cids.map(sec).join('') + '</body></html>';
  download('santorin-' + slug(t.name) + '-' + (all ? 'toutes-classes' : slug(className(cids[0]))) + '.html', doc, 'text/html;charset=utf-8');
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
