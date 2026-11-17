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
.cbulk{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:6px 0 4px}.cbulk span{font-weight:800}.cbulk button{min-height:50px;font-size:15px;font-weight:800;border-radius:12px;padding:8px 14px;color:#fff}.ctrl-alert ul{list-style:none;padding:0;margin:0}.ctrl-alert>ul>li{background:#fff;border-radius:14px;padding:10px 14px;margin:10px 0}.citem{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:6px 0}.citem>span{flex:1;min-width:240px;font-size:17px}.cbtns{display:flex;gap:10px}.cbtns button{min-height:60px;font-size:17px;font-weight:800;border-radius:14px;padding:8px 16px;line-height:1.15;color:#fff;box-shadow:0 4px 10px rgba(0,0,0,.12)}.cbtns small{display:block;font-size:20px;font-weight:900;margin-top:2px}.cb-me{background:linear-gradient(135deg,#16a34a,#22c55e)}.cb-pf{background:linear-gradient(135deg,#2563eb,#3b82f6)}.cb-est{background:linear-gradient(135deg,#7c3aed,#a78bfa)}.ctrl-alert h3{margin:0 0 6px;font-size:20px;color:#b91c1c}.ctrl-alert li{margin:4px 0;font-size:16px}.ctrl-ok{background:#dcfce7;border:2px solid #22c55e;border-radius:16px;padding:12px 16px;color:#14532d;font-weight:700}
.pfbox{background:#f6f3ff;border-radius:18px;padding:14px 16px;margin:12px 0}.pfbox table{width:100%;border-collapse:collapse}.pfbox td,.pfbox th{padding:6px 8px;border-bottom:1px solid #e5e0f5;text-align:left;font-size:14px}
#annBox{position:fixed;inset:0;z-index:9000;background:rgba(20,15,50,.55);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:20px}
#annBox .card{background:#fff;border-radius:22px;max-width:760px;width:100%;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,.3)}
#annBox .row{display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid #eee}#annBox .row span{flex:1;font-size:18px}
#annBox input{width:120px;font-size:24px;font-weight:800;text-align:center;padding:10px;border-radius:12px;border:2px solid #d8d2f0}
#annBox input.bad{border-color:#ef4444;background:#fef2f2}#annBox input.done{border-color:#22c55e;background:#f0fdf4}
`; document.head.appendChild(st); })();

/* ---------- 1. Scan en continu ---------- */
let raf = null;
async function rafaleOpen(cid, back) {
  const classId = cid || $('batchClass').value; if (!classId) return alert('Choisis d’abord la classe.');
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false }); }
  catch (e) { return alert('Caméra inaccessible. Autorise la caméra pour ce site (Réglages › Safari › Caméra), ou utilise « Prendre une photo ».'); }
  const ov = document.createElement('div'); ov.id = 'rafale';
  ov.innerHTML = '<div class="rtop"><b>' + escapeHtml(className(classId)) + '</b><span class="rcount" id="rCount">0</span><button class="rbtn" onclick="rafaleClose()">Terminer ✓</button></div>' +
    '<div class="rvid"><video playsinline muted autoplay></video><div class="flash"></div><div class="hint" id="rHint">Pose une fiche bien à plat sous la caméra</div></div>' +
    '<div class="rbot"><button class="shutter" aria-label="Photographier" onclick="rafaleShoot(true)"></button><div class="rlog" id="rLog"></div><button class="rbtn rauto" id="rAuto" onclick="rafaleAuto()">Auto ✓</button></div>';
  document.body.appendChild(ov);
  const v = ov.querySelector('video'); v.srcObject = stream; try { await v.play(); } catch (e) { }
  beep.ctx = beep.ctx || (() => { try { return new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } })();
  raf = { back, seen: new Set(), stream, v, ov, classId, auto: true, armed: true, stable: 0, prev: null, lost: 0, pending: [], working: false, ok: 0, check: 0, log: [], tpl: null, shooting: false };
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
function beep(ok) {
  try { const A = beep.ctx || (beep.ctx = new (window.AudioContext || window.webkitAudioContext)()), t = A.currentTime;
    (ok ? [[880, 0, .12]] : [[330, 0, .14], [330, .2, .14]]).forEach(([f, d, l]) => { const o = A.createOscillator(), g = A.createGain(); o.frequency.value = f; g.gain.setValueAtTime(.25, t + d); g.gain.exponentialRampToValueAtTime(.001, t + d + l); o.connect(g); g.connect(A.destination); o.start(t + d); o.stop(t + d + l + .02); });
  } catch (e) { }
}
function rafLog(t, color) { raf.log.unshift({ t, color }); raf.log = raf.log.slice(0, 3); const e = $('rLog'); if (e) e.innerHTML = raf.log.map(l => '<span style="color:' + l.color + '">' + escapeHtml(l.t) + '</span>').join(''); }
async function rafaleWork() {
  if (!raf || raf.working) return; raf.working = true;
  while (raf && raf.pending.length) {
    const b = raf.pending.shift(), r = raf;
    const read = await readSafe(b), photo = await compressPhoto(b), ok = addFromRead(read, photo, r.classId);
    await persist();
    if (read.tplId) r.tpl = read.tplId;
    const st = ok ? state.students.find(x => x.id === read.ref?.id) : null, again = st && r.seen.has(st.id);
    if (st) r.seen.add(st.id);
    if (ok && !again) r.ok++; else if (!ok) r.check++;
    r.log.shift(); rafLog(again ? '↺ déjà photographiée : ' + st.name : ok ? '✓ ' + (st ? st.name : 'fiche rangée') : '⚠ fiche à vérifier (' + (read.issues[0] || 'non lue') + ')', again ? '#cbd5e1' : ok ? '#86efac' : '#fca5a5');
    if (!again) beep(ok);
    const tot = state.students.filter(x => x.classId === r.classId).length, done = r.tpl ? state.students.filter(x => x.classId === r.classId && latestScan(x.id, r.tpl)).length : r.ok;
    const ce = $('rCount'); if (ce) ce.textContent = done + ' / ' + tot + (r.check ? ' · ⚠ ' + r.check : '');
  }
  if (raf) raf.working = false;
}
async function rafaleClose() {
  if (!raf) return; const r = raf;
  if (r.pending.length || r.working) { hint('Fin de la lecture…'); while (r.pending.length || r.working) await new Promise(ok => setTimeout(ok, 200)); }
  clearInterval(r.timer); r.stream.getTracks().forEach(t => t.stop()); r.ov.remove(); raf = null;
  if (r.back) { view(r.back); return; }
  $('batchClass').value = r.classId; render();
  const cta = $('batchDone'); if (cta && r.tpl && r.ok) { cta.classList.remove('hidden'); cta.innerHTML = '<div><b>✓ ' + r.ok + ' fiche(s) rangée(s)' + (r.check ? ' · ' + r.check + ' à vérifier' : '') + '</b><span class="muted" style="display:block">' + escapeHtml(className(r.classId)) + '</span></div><button onclick="goResults(\'' + r.tpl + '\',\'' + r.classId + '\')">📊 Voir les résultats et noter →</button>'; }
}

/* ---------- 2. Estimations annoncées avant la course ---------- */
let ann = null;
function annTpls() { return state.templates.filter(t => estBlocks(t).length && state.classes.some(c => classUsesTpl(c.id, t))); }
function classUsesTpl(cid, t) { return (t.printedFor || []).some(p => p.classId === cid) || state.scans.some(x => x.templateId === t.id && x.classId === cid); }
function annOpen(tid, cid) {
  const T = annTpls();
  tid = tid || ($('resultTpl') && !$('results').classList.contains('hidden') && $('resultTpl').value) || (T[T.length - 1] || {}).id;
  const t = tplById(tid); if (!t || !estBlocks(t).length) return alert('Prépare d’abord une évaluation (fiche avec une ligne « Estimation ») et imprime-la pour ta classe.');
  const cls = state.classes.filter(c => classUsesTpl(c.id, t));
  cid = cid || ($('resultClass') && !$('results').classList.contains('hidden') && $('resultClass').value !== '*' ? $('resultClass').value : null) || (cls[0] || state.classes[0] || {}).id;
  ann = { tid: t.id, cid, bi: estBlocks(t)[0].bi }; annRender();
}
function annRender() {
  let box = $('annBox'); if (!ann) { if (box) box.remove(); return; }
  if (!box) { box = document.createElement('div'); box.id = 'annBox'; document.body.appendChild(box); }
  const t = tplById(ann.tid), k = 'ann' + ann.bi, cls = state.classes.filter(c => classUsesTpl(c.id, t));
  const studs = state.students.filter(s => s.classId === ann.cid).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const n = studs.filter(s => ((s.notes || {})[t.id] || {})[k]).length;
  box.innerHTML = '<div class="card"><div class="flex"><h2 class="grow" style="margin:0">📝 Estimations annoncées</h2><button onclick="ann=null;annRender();if(!$(\'results\').classList.contains(\'hidden\'))render()">Fermer ✓</button></div>' +
    '<p class="muted">Avant chaque course, note le temps annoncé par chaque élève. Tape « 320 » pour 3:20, puis Entrée pour passer au suivant. Si la fiche dit autre chose après la course, une <b style="color:#b91c1c">alerte rouge</b> apparaîtra dans les résultats.</p>' +
    '<div class="flex"><select onchange="ann.tid=this.value;ann.bi=estBlocks(tplById(this.value))[0].bi;annRender()">' + annTpls().map(x => '<option value="' + x.id + '"' + (x.id === t.id ? ' selected' : '') + '>' + escapeHtml(x.name) + '</option>').join('') + '</select>' +
    (cls.length > 1 ? '<select onchange="ann.cid=this.value;annRender()">' + cls.map(c => '<option value="' + c.id + '"' + (c.id === ann.cid ? ' selected' : '') + '>' + escapeHtml(c.name) + '</option>').join('') + '</select>' : '<b>' + escapeHtml(className(ann.cid)) + '</b>') + '</div>' +
    '<div class="seg" style="margin:12px 0">' + estBlocks(t).map(x => '<button style="min-height:52px;font-size:18px;padding:8px 20px" class="' + (x.bi === ann.bi ? 'on' : '') + '" onclick="ann.bi=' + x.bi + ';annRender()">' + escapeHtml(x.b.title || 'Course') + '</button>').join('') + '</div>' +
    '<p style="font-size:18px"><b id="annCount">' + n + '</b> / ' + studs.length + ' estimations notées pour ' + escapeHtml(t.blocks[ann.bi].title || 'cette course') + '.</p>' +
    studs.map(s => { const no = (s.notes || {})[t.id] || {}, v = no[k] || ''; if (no.disp) return '<div class="row" style="opacity:.45"><span>' + escapeHtml(s.name) + '</span><i>dispensé</i></div>'; return '<div class="row"><span>' + escapeHtml(s.name) + (s.cls ? ' <small class="muted">' + escapeHtml(s.cls) + '</small>' : '') + '</span><input inputmode="numeric" enterkeyhint="next" value="' + escapeHtml(v) + '" class="' + (v ? 'done' : '') + '" placeholder="m:ss" onchange="annSet(\'' + s.id + '\',this)" onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur();let n=this.closest(\'.row\').nextElementSibling;while(n&&!n.querySelector(\'input\'))n=n.nextElementSibling;if(n)n.querySelector(\'input\').focus();}"></div>'; }).join('') + '</div>';
}
async function annSet(sid, el) {
  const v = parseQuickTime(el.value); if (v === null) { el.classList.add('bad'); return; }
  el.classList.remove('bad'); el.classList.toggle('done', !!v); el.value = v;
  const s = state.students.find(x => x.id === sid); if (!s) return; s.notes = s.notes || {}; s.notes[ann.tid] = s.notes[ann.tid] || {};
  if (v) s.notes[ann.tid]['ann' + ann.bi] = v; else delete s.notes[ann.tid]['ann' + ann.bi];
  await persist();
  const t = tplById(ann.tid), k = 'ann' + ann.bi, c = $('annCount'); if (c) c.textContent = state.students.filter(x => x.classId === ann.cid && ((x.notes || {})[t.id] || {})[k]).length;
}

/* ---------- 3. PhotoFinish ---------- */
function pfData(tid) { state.pf = state.pf || {}; return state.pf[tid] = state.pf[tid] || { tol: 2, files: [] }; }
function parsePF(html, fname) {
  const d = new DOMParser().parseFromString(html, 'text/html');
  const title = d.querySelector('h1')?.textContent.trim() || fname, meta = d.querySelector('.m')?.textContent.trim() || '';
  const fm = String(fname).match(/(\d{4})-(\d{2})-(\d{2})_(\d{2})h(\d{2})/), mm = meta.match(/(\d{1,2})h(\d{2})/);
  const key = fm ? fm.slice(1, 6).join('') : (mm ? '0000000' + mm[1].padStart(2, '0') + mm[2] : fname);
  // photos d'arrivée : une par ligne de classement, partagée par les ex aequo (rowspan)
  const rows = [], photos = []; let last = null, lastPh = null;
  d.querySelectorAll('tbody tr').forEach(tr => {
    const tds = [...tr.children], tcell = tr.querySelector('td.t'), ncell = tds.find(td => !td.className && td.textContent.trim());
    if (tcell) {
      last = sec(tcell.textContent.trim());
      const src = tr.querySelector('td.ph img')?.getAttribute('src') || '';
      lastPh = /^data:image\//.test(src) ? photos.push(src) - 1 : null;
    }
    if (ncell) rows.push({ name: ncell.textContent.trim(), time: tcell ? sec(tcell.textContent.trim()) : last, ph: lastPh });
  });
  d.querySelectorAll('.nf div').forEach(x => { const n = x.textContent.trim(); if (n) rows.push({ name: n, time: null, dnf: true }); });
  return { name: fname, title, meta, key, course: 'auto', rows, photos };
}
// photo réduite (≈ 300 px de large) pour ne pas alourdir la sauvegarde
function pfShrink(src, max) {
  return new Promise(res => {
    const im = new Image();
    im.onload = () => { try { const k = Math.min(1, (max || 300) / im.naturalWidth), c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.72)); } catch (e) { res(src); } };
    im.onerror = () => res(null); im.src = src;
  });
}
async function pfImport(e) {
  const t = tplById(e.target.dataset.tid || $('resultTpl').value); if (!t) return;
  const P = pfData(t.id), files = [...e.target.files]; e.target.value = '';
  let n = 0, nph = 0;
  for (const f of files) { try { const p = parsePF(await f.text(), f.name); if (!p.rows.length) continue; p.photos = await Promise.all(p.photos.map(x => pfShrink(x))); nph += p.photos.filter(Boolean).length; P.files = P.files.filter(x => !(x.key === p.key && x.meta === p.meta)); P.files.push(p); n++; } catch (err) { } }
  P.files.sort((a, b) => a.key.localeCompare(b.key));
  await persist(); render();
  alert(n ? n + ' course(s) PhotoFinish importée(s)' + (nph ? ', ' + nph + ' photo(s) d’arrivée rangées avec les élèves' : '') + '. Les écarts avec les fiches s’affichent en rouge en haut des résultats.' : 'Aucun fichier PhotoFinish reconnu (exporte la course en HTML depuis PhotoFinish).');
}
function pfStudent(name, studs) {
  const k = nameKey(name), ex = studs.filter(s => nameKey(s.name) === k); if (ex.length === 1) return ex[0];
  const m = matchName(name, 0.85); return m && studs.includes(m) ? m : null;
}
function pfTimes(t) { // { sid: [temps course 1, temps course 2…] , unknown: [noms] }
  const P = (state.pf || {})[t.id]; if (!P || !P.files.length) return null;
  const studs = resultStudents('*', t).length ? resultStudents('*', t) : state.students, out = {}, ph = {}, unknown = new Set();
  P.files.forEach(f => f.rows.forEach(r => {
    if (/^non nomm/i.test(r.name)) return; // coureur sans nom dans PhotoFinish
    const s = pfStudent(r.name, studs); if (!s) { unknown.add(r.name); return; }
    const a = out[s.id] = out[s.id] || [];
    let k = +f.course - 1; if (f.course === 'auto') { k = 0; while (a[k] !== undefined) k++; }
    a[k] = r.dnf ? 'dnf' : r.time;
    const src = r.ph != null && f.photos ? f.photos[r.ph] : null;
    if (src) (ph[s.id] = ph[s.id] || [])[k] = { src, label: (f.meta || f.title || '').replace(/^Classe\s+/, '') };
  }));
  return { by: out, ph, unknown: [...unknown], tol: +P.tol || 2 };
}
// vignettes des photos d'arrivée d'un élève (touchées = agrandies)
function pfThumbs(pft, s, t) {
  const L = pft && pft.ph && pft.ph[s.id]; if (!L || !L.some(Boolean)) return '';
  const tb = timedBlocks(t);
  return '<div class="pfph">' + L.map((p, k) => p ? '<figure onclick="pfZoom(' + k + ',\'' + s.id + '\')"><img src="' + p.src + '" alt=""><figcaption>' + escapeHtml((tb[k] && tb[k].b.title ? tb[k].b.title.split(' · ')[0] : 'Course ' + (k + 1))) + '</figcaption></figure>' : '').join('') + '</div>';
}
function pfZoom(k, sid) {
  const t = tplById($('resultTpl').value) || tplById((state.scans.find(x => x.id === editing) || {}).templateId), pft = t && pfTimes(t), p = pft && pft.ph[sid] && pft.ph[sid][k]; if (!p) return;
  const st = state.students.find(x => x.id === sid), o = document.createElement('div'); o.className = 'pfzoom';
  o.innerHTML = '<div><img src="' + p.src + '" alt=""><p><b>' + escapeHtml(st ? st.name : '') + '</b> · ' + escapeHtml(p.label) + '</p><button>Fermer</button></div>';
  o.onclick = () => o.remove(); document.body.appendChild(o);
}
async function pfSet(k, v) { const t = tplById($('resultTpl').value), P = pfData(t.id); if (k === 'tol') P.tol = Math.max(0, +String(v).replace(',', '.') || 0); else if (k.startsWith('c')) P.files[+k.slice(1)].course = v; else if (k.startsWith('x')) P.files.splice(+k.slice(1), 1); await persist(); renderResults(); }

/* ---------- Alertes de contrôle ---------- */
function controlAlerts(t, s, r, pft) {
  if (!t || !s || !r) return [];
  const out = [], n = (s.notes || {})[t.id] || {}, m = metrics(t, r.values);
  estBlocks(t).forEach(({ b, bi, er }) => {
    const a = n['ann' + bi], f = r.values[er.id];
    if (a && sec(a) !== sec(f)) out.push({ kind: 'est', key: 'est' + bi + ':' + a + '/' + (f || ''), rowId: er.id, val: a, cur: f || '', text: (b.title || 'Course') + ' : estimation annoncée ' + a + (f ? ', mais ' + f + ' sur la fiche' : ', rien sur la fiche') });
  });
  // fractions incohérentes (souvent un temps de passage mal noté ou mal lu)
  timedBlocks(t).forEach(({ b, bi }) => { const sg = (m.blocks[bi].segs || []).filter(x => x != null); if (sg.length >= 2 && Math.min(...sg) > 0 && Math.max(...sg) > 1.8 * Math.min(...sg)) out.push({ kind: 'seg', key: 'seg' + bi + ':' + sg.join('/'), cur: '', text: (b.title ? b.title.split(' · ')[0] + ' : ' : '') + 'fractions très différentes (' + sg.map(fmt).join(' puis ') + ') — vérifie les temps de passage' }); });
  pft = pft === undefined ? pfTimes(t) : pft;
  const pf = pft && pft.by[s.id];
  if (pf) timedBlocks(t).forEach(({ b, bi }, k) => {
    const p = pf[k], f = m.blocks[bi].final; if (p === undefined) return;
    const fr = b.rows.filter(x => x.type === 'time' && !isEst(x)).pop(), pv = p === 'dnf' ? null : Math.floor(p / 60) + ':' + String(Math.floor(p % 60)).padStart(2, '0');
    if (p === 'dnf') { out.push({ kind: 'pf', key: 'pf' + bi + ':dnf', text: (b.title || 'Course') + ' : non classé dans PhotoFinish' }); return; }
    if (f == null) { out.push({ kind: 'pf', key: 'pf' + bi + ':' + pv + '/', rowId: fr && fr.id, val: pv, cur: '', text: (b.title || 'Course') + ' : PhotoFinish ' + fmtPF(p) + ', pas de temps final sur la fiche' }); return; }
    const d = f - p; if (Math.abs(d) > pft.tol) out.push({ kind: 'pf', key: 'pf' + bi + ':' + pv + '/' + fmt(f), rowId: fr && fr.id, val: pv, cur: fmt(f), text: (b.title || 'Course') + ' : fiche ' + fmt(f) + ' · PhotoFinish ' + fmtPF(p) + ' (écart ' + sgn(d) + ' s)' });
  });
  return out.filter(a => !(r.ack || {})[a.key]);
}
// Réponse rapide à une alerte : garder la fiche telle quelle, ou prendre la valeur annoncée / PhotoFinish
async function ctrlAnswer(rid, key, take) {
  const r = state.scans.find(x => x.id === rid); if (!r) return;
  const t = tplById(r.templateId), s = state.students.find(x => x.id === r.studentId), a = controlAlerts(t, s, r).find(x => x.key === key); if (!a) return;
  if (take && a.rowId) { r.values = Object.assign({}, r.values, { [a.rowId]: a.val }); r.issues = (r.issues || []).concat('Corrigé : ' + a.text.split(' : ')[0] + ' → ' + a.val + (a.kind === 'pf' ? ' (PhotoFinish)' : ' (annoncée)')); }
  r.ack = Object.assign({}, r.ack, { [take ? key.split(':')[0] + ':' + a.val + '/' + a.val : key]: true, [key]: true });
  if (!controlAlerts(t, s, r).length) r.status = 'validated';
  r.updated = new Date().toISOString(); await persist();
  if ($('scan') && !$('scan').classList.contains('hidden') && editing === rid) editScan(rid); else renderResults();
}
function ctrlButtons(r, a) {
  const go = take => 'onclick="ctrlAnswer(\'' + r.id + '\',\'' + escapeHtml(a.key) + '\',' + take + ')"';
  const mine = a.kind === 'seg' ? '✓ Les temps sont justes<small>valider</small>' : a.kind === 'pf' ? (a.cur ? '✓ Valider le chrono élève<small>' + escapeHtml(a.cur) + '</small>' : '✓ Valider quand même<small>sans temps PhotoFinish</small>') : '✓ Valider la fiche<small>' + escapeHtml(a.cur || 'vide') + '</small>';
  return '<div class="cbtns"><button class="cb-me" ' + go(false) + '>' + mine + '</button>' + (a.rowId && a.val ? '<button class="cb-' + a.kind + '" ' + go(true) + '>' + (a.kind === 'pf' ? '⏱ Valider PhotoFinish' : '📝 Valider l’annoncée') + '<small>' + escapeHtml(a.val) + '</small></button>' : '') + '</div>';
}
const _scanStateBase = scanState;
scanState = function (r) {
  const st = _scanStateBase(r);
  if (st === 'auto') { const t = tplById(r.templateId), s = state.students.find(x => x.id === r.studentId); if (controlAlerts(t, s, r).length) return 'check'; }
  return st;
};
let ctrlAll = false;
async function ctrlBulk(mode) {
  const t = tplById($('resultTpl').value), c = $('resultClass').value, pft = pfTimes(t);
  const list = resultStudents(c, t).map(s => ({ s, r: latestScan(s.id, t.id) })).filter(x => x.r);
  const lbl = mode === 'pf' ? 'prendre le temps PhotoFinish pour tous les écarts de temps' : mode === 'est' ? 'prendre l’estimation annoncée pour toutes les estimations modifiées' : 'garder le temps écrit sur toutes les fiches (toutes les alertes)';
  if (!confirm('Pour toute la classe : ' + lbl + ' ?')) return;
  let n = 0;
  for (const { s, r } of list) for (const a of controlAlerts(t, s, r, pft)) {
    const take = (mode === 'pf' && a.kind === 'pf') || (mode === 'est' && a.kind === 'est');
    if (mode && !take) continue;
    if (take && a.rowId) { r.values = Object.assign({}, r.values, { [a.rowId]: a.val }); r.issues = (r.issues || []).concat('Corrigé : ' + a.text.split(' : ')[0] + ' → ' + a.val + (a.kind === 'pf' ? ' (PhotoFinish)' : ' (annoncée)')); }
    r.ack = Object.assign({}, r.ack, { [a.key]: true }); n++;
    if (!controlAlerts(t, s, r, pft).length) r.status = 'validated';
    r.updated = new Date().toISOString();
  }
  await persist(); renderResults();
}
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
      '<table><thead><tr><th>Fichier</th><th>Élèves</th><th>Course</th><th></th></tr></thead><tbody>' + P.files.map((f, i) => '<tr><td>' + escapeHtml(f.title) + ' · ' + escapeHtml(f.meta) + (f.photos && f.photos.length ? ' <small>📷 ' + f.photos.filter(Boolean).length + '</small>' : ' <small class="muted">sans photo (réimporter)</small>') + '</td><td>' + f.rows.length + '</td><td><select onchange="pfSet(\'c' + i + '\',this.value)">' + [['auto', 'Automatique'], ...timedBlocks(t).map((x, k) => [String(k + 1), x.b.title || 'Course ' + (k + 1)])].map(([v, l]) => '<option value="' + v + '"' + (String(f.course) === v ? ' selected' : '') + '>' + escapeHtml(l) + '</option>').join('') + '</select></td><td><button class="mini" onclick="pfSet(\'x' + i + '\')">Retirer</button></td></tr>').join('') + '</tbody></table>' +
      '<p class="muted">« Automatique » : pour chaque élève, sa 1re course dans l’ordre des heures = ' + escapeHtml(timedBlocks(t)[0]?.b.title || 'course 1') + ', la 2e = ' + escapeHtml(timedBlocks(t)[1]?.b.title || 'course 2') + '. Pas besoin de renommer les fichiers.</p>' +
      (pft.unknown.length ? '<p class="notice">Noms PhotoFinish non reconnus : ' + pft.unknown.map(escapeHtml).join(', ') + '</p>' : '') +
      (missPF.length ? '<p class="muted">Sans temps PhotoFinish : ' + missPF.map(s => escapeHtml(s.name)).join(', ') + '</p>' : '') + '</details>';
  }
  const nA = alerts.reduce((n, x) => n + x.a.length, 0), many = alerts.length > 4 && !ctrlAll, shown = many ? alerts.slice(0, 4) : alerts;
  if (alerts.length) h += '<div class="ctrl-alert"><h3>🚨 ' + alerts.length + ' élève(s) à contrôler</h3>' +
    '<div class="cbulk"><span>Tout d’un coup :</span><button class="cb-me" onclick="ctrlBulk(false)">✓ Garder tous les temps des fiches</button>' + (alerts.some(x => x.a.some(a => a.kind === 'pf' && a.rowId)) ? '<button class="cb-pf" onclick="ctrlBulk(\'pf\')">⏱ Tout prendre de PhotoFinish</button>' : '') + (alerts.some(x => x.a.some(a => a.kind === 'est')) ? '<button class="cb-est" onclick="ctrlBulk(\'est\')">📝 Toutes les estimations annoncées</button>' : '') + '</div><ul>' + shown.map(x => '<li><b>' + escapeHtml(x.s.name) + '</b>' + x.a.map(a => '<div class="citem"><span>' + escapeHtml(a.text) + '</span>' + ctrlButtons(x.r, a) + '</div>').join('') + (x.a.some(a => a.kind === 'pf') ? pfThumbs(pft, x.s, t) : '') + '<button class="linkbtn" onclick="editScan(\'' + x.r.id + '\')">Voir la photo de la fiche</button></li>').join('') + '</ul>' + (many ? '<button class="secondary" onclick="ctrlAll=true;renderControls()">Voir les ' + (alerts.length - 4) + ' autres élèves</button>' : '') + '</div>';
  else if (hasAnn || (P && P.files.length)) h += '<p class="ctrl-ok">✓ Aucune différence avec ' + [hasAnn ? 'les estimations annoncées' : '', P && P.files.length ? 'PhotoFinish (± ' + nf(pft.tol) + ' s)' : ''].filter(Boolean).join(' ni avec ') + '.</p>';
  box.innerHTML = h;
}
const _renderResultsBase = renderResults;
renderResults = function () { _renderResultsBase(); try { renderControls(); } catch (e) { console.error(e); } };
const _editScanBase = editScan;
editScan = function (id) {
  _editScanBase(id); const r = state.scans.find(x => x.id === id); if (!r) return;
  const t = tplById(r.templateId), s = state.students.find(x => x.id === r.studentId), a = controlAlerts(t, s, r), th = s && t ? pfThumbs(pfTimes(t), s, t) : '';
  let el = $('scanCtrl'); if (!el) { el = document.createElement('div'); el.id = 'scanCtrl'; $('scanIssues').parentNode.insertBefore(el, $('scanIssues')); }
  el.innerHTML = (a.length ? '<div class="ctrl-alert"><h3>🚨 À contrôler</h3><ul>' + a.map(x => '<li><div class="citem"><span>' + escapeHtml(x.text) + '</span>' + ctrlButtons(r, x) + '</div></li>').join('') + '</ul>' + th + '</div>' : (th ? '<div class="pfbox"><b>⏱ Photos d’arrivée PhotoFinish</b>' + th + '</div>' : ''));
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
    const ph = k >= 0 && pft && pft.ph && pft.ph[s.id] && pft.ph[s.id][k];
    return '<div class="course"><h3>' + escapeHtml(b.title || 'Relevé') + '</h3><table><thead><tr><th></th><th>Temps</th><th>' + (times.length > 1 ? 'Fraction' : '') + '</th></tr></thead><tbody>' + rows + '</tbody></table>' + (ph ? '<figure class="arr"><img src="' + ph.src + '" alt=""><figcaption>Photo d’arrivée · ' + escapeHtml(ph.label) + '</figcaption></figure>' : '') + '</div>';
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
function exportDetail(tid, cid) {
  const t = tplById(tid || $('resultTpl').value); if (!t) return;
  const sel = cid || $('resultClass').value, cids = sel === '*' ? classesUsing(t) : [sel], pft = pfTimes(t);
  const css = 'body{font-family:system-ui,-apple-system,sans-serif;color:#18314c;margin:24px;background:#f5f7fb}h1{color:#123d66;margin:0}.sub{color:#5a6f85}.cover{min-height:80vh;display:flex;flex-direction:column;justify-content:center;border:3px solid #123d66;border-radius:18px;padding:40px;margin-bottom:30px;background:#fff}.cover h1{font-size:34px}.kv{font-size:18px;margin:6px 0}.eleve{background:#fff;border-radius:16px;padding:16px 20px;margin:16px 0;box-shadow:0 4px 14px rgba(0,0,0,.06);break-inside:avoid}.eleve h2{margin:0 0 10px;color:#123d66}.eleve h2 small{font-size:14px;color:#5a6f85;font-weight:500}.courses{display:flex;gap:16px;flex-wrap:wrap}.course{flex:1;min-width:260px}.course h3{margin:4px 0;color:#1267a5}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #e3eaf2;padding:5px 8px;text-align:left;font-size:14px}th{color:#5a6f85;font-weight:600}tr.fin td{background:#eef6ff}.sum{background:#f2f6fb;border-radius:10px;padding:8px 12px}.al{background:#fee2e2;color:#991b1b;border-radius:10px;padding:8px 12px;font-weight:700}.etat{color:#5a6f85;font-size:13px}.arr{margin:10px 0 0}.arr img{width:100%;max-width:240px;border-radius:10px;display:block}.arr figcaption{color:#5a6f85;font-size:12px;margin-top:3px}@media print{.arr img{max-width:160px}body{background:#fff;margin:10mm}.cover{min-height:250mm;break-after:page}.eleve{box-shadow:none;border:1px solid #d5e0ea}}';
  const body = cids.map(c => '<h1 style="margin-top:30px">' + escapeHtml(className(c)) + '</h1>' + resultStudents(c, t).map(s => studentDetail(t, s, pft)).join('')).join('');
  const doc = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escapeHtml(t.name) + ' — bilan détaillé</title><style>' + css + '</style></head><body>' + coverHTML(t, cids, 'Bilan détaillé par élève') + body + '</body></html>';
  download('bilan-' + slug(t.name) + '-' + (sel === '*' ? 'toutes-classes' : slug(className(cids[0]))) + '.html', doc, 'text/html;charset=utf-8');
}

/* ---------- Tableau des résultats : noms et en-têtes figés ---------- */
(() => { const st = document.createElement('style'); st.textContent = `
.pfph{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0}
.pfph figure{margin:0;cursor:pointer;text-align:center}
.pfph img{height:130px;border-radius:10px;display:block;box-shadow:0 2px 8px rgba(0,0,0,.15)}
.pfph figcaption{font-size:12px;color:#5a6f85;margin-top:3px}
.pfzoom{position:fixed;inset:0;background:rgba(10,20,30,.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px}
.pfzoom>div{max-width:min(92vw,560px);text-align:center;color:#fff}
.pfzoom img{max-width:100%;max-height:78vh;border-radius:12px;display:block;margin:0 auto}
.pfzoom button{margin-top:8px}
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
  const t = JSON.parse(JSON.stringify(s)); t.id = sid('t'); t.lay = 2; t.name = name.trim(); t.locked = false; t.printedFor = []; t.createdAt = today();
  t.blocks.forEach(b => b.rows.forEach(r => { r.id = sid('r'); }));
  state.templates.push(t); await persist(); render();
  alert('« ' + t.name + ' » est prête : même fiche, même barème, résultats séparés.\nLes choix AFL2-AFL3 des élèves sont repris.\nImprime maintenant les fiches de la classe.');
  openEval({ tplId: t.id });
}

/* ---------- Tableau des résultats : afficher un seul AFL / critère à la fois ---------- */
let resFilter = 'all';
(() => { const st = document.createElement('style'); st.textContent = `
.afltabs{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 4px}.afltabs button{min-height:52px;font-size:17px;padding:10px 18px;border-radius:14px;background:#f1eefc;color:#3a3560;box-shadow:none}
.afltabs button.on{color:#fff}.afltabs button.t-all.on{background:#3a3560}.afltabs button.t-a1.on{background:#3b82f6}.afltabs button.t-a2.on{background:#12a36b}.afltabs button.t-a3.on{background:#f5b400;color:#3a2a00}.afltabs button.t-a4.on{background:#0ea5b7}.afltabs button.t-a5.on{background:#ff5c8a}.afltabs button.t-a6.on{background:#6c4cf5}
#resultsTable.filtered{min-width:0}
`; document.head.appendChild(st); })();
const grpOf = el => { const m = (el.className || '').match(/\ba([1-6])s?\b/); return m ? 'a' + m[1] : null; };
function applyResFilter() {
  const tb = $('resultsTable'); if (!tb || !tb.tHead) return;
  const groups = [...(tb.tHead.rows[0] ? tb.tHead.rows[0].cells : [])].filter(grpOf).map(c => ({ k: grpOf(c), label: c.textContent.split('/')[0].trim() }));
  let bar = $('aflTabs');
  if (!groups.length) { if (bar) bar.innerHTML = ''; return; }
  if (!groups.some(g => g.k === resFilter)) resFilter = 'all';
  if (!bar) { bar = document.createElement('div'); bar.id = 'aflTabs'; bar.className = 'afltabs'; const tw = document.querySelector('#results .tablewrap'); tw.parentNode.insertBefore(bar, tw); }
  bar.innerHTML = '<button class="t-all' + (resFilter === 'all' ? ' on' : '') + '" onclick="resFilter=\'all\';applyResFilter()">Tout</button>' + groups.map(g => '<button class="t-' + g.k + (resFilter === g.k ? ' on' : '') + '" onclick="resFilter=\'' + g.k + '\';applyResFilter()">' + escapeHtml(g.label) + '</button>').join('');
  tb.querySelectorAll('th,td').forEach(c => { const g = grpOf(c); c.style.display = resFilter !== 'all' && g && g !== resFilter ? 'none' : ''; });
  // colonnes communes inutiles pour l'AFL affiché : F/G seulement pour la performance, choix seulement pour les AFL au choix
  const firstK = groups[0] && groups[0].k, hide = new Set(); let col = 0;
  [...tb.tHead.rows[0].cells].forEach(c => { const t = c.textContent; if (!grpOf(c) && resFilter !== 'all') { if (/^F\/G/.test(t) && resFilter !== firstK) hide.add(col); if (/^Choix/.test(t) && resFilter === firstK) hide.add(col); } if (hide.has(col)) c.style.display = 'none'; col += c.colSpan; });
  if (hide.size) [...tb.tBodies[0].rows].forEach(tr => { let k = 0; [...tr.cells].forEach(c => { if (hide.has(k)) c.style.display = 'none'; k += c.colSpan; }); });
  tb.classList.toggle('filtered', resFilter !== 'all');
  try { stickyResults(); } catch (e) { }
  const w = document.querySelector('#results .tablewrap'); if (w && resFilter !== 'all') w.scrollLeft = 0;
}
const _renderResultsFilter = renderResults;
renderResults = function () { _renderResultsFilter(); try { applyResFilter(); } catch (e) { console.error(e); } };

/* ---------- Liste de classe pour PhotoFinish (mêmes noms → comparaison automatique) ---------- */
async function pfExportClass(cid) {
  const c = state.classes.find(x => x.id === cid); if (!c) return;
  const studs = state.students.filter(s => s.classId === cid).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  if (!studs.length) return alert('Cette classe n’a pas d’élève.');
  const q = v => /[;"\n]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : v;
  // une seule valeur de classe (le nom du groupe) : PhotoFinish garde le groupe entier en une classe
  const csv = '﻿Nom;Classe\n' + studs.map(s => q(s.name) + ';' + q(c.name)).join('\n') + '\n', name = 'photofinish-' + slug(c.name) + '.csv';
  const file = new File([csv], name, { type: 'text/csv' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Liste ' + c.name + ' pour PhotoFinish' }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  download(name, csv, 'text/csv;charset=utf-8');
  alert('Liste « ' + c.name + ' » téléchargée (' + studs.length + ' élèves).\n\nDans PhotoFinish : Importer CSV → choisis ce fichier.');
}
