'use strict';
/* ScanDocument EPS — « Ma séance » : une classe + une fiche, toutes les étapes dans l'ordre, sur un seul écran. */

(() => { const st = document.createElement('style'); st.textContent = `
.sbanner{display:flex;align-items:center;gap:18px;flex-wrap:wrap;padding:22px 24px;border-radius:26px;color:#fff;margin:6px 0 18px;background:linear-gradient(135deg,#0f766e,#0ea5e9);box-shadow:0 14px 34px rgba(14,165,233,.28)}
.sbanner h3{margin:0;font-size:24px}.sbanner p{margin:4px 0 0;opacity:.92;font-size:16px}.sbanner .grow{flex:1;min-width:240px}
.sbanner button{min-height:62px;font-size:19px;font-weight:900;border-radius:18px;padding:12px 22px;background:#fff;color:#0f5f73;box-shadow:0 6px 16px rgba(0,0,0,.15)}
.sbanner button.ghost{background:rgba(255,255,255,.18);color:#fff;box-shadow:none;border:2px solid rgba(255,255,255,.6);font-size:16px;min-height:52px}
.spick{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;margin:12px 0 20px}
.spick button{display:block;min-height:92px;font-size:20px;font-weight:900;border-radius:20px;background:#fff;color:#1e1b3a;border:3px solid #e5e0f5;box-shadow:0 6px 16px rgba(60,40,140,.08);text-align:left;padding:16px 18px;line-height:1.2}
.spick button small{display:block;font-size:14px;font-weight:600;color:#6b6890;margin-top:4px}.spick button.on{border-color:#0ea5e9;background:#f0f9ff}
.spick label.btn{min-height:92px;display:flex;align-items:center;justify-content:center;border-radius:20px;font-size:17px;border:3px dashed #c7d2fe;background:#f8faff;color:#4338ca;font-weight:800;text-align:center;padding:12px}
.shead{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:6px}.shead h2{margin:0;font-size:28px}.shead .grow{flex:1}
.sstep{display:flex;align-items:center;gap:16px;flex-wrap:wrap;background:#fff;border:3px solid #ece8fb;border-radius:22px;padding:16px 18px;margin:12px 0}
.sstep .num{width:52px;height:52px;flex:none;border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:900;background:#ece8fb;color:#4b3fa8}
.sstep.done{border-color:#bbf7d0;background:#f6fef9}.sstep.done .num{background:#22c55e;color:#fff}
.sstep.next{border-color:#0ea5e9;box-shadow:0 10px 26px rgba(14,165,233,.22)}.sstep.next .num{background:#0ea5e9;color:#fff}
.sstep.opt{opacity:.92}.sstep .txt{flex:1;min-width:230px}.sstep h3{margin:0;font-size:20px}.sstep p{margin:4px 0 0;color:#5b587a;font-size:15px}
.sstep .stat{font-weight:900;font-size:16px;padding:6px 12px;border-radius:999px;background:#f1eefc;color:#4b3fa8;white-space:nowrap}.sstep.done .stat{background:#dcfce7;color:#166534}.sstep .stat.warn{background:#fee2e2;color:#991b1b}
.sstep .acts{display:flex;gap:10px;flex-wrap:wrap}.sstep .acts button,.sstep .acts label.btn{min-height:58px;font-size:17px;font-weight:800;border-radius:16px;padding:10px 18px}
.sstep.next .acts button:first-child,.sstep.next .acts label.btn:first-child{background:linear-gradient(135deg,#0284c7,#38bdf8);color:#fff}
.sopt{font-size:13px;font-weight:700;color:#7c7aa0;margin-left:6px}
#seanceChip{display:none;min-height:44px;border-radius:14px;padding:6px 14px;font-weight:900;background:linear-gradient(135deg,#0f766e,#0ea5e9);color:#fff;margin-right:8px;font-size:15px}
`; document.head.appendChild(st); })();

let seanceNew = null; // { classId, tplId } pendant le choix
const curSeance = () => (state.seances || []).find(x => x.id === state.seanceCur && state.classes.some(c => c.id === x.classId) && tplById(x.tplId)) || null;

function seanceOpen(fresh) {
  if (fresh || !curSeance()) seanceNew = { classId: state.classes.length === 1 ? state.classes[0].id : null, tplId: null };
  else seanceNew = null;
  view('seance');
}
async function seanceStart() {
  const n = seanceNew; if (!n || !n.classId || !n.tplId) return;
  state.seances = state.seances || [];
  let s = state.seances.find(x => x.classId === n.classId && x.tplId === n.tplId);
  if (!s) { s = { id: sid('s'), classId: n.classId, tplId: n.tplId, created: today() }; state.seances.push(s); }
  state.seanceCur = s.id; seanceNew = null; await persist(); view('seance');
}
async function seanceSwitch(id) { state.seanceCur = id; seanceNew = null; await persist(); view('seance'); }
async function seanceFlag(k) { const s = curSeance(); if (s) { s[k] = true; await persist(); } }

function seanceStatus(se) {
  const t = tplById(se.tplId), cid = se.classId, studs = state.students.filter(s => s.classId === cid);
  const active = studs.filter(s => !(((s.notes || {})[t.id] || {}).disp));
  const scanned = active.filter(s => latestScan(s.id, t.id)).length;
  const queue = state.queue.filter(q => q.classId === cid).length;
  const pft = pfTimes(t), P = (state.pf || {})[t.id];
  let alerts = 0, check = 0, valid = 0;
  for (const s of active) { const r = latestScan(s.id, t.id); if (!r) continue; const st = scanState(r); if (controlAlerts(t, s, r, pft).length) alerts++; else if (st === 'check') check++; if (st === 'validated') valid++; }
  const eb = estBlocks(t), annN = eb.length ? active.filter(s => eb.every(x => ((s.notes || {})[t.id] || {})['ann' + x.bi])).length : 0;
  return { t, cid, n: active.length, scanned, queue, pfFiles: P ? P.files.length : 0, alerts, check, valid, printed: (t.printedFor || []).some(p => p.classId === cid), hasEst: !!eb.length, annN, hasBar: !!(t.bareme && bar(t.bareme)), hasTime: timedBlocks(t).length > 0 };
}

function renderSeance() {
  const sec = $('seance'); if (!sec || sec.classList.contains('hidden')) return;
  const se = curSeance();
  if (seanceNew || !se) { sec.innerHTML = seanceSetupHTML(); return; }
  const S = seanceStatus(se), t = S.t, cid = S.cid, q = x => '\'' + x + '\'';
  const steps = [];
  steps.push({ key: 'print', must: true, done: S.printed, title: 'Imprimer les fiches', text: 'Une fiche par élève, avec son nom et son QR code. Taille réelle (100 %).', stat: S.printed ? 'imprimées' : S.n + ' fiches',
    acts: '<button onclick="seancePrint(\'print\')">🖨 Imprimer</button><button class="secondary" onclick="seancePrint(\'zip\')">📁 Télécharger</button>' });
  if (S.hasTime) steps.push({ key: 'pfl', opt: true, done: !!se.pfList, title: 'Envoyer la liste à PhotoFinish', text: 'Seulement si tu filmes les arrivées. Les noms seront les mêmes dans les deux applis.', stat: se.pfList ? 'envoyée' : 'facultatif',
    acts: '<button class="secondary" onclick="seanceFlag(\'pfList\');pfExportClass(' + q(cid) + ')">⏱ Envoyer la liste</button>' });
  if (S.hasEst) steps.push({ key: 'ann', opt: true, done: S.annN === S.n && S.n > 0, title: 'Avant chaque course : estimations annoncées', text: 'Note le temps que chaque élève annonce. Si la fiche dit autre chose, alerte rouge.', stat: S.annN + ' / ' + S.n,
    acts: '<button class="secondary" onclick="annOpen(' + q(t.id) + ',' + q(cid) + ')">📝 Saisir les estimations</button>' });
  steps.push({ key: 'scan', must: true, done: S.scanned >= S.n && S.n > 0 && !S.queue, title: 'Scanner les fiches remplies', text: 'Pose les fiches une à une sous l’iPad : la photo se prend toute seule.', stat: S.scanned + ' / ' + S.n + (S.queue ? ' · ⚠ ' + S.queue + ' à vérifier' : ''), warn: !!S.queue,
    acts: '<button onclick="rafaleOpen(' + q(cid) + ',\'seance\')">📸 Scanner</button>' + (S.queue ? '<button class="secondary" onclick="$(\'batchClass\').value=' + q(cid) + ';view(\'batch\')">Voir les ' + S.queue + ' fiches à vérifier</button>' : '') + '<button class="secondary" onclick="$(\'batchClass\').value=' + q(cid) + ';view(\'batch\')">Depuis mes photos</button>' });
  if (S.hasTime) steps.push({ key: 'pf', opt: true, done: S.pfFiles > 0, title: 'Comparer avec PhotoFinish', text: 'Choisis tous les fichiers de résultats PhotoFinish du jour, d’un coup.', stat: S.pfFiles ? S.pfFiles + ' course(s)' : 'facultatif',
    acts: '<label class="btn secondary">⏱ Importer PhotoFinish<input type="file" accept=".html,.htm,text/html" multiple style="display:none" data-tid="' + t.id + '" onchange="pfImport(event)"></label>' });
  steps.push({ key: 'ctrl', must: true, done: S.scanned > 0 && !S.alerts && !S.check && !S.queue, title: S.hasBar ? 'Contrôler et noter' : 'Contrôler les résultats', text: S.hasBar ? 'Règle les alertes rouges, puis note par AFL (onglets AFL1, AFL2, AFL3).' : 'Règle les alertes rouges. Pas de barème sur cette fiche : tu as les temps (barème à ajouter quand tu veux).', stat: S.alerts ? '🚨 ' + S.alerts + ' alerte(s)' : S.check ? S.check + ' à vérifier' : S.valid + ' validée(s)', warn: !!(S.alerts || S.check),
    acts: '<button onclick="goResults(' + q(t.id) + ',' + q(cid) + ')">📊 Ouvrir les résultats</button>' });
  steps.push({ key: 'exp', must: true, done: !!se.exported, title: 'Exporter', text: 'Garde une trace : archive complète, bilan par élève' + (S.hasBar ? ', export Santorin' : '') + '.', stat: se.exported ? 'fait' : '',
    acts: '<button onclick="seanceFlag(\'exported\');exportHTML(' + q(t.id) + ',' + q(cid) + ')">📄 Archive</button><button class="secondary" onclick="seanceFlag(\'exported\');exportDetail(' + q(t.id) + ',' + q(cid) + ')">📑 Bilan par élève</button>' + (S.hasBar ? '<button class="secondary" onclick="seanceFlag(\'exported\');exportSantorin(' + q(t.id) + ',' + q(cid) + ')">🎓 Santorin</button>' : '') });
  const next = steps.find(x => x.must && !x.done);
  const others = (state.seances || []).filter(x => x.id !== se.id && state.classes.some(c => c.id === x.classId) && tplById(x.tplId)).slice(-6).reverse();
  sec.innerHTML = '<button class="back" onclick="view(\'home\')">← Accueil</button>' +
    '<div class="shead"><div class="grow"><h2>' + escapeHtml(className(cid)) + ' · ' + escapeHtml(t.name) + '</h2><p class="muted" style="margin:4px 0 0">Suis les étapes dans l’ordre. Tout est enregistré : tu peux t’arrêter et reprendre plus tard.</p></div>' +
    '<button class="secondary" onclick="seanceOpen(true)">＋ Autre séance</button>' + (others.length ? '<select onchange="if(this.value)seanceSwitch(this.value)"><option value="">Reprendre…</option>' + others.map(x => '<option value="' + x.id + '">' + escapeHtml(className(x.classId) + ' · ' + tplById(x.tplId).name) + '</option>').join('') + '</select>' : '') + '</div>' +
    steps.map((x, i) => '<div class="sstep' + (x.done ? ' done' : '') + (x === next ? ' next' : '') + (x.opt ? ' opt' : '') + '"><div class="num">' + (x.done ? '✓' : i + 1) + '</div><div class="txt"><h3>' + escapeHtml(x.title) + (x.opt ? '<span class="sopt">facultatif</span>' : '') + '</h3><p>' + escapeHtml(x.text) + '</p></div>' + (x.stat ? '<span class="stat' + (x.warn ? ' warn' : '') + '">' + escapeHtml(x.stat) + '</span>' : '') + '<div class="acts">' + x.acts + '</div></div>').join('') +
    (next ? '' : '<p class="ctrl-ok" style="font-size:18px">🎉 Séance terminée : tout est scanné, contrôlé et exporté.</p>');
}
function seanceSetupHTML() {
  const n = seanceNew || (seanceNew = { classId: null, tplId: null }), q = x => '\'' + x + '\'';
  const cls = state.classes.slice().sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }));
  let h = '<button class="back" onclick="seanceNew=null;view(curSeance()?\'seance\':\'home\')">← Retour</button><h2 style="font-size:30px;margin:6px 0 2px">Nouvelle séance</h2><p class="muted" style="font-size:17px;margin:0 0 10px">Deux choix, puis tout se fait sur un seul écran.</p>';
  h += '<h3 style="font-size:22px;margin:18px 0 0">1 · Quelle classe ?</h3><div class="spick">' + cls.map(c => '<button class="' + (n.classId === c.id ? 'on' : '') + '" onclick="seanceNew.classId=' + q(c.id) + ';renderSeance()">' + escapeHtml(c.name) + '<small>' + state.students.filter(s => s.classId === c.id).length + ' élèves</small></button>').join('') +
    '<label class="btn">＋ Importer une classe<br>(liste PRONOTE)<input type="file" accept=".csv,.txt,text/csv" style="display:none" onchange="importRoster(event).then(()=>{const c=state.classes[state.classes.length-1];if(c)seanceNew.classId=c.id;renderSeance();})"></label></div>';
  if (n.classId) {
    h += '<h3 style="font-size:22px;margin:18px 0 0">2 · Quelle fiche ?</h3><div class="spick">' + state.templates.map(t => '<button class="' + (n.tplId === t.id ? 'on' : '') + '" onclick="seanceNew.tplId=' + q(t.id) + ';renderSeance();setTimeout(()=>{const g=$(\'seanceGo\');if(g)g.scrollIntoView({behavior:\'smooth\',block:\'center\'})},50)">' + escapeHtml(t.name) + '<small>' + ((t.printedFor || []).some(p => p.classId === n.classId) ? 'déjà imprimée pour cette classe' : (LIB_DESC[t.id] || (t.bareme ? 'avec barème' : 'temps seulement'))) + '</small></button>').join('') +
      '<button style="border-style:dashed;color:#4338ca;background:#f8faff" onclick="openFicheWizard()">＋ Créer une fiche<small>distance, nombre de courses, temps de passage</small></button></div>';
  }
  if (n.classId && n.tplId) h += '<button id="seanceGo" style="width:100%;min-height:76px;font-size:24px;font-weight:900;border-radius:22px;background:linear-gradient(135deg,#0f766e,#0ea5e9)" onclick="seanceStart()">C’est parti →</button>';
  return h;
}
async function seancePrint(mode) {
  const se = curSeance(); if (!se) return;
  openEval({ tplId: se.tplId, classId: se.classId });
  if (mode === 'zip') await evDownload(); else await evPrint();
  view('seance');
}
function renderSeanceHome() {
  const home = $('home'); if (!home) return;
  let b = $('seanceBanner'); if (!b) { b = document.createElement('div'); b.id = 'seanceBanner'; const hello = home.querySelector('.hello'); hello.parentNode.insertBefore(b, hello.nextSibling); }
  const se = curSeance();
  if (se) { const S = seanceStatus(se); b.innerHTML = '<div class="sbanner"><div class="grow"><h3>▶ Reprendre ma séance</h3><p><b>' + escapeHtml(className(se.classId)) + ' · ' + escapeHtml(S.t.name) + '</b> — ' + (S.printed ? S.scanned + ' / ' + S.n + ' fiches scannées' + (S.alerts ? ' · 🚨 ' + S.alerts + ' alerte(s)' : '') : 'fiches pas encore imprimées') + '</p></div><button onclick="seanceOpen()">Reprendre →</button><button class="ghost" onclick="seanceOpen(true)">＋ Nouvelle séance</button></div>'; }
  else b.innerHTML = '<div class="sbanner"><div class="grow"><h3>Démarrer une séance</h3><p>Choisis ta classe et ta fiche : l’appli te guide ensuite étape par étape, de l’impression aux notes.</p></div><button onclick="seanceOpen(true)">▶ Démarrer</button></div>';
  let chip = $('seanceChip');
  if (!chip) { chip = document.createElement('button'); chip.id = 'seanceChip'; chip.onclick = () => seanceOpen(); const sp = document.querySelector('header.top .sp'); sp.parentNode.insertBefore(chip, sp.nextSibling); }
  const vis = document.querySelector('main section:not(.hidden)'), on = vis && !['seance', 'cover', 'home'].includes(vis.id);
  chip.textContent = '▶ Ma séance'; chip.style.display = se && on ? 'inline-block' : 'none';
}
const _renderSeanceBase = render;
render = function () { _renderSeanceBase(); try { renderSeance(); renderSeanceHome(); } catch (e) { console.error(e); } };
