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

  function frame(fmt) {
    const { W, H } = FORMATS[fmt];
    return {
      fmt, W, H,
      markers: [[INSET, INSET], [W - INSET, INSET], [W - INSET, H - INSET], [INSET, H - INSET]],
      qr: { x: W - 44, y: 16, size: QR },
      box: { x: 29, w: 15, h: 5.6 },
      gx: 48, corr: { x: W - 10.5, s: 4 },
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
      const F = frame(fmt), gap = 2.6;
      let sp = fmt === 'A4' ? 4.6 : 3.8;
      for (const b of blocks) for (const row of b.rows) {
        const g = rowGroups(row, tpl), n = g.reduce((a, x) => a + x.n, 0);
        if (!n) return { ok: false, error: 'La ligne « ' + row.label + ' » n’a aucune case' };
        const avail = F.corr.x - F.corr.s / 2 - 3 - F.gx;
        sp = Math.min(sp, (avail - (g.length - 1) * gap) / Math.max(1, n - 1));
      }
      if (sp < 2.9) return { ok: false, error: 'Ligne trop longue (trop de cases)' };
      const r = Math.min(fmt === 'A4' ? 1.9 : 1.6, sp * 0.42);
      let headers = 0, rows = 0;
      for (const b of blocks) b.rows.forEach((row, i) => { rows++; if (row.type !== 'choice' && (i === 0 || b.rows[i - 1].type !== row.type)) headers++; });
      const fixed = blocks.length * 9 + headers * 4.6, avail = F.bottom - TOP;
      const rh = Math.min(fmt === 'A4' ? 10 : 8.2, (avail - fixed) / rows);
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
    o.push('<path d="' + qrPath(opts.payload, F.qr) + '" fill="' + (opts.qrColor || tpl.qrColor || '#000') + '"/>');
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
          o.push(text(cx, y + lay.r * 0.42, n2(Math.min(1.9, lay.r * (lb.length > 1 ? 0.85 : 1.2))), lb, ' text-anchor="middle" fill="#999"'));
        }
      });
      o.push('<rect x="' + (F.corr.x - F.corr.s / 2) + '" y="' + n2(y - F.corr.s / 2) + '" width="' + F.corr.s + '" height="' + F.corr.s + '" fill="none" stroke="#666" stroke-width="0.25"/>');
    }
    o.push(text(F.W / 2, F.H - 10.2, 2.2, 'Imprimer en taille réelle · ne pas plier · photographier toute la fiche, les 4 carrés visibles', ' text-anchor="middle" fill="#777"'));
    o.push('</svg>');
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

  const studentPayload = (sid, tid) => PREFIX + 'E:' + sid + ':' + tid;
  const sparePayload = (cid, tid) => PREFIX + 'S:' + cid + ':' + tid;
  const namePayload = (name, tid) => PREFIX + 'N:' + encodeURIComponent(name) + ':' + tid;
  function parsePayload(p) {
    if (typeof p !== 'string' || !p.startsWith(PREFIX)) return null;
    const parts = p.slice(PREFIX.length).split(':');
    if (parts[0] === 'E' && parts[1]) return { kind: 'student', id: parts[1], tpl: parts[2] || null };
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

  function pickMarkers(cands, w, h) {
    const top = cands.sort((a, b) => b.n - a.n).slice(0, 10);
    let best = null, bestA = 0;
    for (let a = 0; a < top.length; a++) for (let b = a + 1; b < top.length; b++) for (let c = b + 1; c < top.length; c++) for (let d = c + 1; d < top.length; d++) {
      const q = [top[a], top[b], top[c], top[d]], ns = q.map(p => p.n);
      if (Math.min(...ns) < 0.3 * Math.max(...ns)) continue;
      const A = quadArea(q); if (A > bestA) { bestA = A; best = q; }
    }
    return best && bestA > 0.04 * w * h ? best : null;
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

  function sampleDisk(gray, w, h, H, cx, cy, rad) {
    let s = 0, n = 0;
    for (const f of [0, 0.35, 0.7]) {
      const k = f === 0 ? 1 : 10;
      for (let i = 0; i < k; i++) { const t = i * 2 * Math.PI / k, [u, v] = H(cx + f * rad * Math.cos(t), cy + f * rad * Math.sin(t)); s += bilinear(gray, w, h, u, v); n++; }
    }
    return s / n;
  }

  function readGroup(vals) {
    const sorted = vals.slice().sort((a, b) => a - b), med = sorted[Math.floor(vals.length / 2)], thr = med * 0.75;
    const marked = vals.map((v, k) => ({ v, k })).filter(o => o.v < thr).sort((a, b) => a.v - b.v);
    if (!marked.length) return { digit: null, state: 'empty' };
    if (marked.length === 1) return { digit: marked[0].k, state: 'ok' };
    const d1 = med - marked[0].v, d2 = med - marked[1].v;
    return { digit: marked[0].k, state: d1 > 2.2 * d2 ? 'ok' : 'double' };
  }

  function cropQR(rgba, w, h, H, F) {
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
    const pts = pickMarkers(squareBlobs(binarize(gray, w, h), w, h), w, h);
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
    if (!H || F.fmt !== lay.fmt) { F = lay.F; H = homography(F.markers, ordered); }
    if (!H) { res.issues.push('Photo trop déformée : reprends-la de face'); return res; }
    res.markers = true;
    if (qr) {
      const [qx, qy] = H(F.qr.x + QR / 2, F.qr.y + QR / 2), loc = qr.location;
      const cx = (loc.topLeftCorner.x + loc.bottomRightCorner.x) / 2, cy = (loc.topLeftCorner.y + loc.bottomRightCorner.y) / 2;
      const [ax, ay] = H(0, 0), [bx, by] = H(F.W, 0);
      if (Math.hypot(qx - cx, qy - cy) > 0.08 * Math.hypot(bx - ax, by - ay)) res.issues.push('Repérage douteux : vérifie les valeurs sur la photo');
    }
    const titles = lay.blocks.map(b => b.title), filled = titles.map(() => 0), pend = titles.map(() => []);
    for (const R of lay.rows) {
      const { row, y } = R;
      const vals = R.groups.map(g => Array.from({ length: g.n }, (_, k) => sampleDisk(gray, w, h, H, g.x + k * lay.sp, y, lay.r * 0.62)));
      const digits = vals.map(readGroup);
      const all = vals.flat().sort((a, b) => a - b), med = all[Math.floor(all.length / 2)];
      const corr = sampleDisk(gray, w, h, H, F.corr.x, y, 1.3) < med * 0.8;
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
    const qrZone = s >= 1 ? null : (Hk, Fk) => {
      const m = 4, q = Fk.qr, c = [[q.x - m, q.y - m], [q.x + q.size + m, q.y + q.size + m], [q.x + q.size + m, q.y - m], [q.x - m, q.y + q.size + m]].map(([x, y]) => Hk(x, y).map(v => v / s));
      const x0 = Math.max(0, Math.min(...c.map(p => p[0]))), y0 = Math.max(0, Math.min(...c.map(p => p[1])));
      const cw = Math.min(img.naturalWidth, Math.max(...c.map(p => p[0]))) - x0, chh = Math.min(img.naturalHeight, Math.max(...c.map(p => p[1]))) - y0;
      if (cw < 20 || chh < 20) return null;
      const f = Math.min(1, 900 / Math.max(cw, chh)), z = document.createElement('canvas');
      z.width = Math.round(cw * f); z.height = Math.round(chh * f);
      const zc = z.getContext('2d', { willReadFrequently: true });
      zc.drawImage(img, x0, y0, cw, chh, 0, 0, z.width, z.height);
      const r = root.jsQR(zc.getImageData(0, 0, z.width, z.height).data, z.width, z.height, { inversionAttempts: 'dontInvert' });
      return r ? r.data : null;
    };
    return analyse(ctx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height, Object.assign({}, opts, { qrZone }));
  }

  root.Fiche = { FORMATS, layoutFor, ficheSVG, pagesSVG, studentPayload, sparePayload, namePayload, parsePayload, analyse, read };
})(typeof self !== 'undefined' ? self : globalThis);
