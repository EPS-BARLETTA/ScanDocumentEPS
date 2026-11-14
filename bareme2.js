'use strict';
/* ScanDocument EPS — assistants « Créer une fiche » et « Créer un barème », barèmes personnalisés (v2). */

/* ================= Modèle de barème personnalisé ================= */
const PERF_MODES = { best: ['Le meilleur temps', 'On garde la course la plus rapide'], sum: ['Le total des temps', 'On additionne les temps de toutes les courses (temps cumulé)'], mean: ['La moyenne des temps', 'On fait la moyenne des temps des courses'], each: ['Une note par course', 'Chaque course est notée, puis on fait la moyenne'] };
const CALC_TYPES = {
  reg_all: ['Régularité (comme au bac)', 'Écart entre le tour le plus rapide et le tour le plus lent, sur toutes les courses'],
  reg_each: ['Régularité course par course', 'Écart entre le tour le plus rapide et le plus lent dans chaque course, puis moyenne'],
  estim: ['Respect de l’estimation', 'Écart total entre les temps annoncés et les temps réalisés']
};
const numv = v => { const x = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : null; };
const COMP_CLS = ['a2', 'a3', 'a5', 'a6', 'a4'];

function normV2(b) {
  const perfRows = (b.perf?.rows || []).map(r => ({ pts: numv(r.pts) || 0, F: sec(r.F), G: sec(r.G) })).filter(r => r.pts);
  const calcs = (b.calcs || []).map(c => { const rowsN = (c.rows || []).map(r => ({ max: numv(r.max), pts: numv(r.pts) || 0 })).filter(r => r.max != null && r.pts); return { ...c, rowsN, maxPts: Math.max(0, ...rowsN.map(r => r.pts)) }; });
  const crits = (b.crits || []).map(c => ({ ...c, levels: Math.max(2, Math.min(6, +c.levels || 4)), maxN: numv(c.max) || 0, ptsN: (c.pts || []).map(numv) }));
  const sp = b.split || {};
  const split = sp.on && crits.some(c => c.id === sp.a) && crits.some(c => c.id === sp.b) && sp.a !== sp.b
    ? { a: sp.a, b: sp.b, options: String(sp.options || '').split(/[\s,;]+/).map(o => o.replace(/[–/]/g, '-')).filter(o => /^\d+(?:[.,]\d+)?-\d+(?:[.,]\d+)?$/.test(o)) } : null;
  const perfMax = Math.max(0, ...perfRows.map(r => r.pts));
  const inSplit = c => split && (c.id === split.a || c.id === split.b);
  const splitMax = split && split.options.length ? Math.max(...split.options.map(o => o.split('-').map(numv).reduce((a, v) => a + v, 0))) : 0;
  const critMax = crits.filter(c => !inSplit(c)).reduce((a, c) => a + critMaxPts(c), 0) + splitMax;
  return { v2: true, id: b.id, name: b.name, perfMode: b.perf?.mode || 'best', perfRows, perfMax, calcs, crits, split, inSplit, totalMax: perfMax + calcs.reduce((a, c) => a + c.maxPts, 0) + critMax };
}
function critMaxPts(c) { return c.custom ? Math.max(0, ...c.ptsN.filter(x => x != null)) : c.maxN; }
function lookupPts(rows, v, key) { let p = 0; for (const r of rows) { const lim = key ? r[key] : r.max; if (lim != null && v <= lim + 0.001 && r.pts > p) p = r.pts; } return p; }
function calcValue(type, m) {
  if (!m) return null;
  if (type === 'estim') return m.gap;
  const all = m.blocks.filter(b => b.hasTime).map(b => b.segs);
  if (!all.length || all.some(s => !s || s.length < 2)) return null;
  if (type === 'reg_all') { const f = all.flat(); return Math.max(...f) - Math.min(...f); }
  return all.reduce((a, s) => a + Math.max(...s) - Math.min(...s), 0) / all.length;
}
function estimLevel(c, g) { const th = (c.th || [7, 15, 24]).map(numv); return g <= th[0] ? 4 : g <= th[1] ? 3 : g <= th[2] ? 2 : 1; }

function gradeV2(t, s, m, B) {
  const n = (s.notes || {})[t.id] || {}, sexOk = s.sex === 'F' || s.sex === 'G';
  const choix = B.split && B.split.options.includes(n.choix) ? n.choix : null;
  const [ma, mb] = choix ? choix.split('-').map(numv) : [null, null];
  if (n.disp) return { v2: true, disp: true, B, choix, total: null, missing: [], acquired: 0, crits: [], calcs: [] };
  const finals = m ? m.blocks.filter(b => b.hasTime).map(b => b.final) : [];
  let perf = null, perfVal = null;
  if (m && sexOk && B.perfRows.length) {
    const ok = finals.filter(v => v != null);
    if (B.perfMode === 'best' && ok.length) { perfVal = Math.min(...ok); perf = lookupPts(B.perfRows, perfVal, s.sex); }
    else if (ok.length && ok.length === finals.length) {
      if (B.perfMode === 'sum') { perfVal = ok.reduce((a, v) => a + v, 0); perf = lookupPts(B.perfRows, perfVal, s.sex); }
      else if (B.perfMode === 'mean') { perfVal = ok.reduce((a, v) => a + v, 0) / ok.length; perf = lookupPts(B.perfRows, perfVal, s.sex); }
      else { perf = ok.reduce((a, v) => a + lookupPts(B.perfRows, v, s.sex), 0) / ok.length; perfVal = null; }
    }
  }
  const calcs = B.calcs.map(c => { const v = calcValue(c.type, m); return { v, pts: v == null ? null : lookupPts(c.rowsN, v) }; });
  const crits = B.crits.map(c => {
    const has = n['k_' + c.id] !== undefined && n['k_' + c.id] !== null && n['k_' + c.id] !== '';
    let level = has ? +n['k_' + c.id] : null, auto = false;
    if (level == null && c.auto && c.levels === 4 && m && m.gap != null) { level = estimLevel(c, m.gap); auto = true; }
    const sp = B.inSplit(c), max = sp ? (choix ? (c.id === B.split.a ? ma : mb) : null) : critMaxPts(c);
    const pts = level == null ? null : sp ? (max == null ? null : level * max / c.levels) : (c.custom ? (c.ptsN[level - 1] ?? null) : level * c.maxN / c.levels);
    return { level, auto, pts, max, sp };
  });
  const parts = [B.perfRows.length ? perf : 0, ...calcs.map(x => x.pts), ...crits.map(x => x.pts)];
  const total = parts.every(v => v != null) && (!B.split || choix) ? parts.reduce((a, v) => a + v, 0) : null;
  const acquired = parts.reduce((a, v) => a + (v || 0), 0);
  const missing = [!sexOk && 'F/G', !m && 'fiche', B.split && !choix && 'choix', ...B.crits.filter((c, i) => crits[i].level == null).map(c => c.name || 'critère')].filter(Boolean);
  return { v2: true, B, perf, perfVal, calcs, crits, choix, total, acquired, missing, noSex: !sexOk };
}

/* ---------- Tableau des résultats ---------- */
function v2Head(B, screen) {
  const h = (cls, t, sub) => '<th class="' + cls + '">' + t + (sub ? '<span class="sub">' + sub + '</span>' : '') + '</th>';
  return '<tr><th>Élève</th><th>F/G</th>' + (B.split ? '<th>Choix</th>' : '') +
    (B.perfRows.length ? h('a1', 'Performance /' + nf(B.perfMax), PERF_MODES[B.perfMode][0].toLowerCase()) : '') +
    B.calcs.map(c => h('a4', escapeHtml(c.name || CALC_TYPES[c.type][0]) + ' /' + nf(c.maxPts), CALC_TYPES[c.type][0].toLowerCase())).join('') +
    B.crits.map((c, i) => h(COMP_CLS[i % COMP_CLS.length], escapeHtml(c.name || 'Critère') + (B.inSplit(c) ? '' : ' /' + nf(critMaxPts(c))), c.levels + ' niveaux' + (B.inSplit(c) ? ' · au choix' : ''))).join('') +
    '<th>Note<br>/' + nf(B.totalMax) + '</th></tr>';
}
function v2Row(t, s, r, m, st, screen, showClass) {
  const B = bar(t.bareme), g = gradeV2(t, s, m, B);
  const seg = (k, opts, cur) => '<span class="seg">' + opts.map(([v, l, cl]) => '<button class="' + (cl || '') + (String(cur ?? '') === String(v) ? ' on' : '') + '" onclick="setNote(\'' + s.id + '\',\'' + t.id + '\',\'' + k + '\',\'' + v + '\')">' + l + '</button>').join('') + '</span>';
  const lab = { validated: 'Validé', auto: 'Lu, à valider', check: 'À vérifier' }, pill = { validated: 'ok', auto: 'auto', check: 'warn' };
  const finals = m ? m.blocks.filter(b => b.hasTime).map(b => fmt(b.final)).join(' · ') : '';
  const dispBtn = screen ? ' <button class="mini" style="' + (g.disp ? 'background:#6b7a8c;color:#fff' : '') + '" onclick="setNote(\'' + s.id + '\',\'' + t.id + '\',\'disp\',1)">' + (g.disp ? 'Dispensé ✓' : 'Dispensé ?') + '</button>' : '';
  const name = '<td class="nm"><b>' + escapeHtml(s.name) + '</b>' + (showClass ? ' <span class="of">' + escapeHtml(className(s.classId)) + '</span>' : '') + '<span class="sub">' + (finals ? 'Temps : ' + finals : 'non scanné') + '</span>' +
    (screen ? '<span class="sub"><span class="pill ' + (pill[st] || '') + '">' + (lab[st] || 'Non scanné') + '</span>' + (r ? ' <button class="mini" onclick="editScan(\'' + r.id + '\')">Ouvrir</button>' : '') + dispBtn + '</span>' : '') + '</td>';
  const ncol = 2 + (B.split ? 1 : 0) + (B.perfRows.length ? 1 : 0) + B.calcs.length + B.crits.length;
  if (g.disp) return '<tr>' + name + '<td colspan="' + ncol + '" style="background:#eef1f5;color:#5a6f85;font-size:18px;font-weight:700">Dispensé(e)</td></tr>';
  const chCls = o => ({ '6-2': 'c62', '4-4': 'c44', '2-6': 'c26' }[o] || '');
  const big = (v, max) => '<span class="big">' + nf(v) + '</span>' + (max != null ? '<span class="of"> /' + nf(max) + '</span>' : '');
  let h = '<tr' + (screen && g.noSex ? ' class="nosex"' : '') + '>' + name + '<td class="fg">' + (screen ? seg('sex', [['F', 'F'], ['G', 'G']], s.sex) : (s.sex || '?')) + '</td>';
  if (B.split) h += '<td class="' + (g.choix ? 'ch' + g.choix.replace('-', '') : '') + '">' + (screen ? seg('choix', B.split.options.map(o => [o, o, chCls(o)]), g.choix) : '<b>' + (g.choix || '—') + '</b>') + '</td>';
  if (B.perfRows.length) h += '<td class="a1">' + (g.noSex && m ? '<span class="miss">F/G ?</span>' : big(g.perf)) + '<span class="sub">' + (g.perfVal != null ? fmt(g.perfVal) : '') + '</span></td>';
  B.calcs.forEach((c, i) => { const x = g.calcs[i]; h += '<td class="a4">' + big(x.pts) + '<span class="sub">' + (x.v != null ? round1(x.v) + ' s' : '') + '</span></td>'; });
  B.crits.forEach((c, i) => {
    const x = g.crits[i], cls = COMP_CLS[i % COMP_CLS.length];
    const lbl = d => { const p = x.sp ? (x.max != null ? d * x.max / c.levels : null) : (c.custom ? c.ptsN[d - 1] : d * c.maxN / c.levels); return p != null ? nf(p) + '<small>N' + d + '</small>' : 'N' + d; };
    h += '<td class="' + cls + '">' + (screen ? seg('k_' + c.id, Array.from({ length: c.levels }, (_, k) => [k + 1, lbl(k + 1)]), x.level) : (x.level ? '<span class="deg">N' + x.level + '</span> ' + nf(x.pts) : '—')) + (x.auto ? '<span class="sub">proposé (temps)</span>' : '') + (screen && x.pts != null ? '<span class="sub">' + nf(x.pts) + ' pt(s)</span>' : '') + '</td>';
  });
  h += '<td>' + (g.total != null ? '<span class="note">' + nf(g.total) + '</span>' : '<span class="of">' + nf(g.acquired) + ' acquis</span><span class="miss">manque : ' + g.missing.join(', ') + '</span>') + '</td></tr>';
  return h;
}
function v2Legend(B) {
  const tbl = (head, rows) => '<table class="gt" style="min-width:0;width:auto"><thead><tr>' + head.map(x => '<th>' + x + '</th>').join('') + '</tr></thead><tbody>' + rows.map(r => '<tr>' + r.map(x => '<td>' + x + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
  let h = '<section><h2>Rappel du barème · ' + escapeHtml(B.name) + '</h2><div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start">';
  if (B.perfRows.length) h += '<div><h3>Performance /' + nf(B.perfMax) + ' · ' + PERF_MODES[B.perfMode][0].toLowerCase() + '</h3>' + tbl(['Points', 'Fille ≤', 'Garçon ≤'], B.perfRows.slice().sort((a, b) => a.pts - b.pts).map(r => [nf(r.pts), r.F != null ? fmt(r.F) : '', r.G != null ? fmt(r.G) : ''])) + '</div>';
  B.calcs.forEach(c => { h += '<div><h3>' + escapeHtml(c.name || CALC_TYPES[c.type][0]) + ' /' + nf(c.maxPts) + '</h3><p class="sub">' + CALC_TYPES[c.type][1] + '</p>' + tbl(['Valeur ≤ (s)', 'Points'], c.rowsN.slice().sort((a, b) => b.max - a.max).map(r => [nf(r.max), nf(r.pts)])) + '</div>'; });
  B.crits.forEach(c => { h += '<div><h3>' + escapeHtml(c.name || 'Critère') + '</h3>' + tbl(['Niveau', 'Points'], Array.from({ length: c.levels }, (_, k) => ['N' + (k + 1), B.inSplit(c) ? (k + 1) + '/' + c.levels + ' du maximum choisi' : nf(c.custom ? c.ptsN[k] : (k + 1) * c.maxN / c.levels)])) + '</div>'; });
  h += '</div>' + (B.split ? '<p class="sub">Répartition au choix de l’élève : ' + B.split.options.join(' · ') + ' (points max de « ' + escapeHtml(B.crits.find(c => c.id === B.split.a)?.name || '') + ' » - « ' + escapeHtml(B.crits.find(c => c.id === B.split.b)?.name || '') + ' »).</p>' : '') + '<p class="sub">Note /' + nf(B.totalMax) + '.</p></section>';
  return h;
}
function v2SantorinSection(t, cid) {
  const B = bar(t.bareme), studs = state.students.filter(s => s.classId === cid).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const cols = (B.split ? 1 : 0) + (B.perfRows.length ? 1 : 0) + B.calcs.length + B.crits.length + 1;
  const rows = studs.map(s => {
    const r = latestScan(s.id, t.id), m = r ? metrics(t, r.values) : null, g = gradeV2(t, s, m, B), [nom, pre] = splitName(s.name);
    const c = (v, cls) => '<td class="' + cls + (v == null ? ' vide' : '') + '">' + (v == null ? '' : nf(v)) + '</td>';
    if (g.disp) return '<tr><td class="l"><b>' + escapeHtml(nom) + '</b></td><td class="l">' + escapeHtml(pre) + '</td><td colspan="' + cols + '" style="color:#5a6f85;font-weight:700">Dispensé(e)</td></tr>';
    return '<tr><td class="l"><b>' + escapeHtml(nom) + '</b></td><td class="l">' + escapeHtml(pre) + '</td>' + (B.split ? '<td class="' + (g.choix ? 'ch' + g.choix.replace('-', '') : 'vide') + '"><b>' + (g.choix || '') + '</b></td>' : '') +
      (B.perfRows.length ? c(g.perf, 'a1') : '') + g.calcs.map(x => c(x.pts, 'a4')).join('') + g.crits.map((x, i) => c(x.pts, COMP_CLS[i % COMP_CLS.length])).join('') + c(g.total, 'n') + '</tr>';
  }).join('');
  return '<section><h2>' + escapeHtml(className(cid)) + '</h2><table><thead><tr><th>Nom</th><th>Prénom</th>' + (B.split ? '<th>Choix</th>' : '') + (B.perfRows.length ? '<th class="a1">Performance /' + nf(B.perfMax) + '</th>' : '') +
    B.calcs.map(c => '<th class="a4">' + escapeHtml(c.name || CALC_TYPES[c.type][0]) + '</th>').join('') + B.crits.map((c, i) => '<th class="' + COMP_CLS[i % COMP_CLS.length] + '">' + escapeHtml(c.name || 'Critère') + '</th>').join('') + '<th>Note /' + nf(B.totalMax) + '</th></tr></thead><tbody>' + rows + '</tbody></table></section>';
}
function v2CSVHead(B) { return ['Sexe', ...(B.split ? ['Choix'] : []), ...(B.perfRows.length ? ['Performance'] : []), ...B.calcs.map(c => c.name || CALC_TYPES[c.type][0]), ...B.crits.map(c => (c.name || 'Critère') + ' (niveau)'), ...B.crits.map(c => (c.name || 'Critère') + ' (points)'), 'Note /' + nf(B.totalMax)]; }
function v2CSVRow(t, s, m) { const B = bar(t.bareme), g = gradeV2(t, s, m, B); if (g.disp) return [s.sex || '', 'dispensé']; return [s.sex || '', ...(B.split ? [g.choix || ''] : []), ...(B.perfRows.length ? [g.perf ?? ''] : []), ...g.calcs.map(x => x.pts ?? ''), ...g.crits.map(x => x.level ?? ''), ...g.crits.map(x => x.pts ?? ''), g.total ?? '']; }

/* ================= Lecture d'un tableau collé (Word, Excel, texte d'une photo) ================= */
const TIME_RE = /(\d{1,2})\s*['’′:h]\s*(\d{2})(?![\d])/g;
function parsePerfText(text) {
  const lines = String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const info = lines.map(l => { const times = [...l.matchAll(TIME_RE)].map(m => m[1] + ':' + m[2]); const rest = l.replace(TIME_RE, ' '); const nums = [...rest.matchAll(/(?<![\d])(\d{1,2}(?:[.,]\d{1,2})?)(?![\d])/g)].map(m => m[1]).filter(v => numv(v) <= 40); return { l, times, nums }; });
  // une ligne par palier : « 0,25  5'06  4'02 »
  const perLine = info.filter(x => x.times.length >= 1 && x.times.length <= 2 && x.nums.length === 1);
  if (perLine.length >= 3) return perLine.map(x => ({ pts: x.nums[0], F: x.times[0], G: x.times[1] || '' }));
  // lignes de tableau : temps filles / points / temps garçons
  const T = info.filter(x => x.times.length >= 4);
  if (T.length) {
    const n = T[0].times.length, F = T.find(x => /fille|f[ée]m|\bF\b/i.test(x.l)) || T[0], G = T.find(x => x !== F && /gar|masc|\bG\b/i.test(x.l)) || T.find(x => x !== F) || null;
    const P = info.find(x => !x.times.length && x.nums.length === n) || info.find(x => !x.times.length && x.nums.length >= n);
    if (!P) return null;
    return P.nums.slice(0, n).map((p, k) => ({ pts: p, F: F.times[k] || '', G: G ? G.times[k] || '' : '' }));
  }
  // colonnes copiées les unes après les autres (Texte en direct d'une photo)
  const allT = info.flatMap(x => x.times), allN = info.filter(x => !/[a-zA-Zé]/.test(x.l.replace(TIME_RE, ''))).flatMap(x => x.nums);
  if (allN.length >= 3 && allT.length === 2 * allN.length) {
    const n = allN.length, txt = String(text).toLowerCase(), gFirst = txt.indexOf('gar') >= 0 && txt.indexOf('fil') >= 0 && txt.indexOf('gar') < txt.indexOf('fil');
    const A = allT.slice(0, n), Bt = allT.slice(n);
    return allN.map((p, k) => ({ pts: p, F: (gFirst ? Bt : A)[k], G: (gFirst ? A : Bt)[k] }));
  }
  if (allN.length >= 3 && allT.length === allN.length) return allN.map((p, k) => ({ pts: p, F: allT[k], G: '' }));
  return null;
}
function parsePairText(text) {
  const lines = String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const tok = l => [...l.matchAll(/([<>]?)\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:''|’’|"|″|s\b)?/g)].map(m => ({ op: m[1], v: numv(m[2]) }));
  const perLine = lines.map(tok).filter(t => t.length === 2);
  if (perLine.length >= 3) return perLine.filter(t => t[0].op !== '>').map(t => ({ max: String(t[0].op === '<' ? t[0].v - 0.1 : t[0].v).replace('.', ','), pts: String(t[1].v).replace('.', ',') }));
  const rows = lines.map(tok).filter(t => t.length >= 3);
  if (rows.length >= 2) {
    const [a, b] = rows, secRow = /''|’’|"|<|>/.test(lines[lines.findIndex(l => tok(l) === a)] || '') ? a : (Math.max(...a.map(x => x.v)) > Math.max(...b.map(x => x.v)) ? a : b), ptsRow = secRow === a ? b : a;
    return secRow.map((x, k) => x.op === '>' ? null : { max: String(x.op === '<' ? x.v - 0.1 : x.v).replace('.', ','), pts: String(ptsRow[k]?.v ?? '').replace('.', ',') }).filter(r => r && r.pts !== '');
  }
  return null;
}

/* ================= Assistant « Créer un barème » ================= */
let barPaste = null; // { target: 'perf' | calcIndex, photo: dataURL }
function newV2(name) { return { id: sid('b'), v: 2, name: name || 'Mon barème', perf: { mode: 'best', rows: [{ pts: '', F: '', G: '' }] }, calcs: [], crits: [], split: { on: false, total: 8, options: '2-6, 4-4, 6-2' } }; }
function v2FromBac(src, name) {
  const b = newV2(name || src.name + ' (copie)');
  b.perf.rows = src.perf.map(r => ({ pts: nf(r.pts), F: r.F != null ? fmt(r.F) : '', G: r.G != null ? fmt(r.G) : '' }));
  b.calcs = src.reg.length ? [{ id: sid('c'), name: 'Régularité', type: 'reg_all', rows: src.reg.map(r => ({ max: r.max < 4 && r.max > 3.99 ? '3,9' : nf(r.max), pts: nf(r.pts) })) }] : [];
  const a2 = { id: sid('k'), name: 'AFL2 · S’entraîner', levels: 4, max: '4', auto: true, th: src.afl2.slice() }, a3 = { id: sid('k'), name: 'AFL3 · Rôle', levels: 4, max: '4' };
  b.crits = [a2, a3]; b.split = { on: true, a: a2.id, b: a3.id, options: '2-6, 4-4, 6-2' };
  return b;
}
function migrateV1(b) { // anciens barèmes personnels → v2
  if (b.v === 2) return b;
  const src = { name: b.name, perf: (b.perfRows || []).map(r => ({ pts: numv(r.pts) || 0, F: sec(r.F), G: sec(r.G) })).filter(r => r.pts), reg: (b.regRows || []).map(r => ({ max: numv(r.max), pts: numv(r.pts) || 0 })).filter(r => r.max != null), afl2: (b.afl2 || [7, 15, 24]).map(Number) };
  const n = v2FromBac(src, b.name); n.id = b.id; return n;
}
function curBar() { return (state.baremes || []).find(x => x.id === barEdit); }
async function bSet(path, v, rerender) {
  const b = curBar(); if (!b) return; const k = path.split('.'); let o = b;
  for (let i = 0; i < k.length - 1; i++) { if (o[k[i]] == null) o[k[i]] = /^\d+$/.test(k[i + 1]) ? [] : {}; o = o[k[i]]; }
  o[k[k.length - 1]] = v; await persist();
  if (rerender !== false) render(); else { renderResults(); $('barTotal') && ($('barTotal').innerHTML = barTotalHTML(b)); }
}
async function bMut(fn) { const b = curBar(); if (!b) return; fn(b); await persist(); render(); }
function barTotalHTML(b) {
  const B = normV2(b), parts = [];
  if (B.perfRows.length) parts.push('Performance /' + nf(B.perfMax));
  B.calcs.forEach(c => parts.push(escapeHtml(c.name || CALC_TYPES[c.type][0]) + ' /' + nf(c.maxPts)));
  B.crits.filter(c => !B.inSplit(c)).forEach(c => parts.push(escapeHtml(c.name || 'Critère') + ' /' + nf(critMaxPts(c))));
  if (B.split) parts.push('répartition au choix ' + B.split.options.join(' · '));
  return '<b>Note sur ' + nf(B.totalMax) + '</b> = ' + (parts.join(' + ') || '—');
}
function renderBarWizard() {
  const box = $('barEditor'), b = curBar(); if (!box) return;
  box.classList.toggle('hidden', !b); if (!b) return;
  const inp = (path, v, ph, w, extra) => '<input style="width:' + (w || 90) + 'px" value="' + escapeHtml(v ?? '') + '" placeholder="' + (ph || '') + '" onchange="bSet(\'' + path + '\',this.value,false)"' + (extra || '') + '>';
  const tpls = state.templates.filter(t => t.bareme === b.id).map(t => t.id);
  let h = '<div class="wiz-head"><span class="badge g-orange">🎯</span><div class="grow"><small>Barème</small>' + inp('name', b.name, 'Nom du barème', 360, ' class="wiz-title"') + '</div><button class="mini" onclick="delBareme()">Supprimer</button><button class="w-orange" onclick="barEdit=null;render()">✓ Terminé</button></div>';
  h += '<div class="wstep"><h3><b>1</b>Pour quelle épreuve ?</h3><p class="muted">Choisis la fiche que ce barème va noter (par exemple « 3 × 500 m »). Tu pourras aussi le faire plus tard.</p><select onchange="barLinkTpl(this.value)"><option value="">— choisir la fiche —</option>' + state.templates.map(t => '<option value="' + t.id + '"' + (tpls.includes(t.id) ? ' selected' : '') + '>' + escapeHtml(t.name) + '</option>').join('') + '</select></div>';
  // Performance
  h += '<div class="wstep"><h3><b>2</b>Quel temps compte pour la note de performance ?</h3><div class="pick">' + Object.entries(PERF_MODES).map(([k, [t, d]]) => '<button class="' + (b.perf.mode === k ? 'on' : '') + '" onclick="bSet(\'perf.mode\',\'' + k + '\')"><b>' + t + '</b><span class="muted">' + d + '</span></button>').join('') + '</div>' +
    '<h4>Ton tableau : temps à réaliser → points</h4><p class="muted">Un élève qui fait ce temps ou mieux obtient ces points.</p>' + pasteTools('perf') +
    '<table class="gt" style="min-width:0"><thead><tr><th>Points</th><th>Temps fille</th><th>Temps garçon</th><th></th></tr></thead><tbody>' +
    b.perf.rows.map((r, i) => '<tr><td>' + inp('perf.rows.' + i + '.pts', r.pts, '1', 70) + '</td><td>' + inp('perf.rows.' + i + '.F', r.F, '4:30') + '</td><td>' + inp('perf.rows.' + i + '.G', r.G, '3:40') + '</td><td><button class="mini" onclick="bMut(b=>b.perf.rows.splice(' + i + ',1))">✕</button></td></tr>').join('') +
    '</tbody></table><button class="mini" onclick="bMut(b=>b.perf.rows.push({pts:\'\',F:\'\',G:\'\'}))">+ Palier</button> <button class="mini" onclick="if(confirm(\'Vider le tableau ?\'))bMut(b=>b.perf.rows=[])">Vider</button></div>';
  // Calculs
  h += '<div class="wstep"><h3><b>3</b>Noter aussi la régularité ou l’estimation ? <span class="muted">(facultatif)</span></h3>' + b.calcs.map((c, i) => '<div class="sub-card"><div class="flex"><input class="grow" value="' + escapeHtml(c.name || '') + '" placeholder="Nom affiché (ex. Régularité)" onchange="bSet(\'calcs.' + i + '.name\',this.value,false)"><button class="mini" onclick="bMut(b=>b.calcs.splice(' + i + ',1))">Retirer</button></div>' +
    '<div class="pick" style="margin-top:8px">' + Object.entries(CALC_TYPES).map(([k, [t, d]]) => '<button class="' + (c.type === k ? 'on' : '') + '" onclick="bSet(\'calcs.' + i + '.type\',\'' + k + '\')"><b>' + t + '</b><span class="muted">' + d + '</span></button>').join('') + '</div>' +
    '<h4>Ton tableau : écart en secondes → points</h4><p class="muted">Un élève qui a cet écart ou moins obtient ces points.</p>' + pasteTools(i) + '<table class="gt" style="min-width:0"><thead><tr><th>Écart (s)</th><th>Points</th><th></th></tr></thead><tbody>' +
    (c.rows || []).map((r, j) => '<tr><td>' + inp('calcs.' + i + '.rows.' + j + '.max', r.max, '10', 70) + '</td><td>' + inp('calcs.' + i + '.rows.' + j + '.pts', r.pts, '3', 70) + '</td><td><button class="mini" onclick="bMut(b=>b.calcs[' + i + '].rows.splice(' + j + ',1))">✕</button></td></tr>').join('') +
    '</tbody></table><button class="mini" onclick="bMut(b=>b.calcs[' + i + '].rows.push({max:\'\',pts:\'\'}))">+ Palier</button></div>').join('') +
    '<button class="secondary" onclick="bMut(b=>b.calcs.push({id:sid(\'c\'),name:\'Régularité\',type:\'reg_all\',rows:[]}))">+ Ajouter (régularité, estimation…)</button></div>';
  // Critères
  h += '<div class="wstep"><h3><b>4</b>Ce que tu notes toi-même <span class="muted">(facultatif, autant que tu veux : investissement, rôle, échauffement…)</span></h3>' + b.crits.map((c, i) => {
    const L = Math.max(2, Math.min(6, +c.levels || 4)), pts = c.pts || [];
    return '<div class="sub-card"><div class="flex"><input class="grow" value="' + escapeHtml(c.name || '') + '" placeholder="Nom (ex. Investissement)" onchange="bSet(\'crits.' + i + '.name\',this.value,false)"><button class="mini" onclick="bMut(b=>{const id=b.crits[' + i + '].id;b.crits.splice(' + i + ',1);if(b.split&&(b.split.a===id||b.split.b===id))b.split.on=false})">Retirer</button></div>' +
      '<div class="flex" style="margin-top:8px"><label style="margin:0">Nombre de niveaux</label><span class="seg">' + [2, 3, 4, 5, 6].map(n => '<button class="' + (L === n ? 'on' : '') + '" onclick="bSet(\'crits.' + i + '.levels\',' + n + ')">' + n + '</button>').join('') + '</span></div>' +
      (b.split && b.split.on && (b.split.a === c.id || b.split.b === c.id) ? '<p class="notice" style="margin-top:8px">Les points de cet élément dépendent de la répartition choisie par l’élève (étape 5).</p>' : '') +
      (b.split && b.split.on && (b.split.a === c.id || b.split.b === c.id) ? '' : '<div class="pick" style="margin-top:8px"><button class="' + (!c.custom ? 'on' : '') + '" onclick="bSet(\'crits.' + i + '.custom\',false)"><b>Points réguliers</b><span class="muted">Tu donnes le maximum, les niveaux se partagent les points (comme au bac)</span></button><button class="' + (c.custom ? 'on' : '') + '" onclick="bSet(\'crits.' + i + '.custom\',true)"><b>Je choisis les points</b><span class="muted">Tu écris les points de chaque niveau</span></button></div>' +
      (c.custom ? '<div class="flex" style="margin-top:8px">' + Array.from({ length: L }, (_, k) => '<label style="margin:0">N' + (k + 1) + '</label>' + inp('crits.' + i + '.pts.' + k, pts[k], String(k + 1), 64)).join('') + '</div>'
        : '<div class="flex" style="margin-top:8px"><label style="margin:0">Sur combien de points ?</label>' + inp('crits.' + i + '.max', c.max, '4', 70) + '<span class="muted">→ ' + Array.from({ length: L }, (_, k) => 'N' + (k + 1) + ' = ' + nf((k + 1) * (numv(c.max) || 0) / L)).join(' · ') + '</span></div>')) +
      (L === 4 ? '<label class="chk"><input type="checkbox"' + (c.auto ? ' checked' : '') + ' onchange="bSet(\'crits.' + i + '.auto\',this.checked)"> Proposer le niveau automatiquement d’après le respect de l’estimation</label>' + (c.auto ? '<div class="flex">N4 si ≤ ' + inp('crits.' + i + '.th.0', (c.th || [7])[0], '7', 60) + ' s · N3 si ≤ ' + inp('crits.' + i + '.th.1', (c.th || [7, 15])[1], '15', 60) + ' s · N2 si ≤ ' + inp('crits.' + i + '.th.2', (c.th || [7, 15, 24])[2], '24', 60) + ' s · sinon N1</div>' : '') : '') + '</div>';
  }).join('') + '<button class="secondary" onclick="bMut(b=>b.crits.push({id:sid(\'k\'),name:\'\',levels:4,max:\'4\'}))">+ Ajouter ce que je note</button></div>';
  // Répartition au choix
  const sp = b.split || {}, opts = cur => b.crits.map(c => '<option value="' + c.id + '"' + (c.id === cur ? ' selected' : '') + '>' + escapeHtml(c.name || 'Sans nom') + '</option>').join('');
  h += '<div class="wstep"><h3><b>5</b>L’élève choisit sa répartition des points ? <span class="muted">(facultatif, comme AFL2 / AFL3 au bac)</span></h3>' +
    '<label class="chk"><input type="checkbox"' + (sp.on ? ' checked' : '') + ' onchange="barSplit(this.checked)"> Oui : l’élève répartit des points entre deux éléments (par exemple 2-6, 4-4 ou 6-2)</label>' +
    (sp.on && b.crits.length >= 2 ? '<div class="flex"><span>Entre</span><select onchange="bSet(\'split.a\',this.value)">' + opts(sp.a) + '</select><span>et</span><select onchange="bSet(\'split.b\',this.value)">' + opts(sp.b) + '</select></div><label>Répartitions possibles</label>' + inp('split.options', sp.options, '2-6, 4-4, 6-2', 260) + '<p class="muted">Exemple : avec 6-2, le 1er élément est sur 6 points et le 2e sur 2. Chaque niveau donne une part de ces points (sur 6 : N1 = 1,5 · N2 = 3 · N3 = 4,5 · N4 = 6).</p>' : '') + '</div>';
  h += '<p id="barTotal" class="notice">' + barTotalHTML(b) + '</p>';
  box.innerHTML = h;
}
function pasteTools(target) {
  const open = barPaste && barPaste.target === target;
  return '<div class="flex" style="margin:6px 0"><button class="mini" onclick="barPaste={target:' + JSON.stringify(target).replace(/"/g, '&quot;') + '};renderBarWizard()">📋 Coller un tableau</button><label class="btn secondary" style="padding:8px 12px;font-size:14px">📷 Depuis une photo<input type="file" accept="image/*" style="display:none" onchange="barPhoto(event,' + JSON.stringify(target).replace(/"/g, '&quot;') + ')"></label></div>' +
    (open ? '<div class="sub-card">' + (barPaste.photo ? '<img src="' + barPaste.photo + '" style="max-width:100%;border-radius:12px"><p class="muted">Sur l’iPad : touche longuement le texte de la photo (Texte en direct), « Tout sélectionner », « Copier », puis colle ci-dessous.</p>' : '<p class="muted">Copie le tableau depuis Word, Excel, Pages ou un PDF, puis colle-le ici.</p>') +
      '<textarea id="barPasteBox" rows="5" style="width:100%" placeholder="Colle ici le tableau"></textarea><div class="flex" style="margin-top:6px"><button onclick="barApplyPaste()">Lire le tableau</button><button class="mini" onclick="barPaste=null;renderBarWizard()">Annuler</button></div></div>' : '');
}
function barPhoto(e, target) { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { barPaste = { target, photo: r.result }; renderBarWizard(); }; r.readAsDataURL(f); }
async function barApplyPaste() {
  const txt = $('barPasteBox').value, tg = barPaste?.target; if (!txt.trim()) return;
  if (tg === 'perf') { const rows = parsePerfText(txt); if (!rows || !rows.length) return alert('Je n’ai pas trouvé de temps et de points dans ce texte. Vérifie que le tableau contient les temps (ex. 4’30) et les points.'); barPaste = null; await bMut(b => { b.perf.rows = rows; }); alert(rows.length + ' paliers lus. Vérifie-les dans le tableau.'); }
  else { const rows = parsePairText(txt); if (!rows || !rows.length) return alert('Je n’ai pas trouvé de valeurs et de points dans ce texte.'); barPaste = null; await bMut(b => { b.calcs[tg].rows = rows; }); alert(rows.length + ' paliers lus. Vérifie-les dans le tableau.'); }
}
async function barSplit(on) {
  await bMut(b => {
    b.split = b.split || {}; b.split.on = on;
    if (on) {
      while (b.crits.length < 2) b.crits.push({ id: sid('k'), name: b.crits.length ? 'AFL3 · Rôle' : 'AFL2 · S’entraîner', levels: 4, max: '4' });
      const ids = b.crits.map(c => c.id);
      if (!ids.includes(b.split.a)) b.split.a = ids[0];
      if (!ids.includes(b.split.b) || b.split.b === b.split.a) b.split.b = ids.find(x => x !== b.split.a);
      if (!b.split.options) b.split.options = '2-6, 4-4, 6-2';
    }
  });
}
async function barLinkTpl(tid) { const b = curBar(); if (!b) return; state.templates.forEach(t => { if (t.bareme === b.id && t.id !== tid) t.bareme = undefined; }); const t = tplById(tid); if (t) t.bareme = b.id; await persist(); render(); }

/* ================= Assistant « Créer une fiche » ================= */
let fw = null;
function openFicheWizard() { fw = { name: '', dist: 800, n: 2, step: 200, est: true }; editorOpen = false; render(); $('ficheWizard').scrollIntoView({ behavior: 'smooth' }); }
function fwTpl() {
  const d = Math.max(50, +fw.dist || 800), n = Math.max(1, Math.min(8, +fw.n || 1)), st = +fw.step || 0, ord = i => i === 1 ? '1er' : i + 'e';
  const blocks = Array.from({ length: n }, (_, i) => {
    const rows = []; if (fw.est) rows.push({ id: sid('r'), label: 'Estimation', type: 'time' });
    if (st > 0) for (let x = st; x < d - 0.1; x += st) rows.push({ id: sid('r'), label: x + ' m', type: 'time' });
    rows.push({ id: sid('r'), label: d + ' m', type: 'time' });
    return { title: n > 1 ? ord(i + 1) + ' ' + d + ' m' : d + ' m', rows };
  });
  return { id: sid('t'), name: fw.name.trim() || (n > 1 ? n + ' × ' + d + ' m' : d + ' m'), format: 'auto', minutesMax: d >= 1000 ? 9 : 5, cumulative: true, blocks, createdAt: today(), printedFor: [] };
}
function renderFicheWizard() {
  const box = $('ficheWizard'); if (!box) return;
  box.classList.toggle('hidden', !fw); if (!fw) return;
  const t = fwTpl(), lay = Fiche.layoutFor(t);
  const seg = (k, opts) => '<span class="seg">' + opts.map(([v, l]) => '<button class="' + (String(fw[k]) === String(v) ? 'on' : '') + '" onclick="fw.' + k + '=' + JSON.stringify(v).replace(/"/g, '&quot;') + ';renderFicheWizard()">' + l + '</button>').join('') + '</span>';
  box.innerHTML = '<div class="wiz-head"><span class="badge g-blue">📄</span><div class="grow"><small>Nouvelle fiche</small><input class="wiz-title" style="width:360px" value="' + escapeHtml(fw.name) + '" placeholder="' + escapeHtml(t.name) + '" onchange="fw.name=this.value;renderFicheWizard()"></div><button class="mini" onclick="fw=null;render()">Annuler</button></div>' +
    '<div class="grid2"><div>' +
    '<div class="wstep"><h3><b>1</b>Distance d’une course</h3><div class="flex">' + seg('dist', [[500, '500 m'], [800, '800 m'], [1000, '1000 m'], [1500, '1500 m']]) + '<input type="number" style="width:110px" value="' + fw.dist + '" onchange="fw.dist=+this.value;renderFicheWizard()"> m</div></div>' +
    '<div class="wstep"><h3><b>2</b>Nombre de courses</h3>' + seg('n', [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']]) + '</div>' +
    '<div class="wstep"><h3><b>3</b>Temps intermédiaires</h3><div class="flex">' + seg('step', [[0, 'Aucun'], [100, 'Tous les 100 m'], [200, 'Tous les 200 m'], [250, 'Tous les 250 m'], [400, 'Tous les 400 m']]) + '</div></div>' +
    '<div class="wstep"><h3><b>4</b>Estimation avant chaque course</h3>' + seg('est', [[true, 'Oui'], [false, 'Non']]) + '</div>' +
    '<div class="flex"><button class="w-blue" onclick="fwCreate(false)">✓ Créer la fiche</button><button class="secondary" onclick="fwCreate(true)">Créer et personnaliser</button></div>' +
    '</div><div><h3 style="margin-top:0">Aperçu</h3><div class="previewbox">' + Fiche.ficheSVG({ tpl: t, name: 'NOM Prénom', className: 'Classe', payload: Fiche.studentPayload('apercu', t.id), layout: lay }) + '</div><p class="muted">' + (lay.ok ? 'Format ' + lay.fmt + ' · ' + t.blocks.length + ' course(s) · ' + lay.rows.length + ' lignes' : '⚠ ' + lay.error) + '</p></div></div>';
}
async function fwCreate(advanced) {
  const t = fwTpl(), lay = Fiche.layoutFor(t);
  if (!lay.ok) return alert('Fiche impossible : ' + lay.error + '. Réduis le nombre de courses ou de temps intermédiaires.');
  state.templates.push(t); fw = null; await persist();
  if (advanced) editTpl(t.id); else { render(); alert('Fiche « ' + t.name + ' » créée. Tu peux l’imprimer ou lui associer un barème.'); }
}
