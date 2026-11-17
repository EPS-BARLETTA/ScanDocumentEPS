/* ScanDocument EPS — fiches à bulles : mise en page à partir d'un modèle, génération SVG, lecture des photos.
   Cotes en millimètres, origine en haut à gauche. Formats : A5 portrait (148 × 210) ou A4 portrait (210 × 297).

   Modèle : { id, name, format: 'auto'|'A5'|'A4', minutesMax: 5|9,
              blocks: [ { title, rows: [ { id, label, type: 'time'|'number'|'choice', options: ['A','B',…] } ] } ] } */
(function (root) {
  'use strict';

  const FORMATS = { A5: { W: 148, H: 210 }, A4: { W: 210, H: 297 } };
  const PREFIX = 'EPS1:';
  const MK = 6, INSET = 11, QR = 24;
  const TOP = 66;               // première ligne utile sous l'en-tête
  const n2 = v => Math.round(v * 100) / 100;

  function frame(fmt, v2) {
    const { W, H } = FORMATS[fmt];
    return {
      fmt, W, H,
      markers: [[INSET, INSET], [W - INSET, INSET], [W - INSET, H - INSET], [INSET, H - INSET]],
      qr: { x: W - 44, y: 16, size: QR },
      // v2 (fiches créées à partir de novembre 2026) : case manuscrite et bulles plus grandes
      box: v2 ? { x: 27.5, w: 18.5, h: 7.4 } : { x: 29, w: 15, h: 5.6 },
      gx: v2 ? 49.5 : 48, corr: { x: W - 10.5, s: 4 },
      bottom: H - 18
    };
  }

  function rowGroups(row, tpl) {
    if (row.type === 'number') return [{ n: 10, cap: 'dizaine' }, { n: 10, cap: 'unité' }];
    if (row.type === 'choice') { const o = (row.options || []).slice(0, 12); return [{ n: o.length, labels: o, cap: '' }]; }
    return [{ n: (tpl.minutesMax === 9 ? 10 : 6), cap: 'minutes' }, { n: 6, cap: 's · 1er chiffre' }, { n: 10, cap: 's · 2e chiffre' }];
  }

  /** Mise en page : { ok, error, fmt, F, sp, r, rh, blocks:[{title,y}], rows:[{row,block,y,header,groups:[{x,n,labels,cap}]}] } */
  function layoutFor(tpl, forceFmt) {
    const blocks = (tpl.blocks || []).filter(b => (b.rows || []).length);
    if (!blocks.length) return { ok: false, error: 'Ajoute au moins une ligne' };
    const tryFmt = fmt => {
      const v2 = tpl.lay === 2, F = frame(fmt, v2), gap = v2 ? 2 : 2.6;
      let sp = v2 ? (fmt === 'A4' ? 5.4 : 4.4) : fmt === 'A4' ? 4.6 : 3.8;
      for (const b of blocks) for (const row of b.rows) {
        const g = rowGroups(row, tpl), n = g.reduce((a, x) => a + x.n, 0);
        if (!n) return { ok: false, error: 'La ligne « ' + row.label + ' » n’a aucune case' };
        const avail = F.corr.x - F.corr.s / 2 - 3 - F.gx;
        sp = Math.min(sp, (avail - (g.length - 1) * gap) / Math.max(1, n - 1));
      }
      if (sp < 2.9) return { ok: false, error: 'Ligne trop longue (trop de cases)' };
      const r = v2 ? Math.min(fmt === 'A4' ? 2.3 : 2, sp * 0.45) : Math.min(fmt === 'A4' ? 1.9 : 1.6, sp * 0.42);
      let headers = 0, rows = 0;
      for (const b of blocks) b.rows.forEach((row, i) => { rows++; if (row.type !== 'choice' && (i === 0 || b.rows[i - 1].type !== row.type)) headers++; });
      const fixed = blocks.length * 9 + headers * 4.6, avail = F.bottom - TOP;
      const rh = Math.min(tpl.roomy ? (fmt === 'A4' ? 15 : 13) : v2 ? (fmt === 'A4' ? 11 : 9.4) : fmt === 'A4' ? 10 : 8.2, (avail - fixed - (tpl.lapHelper ? 46 : 0)) / rows);
      if (rh < 6.4) return { ok: false, error: 'Trop de lignes pour une fiche ' + fmt };
      const out = { ok: true, fmt, F, sp, r, rh, blocks: [], rows: [] };
      let y = TOP + 3;
      blocks.forEach((b, bi) => {
        out.blocks.push({ title: b.title || '', y });
        y += 4;
        b.rows.forEach((row, i) => {
          const header = row.type !== 'choice' && (i === 0 || b.rows[i - 1].type !== row.type);
          let hy = null; if (header) { hy = y + 2.6; y += 4.6; }
          const cy = y + rh / 2;
          let x = F.gx; const groups = rowGroups(row, tpl).map(g => { const o = Object.assign({ x }, g); x += (g.n - 1) * sp + sp + gap; return o; });
          out.rows.push({ row, block: bi, y: n2(cy), header: hy, groups });
          y += rh;
        });
        y += 5;
      });
      out.endY = y;
      return out;
    };
    const want = forceFmt || tpl.format;
    if (want === 'A4') return tryFmt('A4');
    const a5 = tryFmt('A5');
    if (a5.ok || want === 'A5') return a5;
    return tryFmt('A4');
  }

  /* ---------- Génération ---------- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const text = (x, y, size, content, extra) => '<text x="' + n2(x) + '" y="' + n2(y) + '" font-size="' + size + '"' + (extra || '') + '>' + esc(content) + '</text>';

  function qrPath(textData, q0) {
    const q = root.qrcode(0, 'M'); q.addData(textData); q.make();
    const n = q.getModuleCount(), m = q0.size / n; let d = '';
    for (let r = 0; r < n; r++) {
      let c = 0;
      while (c < n) {
        if (!q.isDark(r, c)) { c++; continue; }
        const s = c; while (c < n && q.isDark(r, c)) c++;
        d += 'M' + n2(q0.x + s * m) + ' ' + n2(q0.y + r * m) + 'h' + n2((c - s) * m) + 'v' + n2(m) + 'h' + n2(-(c - s) * m) + 'z';
      }
    }
    return d;
  }

  /** opts : { tpl, name, className, payload, spare, inner, layout } */
  function ficheSVG(opts) {
    const lay = opts.layout || layoutFor(opts.tpl);
    if (!lay.ok) return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 148 60" width="148mm" height="60mm"><text x="6" y="30" font-size="5" fill="#b83246">' + esc(lay.error) + '</text></svg>';
    const F = lay.F, navy = '#123d66', o = [], tpl = opts.tpl;
    o.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + F.W + ' ' + F.H + '" ' + (opts.inner ? 'width="' + F.W + '" height="' + F.H + '"' : 'width="' + F.W + 'mm" height="' + F.H + 'mm"') + ' font-family="Helvetica, Arial, sans-serif">');
    o.push('<rect width="' + F.W + '" height="' + F.H + '" fill="#fff"/>');
    for (const [x, y] of F.markers) o.push('<rect x="' + (x - MK / 2) + '" y="' + (y - MK / 2) + '" width="' + MK + '" height="' + MK + '" fill="#000"/>');
    const title = tpl.name || 'Fiche';
    o.push(text(18, 13.8, title.length > 30 ? 3.6 : 4.6, title, ' font-weight="700" fill="' + navy + '"'));
    if (opts.spare) {
      o.push(text(14, 25, 3.2, 'Nom Prénom : ..............................................'));
      o.push(text(14, 31.5, 3.2, 'Classe : ' + (opts.className || '')));
      o.push(text(F.qr.x - 34, 18.6, 2.4, 'FICHE DE SECOURS', ' font-weight="700" fill="#b83246"'));
    } else {
      const name = String(opts.name || '');
      o.push(text(14, 24.4, 3, 'Élève :'));
      o.push(text(25, 24.6, name.length > 24 ? 4.2 : 5.4, name, ' font-weight="700"'));
      o.push(text(14, 31.5, 3, 'Classe :'));
      o.push(text(27, 31.5, 3.4, opts.className || '', ' font-weight="700"'));
    }
    o.push(text(14, 38, 3, 'Observateur : ................................'));
    o.push(text(14, 44, 3, 'Date : ......./......./..........'));
    let payload = opts.payload;
    if (tpl.lay === 2 && typeof payload === 'string' && payload.startsWith(PREFIX)) { const pp = payload.slice(PREFIX.length).split(':'); if (pp[2] && !/~2$/.test(pp[2])) { pp[2] += '~2'; payload = PREFIX + pp.join(':'); } }
    o.push('<path d="' + qrPath(payload, F.qr) + '" fill="' + (opts.qrColor || tpl.qrColor || '#000') + '"/>');
    o.push(text(F.qr.x + QR / 2, F.qr.y + QR + 3, 2, 'ne pas masquer', ' text-anchor="middle" fill="#666"'));
    o.push('<rect x="12" y="47.5" width="' + (F.W - 24) + '" height="15" rx="2" fill="#eef2f8"/>');
    const hasTime = lay.rows.some(r => r.row.type === 'time');
    o.push(text(14.5, 52.3, 2.6, '1. Écris la valeur dans la case.  2. Noircis UNE bulle par colonne (stylo foncé).', ' fill="#333"'));
    o.push(text(14.5, 56.3, 2.6, hasTime ? 'Exemple 2:58 → minutes 2 · secondes 5 puis 8. Temps lus au chrono.' : 'Exemple 27 → dizaine 2 · unité 7.', ' fill="#333"'));
    o.push(text(14.5, 60.3, 2.6, 'Erreur ? Noircis la case « corr. » de la ligne et écris la bonne valeur à côté.', ' fill="#333"'));
    const a = ' text-anchor="middle" fill="#555"';
    lay.blocks.forEach(b => {
      o.push(text(12, b.y + 1, 3.8, b.title, ' font-weight="700" fill="' + navy + '"'));
      o.push(text(F.corr.x, b.y + 1, 2.2, 'corr.', a));
    });
    for (const R of lay.rows) {
      const { row, y } = R;
      if (R.header != null) {
        o.push(text(F.box.x + F.box.w / 2, R.header, 2, row.type === 'time' ? 'temps écrit' : 'nombre écrit', a));
        R.groups.forEach(g => g.cap && o.push(text(g.x + (g.n - 1) * lay.sp / 2, R.header, 2, g.cap, a)));
      }
      const lab = String(row.label || '');
      o.push(text(12, y + 1.1, lab.length > 10 ? 2.4 : 3, lab));
      if (row.type !== 'choice') o.push('<rect x="' + F.box.x + '" y="' + n2(y - F.box.h / 2) + '" width="' + F.box.w + '" height="' + F.box.h + '" fill="none" stroke="#555" stroke-width="0.3"/>');
      R.groups.forEach(g => {
        for (let k = 0; k < g.n; k++) {
          const cx = n2(g.x + k * lay.sp), lb = g.labels ? String(g.labels[k]) : String(k);
          o.push('<circle cx="' + cx + '" cy="' + y + '" r="' + n2(lay.r) + '" fill="none" stroke="#666" stroke-width="0.25"/>');
          { const fs = Math.min(2.4, lay.r * (lb.length > 1 ? 1.05 : 1.5)); o.push(text(cx, y + fs * 0.36, n2(fs), lb, ' text-anchor="middle" fill="#444" font-weight="700"')); }
        }
      });
      o.push('<rect x="' + (F.corr.x - F.corr.s / 2) + '" y="' + n2(y - F.corr.s / 2) + '" width="' + F.corr.s + '" height="' + F.corr.s + '" fill="none" stroke="#666" stroke-width="0.25"/>');
    }
    if (tpl.lapHelper && lay.endY) o.push(lapHelperSVG(tpl.lapHelper, F, lay.endY + 2, tpl, lay));
    o.push(text(F.W / 2, F.H - 10.2, 2.2, 'Imprimer en taille réelle · ne pas plier · photographier toute la fiche, les 4 carrés visibles', ' text-anchor="middle" fill="#777"'));
    o.push('</svg>');
    return o.join('');
  }

  /* Aide au comptage des tours + exemple de remplissage : décor seulement, jamais lu par l'appli */
  function lapHelperSVG(h, F, y0, tpl, lay) {
    const o = [], n = h.n || 10, mark = h.mark || 0, x0 = 19, x1 = F.W - 17, g = '#8a94a6';
    o.push('<rect x="12" y="' + n2(y0) + '" width="' + (F.W - 24) + '" height="40" rx="3" fill="none" stroke="#c9d2de" stroke-width="0.3" stroke-dasharray="1.2 1"/>');
    o.push(text(15, y0 + 5.2, 2.6, 'Pour compter les tours : barre un rond à chaque tour (aide, non lue par l’appli)', ' fill="' + g + '" font-style="italic"'));
    const step = (x1 - x0 - 10) / (n - 1), cy = y0 + 13.5;
    for (let i = 0; i < n; i++) {
      const cx = x0 + 3.5 + i * step + (mark && i >= mark ? 6 : 0) - (mark ? 3 : 0);
      o.push('<circle cx="' + n2(cx) + '" cy="' + n2(cy) + '" r="3.3" fill="none" stroke="' + g + '" stroke-width="0.35"/>');
      o.push(text(cx, cy + 1.2, 3.2, String(i + 1), ' text-anchor="middle" fill="' + g + '"'));
      if (mark && i === mark - 1) { const sx = cx + 3.3 + (step - 6.6 + 6) / 2; o.push('<line x1="' + n2(sx) + '" y1="' + n2(cy - 5) + '" x2="' + n2(sx) + '" y2="' + n2(cy + 5) + '" stroke="' + g + '" stroke-width="0.4"/>'); o.push(text(sx, cy + 8.6, 2.4, (h.markLabel || 'passage') + ' : note le temps', ' text-anchor="middle" fill="' + g + '"')); }
      if (i === n - 1) o.push(text(cx, cy + 8.6, 2.4, h.endLabel || 'arrivée', ' text-anchor="middle" fill="' + g + '"'));
    }
    // exemple de remplissage
    // exemple aligné sur les vraies colonnes
    const ey = y0 + 33, R0 = lay.rows.find(x => x.row.type === 'time');
    o.push(text(15, ey + 0.9, 2.6, 'Exemple : 4:52 →', ' fill="' + g + '" font-weight="700"'));
    if (R0) [4, 5, 2].forEach((on, gi) => { const G = R0.groups[gi]; if (!G) return; for (let k = 0; k < G.n; k++) { const cx = n2(G.x + k * lay.sp); o.push('<circle cx="' + cx + '" cy="' + n2(ey) + '" r="' + n2(lay.r * 0.9) + '" fill="' + (k === on ? '#9aa3b2' : 'none') + '" stroke="#9aa3b2" stroke-width="0.2"/>'); if (k !== on) o.push(text(cx, ey + 0.6, 1.7, String(k), ' text-anchor="middle" fill="#9aa3b2"')); } });
    return o.join('');
  }

  /** Pages A4 portrait à imprimer. A5 : deux fiches tournées par page ; A4 : une fiche par page. */
  function pagesSVG(list) {
    if (!list.length) return [];
    const lay = layoutFor(list[0].tpl), pages = [];
    if (!lay.ok) return [ficheSVG(list[0])];
    if (lay.fmt === 'A4') return list.map(f => ficheSVG(Object.assign({}, f, { layout: lay })).replace('<svg ', '<svg class="page" '));
    for (let i = 0; i < list.length; i += 2) {
      const o = ['<svg xmlns="http://www.w3.org/2000/svg" class="page" viewBox="0 0 210 297" width="210mm" height="297mm">', '<rect width="210" height="297" fill="#fff"/>'];
      list.slice(i, i + 2).forEach((f, k) => o.push('<g transform="translate(0,' + (k ? 297 : 148) + ') rotate(-90)">' + ficheSVG(Object.assign({}, f, { inner: true, layout: lay })) + '</g>'));
      o.push('<line x1="0" y1="148.5" x2="210" y2="148.5" stroke="#aaa" stroke-width="0.2" stroke-dasharray="2 2"/></svg>');
      pages.push(o.join(''));
    }
    return pages;
  }

  const studentPayload = (sid, tid, name) => PREFIX + 'E:' + sid + ':' + tid + (name ? ':' + String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z ]/g, '').trim().replace(/ +/g, '_').slice(0, 24) : '');
  const sparePayload = (cid, tid) => PREFIX + 'S:' + cid + ':' + tid;
  const namePayload = (name, tid) => PREFIX + 'N:' + encodeURIComponent(name) + ':' + tid;
  function safeDecode(x) { try { return decodeURIComponent(x); } catch (e) { return x; } }
  function parsePayload(p) {
    if (typeof p !== 'string' || !p.startsWith(PREFIX)) return null;
    const parts = p.slice(PREFIX.length).split(':');
    // « ~2 » après l'identifiant de fiche = mise en page grandes bulles (v2), quelle que soit la fiche enregistrée sur l'appareil
    const lay2 = /~2$/.test(parts[2] || ''); if (lay2) parts[2] = parts[2].slice(0, -2);
    const r = parsePayload0(parts); if (r) r.lay2 = lay2; return r;
  }
  function parsePayload0(parts) {
    if (parts[0] === 'E' && parts[1]) return { kind: 'student', id: parts[1], tpl: parts[2] || null, name: parts[3] ? safeDecode(parts.slice(3).join(':')).replace(/_/g, ' ') : null };
    if (parts[0] === 'S' && parts[1]) return { kind: 'spare', classId: parts[1], tpl: parts[2] || null };
    if (parts[0] === 'N' && parts[1]) return { kind: 'name', name: decodeURIComponent(parts[1]), tpl: parts[2] || null };
    return null;
  }

  /* ---------- Lecture ---------- */
  function toGray(rgba, w, h) {
    const g = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
    return g;
  }

  function binarize(gray, w, h) {
    const I = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += gray[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; } }
    const s = Math.max(16, Math.round(Math.max(w, h) / 9)), half = s >> 1, out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - half), y1 = Math.min(h, y + half + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - half), x1 = Math.min(w, x + half + 1);
        const sum = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
        out[y * w + x] = gray[y * w + x] * (x1 - x0) * (y1 - y0) < sum * 0.78 ? 1 : 0;
      }
    }
    return out;
  }

  function squareBlobs(bin, w, h) {
    const N = w * h, minA = Math.max(60, N * 0.00002), maxA = N * 0.012, stack = new Int32Array(N), out = [];
    for (let start = 0; start < N; start++) {
      if (!bin[start]) continue;
      let sp = 0, n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, minx = w, maxx = 0, miny = h, maxy = 0;
      stack[sp++] = start; bin[start] = 0;
      while (sp) {
        const p = stack[--sp], x = p % w, y = (p - x) / w;
        n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
        if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
        if (x > 0 && bin[p - 1]) { bin[p - 1] = 0; stack[sp++] = p - 1; }
        if (x < w - 1 && bin[p + 1]) { bin[p + 1] = 0; stack[sp++] = p + 1; }
        if (y > 0 && bin[p - w]) { bin[p - w] = 0; stack[sp++] = p - w; }
        if (y < h - 1 && bin[p + w]) { bin[p + w] = 0; stack[sp++] = p + w; }
      }
      if (n < minA || n > maxA) continue;
      const mx = sx / n, my = sy / n, vx = sxx / n - mx * mx, vy = syy / n - my * my, vxy = sxy / n - mx * my;
      const tr = vx + vy, det = vx * vy - vxy * vxy; if (det <= 0) continue;
      const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det)), l1 = tr / 2 + disc, l2 = tr / 2 - disc;
      const iso = l1 / Math.max(l2, 1e-9), compact = n / (12 * Math.sqrt(det)), fill = n / ((maxx - minx + 1) * (maxy - miny + 1));
      if (iso < 2.2 && compact > 0.85 && compact < 1.2 && fill > 0.45) out.push({ x: mx, y: my, n });
    }
    return out;
  }

  function quadArea(p) {
    const c = p.reduce((a, q) => [a[0] + q.x / 4, a[1] + q.y / 4], [0, 0]);
    const s = p.slice().sort((a, b) => Math.atan2(a.y - c[1], a.x - c[0]) - Math.atan2(b.y - c[1], b.x - c[0]));
    let A = 0; for (let i = 0; i < 4; i++) { const a = s[i], b = s[(i + 1) % 4]; A += a.x * b.y - b.x * a.y; }
    return Math.abs(A) / 2;
  }

  // Coins attendus : quadrilatère proche d'un parallélogramme (photo légèrement en perspective)
  function quadOK(q) {
    const c = q.reduce((a, p) => [a[0] + p.x / 4, a[1] + p.y / 4], [0, 0]);
    const s = q.slice().sort((a, b) => Math.atan2(a.y - c[1], a.x - c[0]) - Math.atan2(b.y - c[1], b.x - c[0]));
    const diag = Math.max(Math.hypot(s[0].x - s[2].x, s[0].y - s[2].y), Math.hypot(s[1].x - s[3].x, s[1].y - s[3].y));
    for (let k = 0; k < 4; k++) { // chaque sommet prédit par les trois autres
      const a = s[(k + 1) % 4], m = s[(k + 2) % 4], b = s[(k + 3) % 4];
      if (Math.hypot(a.x + b.x - m.x - s[k].x, a.y + b.y - m.y - s[k].y) > 0.16 * diag) return false;
    }
    const L = k => Math.hypot(s[k].x - s[(k + 1) % 4].x, s[k].y - s[(k + 1) % 4].y), r = (L(0) + L(2)) / (L(1) + L(3)), ar = Math.min(r, 1 / r);
    return ar > 0.5 && ar < 0.85;
  }

  // Cherche autour d'un point le carré le plus contrasté (repère dans l'ombre ou collé au fond)
  function refineMarker(gray, w, h, px, py, side, radius) {
    const I = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += gray[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; } }
    const box = (x0, y0, x1, y1) => { x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(w, x1); y1 = Math.min(h, y1); const n = (x1 - x0) * (y1 - y0); if (n <= 0) return [0, 0]; return [I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0], n]; };
    const hs = Math.max(2, Math.round(side / 2)), ring = Math.max(2, Math.round(side * 0.45)), st = Math.max(1, Math.round(side / 8));
    let best = null, bs = -1;
    for (let y = Math.round(py - radius); y <= py + radius; y += st) for (let x = Math.round(px - radius); x <= px + radius; x += st) {
      const [si, ni] = box(x - hs, y - hs, x + hs, y + hs), [so, no] = box(x - hs - ring, y - hs - ring, x + hs + ring, y + hs + ring);
      if (!ni || no <= ni) continue;
      const inner = si / ni, outer = (so - si) / (no - ni), score = outer - inner;
      if (score > bs) { bs = score; best = { x, y, n: side * side }; }
    }
    return best && bs > 25 ? best : null;
  }

  function pickMarkers(cands, w, h, gray) {
    const sorted = cands.sort((a, b) => b.n - a.n);
    // les repères (6 mm) sont les plus gros carrés pleins : on écarte ce qui est nettement plus petit (bulles, QR)
    const big = sorted.length ? sorted.filter((p, i) => i < 4 || p.n >= 0.45 * sorted[Math.min(2, sorted.length - 1)].n) : [];
    const top = big.slice(0, 12);
    let best = null, bestA = 0; const alts = [];
    for (let a = 0; a < top.length; a++) for (let b = a + 1; b < top.length; b++) for (let c = b + 1; c < top.length; c++) for (let d = c + 1; d < top.length; d++) {
      const q = [top[a], top[b], top[c], top[d]], ns = q.map(p => p.n);
      if (Math.min(...ns) < 0.4 * Math.max(...ns)) continue;
      const A = quadArea(q); if (quadOK(q)) { if (A > 0.04 * w * h) alts.push({ q, A }); if (A > bestA) { bestA = A; best = q; } }
    }
    if (best && bestA > 0.04 * w * h) { best.alts = alts.sort((x, y) => y.A - x.A); return best; }
    if (!gray) return null;
    // Un repère manquant (ombre, bord) : on part des trois meilleurs, on prédit le quatrième et on le cherche localement
    let tri = null, triA = 0;
    for (let a = 0; a < top.length; a++) for (let b = a + 1; b < top.length; b++) for (let c = b + 1; c < top.length; c++) {
      const t = [top[a], top[b], top[c]], ns = t.map(p => p.n);
      if (Math.min(...ns) < 0.5 * Math.max(...ns)) continue;
      for (let k = 0; k < 3; k++) { // k = sommet de l'angle droit
        const m = t[k], p = t[(k + 1) % 3], q = t[(k + 2) % 3];
        const v1 = [p.x - m.x, p.y - m.y], v2 = [q.x - m.x, q.y - m.y], l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
        const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2), ar = Math.min(l1, l2) / Math.max(l1, l2);
        if (Math.abs(cos) > 0.3 || ar < 0.5 || ar > 0.85) continue;
        const A = l1 * l2 * Math.sqrt(1 - cos * cos);
        if (A > triA) { triA = A; tri = { m, p, q }; }
      }
    }
    if (!tri || triA < 0.04 * w * h) return null;
    const { m, p, q } = tri, side = Math.sqrt((m.n + p.n + q.n) / 3), dx = p.x + q.x - m.x, dy = p.y + q.y - m.y;
    const d = refineMarker(gray, w, h, dx, dy, side, Math.max(side * 1.5, 0.06 * Math.hypot(p.x - q.x, p.y - q.y)));
    return d ? [m, p, q, d] : null;
  }

  function orderMarkers(pts, qrLoc) {
    const c = pts.reduce((a, p) => [a[0] + p.x / 4, a[1] + p.y / 4], [0, 0]);
    let r = [1, 0], u = [0, -1];
    if (qrLoc) { const { topLeftCorner: tl, topRightCorner: trc, bottomLeftCorner: bl } = qrLoc; r = [trc.x - tl.x, trc.y - tl.y]; u = [tl.x - bl.x, tl.y - bl.y]; }
    const nr = Math.hypot(r[0], r[1]) || 1, nu = Math.hypot(u[0], u[1]) || 1;
    const P = pts.map(p => ({ p, a: ((p.x - c[0]) * r[0] + (p.y - c[1]) * r[1]) / nr, b: ((p.x - c[0]) * u[0] + (p.y - c[1]) * u[1]) / nu }));
    const pick = f => { let k = 0; P.forEach((q, i) => { if (f(q) > f(P[k])) k = i; }); return P.splice(k, 1)[0].p; };
    const TL = pick(q => -q.a + q.b), TR = pick(q => q.a + q.b), BR = pick(q => q.a - q.b), BL = P[0].p;
    return [TL, TR, BR, BL];
  }

  function homography(src, dst) {
    const A = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], { x: u, y: v } = dst[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]); A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
    }
    for (let c = 0; c < 8; c++) {
      let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]];
      if (Math.abs(A[c][c]) < 1e-12) return null;
      for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k]; }
    }
    const h = A.map((row, i) => row[8] / row[i]);
    return (x, y) => { const d = h[6] * x + h[7] * y + 1; return [(h[0] * x + h[1] * y + h[2]) / d, (h[3] * x + h[4] * y + h[5]) / d]; };
  }

  function bilinear(gray, w, h, x, y) {
    x = Math.min(w - 1.001, Math.max(0, x)); y = Math.min(h - 1.001, Math.max(0, y));
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * w + x0;
    return gray[i] * (1 - fx) * (1 - fy) + gray[i + 1] * fx * (1 - fy) + gray[i + w] * (1 - fx) * fy + gray[i + w + 1] * fx * fy;
  }

  // Contraste du contour imprimé des bulles d'une ligne pour un petit décalage (dx, dy) en mm
  function ringScore(gray, w, h, H, R, lay, dx, dy) {
    let s = 0, n = 0; const r = lay.r;
    for (const g of R.groups) for (let k = 0; k < g.n; k++) {
      const cx = g.x + k * lay.sp + dx, cy = R.y + dy;
      for (let i = 0; i < 12; i++) { const t = i * Math.PI / 6, [u, v] = H(cx + r * Math.cos(t), cy + r * Math.sin(t)); s -= bilinear(gray, w, h, u, v); }
      for (const t of [Math.PI / 2, -Math.PI / 2, Math.PI / 3, -Math.PI / 3, 2 * Math.PI / 3, -2 * Math.PI / 3]) { const [u, v] = H(cx + 1.3 * r * Math.cos(t), cy + 1.3 * r * Math.sin(t)); s += 2 * bilinear(gray, w, h, u, v); }
      n++;
    }
    return s / Math.max(1, n);
  }
  function bubbleShift(gray, w, h, H, cx, cy, r, pd) {
    let best = [0, 0], bs = -1e9; const M = 0.6, st = 0.15;
    for (let dy = -M; dy <= M + 1e-6; dy += st) for (let dx = -M; dx <= M + 1e-6; dx += st) {
      let s = 0;
      for (let i = 0; i < 16; i++) { const t = i * Math.PI / 8, [u, v] = H(cx + dx + r * Math.cos(t), cy + dy + r * Math.sin(t)); s -= bilinear(gray, w, h, u, v); }
      for (const t of [Math.PI / 2, -Math.PI / 2, Math.PI / 3, -Math.PI / 3, 2 * Math.PI / 3, -2 * Math.PI / 3]) { const [u, v] = H(cx + dx + 1.3 * r * Math.cos(t), cy + dy + 1.3 * r * Math.sin(t)); s += 16 / 6 * bilinear(gray, w, h, u, v); }
      s -= 10 * Math.hypot(dx - pd[0] * 0.5, dy - pd[1] * 0.5);
      if (s > bs) { bs = s; best = [dx, dy]; }
    }
    return best;
  }
  function rowShift(gray, w, h, H, R, lay, prev) {
    let best = prev, bs = -1e9; const st = 0.25, M = 1.5;
    for (let dy = -M; dy <= M + 1e-6; dy += st) for (let dx = -M; dx <= M + 1e-6; dx += st) {
      const sc = ringScore(gray, w, h, H, R, lay, dx, dy) - 0.5 * Math.hypot(dx - prev[0], dy - prev[1]);
      if (sc > bs) { bs = sc; best = [dx, dy]; }
    }
    return best;
  }
  function sampleDisk(gray, w, h, H, cx, cy, rad) {
    let s = 0, n = 0;
    for (const f of [0, 0.35, 0.7]) {
      const k = f === 0 ? 1 : 10;
      for (let i = 0; i < k; i++) { const t = i * 2 * Math.PI / k, [u, v] = H(cx + f * rad * Math.cos(t), cy + f * rad * Math.sin(t)); s += bilinear(gray, w, h, u, v); n++; }
    }
    return s / n;
  }

  // Échantillons denses à l'intérieur d'une bulle (pour repérer un simple trait, une croix, un « v »)
  function diskSamples(gray, w, h, H, cx, cy, rad) {
    const out = [];
    for (const f of [0, 0.22, 0.45, 0.68, 0.9]) {
      const k = f === 0 ? 1 : Math.round(6 + f * 18);
      for (let i = 0; i < k; i++) { const t = i * 2 * Math.PI / k + f, [u, v] = H(cx + f * rad * Math.cos(t), cy + f * rad * Math.sin(t)); out.push(bilinear(gray, w, h, u, v)); }
    }
    return out;
  }
  // part d'encre dans chaque bulle → bulle marquée si nettement au-dessus des autres de la colonne
  function readInk(fr) {
    const sorted = fr.slice().sort((a, b) => a - b), med = sorted[Math.floor(fr.length / 2)];
    const order = fr.map((v, k) => ({ v, k })).sort((a, b) => b.v - a.v), d1 = order[0].v - med, d2 = order[1].v - med;
    if (d1 < 0.09) return { digit: null, state: 'empty' };
    if (d2 < 0.09 || d1 > 2.2 * d2) return { digit: order[0].k, state: 'ok' };
    return { digit: order[0].k, state: 'double' };
  }
  function merge(a, b) { // a : noirceur moyenne, b : part d'encre
    if (a.state === 'double' || b.state === 'double') return { digit: (b.digit ?? a.digit), state: 'double' };
    if (a.state === 'empty') return b; if (b.state === 'empty') return a;
    return a.digit === b.digit ? a : { digit: b.digit, state: 'double' };
  }
  function readGroup(vals) {
    // seuil relatif à la colonne : tolère crayon à papier, stylo clair et éclairage inégal
    const sorted = vals.slice().sort((a, b) => a - b), med = sorted[Math.floor(vals.length / 2)];
    const dev = vals.map(v => Math.abs(v - med)).sort((a, b) => a - b), mad = dev[Math.floor(dev.length / 2)];
    const thr = med - Math.max(0.08 * med, 5 * mad + 4);
    const marked = vals.map((v, k) => ({ v, k })).filter(o => o.v < thr).sort((a, b) => a.v - b.v);
    if (!marked.length) {
      // marque claire mais nettement isolée (crayon, stylo peu appuyé)
      const order = vals.map((v, k) => ({ v, k })).sort((a, b) => a.v - b.v), d1 = med - order[0].v, d2 = Math.max(0, med - order[1].v);
      if (d1 >= 0.05 * med && d1 >= 3 * d2 + 6 && d1 >= 6 * mad) return { digit: order[0].k, state: 'ok' };
      return { digit: null, state: 'empty' };
    }
    if (marked.length === 1) return { digit: marked[0].k, state: 'ok' };
    const d1 = med - marked[0].v, d2 = med - marked[1].v;
    return { digit: marked[0].k, state: d1 > 2.2 * d2 ? 'ok' : 'double' };
  }

  // QR redressé : on rééchantillonne la zone du QR à 10 px/mm grâce au repérage des carrés (perspective, petite fiche, rotation)
  function rectQR(rgba, w, h, M, F) {
    const q = F.qr, m = 3, k = 10, N = Math.round((q.size + 2 * m) * k), g = new Float32Array(N * N), out = new Uint8ClampedArray(N * N * 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const [sx0, sy0] = M(q.x - m + (x + 0.5) / k, q.y - m + (y + 0.5) / k), sx = Math.max(0, Math.min(w - 1.001, sx0)), sy = Math.max(0, Math.min(h - 1.001, sy0));
      const ix = sx | 0, iy = sy | 0, fx = sx - ix, fy = sy - iy, i = (iy * w + ix) * 4, L = j => 0.3 * rgba[j] + 0.59 * rgba[j + 1] + 0.11 * rgba[j + 2];
      g[y * N + x] = L(i) * (1 - fx) * (1 - fy) + L(i + 4) * fx * (1 - fy) + L(i + w * 4) * (1 - fx) * fy + L(i + w * 4 + 4) * fx * fy;
    }
    const tryRead = data => { const r = root.jsQR(data, N, N, { inversionAttempts: 'dontInvert' }); return r ? r.data : null; };
    for (let i = 0; i < N * N; i++) { out[4 * i] = out[4 * i + 1] = out[4 * i + 2] = g[i]; out[4 * i + 3] = 255; }
    let r = tryRead(out); if (r) return r;
    // noir et blanc local (ombres, lumière inégale)
    const S = new Float64Array((N + 1) * (N + 1));
    for (let y = 0; y < N; y++) { let row = 0; for (let x = 0; x < N; x++) { row += g[y * N + x]; S[(y + 1) * (N + 1) + x + 1] = S[y * (N + 1) + x + 1] + row; } }
    const R = Math.round(k * 3);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const x0 = Math.max(0, x - R), x1 = Math.min(N, x + R + 1), y0 = Math.max(0, y - R), y1 = Math.min(N, y + R + 1);
      const mean = (S[y1 * (N + 1) + x1] - S[y0 * (N + 1) + x1] - S[y1 * (N + 1) + x0] + S[y0 * (N + 1) + x0]) / ((x1 - x0) * (y1 - y0));
      const v = g[y * N + x] < mean * 0.85 ? 0 : 255, o = 4 * (y * N + x); out[o] = out[o + 1] = out[o + 2] = v;
    }
    return tryRead(out);
  }
  function cropQR(rgba, w, h, H, F) {
    const rr = rectQR(rgba, w, h, H, F); if (rr) return rr;
    const m = 4, q = F.qr, c = [[q.x - m, q.y - m], [q.x + q.size + m, q.y - m], [q.x + q.size + m, q.y + q.size + m], [q.x - m, q.y + q.size + m]].map(([x, y]) => H(x, y));
    const x0 = Math.max(0, Math.floor(Math.min(...c.map(p => p[0])))), x1 = Math.min(w, Math.ceil(Math.max(...c.map(p => p[0]))));
    const y0 = Math.max(0, Math.floor(Math.min(...c.map(p => p[1])))), y1 = Math.min(h, Math.ceil(Math.max(...c.map(p => p[1]))));
    const cw = x1 - x0, ch = y1 - y0; if (cw < 20 || ch < 20) return null;
    const f = Math.max(1, Math.min(4, 500 / Math.max(cw, ch))), ow = Math.round(cw * f), oh = Math.round(ch * f), out = new Uint8ClampedArray(ow * oh * 4);
    for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
      const sx = Math.min(w - 1.001, x0 + x / f), sy = Math.min(h - 1.001, y0 + y / f), ix = sx | 0, iy = sy | 0, fx = sx - ix, fy = sy - iy, o = (y * ow + x) * 4;
      for (let k = 0; k < 3; k++) { const i = (iy * w + ix) * 4 + k; out[o + k] = rgba[i] * (1 - fx) * (1 - fy) + rgba[i + 4] * fx * (1 - fy) + rgba[i + w * 4] * (1 - fx) * fy + rgba[i + w * 4 + 4] * fx * fy; }
      out[o + 3] = 255;
    }
    const r = root.jsQR(out, ow, oh, { inversionAttempts: 'dontInvert' });
    return r ? r.data : null;
  }

  /**
   * opts : { templateFor(ref) → modèle | null, fallback: modèle, qrZone(H, F) → texte | null }
   * Renvoie { markers, payload, ref, tplId, values: { idLigne: valeur }, issues: [] }
   */
  function analyse(rgba, w, h, opts) {
    opts = opts || {};
    const res = { markers: false, payload: null, ref: null, tplId: null, values: {}, issues: [] };
    const qr = root.jsQR(rgba, w, h, { inversionAttempts: 'dontInvert' });
    if (qr) { res.payload = qr.data; res.ref = parsePayload(qr.data); }
    const gray = toGray(rgba, w, h);
    const pts = pickMarkers(squareBlobs(binarize(gray, w, h), w, h), w, h, gray);
    if (!pts) { res.issues.push('Repères introuvables : reprends la photo à plat, les 4 carrés noirs bien visibles'); return res; }
    let ordered = orderMarkers(pts, qr && qr.location);
    let H = null, F = null;
    if (!qr) {
      search: for (const fmt of ['A5', 'A4']) for (let k = 0; k < 4; k++) {
        const ok = ordered.slice(k).concat(ordered.slice(0, k)), Fk = frame(fmt), Hk = homography(Fk.markers, ok);
        if (!Hk) continue;
        const found = cropQR(rgba, w, h, Hk, Fk) || (opts.qrZone && opts.qrZone(Hk, Fk));
        if (found) { res.payload = found; res.ref = parsePayload(found); H = Hk; F = Fk; ordered = ok; break search; }
      }
    }
    let tpl = res.ref && opts.templateFor ? opts.templateFor(res.ref) : null;
    if (!res.ref) res.issues.push(res.payload ? 'QR code inconnu : choisis l’élève' : 'QR code illisible : choisis l’élève');
    else if (!tpl) res.issues.push('Modèle de fiche inconnu sur cet appareil');
    else if (res.ref.kind === 'spare') res.issues.push('Fiche de secours : choisis l’élève');
    if (!tpl) tpl = opts.fallback;
    if (!tpl) return res;
    res.tplId = tpl.id;
    const lay = layoutFor(tpl);
    if (!lay.ok) { res.issues.push(lay.error); return res; }
    // Pile de fiches : les repères de la feuille du dessous peuvent former un plus grand cadre → on garde le cadre aux bonnes proportions
    if (opts.debug) res.dbgAlts = (pts.alts || []).map(a => ({ A: Math.round(a.A), q: a.q.map(p => [Math.round(p.x), Math.round(p.y)]) }));
    if (pts.alts && pts.alts.length > 1) {
      const exp = (lay.F.H - 2 * INSET) / (lay.F.W - 2 * INSET), loc = qr && qr.location;
      const err = q => { const o = orderMarkers(q, loc), d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y), L = d(o[0], o[3]), R = d(o[1], o[2]), T = d(o[0], o[1]), B = d(o[3], o[2]);
        return Math.abs((L + R) / (T + B) / exp - 1) + Math.abs(L - R) / (L + R) + Math.abs(T - B) / (T + B); };
      const Am = pts.alts[0].A, sc = a => err(a.q) - 0.15 * a.A / Am, big = pts.alts.slice().sort((a, b) => sc(a) - sc(b))[0];
      if (big && big.q !== pts) { ordered = orderMarkers(big.q, loc); H = null; }
    }
    if (!H || F.fmt !== lay.fmt) { F = lay.F; H = homography(F.markers, ordered); }
    if (!H) { res.issues.push('Photo trop déformée : reprends-la de face'); return res; }
    res.markers = true;
    // bandeau du nom imprimé, redressé (pour reconnaître l'élève si son QR vient d'une ancienne liste)
    if (!res.ref || res.ref.kind === 'student') {
      const k = 8, x0 = 24, x1 = Math.min(F.qr.x - 2, 24 + 95), y0 = 19.2, y1 = 26.8, nw = Math.round((x1 - x0) * k), nh = Math.round((y1 - y0) * k), g = new Uint8ClampedArray(nw * nh);
      for (let j = 0; j < nh; j++) for (let i = 0; i < nw; i++) { const [u, v] = H(x0 + i / k, y0 + j / k); g[j * nw + i] = bilinear(gray, w, h, u, v); }
      res.nameStrip = { w: nw, h: nh, g };
    }
    if (opts.debug) res.dbg = { ordered, H, lay };
    if (qr) {
      const [qx, qy] = H(F.qr.x + QR / 2, F.qr.y + QR / 2), loc = qr.location;
      const cx = (loc.topLeftCorner.x + loc.bottomRightCorner.x) / 2, cy = (loc.topLeftCorner.y + loc.bottomRightCorner.y) / 2;
      const [ax, ay] = H(0, 0), [bx, by] = H(F.W, 0);
      if (Math.hypot(qx - cx, qy - cy) > 0.08 * Math.hypot(bx - ax, by - ay)) res.issues.push('Repérage douteux : vérifie les valeurs sur la photo');
    }
    const titles = lay.blocks.map(b => b.title), filled = titles.map(() => 0), pend = titles.map(() => []);
    let prev = [0, 0];
    for (const R of lay.rows) {
      const { row } = R;
      // recalage local de la ligne (feuille gondolée, photo pas tout à fait à plat)
      const [ox, oy] = opts.noShift ? [0, 0] : rowShift(gray, w, h, H, R, lay, prev); prev = [ox, oy];
      const y = R.y + oy, G = R.groups.map(g => Object.assign({}, g, { x: g.x + ox }));
      // chaque bulle est recentrée sur son contour imprimé (feuille pas tout à fait plane) ; si la ligne reste illisible, on garde la position calculée
      const readAt = shift => {
        const C = G.map(g => { let pd = [0, 0]; return Array.from({ length: g.n }, (_, k) => { const c = shift ? bubbleShift(gray, w, h, H, g.x + k * lay.sp, y, lay.r, pd) : [0, 0]; pd = c; return [g.x + k * lay.sp + c[0], y + c[1]]; }); });
        // fond local (papier juste au-dessus et au-dessous de chaque bulle) : corrige ombres et dégradés de lumière
        const P = C.map(g => g.map(([cx, cy]) => { const a = []; for (const t of [-2.1, -1.57, -1.05, 1.05, 1.57, 2.1]) { const [u, v] = H(cx + 1.45 * lay.r * Math.cos(t), cy + 1.45 * lay.r * Math.sin(t)); a.push(bilinear(gray, w, h, u, v)); } a.sort((x, z) => x - z); return Math.max(20, a[3]); }));
        const vals = C.map((g, gi) => g.map(([cx, cy], k) => sampleDisk(gray, w, h, H, cx, cy, lay.r * 0.62) * 200 / P[gi][k]));
        const smp = C.map((g, gi) => g.map(([cx, cy], k) => diskSamples(gray, w, h, H, cx, cy, lay.r * 0.8).map(x => x * 200 / P[gi][k])));
        const allS = smp.flat(2).sort((a, b) => a - b), paper = allS[Math.floor(allS.length * 0.8)], cut = paper * 0.8;
        const digits = vals.map((v, gi) => merge(readGroup(v), readInk(smp[gi].map(arr => arr.filter(x => x < cut).length / arr.length))));
        if (row.type === 'time' && digits[0].state === 'empty' && digits[1].state !== 'empty' && digits[2].state !== 'empty') digits[0] = { digit: 0, state: 'ok' };
        if (opts.debug) (res.dbgRows = res.dbgRows || []).push({ shift, c: C.flat().map(([a, b]) => H(a, b).map(Math.round)), l: row.label, v: vals.map(a => a.map(Math.round).join(' ')), paper: Math.round(paper) });
        return { vals, digits };
      };
      let rd = readAt(!opts.noShift);
      if (!opts.noShift && rd.digits.some(d => d.state !== 'ok')) { const r0 = readAt(false); if (r0.digits.every(d => d.state === 'ok')) rd = r0; }
      const { vals, digits } = rd;
      const all = vals.flat().sort((a, b) => a - b), med = all[Math.floor(all.length / 2)];
      const corrP = [[0, -2.9], [0, 2.9], [-3.2, 0], [3.2, 0]].map(([a, b]) => { const [u, v] = H(F.corr.x + a, y + b); return bilinear(gray, w, h, u, v); }).sort((a, b) => a - b), corr = sampleDisk(gray, w, h, H, F.corr.x, y, 1.3) * 200 / Math.max(20, corrP[2]) < med * 0.8;
      const where = (titles[R.block] ? titles[R.block] + ' · ' : '') + row.label;
      const nEmpty = digits.filter(d => d.state === 'empty').length;
      if (nEmpty === digits.length) { pend[R.block].push(corr ? where + ' : correction signalée, valeur écrite à reporter' : where + ' : ligne vide'); continue; }
      filled[R.block]++;
      if (nEmpty) pend[R.block].push(where + ' : ligne incomplète');
      if (digits.some(d => d.state === 'double')) pend[R.block].push(where + ' : deux bulles noircies dans une colonne');
      if (corr) pend[R.block].push(where + ' : correction signalée, compare avec la valeur écrite');
      if (nEmpty) continue;
      if (row.type === 'time') res.values[row.id] = digits[0].digit + ':' + digits[1].digit + digits[2].digit;
      else if (row.type === 'number') res.values[row.id] = String(digits[0].digit * 10 + digits[1].digit);
      else res.values[row.id] = String(R.groups[0].labels[digits[0].digit]);
    }
    titles.forEach((t, i) => {
      if (!filled[i]) res.issues.push((t || 'Bloc ' + (i + 1)) + ' non rempli');
      else pend[i].forEach(x => res.issues.push(x));
    });
    // temps de passage cumulés : chacun doit être plus grand que le précédent
    if (tpl.cumulative !== false) (tpl.blocks || []).forEach(b => {
      let last = -1;
      b.rows.filter(r => r.type === 'time' && !/estim/i.test(r.label)).forEach(r => {
        const v = res.values[r.id], m = v && /^(\d+):(\d\d)$/.exec(v); if (!m) return;
        const t = +m[1] * 60 + +m[2]; if (t <= last) res.issues.push((b.title ? b.title + ' · ' : '') + r.label + ' : temps plus petit que le précédent, vérifie'); last = t;
      });
    });
    return res;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image(), url = typeof src === 'string' ? src : URL.createObjectURL(src);
      img.onload = () => { if (typeof src !== 'string') URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => reject(Error('Photo illisible'));
      img.src = url;
    });
  }

  /** src : File/Blob ou dataURL. opts comme analyse(). */
  async function read(src, opts) {
    const img = await loadImage(src), s = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.naturalWidth * s); cv.height = Math.round(img.naturalHeight * s);
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    const qrZone = (Hk, Fk) => {
      const m = 4, q = Fk.qr, c = [[q.x - m, q.y - m], [q.x + q.size + m, q.y + q.size + m], [q.x + q.size + m, q.y - m], [q.x - m, q.y + q.size + m]].map(([x, y]) => Hk(x, y).map(v => v / s));
      const x0 = Math.max(0, Math.min(...c.map(p => p[0]))), y0 = Math.max(0, Math.min(...c.map(p => p[1])));
      const cw = Math.min(img.naturalWidth, Math.max(...c.map(p => p[0]))) - x0, chh = Math.min(img.naturalHeight, Math.max(...c.map(p => p[1]))) - y0;
      if (cw < 20 || chh < 20) return null;
      const f = Math.min(1, 900 / Math.max(cw, chh)), z = document.createElement('canvas');
      z.width = Math.round(cw * f); z.height = Math.round(chh * f);
      const zc = z.getContext('2d', { willReadFrequently: true });
      zc.drawImage(img, x0, y0, cw, chh, 0, 0, z.width, z.height);
      const zd = zc.getImageData(0, 0, z.width, z.height).data;
      const r = root.jsQR(zd, z.width, z.height, { inversionAttempts: 'dontInvert' });
      if (r) return r.data;
      // zone à pleine résolution, redressée
      const g = Math.min(1, 1600 / Math.max(cw, chh)), z2 = document.createElement('canvas'); z2.width = Math.round(cw * g); z2.height = Math.round(chh * g);
      const c2 = z2.getContext('2d', { willReadFrequently: true }); c2.drawImage(img, x0, y0, cw, chh, 0, 0, z2.width, z2.height);
      return rectQR(c2.getImageData(0, 0, z2.width, z2.height).data, z2.width, z2.height, (x, y) => { const [u, v] = Hk(x, y); return [(u / s - x0) * g, (v / s - y0) * g]; }, Fk);
    };
    return analyse(ctx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height, Object.assign({}, opts, { qrZone }));
  }

  root.Fiche = { _int: { toGray, binarize, squareBlobs, pickMarkers }, FORMATS, layoutFor, ficheSVG, pagesSVG, studentPayload, sparePayload, namePayload, parsePayload, analyse, read };
})(typeof self !== 'undefined' ? self : globalThis);
