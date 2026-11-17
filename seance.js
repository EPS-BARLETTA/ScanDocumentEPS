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
#seance .shead select{min-height:48px}
.stepper{display:flex;align-items:center;gap:0;margin:14px 0 18px;overflow-x:auto;padding:4px 2px}
.stepper i{flex:1;min-width:14px;height:3px;background:#e2ddf5;border-radius:3px}
.stepper button{flex:none;display:flex;flex-direction:column;align-items:center;gap:4px;background:none;box-shadow:none;padding:2px 4px;min-height:0;color:#6b6890}
.stepper button span{width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;background:#f1eefc;border:3px solid #e2ddf5}
.stepper button small{font-size:12px;font-weight:800}
.stepper button.ok span{background:#22c55e;border-color:#22c55e;color:#fff;font-weight:900}.stepper button.ok small{color:#15803d}
.stepper button.cur span{background:#0ea5e9;border-color:#bae6fd;color:#fff;transform:scale(1.15)}.stepper button.cur small{color:#0369a1}
.focus{background:#fff;border-radius:28px;padding:30px 32px;box-shadow:0 18px 44px rgba(14,165,233,.16);border:3px solid #bae6fd;text-align:center}
.focus.isdone{border-color:#bbf7d0}.fnum{font-weight:900;color:#0369a1;letter-spacing:.02em;text-transform:uppercase;font-size:14px}
.focus h2{font-size:32px;margin:8px 0 6px}.focus>p{font-size:18px;color:#4b4870;max-width:720px;margin:0 auto 14px;line-height:1.45}
.fstat{display:inline-block;font-size:20px;font-weight:900;padding:8px 18px;border-radius:999px;background:#f1eefc;color:#4b3fa8;margin-bottom:16px}.fstat.ok{background:#dcfce7;color:#166534}.fstat.warn{background:#fee2e2;color:#991b1b}
.fmain .big,.fmain label.big{display:inline-flex;align-items:center;justify-content:center;min-height:84px;min-width:min(520px,100%);font-size:24px;font-weight:900;border-radius:22px;padding:14px 30px;background:linear-gradient(135deg,#0284c7,#38bdf8);color:#fff;box-shadow:0 12px 28px rgba(2,132,199,.3);cursor:pointer}
.focus.isdone .fmain .big,.focus.isdone .fmain label.big{background:#f1eefc;color:#4b3fa8;box-shadow:none;min-height:64px;font-size:19px}
.fmore{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:14px}.fmore button,.fmore select{min-height:52px;font-size:16px}
.fnav{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-top:26px;border-top:2px solid #f1eefc;padding-top:18px}
.fnav button{min-height:56px;font-size:17px;font-weight:800}.fnav .gonext{background:linear-gradient(135deg,#16a34a,#22c55e);color:#fff;font-size:19px;min-height:64px;padding:12px 24px}
.fnav .linkbtn{font-size:16px}
#home .home>.tile{display:none}#home .home{display:block}
.srecent{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin:4px 0 22px}
.srecent button{display:block;text-align:left;min-height:80px;background:#fff;color:#1e1b3a;border:2px solid #e5e0f5;border-radius:18px;padding:12px 16px;box-shadow:none;font-weight:900;font-size:17px}
.srecent button small{display:block;font-weight:600;color:#6b6890;font-size:14px;margin-top:3px}
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

function seanceSteps(se, S) {
  const t = S.t, cid = S.cid, q = x => '\'' + x + '\'', sk = se.skip || {};
  const steps = [];
  steps.push({ key: 'print', ico: '🖨', short: 'Imprimer', done: S.printed, title: 'Imprimer les fiches', text: 'Une fiche par élève, avec son nom et son QR code. Imprime en taille réelle (100 %), puis coupe les feuilles en deux.', stat: S.printed ? '✓ Fiches imprimées' : S.n + ' fiches à imprimer',
    main: '<button class="big" onclick="seancePrint(\'print\')">🖨 Imprimer les fiches</button>', more: '<button class="secondary" onclick="seancePrint(\'zip\')">📁 Télécharger pour imprimer plus tard</button>' });
  if (S.hasTime) steps.push({ key: 'pfl', ico: '⏱', short: 'PhotoFinish', opt: true, done: !!se.pfList || sk.pfl, title: 'Tu filmes les arrivées avec PhotoFinish ?', text: 'Envoie la liste de la classe à PhotoFinish (AirDrop ou « Enregistrer dans Fichiers », puis « Importer CSV » dans PhotoFinish). Les noms seront identiques : les temps seront comparés tout seuls.', stat: se.pfList ? '✓ Liste envoyée' : sk.pfl ? 'Pas de PhotoFinish' : '',
    main: '<button class="big" onclick="seanceFlag(\'pfList\');pfExportClass(' + q(cid) + ')">⏱ Envoyer la liste à PhotoFinish</button>', skip: 'Je n’utilise pas PhotoFinish' });
  if (S.hasEst) steps.push({ key: 'ann', ico: '📝', short: 'Estimations', opt: true, done: (S.annN === S.n && S.n > 0) || sk.ann, title: 'Avant chaque course : les estimations', text: 'Note le temps que chaque élève annonce. Si la fiche dit autre chose après la course, une alerte rouge te préviendra.', stat: S.annN + ' / ' + S.n + ' estimations notées',
    main: '<button class="big" onclick="annOpen(' + q(t.id) + ',' + q(cid) + ')">📝 Saisir les estimations</button>', skip: 'Pas d’estimation annoncée' });
  steps.push({ key: 'scan', ico: '📸', short: 'Scanner', done: S.scanned >= S.n && S.n > 0 && !S.queue, title: 'Scanner les fiches remplies', text: 'Pose les fiches une à une sous l’iPad : la photo se prend toute seule. Approche l’iPad pour que la fiche remplisse presque tout l’écran.', stat: S.scanned + ' / ' + S.n + ' scannées' + (S.queue ? ' · ⚠ ' + S.queue + ' à vérifier' : ''), warn: !!S.queue,
    main: '<button class="big" onclick="window.__seanceTpl=' + q(t.id) + ';rafaleOpen(' + q(cid) + ',\'seance\')">📸 Scanner les fiches</button>',
    more: (S.queue ? '<button class="secondary" onclick="window.__seanceTpl=' + q(t.id) + ';$(\'batchClass\').value=' + q(cid) + ';view(\'batch\')">⚠ Voir les ' + S.queue + ' fiches à vérifier</button>' : '') + '<button class="secondary" onclick="window.__seanceTpl=' + q(t.id) + ';$(\'batchClass\').value=' + q(cid) + ';view(\'batch\')">🖼 Depuis mes photos</button>' });
  const B = t.bareme && bar(t.bareme), bars = [['ca1-2x800', 'Bac · demi-fond 2 × 800 m']].concat((state.baremes || []).map(b => [b.id, b.name || 'Barème sans nom']));
  steps.push({ key: 'bar', ico: '🎯', short: 'Barème', opt: true, done: !!B || sk.bar, title: B ? 'Barème de la note' : 'Ajouter un barème pour avoir les notes ?', text: B ? 'Les notes sont calculées avec ce barème : ' + (B.name || '') + '.' : 'Sans barème, tu as les temps de chaque élève. Avec un barème, l’appli calcule aussi les notes (tu peux le faire maintenant ou plus tard).', stat: B ? '✓ Barème associé' : sk.bar ? 'Pas de note' : '',
    main: B ? '<button class="big" onclick="seanceBareme(true)">🎯 Voir ou modifier le barème</button>' : '<button class="big" onclick="seanceBareme()">🎯 Créer le barème</button>',
    more: B ? '' : '<select onchange="if(this.value)seanceLinkBar(this.value)"><option value="">… ou utiliser un barème existant</option>' + bars.map(([id, n]) => '<option value="' + id + '">' + escapeHtml(n) + '</option>').join('') + '</select>', skip: B ? '' : 'Pas de note cette fois' });
  if (S.hasTime) steps.push({ key: 'pf', ico: '🏁', short: 'Comparer', opt: true, done: S.pfFiles > 0 || sk.pf, title: 'Comparer avec PhotoFinish', text: 'Dans PhotoFinish : « Fiche résultats » → « Enregistrer dans Fichiers » pour chaque course. Ici, choisis tous les fichiers du jour d’un coup.', stat: S.pfFiles ? '✓ ' + S.pfFiles + ' course(s) importée(s)' : '',
    main: '<label class="btn big">⏱ Importer les résultats PhotoFinish<input type="file" accept=".html,.htm,text/html" multiple style="display:none" data-tid="' + t.id + '" onchange="pfImport(event)"></label>', skip: 'Pas de PhotoFinish' });
  steps.push({ key: 'ctrl', ico: '✅', short: B ? 'Noter' : 'Vérifier', done: S.scanned > 0 && !S.alerts && !S.check && !S.queue, title: B ? 'Contrôler et noter' : 'Contrôler les résultats', text: B ? 'Règle les alertes rouges (un toucher chacune), puis note par AFL avec les onglets AFL1, AFL2, AFL3.' : 'Règle les alertes rouges (un toucher chacune) et vérifie les temps.', stat: S.alerts ? '🚨 ' + S.alerts + ' alerte(s)' : S.check ? '⚠ ' + S.check + ' fiche(s) à vérifier' : S.scanned ? '✓ ' + S.valid + ' validée(s)' : '', warn: !!(S.alerts || S.check),
    main: '<button class="big" onclick="goResults(' + q(t.id) + ',' + q(cid) + ')">📊 Ouvrir les résultats</button>' });
  steps.push({ key: 'exp', ico: '📤', short: 'Exporter', done: !!se.exported, title: 'Exporter', text: 'Garde une trace de la séance.', stat: se.exported ? '✓ Exporté' : '',
    main: '<button class="big" onclick="seanceFlag(\'exported\');exportDetail(' + q(t.id) + ',' + q(cid) + ')">📑 Bilan par élève</button>', more: '<button class="secondary" onclick="seanceFlag(\'exported\');exportHTML(' + q(t.id) + ',' + q(cid) + ')">📄 Archive complète</button>' + (B ? '<button class="secondary" onclick="seanceFlag(\'exported\');exportSantorin(' + q(t.id) + ',' + q(cid) + ')">🎓 Santorin</button>' : '') });
  return steps;
}
function seanceCurIndex(se, steps) { const i = steps.findIndex(x => x.key === se.at); if (i >= 0) return i; const k = steps.findIndex(x => !x.done); return k < 0 ? steps.length - 1 : k; }
async function seanceGo(key) { const se = curSeance(); if (!se) return; se.at = key; await persist(); renderSeance(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
async function seanceSkip(key) { const se = curSeance(); if (!se) return; se.skip = Object.assign({}, se.skip, { [key]: true }); const st = seanceSteps(se, seanceStatus(se)), i = st.findIndex(x => x.key === key); se.at = (st[i + 1] || st[i]).key; await persist(); renderSeance(); }
async function seanceLinkBar(id) { const se = curSeance(); if (!se) return; const t = tplById(se.tplId); state.templates.forEach(x => { if (x.bareme === id && x.id !== t.id && id !== 'ca1-2x800') x.bareme = undefined; }); t.bareme = id; await persist(); renderSeance(); }
async function seanceBareme(edit) {
  const se = curSeance(); if (!se) return; const t = tplById(se.tplId);
  window.__seanceReturn = true; view('models');
  if (edit && state.baremes && state.baremes.some(b => b.id === t.bareme)) { barEdit = t.bareme; barStepFor = null; render(); }
  else { await newBareme(); await barLinkTpl(t.id); barStepFor = barEdit; barStep = 1; }
  renderBarWizard(); const e = $('barEditor'); if (e) e.scrollIntoView({ behavior: 'smooth' });
}
function renderSeance() {
  const sec = $('seance'); if (!sec || sec.classList.contains('hidden')) return;
  const se = curSeance();
  if (seanceNew || !se) { sec.innerHTML = seanceSetupHTML(); return; }
  const S = seanceStatus(se), t = S.t, steps = seanceSteps(se, S), ci = seanceCurIndex(se, steps), c = steps[ci], allDone = steps.every(x => x.done);
  const others = (state.seances || []).filter(x => x.id !== se.id && state.classes.some(cc => cc.id === x.classId) && tplById(x.tplId)).slice(-6).reverse();
  sec.innerHTML = '<div class="shead"><button class="back" style="margin:0" onclick="view(\'home\')">← Accueil</button><div class="grow"><h2>' + escapeHtml(className(S.cid)) + ' · ' + escapeHtml(t.name) + '</h2></div>' +
    (others.length ? '<select onchange="if(this.value)seanceSwitch(this.value)"><option value="">Autre séance…</option>' + others.map(x => '<option value="' + x.id + '">' + escapeHtml(className(x.classId) + ' · ' + tplById(x.tplId).name) + '</option>').join('') + '</select>' : '') + '<button class="secondary" onclick="seanceOpen(true)">＋ Nouvelle</button></div>' +
    '<div class="stepper">' + steps.map((x, i) => '<button class="' + (i === ci ? 'cur' : x.done ? 'ok' : '') + '" onclick="seanceGo(\'' + x.key + '\')"><span>' + (x.done && i !== ci ? '✓' : x.ico) + '</span><small>' + escapeHtml(x.short) + '</small></button>').join('<i></i>') + '</div>' +
    '<div class="focus' + (c.done ? ' isdone' : '') + '"><div class="fnum">Étape ' + (ci + 1) + ' sur ' + steps.length + (c.opt ? ' · facultative' : '') + '</div><h2>' + escapeHtml(c.title) + '</h2><p>' + escapeHtml(c.text) + '</p>' +
    (c.stat ? '<div class="fstat' + (c.warn ? ' warn' : c.done ? ' ok' : '') + '">' + escapeHtml(c.stat) + '</div>' : '') +
    '<div class="fmain">' + c.main + '</div>' + (c.more ? '<div class="fmore">' + c.more + '</div>' : '') +
    '<div class="fnav">' + (ci > 0 ? '<button class="secondary" onclick="seanceGo(\'' + steps[ci - 1].key + '\')">← ' + escapeHtml(steps[ci - 1].short) + '</button>' : '<span></span>') +
    (c.skip && !c.done ? '<button class="linkbtn" onclick="seanceSkip(\'' + c.key + '\')">' + escapeHtml(c.skip) + ' →</button>' : '') +
    (ci < steps.length - 1 ? '<button class="' + (c.done ? 'gonext' : 'secondary') + '" onclick="seanceGo(\'' + steps[ci + 1].key + '\')">Étape suivante : ' + escapeHtml(steps[ci + 1].short) + ' →</button>' : '<span></span>') + '</div></div>' +
    (allDone ? '<p class="ctrl-ok" style="font-size:18px;text-align:center">🎉 Séance terminée : tout est scanné, contrôlé et exporté.</p>' : '');
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
  const se = curSeance(), rec = (state.seances || []).filter(x => (!se || x.id !== se.id) && state.classes.some(c => c.id === x.classId) && tplById(x.tplId)).slice(-4).reverse();
  let h = '';
  if (se) { const S = seanceStatus(se), st = seanceSteps(se, S), ci = seanceCurIndex(se, st); h += '<div class="sbanner"><div class="grow"><h3>▶ Reprendre : ' + escapeHtml(className(se.classId)) + ' · ' + escapeHtml(S.t.name) + '</h3><p>Étape ' + (ci + 1) + ' sur ' + st.length + ' : <b>' + escapeHtml(st[ci].title) + '</b></p></div><button onclick="seanceOpen()">Reprendre →</button><button class="ghost" onclick="seanceOpen(true)">＋ Nouvelle séance</button></div>'; }
  else h += '<div class="sbanner"><div class="grow"><h3>Nouvelle séance</h3><p>Choisis ta classe et ta fiche : l’appli te guide ensuite, étape par étape, de l’impression aux notes.</p></div><button onclick="seanceOpen(true)">▶ Commencer</button></div>';
  if (rec.length) h += '<h3 style="margin:6px 0 8px">Mes autres séances</h3><div class="srecent">' + rec.map(x => { const S = seanceStatus(x); return '<button onclick="seanceSwitch(\'' + x.id + '\')">' + escapeHtml(className(x.classId)) + ' · ' + escapeHtml(S.t.name) + '<small>' + (S.printed ? S.scanned + ' / ' + S.n + ' fiches scannées' : 'à imprimer') + '</small></button>'; }).join('') + '</div>';
  b.innerHTML = h;
  let chip = $('seanceChip');
  if (!chip) { chip = document.createElement('button'); chip.id = 'seanceChip'; chip.onclick = () => seanceOpen(); const sp = document.querySelector('header.top .sp'); sp.parentNode.insertBefore(chip, sp.nextSibling); }
  const vis = document.querySelector('main section:not(.hidden)'), on = vis && !['seance', 'cover', 'home'].includes(vis.id);
  chip.textContent = '▶ Ma séance'; chip.style.display = se && on ? 'inline-block' : 'none';
}
const _renderSeanceBase = render;
render = function () { _renderSeanceBase(); try { const vs = document.querySelector('main section:not(.hidden)'); if (vs && !['seance', 'batch', 'scan'].includes(vs.id)) window.__seanceTpl = null; renderSeance(); renderSeanceHome(); } catch (e) { console.error(e); } };

/* ---------- Mes classes : une tuile par classe, puis la page de la classe ---------- */
let classView = null, classOpening = false;
(() => { const st = document.createElement('style'); st.textContent = `
#directory .cards{grid-template-columns:repeat(auto-fill,minmax(200px,1fr))}
.ctile{display:flex;flex-direction:column;align-items:center;gap:8px;min-height:170px;justify-content:center;background:#fff;color:#1e1b3a;border:3px solid #ece8fb;border-radius:24px;box-shadow:0 8px 20px rgba(60,40,140,.08);padding:18px 12px;text-align:center}
.ctile .cav{width:68px;height:68px;border-radius:20px;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;color:#fff;background:linear-gradient(135deg,#7c3aed,#ec4899)}
.ctile:nth-child(4n+2) .cav{background:linear-gradient(135deg,#0ea5e9,#22d3ee)}.ctile:nth-child(4n+3) .cav{background:linear-gradient(135deg,#f97316,#facc15)}.ctile:nth-child(4n) .cav{background:linear-gradient(135deg,#10b981,#84cc16)}
.ctile b{font-size:20px}.ctile small{color:#6b6890;font-size:14px;font-weight:600}
.chead{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:6px}.chead h2{margin:0;font-size:32px;flex:1}
#classDetail.cmode button[onclick^="openEval"]{display:none}
#classDetail.cmode{border:0;background:none;padding:0;box-shadow:none}
`; document.head.appendChild(st); })();
function classOpen(id) { classView = id; classOpening = true; view('classes'); classOpening = false; const sel = $('classSelect'); if (sel) sel.value = id; render(); window.scrollTo({ top: 0 }); }
function renderClassMode() {
  const sec = $('classes'); if (!sec || sec.classList.contains('hidden')) return;
  if (classView && !state.classes.some(c => c.id === classView)) classView = null;
  const det = $('classDetail'), dir = $('directory'), detail = !!classView;
  [...sec.children].forEach(el => { if (el.id === 'classDetail' || el.classList.contains('back') || el.classList.contains('pagehead')) return; el.style.display = detail ? 'none' : ''; });
  sec.querySelector('.pagehead').style.display = detail ? 'none' : '';
  sec.querySelector('.back').style.display = detail ? 'none' : '';
  det.classList.toggle('hidden', !detail); det.classList.toggle('cmode', detail);
  if (!detail) return;
  const sel = $('classSelect'); if (sel && sel.value !== classView) { sel.value = classView; }
  const c = state.classes.find(x => x.id === classView), n = state.students.filter(s => s.classId === c.id).length;
  const h3 = det.querySelector('h3'); if (h3) h3.style.display = 'none';
  let head = $('classHead'); if (!head) { head = document.createElement('div'); head.id = 'classHead'; det.insertBefore(head, det.firstChild); }
  head.innerHTML = '<button class="back" onclick="classView=null;render();window.scrollTo({top:0})">← Toutes mes classes</button><div class="chead"><h2>' + escapeHtml(c.name) + ' <small class="muted" style="font-size:18px">' + n + ' élèves</small></h2><button onclick="seanceNew={classId:\'' + c.id + '\',tplId:null};view(\'seance\')">▶ Nouvelle séance</button></div>';
  // liste des élèves repliée
  const ro = $('roster'); if (ro && !ro.closest('details.rosterbox')) { const d = document.createElement('details'); d.className = 'rosterbox'; d.innerHTML = '<summary style="font-size:18px;font-weight:800;cursor:pointer;padding:8px 0">👥 Liste des élèves (' + n + ')</summary>'; ro.parentNode.insertBefore(d, ro); d.appendChild(ro); const h4 = d.previousElementSibling; if (h4 && h4.tagName === 'H4') h4.remove(); }
  else if (ro) { const sm = ro.closest('details.rosterbox').querySelector('summary'); sm.textContent = '👥 Liste des élèves (' + n + ')'; }
}
const _renderClassBase = render;
render = function () { _renderClassBase(); try { renderClassMode(); } catch (e) { console.error(e); } };
const _viewClassBase = view;
view = function (id) { if (id === 'classes' && !classOpening) classView = null; return _viewClassBase(id); };
