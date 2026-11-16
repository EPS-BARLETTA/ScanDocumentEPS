'use strict';
/* ScanDocument EPS — scan en continu, estimations annoncées, contrôle PhotoFinish, bilan détaillé. */

/* ---------- Outils ---------- */
function parseQuickTime(v) { // « 320 » → 3:20 · « 3:20 » · « 3.20 » · « 3'20 »
  v = String(v || '').trim().replace(/[’′'.,h ]/g, ':').replace(/:+/g, ':');
  if (!v) return '';
  if (/^\d{3,4}$/.test(v)) v = v.slice(0, -2) + ':' + v.slice(-2);
  if (/^\d{1,2}$/.test(v)) v = '0:' + v.padStart(2, '0');
  const m = v.match(/^(\d{1,2}):(\d{1,2})$/); if (!m || +m[2] > 59) return null;
  return +m[1] + ':' + m[2].padStart(2, '0');
}
const timedBlocks = t => t.blocks.map((b, bi) => ({ b, bi })).filter(x => x.b.rows.some(r => r.type === 'time' && !isEst(r)));
const estBlocks = t => t.blocks.map((b, bi) => ({ b, bi, er: b.rows.find(isEst) })).filter(x => x.er);
const fmtPF = v => v == null ? '—' : Math.floor(v / 60) + ':' + (v % 60).toFixed(2).padStart(5, '0');
const sgn = v => (v > 0 ? '+' : v < 0 ? '−' : '') + String(Math.abs(Math.round(v * 10) / 10)).replace('.', ',');
(() => { const st = document.createElement('style'); st.textContent = `
#rafale{position:fixed;inset:0;z-index:9999;background:#000;display:flex;flex-direction:column;color:#fff;font-family:inherit}
#rafale .rtop{display:flex;align-items:center;gap:12px;padding:12px 16px;background:rgba(0,0,0,.6)}
#rafale .rtop b{font-size:20px}#rafale .rcount{font-size:26px;font-weight:900;margin-left:auto}
#rafale .rvid{flex:1;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center}
#rafale video{max-width:100%;max-height:100%;border:6px solid transparent;border-radius:12px;transition:border-color .2s}
#rafale video.seen{border-color:#facc15}#rafale video.ok{border-color:#22c55e}
#rafale .flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;transition:opacity .25s}
#rafale .hint{position:absolute;top:14px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.65);padding:10px 18px;border-radius:999px;font-size:18px;font-weight:700;white-space:nowrap}
#rafale .rbot{display:flex;align-items:center;gap:16px;padding:14px 18px;background:rgba(0,0,0,.6)}
#rafale .shutter{width:84px;height:84px;border-radius:50%;border:6px solid #fff;background:#ef4444;flex:none;box-shadow:0 0 0 4px rgba(255,255,255,.25)}
#rafale .rlog{flex:1;display:flex;flex-direction:column;gap:4px;font-size:16px;min-width:0}
#rafale .rlog span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#rafale .rbtn{background:#fff;color:#111;border:0;border-radius:14px;padding:14px 18px;font-size:18px;font-weight:800;min-height:56px}
#rafale .rauto{background:#22c55e;color:#fff}#rafale .rauto.off{background:#555}
.ctrlbox{margin:14px 0}.ctrl-alert{background:#fee2e2;border:3px solid #ef4444;border-radius:18px;padding:14px 16px;margin:10px 0;color:#7f1d1d}
.ctrl-alert h3{margin:0 0 6px;font-size:20px;color:#b91c1c}.ctrl-alert li{margin:4px 0;font-size:16px}.ctrl-ok{background:#dcfce7;border:2px solid #22c55e;border-radius:16px;padding:12px 16px;color:#14532d;font-weight:700}
.pfbox{background:#f6f3ff;border-radius:18px;padding:14px 16px;margin:12px 0}.pfbox table{width:100%;border-collapse:collapse}.pfbox td,.pfbox th{padding:6px 8px;border-bottom:1px solid #e5e0f5;text-align:left;font-size:14px}
#annBox{position:fixed;inset:0;z-index:9000;background:rgba(20,15,50,.55);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:20px}
#annBox .card{background:#fff;border-radius:22px;max-width:760px;width:100%;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,.3)}
#annBox .row{display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid #eee}#annBox .row span{flex:1;font-size:18px}
#annBox input{width:120px;font-size:24px;font-weight:800;text-align:center;padding:10px;border-radius:12px;border:2px solid #d8d2f0}
#annBox input.bad{border-color:#ef4444;background:#fef2f2}#annBox input.done{border-color:#22c55e;background:#f0fdf4}
`; document.head.appendChild(st); })();

/* ---------- 1. Scan en continu ---------- */
let raf = null;
async function rafaleOpen() {
  const classId = $('batchClass').value; if (!classId) return alert('Choisis d’abord la classe.');
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false }); }
  catch (e) { return alert('Caméra inaccessible. Autorise la caméra pour ce site (Réglages › Safari › Caméra), ou utilise « Prendre une photo ».'); }
  const ov = document.createElement('div'); ov.id = 'rafale';
  ov.innerHTML = '<div class="rtop"><b>' + escapeHtml(className(classId)) + '</b><span class="rcount" id="rCount">0</span><button class="rbtn" onclick="rafaleClose()">Terminer ✓</button></div>' +
    '<div class="rvid"><video playsinline muted autoplay></video><div class="flash"></div><div class="hint" id="rHint">Pose une fiche bien à plat sous la caméra</div></div>' +
    '<div class="rbot"><button class="shutter" aria-label="Photographier" onclick="rafaleShoot(true)"></button><div class="rlog" id="rLog"></div><button class="rbtn rauto" id="rAuto" onclick="rafaleAuto()">Auto ✓</button></div>';
  document.body.appendChild(ov);
  const v = ov.querySelector('video'); v.srcObject = stream; try { await v.play(); } catch (e) { }
  raf = { stream, v, ov, classId, auto: true, armed: true, stable: 0, prev: null, lost: 0, pending: [], working: false, ok: 0, check: 0, log: [], tpl: null, shooting: false };
  raf.timer = setInterval(rafaleTick, 380);
}
function rafaleAuto() { raf.auto = !raf.auto; const b = $('rAuto'); b.classList.toggle('off', !raf.auto); b.textContent = raf.auto ? 'Auto ✓' : 'Auto ✗'; }
function rafaleTick() {
  if (!raf || raf.shooting || !raf.v.videoWidth) return;
  const v = raf.v, s = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight)), w = Math.round(v.videoWidth * s), h = Math.round(v.videoHeight * s);
  const c = raf.small || (raf.small = document.createElement('canvas')); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(v, 0, 0, w, h);
  const I = Fiche._int, g = I.toGray(x.getImageData(0, 0, w, h).data, w, h), pts = I.pickMarkers(I.squareBlobs(I.binarize(g, w, h), w, h), w, h, null);
  const big = pts && quadAreaPts(pts) > 0.1 * w * h;
  v.classList.toggle('seen', !!big); v.classList.toggle('ok', false);
  if (!big) { raf.stable = 0; raf.prev = null; if (++raf.lost >= 1) raf.armed = true; hint(raf.armed ? 'Pose une fiche bien à plat sous la caméra' : 'Fiche suivante…'); return; }
  raf.lost = 0;
  const cen = pts.map(p => [p.x / w, p.y / h]).sort((a, b) => a[0] + a[1] - b[0] - b[1]);
  const moved = raf.prev ? Math.max(...cen.map((p, i) => Math.hypot(p[0] - raf.prev[i][0], p[1] - raf.prev[i][1]))) : 1;
  if (raf.prev && moved > 0.08) raf.armed = true; // autre fiche posée ailleurs
  raf.stable = moved < 0.015 ? raf.stable + 1 : 0; raf.prev = cen;
  if (!raf.armed) { hint('✓ Photographiée — pose la fiche suivante'); v.classList.add('ok'); return; }
  hint(raf.stable >= 2 ? 'Ne bouge plus…' : 'Fiche repérée, tiens l’iPad immobile');
  if (raf.auto && raf.stable >= 2) rafaleShoot(false);
}
function quadAreaPts(q) { const c = q.reduce((a, p) => [a[0] + p.x / 4, a[1] + p.y / 4], [0, 0]), s = q.slice().sort((a, b) => Math.atan2(a.y - c[1], a.x - c[0]) - Math.atan2(b.y - c[1], b.x - c[0])); let A = 0; for (let i = 0; i < 4; i++) { const p = s[i], n = s[(i + 1) % 4]; A += p.x * n.y - n.x * p.y; } return Math.abs(A) / 2; }
function hint(t) { const e = $('rHint'); if (e && e.textContent !== t) e.textContent = t; }
function rafaleShoot(manual) {
  if (!raf || raf.shooting) return; raf.shooting = true;
  const v = raf.v, c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0);
  const f = raf.ov.querySelector('.flash'); f.style.opacity = '.85'; setTimeout(() => { f.style.opacity = '0'; }, 120);
  raf.armed = false; raf.stable = 0;
  c.toBlob(b => { raf.shooting = false; if (!b) return; raf.pending.push(b); rafLog('⏳ Lecture…', '#fde68a'); rafaleWork(); }, 'image/jpeg', 0.92);
}
function rafLog(t, color) { raf.log.unshift({ t, color }); raf.log = raf.log.slice(0, 3); const e = $('rLog'); if (e) e.innerHTML = raf.log.map(l => '<span style="color:' + l.color + '">' + escapeHtml(l.t) + '</span>').join(''); }
async function rafaleWork() {
  if (!raf || raf.working) return; raf.working = true;
  while (raf && raf.pending.length) {
    const b = raf.pending.shift(), r = raf;
    const read = await readSafe(b), photo = await compressPhoto(b), ok = addFromRead(read, photo, r.classId);
    await persist();
    if (read.tplId) r.tpl = read.tplId;
    const st = ok ? state.students.find(x => x.id === read.ref?.id) : null;
    if (ok) r.ok++; else r.check++;
    r.log.shift(); rafLog(ok ? '✓ ' + (st ? st.name : 'fiche rangée') : '⚠ fiche à vérifier (' + (read.issues[0] || 'non lue') + ')', ok ? '#86efac' : '#fca5a5');
    const tot = state.students.filter(x => x.classId === r.classId).length, done = r.tpl ? state.students.filter(x => x.classId === r.classId && latestScan(x.id, r.tpl)).length : r.ok;
    const ce = $('rCount'); if (ce) ce.textContent = done + ' / ' + tot + (r.check ? ' · ⚠ ' + r.check : '');
  }
  if (raf) raf.working = false;
}
async function rafaleClose() {
  if (!raf) return; const r = raf;
  if (r.pending.length || r.working) { hint('Fin de la lecture…'); while (r.pending.length || r.working) await new Promise(ok => setTimeout(ok, 200)); }
  clearInterval(r.timer); r.stream.getTracks().forEach(t => t.stop()); r.ov.remove(); raf = null;
  $('batchClass').value = r.classId; render();
  const cta = $('batchDone'); if (cta && r.tpl && r.ok) { cta.classList.remove('hidden'); cta.innerHTML = '<div><b>✓ ' + r.ok + ' fiche(s) rangée(s)' + (r.check ? ' · ' + r.check + ' à vérifier' : '') + '</b><span class="muted" style="display:block">' + escapeHtml(className(r.classId)) + '</span></div><button onclick="goResults(\'' + r.tpl + '\',\'' + r.classId + '\')">📊 Voir les résultats et noter →</button>'; }
}

/* ---------- 2. Estimations annoncées avant la course ---------- */
let ann = null;
function annOpen(tid, cid) {
  tid = tid || ($('resultTpl') && $('resultTpl').value) || state.templates[0]?.id; cid = cid || ($('resultClass') && $('resultClass').value) || $('batchClass').value;
  const t = tplById(tid); if (!t || !estBlocks(t).length) return alert('Cette fiche n’a pas de ligne « Estimation ».');
  ann = { tid, cid, bi: estBlocks(t)[0].bi }; annRender();
}
function annRender() {
  let box = $('annBox'); if (!ann) { if (box) box.remove(); return; }
  if (!box) { box = document.createElement('div'); box.id = 'annBox'; document.body.appendChild(box); }
  const t = tplById(ann.tid), studs = resultStudents(ann.cid, t), k = 'ann' + ann.bi;
  const n = studs.filter(s => ((s.notes || {})[t.id] || {})[k]).length;
  box.innerHTML = '<div class="card"><div class="flex"><h2 class="grow" style="margin:0">📝 Estimations annoncées</h2><button onclick="ann=null;annRender();render()">Fermer ✓</button></div>' +
    '<p class="muted">Avant la course, note le temps annoncé par chaque élève. Après le scan, si la fiche ne dit pas la même chose, une <b style="color:#b91c1c">alerte rouge</b> s’affiche dans les résultats. Tape simplement « 320 » pour 3:20.</p>' +
    '<div class="flex"><select onchange="ann.tid=this.value;ann.bi=estBlocks(tplById(this.value))[0]?.bi;annRender()">' + state.templates.filter(x => estBlocks(x).length).map(x => '<option value="' + x.id + '"' + (x.id === t.id ? ' selected' : '') + '>' + escapeHtml(x.name) + '</option>').join('') + '</select>' +
    '<span class="seg">' + estBlocks(t).map(x => '<button class="' + (x.bi === ann.bi ? 'on' : '') + '" onclick="ann.bi=' + x.bi + ';annRender()">' + escapeHtml(x.b.title || 'Course') + '</button>').join('') + '</span></div>' +
    '<p><b>' + n + ' / ' + studs.length + '</b> estimations notées pour ' + escapeHtml(t.blocks[ann.bi].title || 'cette course') + '.</p>' +
    studs.map(s => { const v = ((s.notes || {})[t.id] || {})[k] || ''; return '<div class="row"><span>' + escapeHtml(s.name) + (s.cls ? ' <small class="muted">' + escapeHtml(s.cls) + '</small>' : '') + '</span><input inputmode="numeric" enterkeyhint="next" value="' + escapeHtml(v) + '" class="' + (v ? 'done' : '') + '" placeholder="m:ss" onchange="annSet(\'' + s.id + '\',this)" onkeydown="if(event.key===\'Enter\'){const n=this.closest(\'.row\').nextElementSibling;if(n)n.querySelector(\'input\').focus();}"></div>'; }).join('') + '</div>';
}
async function annSet(sid, el) {
  const v = parseQuickTime(el.value); if (v === null) { el.classList.add('bad'); return; }
  el.classList.remove('bad'); el.classList.toggle('done', !!v); el.value = v;
  const s = state.students.find(x => x.id === sid); if (!s) return; s.notes = s.notes || {}; s.notes[ann.tid] = s.notes[ann.tid] || {};
  if (v) s.notes[ann.tid]['ann' + ann.bi] = v; else delete s.notes[ann.tid]['ann' + ann.bi];
  await persist();
}

/* ---------- 3. PhotoFinish ---------- */
function pfData(tid) { state.pf = state.pf || {}; return state.pf[tid] = state.pf[tid] || { tol: 2, files: [] }; }
function parsePF(html, fname) {
  const d = new DOMParser().parseFromString(html, 'text/html');
  const title = d.querySelector('h1')?.textContent.trim() || fname, meta = d.querySelector('.m')?.textContent.trim() || '';
  const fm = String(fname).match(/(\d{4})-(\d{2})-(\d{2})_(\d{2})h(\d{2})/), mm = meta.match(/(\d{1,2})h(\d{2})/);
  const key = fm ? fm.slice(1, 6).join('') : (mm ? '0000000' + mm[1].padStart(2, '0') + mm[2] : fname);
  const rows = []; let last = null;
  d.querySelectorAll('tbody tr').forEach(tr => {
    const tds = [...tr.children], tcell = tr.querySelector('td.t'), ncell = tds.find(td => !td.className && td.textContent.trim());
    if (tcell) last = sec(tcell.textContent.trim());
    if (ncell) rows.push({ name: ncell.textContent.trim(), time: tcell ? sec(tcell.textContent.trim()) : last });
  });
  d.querySelectorAll('.nf div').forEach(x => { const n = x.textContent.trim(); if (n) rows.push({ name: n, time: null, dnf: true }); });
  return { name: fname, title, meta, key, course: 'auto', rows };
}
async function pfImport(e) {
  const t = tplById($('resultTpl').value); if (!t) return;
  const P = pfData(t.id), files = [...e.target.files]; e.target.value = '';
  let n = 0;
  for (const f of files) { try { const p = parsePF(await f.text(), f.name); if (!p.rows.length) continue; P.files = P.files.filter(x => !(x.key === p.key && x.meta === p.meta)); P.files.push(p); n++; } catch (err) { } }
  P.files.sort((a, b) => a.key.localeCompare(b.key));
  await persist(); renderResults();
  alert(n ? n + ' course(s) PhotoFinish importée(s). Les écarts avec les fiches s’affichent en rouge en haut des résultats.' : 'Aucun fichier PhotoFinish reconnu (exporte la course en HTML depuis PhotoFinish).');
}
function pfStudent(name, studs) {
  const k = nameKey(name), ex = studs.filter(s => nameKey(s.name) === k); if (ex.length === 1) return ex[0];
  const m = matchName(name, 0.85); return m && studs.includes(m) ? m : null;
}
function pfTimes(t) { // { sid: [temps course 1, temps course 2…] , unknown: [noms] }
  const P = (state.pf || {})[t.id]; if (!P || !P.files.length) return null;
  const studs = resultStudents('*', t).length ? resultStudents('*', t) : state.students, out = {}, unknown = new Set();
  P.files.forEach(f => f.rows.forEach(r => {
    const s = pfStudent(r.name, studs); if (!s) { unknown.add(r.name); return; }
    const a = out[s.id] = out[s.id] || [];
    let k = +f.course - 1; if (f.course === 'auto') { k = 0; while (a[k] !== undefined) k++; }
    a[k] = r.dnf ? 'dnf' : r.time;
  }));
  return { by: out, unknown: [...unknown], tol: +P.tol || 2 };
}
async function pfSet(k, v) { const t = tplById($('resultTpl').value), P = pfData(t.id); if (k === 'tol') P.tol = Math.max(0, +String(v).replace(',', '.') || 0); else if (k.startsWith('c')) P.files[+k.slice(1)].course = v; else if (k.startsWith('x')) P.files.splice(+k.slice(1), 1); await persist(); renderResults(); }

/* ---------- Alertes de contrôle ---------- */
function controlAlerts(t, s, r, pft) {
  if (!t || !s || !r) return [];
  const out = [], n = (s.notes || {})[t.id] || {}, m = metrics(t, r.values);
  estBlocks(t).forEach(({ b, bi, er }) => {
    const a = n['ann' + bi], f = r.values[er.id];
    if (a && f && sec(a) !== sec(f)) out.push({ kind: 'est', text: (b.title || 'Course') + ' : estimation annoncée ' + a + ', mais ' + f + ' sur la fiche' });
    if (a && !f) out.push({ kind: 'est', text: (b.title || 'Course') + ' : estimation annoncée ' + a + ', rien sur la fiche' });
  });
  pft = pft === undefined ? pfTimes(t) : pft;
  const pf = pft && pft.by[s.id];
  if (pf) timedBlocks(t).forEach(({ b, bi }, k) => {
    const p = pf[k], f = m.blocks[bi].final; if (p === undefined) return;
    if (p === 'dnf') { out.push({ kind: 'pf', text: (b.title || 'Course') + ' : non classé dans PhotoFinish' }); return; }
    if (f == null) { out.push({ kind: 'pf', text: (b.title || 'Course') + ' : PhotoFinish ' + fmtPF(p) + ', pas de temps final sur la fiche' }); return; }
    const d = f - p; if (Math.abs(d) > pft.tol) out.push({ kind: 'pf', text: (b.title || 'Course') + ' : fiche ' + fmt(f) + ' · PhotoFinish ' + fmtPF(p) + ' (écart ' + sgn(d) + ' s)' });
  });
  return out;
}
const _scanStateBase = scanState;
scanState = function (r) {
  const st = _scanStateBase(r);
  if (st === 'auto') { const t = tplById(r.templateId), s = state.students.find(x => x.id === r.studentId); if (controlAlerts(t, s, r).length) return 'check'; }
  return st;
};
function renderControls() {
  let box = $('ctrlBox'); const t = tplById($('resultTpl').value);
  if (!box) { box = document.createElement('div'); box.id = 'ctrlBox'; box.className = 'ctrlbox'; const tw = document.querySelector('#results .tablewrap'); tw.parentNode.insertBefore(box, tw); }
  if (!t) { box.innerHTML = ''; return; }
  const c = $('resultClass').value, studs = resultStudents(c, t), pft = pfTimes(t), P = (state.pf || {})[t.id];
  const hasAnn = studs.some(s => Object.keys(((s.notes || {})[t.id] || {})).some(k => k.startsWith('ann')));
  const alerts = studs.map(s => { const r = latestScan(s.id, t.id); return { s, r, a: r ? controlAlerts(t, s, r, pft) : [] }; }).filter(x => x.a.length);
  const missPF = pft ? studs.filter(s => latestScan(s.id, t.id) && !pft.by[s.id]) : [];
  let h = '<div class="flex">' + (estBlocks(t).length ? '<button class="secondary" onclick="annOpen()">📝 Estimations annoncées</button>' : '') +
    (timedBlocks(t).length ? '<label class="btn secondary">⏱ Importer PhotoFinish<input type="file" accept=".html,.htm,text/html" multiple style="display:none" onchange="pfImport(event)"></label>' : '') +
    '<button class="secondary" onclick="exportDetail()">📑 Bilan détaillé par élève</button></div>';
  if (P && P.files.length) {
    const cn = pft.by;
    h += '<details class="pfbox"' + (pft.unknown.length ? ' open' : '') + '><summary><b>⏱ PhotoFinish : ' + P.files.length + ' course(s)</b> · alerte si l’écart dépasse <b>' + nf(pft.tol) + ' s</b></summary>' +
      '<div class="flex" style="margin:10px 0"><label style="margin:0">Écart toléré</label><input style="width:80px" inputmode="decimal" value="' + nf(pft.tol) + '" onchange="pfSet(\'tol\',this.value)"> s</div>' +
      '<table><thead><tr><th>Fichier</th><th>Élèves</th><th>Course</th><th></th></tr></thead><tbody>' + P.files.map((f, i) => '<tr><td>' + escapeHtml(f.title) + ' · ' + escapeHtml(f.meta) + '</td><td>' + f.rows.length + '</td><td><select onchange="pfSet(\'c' + i + '\',this.value)">' + [['auto', 'Automatique'], ...timedBlocks(t).map((x, k) => [String(k + 1), x.b.title || 'Course ' + (k + 1)])].map(([v, l]) => '<option value="' + v + '"' + (String(f.course) === v ? ' selected' : '') + '>' + escapeHtml(l) + '</option>').join('') + '</select></td><td><button class="mini" onclick="pfSet(\'x' + i + '\')">Retirer</button></td></tr>').join('') + '</tbody></table>' +
      '<p class="muted">« Automatique » : pour chaque élève, sa 1re course dans l’ordre des heures = ' + escapeHtml(timedBlocks(t)[0]?.b.title || 'course 1') + ', la 2e = ' + escapeHtml(timedBlocks(t)[1]?.b.title || 'course 2') + '. Pas besoin de renommer les fichiers.</p>' +
      (pft.unknown.length ? '<p class="notice">Noms PhotoFinish non reconnus : ' + pft.unknown.map(escapeHtml).join(', ') + '</p>' : '') +
      (missPF.length ? '<p class="muted">Sans temps PhotoFinish : ' + missPF.map(s => escapeHtml(s.name)).join(', ') + '</p>' : '') + '</details>';
  }
  if (alerts.length) h += '<div class="ctrl-alert"><h3>🚨 ' + alerts.length + ' élève(s) à contrôler</h3><ul>' + alerts.map(x => '<li><b>' + escapeHtml(x.s.name) + '</b> — ' + x.a.map(a => escapeHtml(a.text)).join(' · ') + ' <button class="mini" onclick="editScan(\'' + x.r.id + '\')">Ouvrir la fiche</button></li>').join('') + '</ul></div>';
  else if (hasAnn || (P && P.files.length)) h += '<p class="ctrl-ok">✓ Aucune différence avec ' + [hasAnn ? 'les estimations annoncées' : '', P && P.files.length ? 'PhotoFinish (± ' + nf(pft.tol) + ' s)' : ''].filter(Boolean).join(' ni avec ') + '.</p>';
  box.innerHTML = h;
}
const _renderResultsBase = renderResults;
renderResults = function () { _renderResultsBase(); try { renderControls(); } catch (e) { console.error(e); } };
const _editScanBase = editScan;
editScan = function (id) {
  _editScanBase(id); const r = state.scans.find(x => x.id === id); if (!r) return;
  const a = controlAlerts(tplById(r.templateId), state.students.find(x => x.id === r.studentId), r);
  let el = $('scanCtrl'); if (!el) { el = document.createElement('div'); el.id = 'scanCtrl'; $('scanIssues').parentNode.insertBefore(el, $('scanIssues')); }
  el.innerHTML = a.length ? '<div class="ctrl-alert"><h3>🚨 À contrôler</h3><ul>' + a.map(x => '<li>' + escapeHtml(x.text) + '</li>').join('') + '</ul></div>' : '';
};

/* ---------- 4. Bilan détaillé par élève (HTML) ---------- */
function studentDetail(t, s, pft) {
  const r = latestScan(s.id, t.id), n = (s.notes || {})[t.id] || {};
  let h = '<article class="eleve"><h2>' + escapeHtml(s.name) + (s.cls ? ' <small>' + escapeHtml(s.cls) + '</small>' : '') + ' <small>' + escapeHtml(className(s.classId)) + (s.sex ? ' · ' + (s.sex === 'F' ? 'fille' : 'garçon') : '') + '</small></h2>';
  if (n.disp) return h + '<p><b>Dispensé(e)</b></p></article>';
  if (!r) return h + '<p class="muted">Fiche non scannée.</p></article>';
  const m = metrics(t, r.values), pf = pft && pft.by[s.id], alerts = controlAlerts(t, s, r, pft);
  h += '<div class="courses">' + t.blocks.map((b, bi) => {
    const er = b.rows.find(isEst), times = b.rows.filter(x => x.type === 'time' && x !== er), B = m.blocks[bi], k = timedBlocks(t).findIndex(x => x.bi === bi);
    let rows = '';
    if (er) rows += '<tr><td>Estimation</td><td colspan="2"><b>' + escapeHtml(r.values[er.id] || '—') + '</b>' + (n['ann' + bi] ? ' <small>(annoncée ' + escapeHtml(n['ann' + bi]) + ')</small>' : '') + '</td></tr>';
    times.forEach((x, j) => { const seg = B.segs && B.segs[j]; rows += '<tr><td>' + escapeHtml(x.label) + '</td><td>' + escapeHtml(r.values[x.id] || '—') + '</td><td>' + (seg != null && times.length > 1 ? fmt(seg) : '') + '</td></tr>'; });
    b.rows.filter(x => x.type !== 'time').forEach(x => { rows += '<tr><td>' + escapeHtml(x.label) + '</td><td colspan="2">' + escapeHtml(r.values[x.id] ?? '—') + '</td></tr>'; });
    if (B.hasTime) {
      rows += '<tr class="fin"><td>Temps final</td><td colspan="2"><b>' + fmt(B.final) + '</b></td></tr>';
      if (B.hasEst && B.est != null && B.final != null) rows += '<tr><td>Écart à l’estimation</td><td colspan="2">' + sgn(B.final - B.est) + ' s</td></tr>';
      if (B.segs && B.segs.length > 1) rows += '<tr><td>Régularité (tour le + lent − le + rapide)</td><td colspan="2">' + round1(Math.max(...B.segs) - Math.min(...B.segs)) + ' s</td></tr>';
      if (pf && pf[k] !== undefined) rows += '<tr><td>PhotoFinish</td><td colspan="2">' + (pf[k] === 'dnf' ? 'non classé' : fmtPF(pf[k]) + (B.final != null ? ' <small>(écart ' + sgn(B.final - pf[k]) + ' s)</small>' : '')) + '</td></tr>';
    }
    return '<div class="course"><h3>' + escapeHtml(b.title || 'Relevé') + '</h3><table><thead><tr><th></th><th>Temps</th><th>' + (times.length > 1 ? 'Fraction' : '') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }).join('') + '</div>';
  const sum = [];
  if (m.best != null && timedBlocks(t).length > 1) sum.push('Meilleur temps : <b>' + fmt(m.best) + '</b>');
  if (m.gap != null) sum.push('Écarts estimation cumulés : <b>' + round1(m.gap) + ' s</b>');
  if (m.pace != null) sum.push('Régularité sur toutes les courses : <b>' + round1(m.pace) + ' s</b>');
  const g = bar(t.bareme) ? grade(t, s, m) : null;
  if (g && !g.disp) {
    if (g.v2) { sum.push('Note : <b>' + (g.total != null ? nf(g.total) + ' / ' + nf(g.B.totalMax) : 'incomplète') + '</b>' + (g.perf != null ? ' · performance ' + nf(g.perf) : '') + g.calcs.map((c, i) => c.pts != null ? ' · ' + escapeHtml(g.B.calcs[i].name) + ' ' + nf(c.pts) : '').join('') + g.crits.map((c, i) => c.pts != null ? ' · ' + escapeHtml(g.B.crits[i].name) + ' ' + nf(c.pts) : '').join('')); }
    else sum.push('Note : <b>' + (g.total != null ? nf(g.total) + ' / 20' : 'incomplète') + '</b> · AFL1 ' + nf(g.afl1) + ' (perf. ' + nf(g.perf) + ' + régularité ' + nf(g.reg) + ') · AFL2 ' + (g.d2 ? 'D' + g.d2 + ' = ' + nf(g.p2) : '—') + ' · AFL3 ' + (g.d3 ? 'D' + g.d3 + ' = ' + nf(g.p3) : '—') + (g.choix ? ' · choix ' + escapeHtml(g.choix) : ''));
  }
  h += '<p class="sum">' + sum.join(' · ') + '</p>';
  if (alerts.length) h += '<p class="al">🚨 ' + alerts.map(a => escapeHtml(a.text)).join(' · ') + '</p>';
  const st = scanState(r); h += '<p class="etat">Fiche : ' + ({ validated: 'validée', auto: 'lue, non validée', check: 'à vérifier' }[st] || '') + (r.observer ? ' · observateur : ' + escapeHtml(r.observer) : '') + '</p>';
  return h + '</article>';
}
function exportDetail() {
  const t = tplById($('resultTpl').value); if (!t) return;
  const sel = $('resultClass').value, cids = sel === '*' ? classesUsing(t) : [sel], pft = pfTimes(t);
  const css = 'body{font-family:system-ui,-apple-system,sans-serif;color:#18314c;margin:24px;background:#f5f7fb}h1{color:#123d66;margin:0}.sub{color:#5a6f85}.cover{min-height:80vh;display:flex;flex-direction:column;justify-content:center;border:3px solid #123d66;border-radius:18px;padding:40px;margin-bottom:30px;background:#fff}.cover h1{font-size:34px}.kv{font-size:18px;margin:6px 0}.eleve{background:#fff;border-radius:16px;padding:16px 20px;margin:16px 0;box-shadow:0 4px 14px rgba(0,0,0,.06);break-inside:avoid}.eleve h2{margin:0 0 10px;color:#123d66}.eleve h2 small{font-size:14px;color:#5a6f85;font-weight:500}.courses{display:flex;gap:16px;flex-wrap:wrap}.course{flex:1;min-width:260px}.course h3{margin:4px 0;color:#1267a5}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #e3eaf2;padding:5px 8px;text-align:left;font-size:14px}th{color:#5a6f85;font-weight:600}tr.fin td{background:#eef6ff}.sum{background:#f2f6fb;border-radius:10px;padding:8px 12px}.al{background:#fee2e2;color:#991b1b;border-radius:10px;padding:8px 12px;font-weight:700}.etat{color:#5a6f85;font-size:13px}@media print{body{background:#fff;margin:10mm}.cover{min-height:250mm;break-after:page}.eleve{box-shadow:none;border:1px solid #d5e0ea}}';
  const body = cids.map(c => '<h1 style="margin-top:30px">' + escapeHtml(className(c)) + '</h1>' + resultStudents(c, t).map(s => studentDetail(t, s, pft)).join('')).join('');
  const doc = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escapeHtml(t.name) + ' — bilan détaillé</title><style>' + css + '</style></head><body>' + coverHTML(t, cids, 'Bilan détaillé par élève') + body + '</body></html>';
  download('bilan-' + slug(t.name) + '-' + (sel === '*' ? 'toutes-classes' : slug(className(cids[0]))) + '.html', doc, 'text/html;charset=utf-8');
}

/* ---------- Tableau des résultats : noms et en-têtes figés ---------- */
(() => { const st = document.createElement('style'); st.textContent = `
#results .tablewrap{max-height:calc(100vh - 140px);overflow:auto;-webkit-overflow-scrolling:touch}
#resultsTable,#resultsTable.gt{overflow:visible}
#resultsTable thead th{position:sticky;z-index:3}
#resultsTable tbody td:first-child,#resultsTable thead th.stickl{position:sticky;left:0;z-index:2;background:#fff;box-shadow:2px 0 0 #ece8fb}
#resultsTable thead th.stickl{z-index:4;background:#f6f3ff}
#resultsTable thead tr:first-child th.stickl{background:#f6f3ff}
`; document.head.appendChild(st); })();
function stickyResults() {
  const tb = $('resultsTable'); if (!tb) return;
  let top = 0;
  [...tb.tHead.rows].forEach(tr => { [...tr.cells].forEach(th => { th.style.top = top + 'px'; }); top += tr.getBoundingClientRect().height; });
  const first = tb.tHead.rows[0] && tb.tHead.rows[0].cells[0]; if (first) first.classList.add('stickl');
}
const _renderResultsSticky = renderResults;
renderResults = function () { _renderResultsSticky(); try { stickyResults(); requestAnimationFrame(stickyResults); } catch (e) { } };

/* ---------- Refaire une évaluation (nouvelle session, sans mélanger avec l'ancienne) ---------- */
async function redoEval(tid) {
  const s = tplById(tid); if (!s) return;
  const base = s.name.replace(/\s+—\s+(évaluation|session|séance).*$/i, '');
  const name = prompt('Nom de la nouvelle évaluation (les résultats de « ' + s.name + ' » restent à part) :', base + ' — évaluation du ' + new Date().toLocaleDateString('fr-FR'));
  if (!name || !name.trim()) return;
  const t = JSON.parse(JSON.stringify(s)); t.id = sid('t'); t.name = name.trim(); t.locked = false; t.printedFor = []; t.createdAt = today();
  t.blocks.forEach(b => b.rows.forEach(r => { r.id = sid('r'); }));
  state.templates.push(t); await persist(); render();
  alert('« ' + t.name + ' » est prête : même fiche, même barème, résultats séparés.\nLes choix AFL2-AFL3 des élèves sont repris.\nImprime maintenant les fiches de la classe.');
  openEval({ tplId: t.id });
}
