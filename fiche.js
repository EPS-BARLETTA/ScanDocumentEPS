/* ScanDocument EPS — fiche A5 2 × 800 m : génération (SVG) et lecture automatique (photo).
   Toutes les cotes sont en millimètres, origine en haut à gauche de la fiche A5 (148 × 210). */
(function (root) {
  'use strict';

  const L = {
    W: 148, H: 210, mk: 6,
    markers: [[11, 11], [137, 11], [137, 199], [11, 199]], // centres : haut-gauche, haut-droit, bas-droit, bas-gauche
    qr: { x: 104, y: 16, size: 24 },
    sp: 3.8, r: 1.6,
    box: { x: 29, w: 15, h: 5.6 },
    groups: [{ x: 48, n: 6 }, { x: 48 + 6 * 3.8 + 2.6, n: 6 }, { x: 48 + 12 * 3.8 + 5.2, n: 10 }],
    corr: { x: 137.5, s: 4 },
    rowLabels: ['Estimation', '200 m', '400 m', '600 m', '800 m'],
    races: [
      { title: '1er 800 m', y: 69, rows: [80, 88.2, 96.4, 104.6, 112.8] },
      { title: '2e 800 m', y: 128, rows: [139, 147.2, 155.4, 163.6, 171.8] }
    ]
  };
  const PREFIX = 'EPS1:';

  /* ---------- Génération ---------- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n2 = v => Math.round(v * 100) / 100;

  function qrPath(text) {
    const q = root.qrcode(0, 'M'); q.addData(text); q.make();
    const n = q.getModuleCount(), m = L.qr.size / n; let d = '';
    for (let r = 0; r < n; r++) {
      let c = 0;
      while (c < n) {
        if (!q.isDark(r, c)) { c++; continue; }
        let s = c; while (c < n && q.isDark(r, c)) c++;
        d += 'M' + n2(L.qr.x + s * m) + ' ' + n2(L.qr.y + r * m) + 'h' + n2((c - s) * m) + 'v' + n2(m) + 'h' + n2(-(c - s) * m) + 'z';
      }
    }
    return d;
  }

  function text(x, y, size, content, extra) {
    return '<text x="' + n2(x) + '" y="' + n2(y) + '" font-size="' + size + '"' + (extra || '') + '>' + esc(content) + '</text>';
  }

  /** opts : { name, className, payload, spare, inner } */
  function ficheSVG(opts) {
    const navy = '#123d66', o = [];
    o.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 148 210" ' + (opts.inner ? 'width="148" height="210"' : 'width="148mm" height="210mm"') + ' font-family="Helvetica, Arial, sans-serif">');
    o.push('<rect width="148" height="210" fill="#fff"/>');
    for (const [x, y] of L.markers) o.push('<rect x="' + (x - L.mk / 2) + '" y="' + (y - L.mk / 2) + '" width="' + L.mk + '" height="' + L.mk + '" fill="#000"/>');
    o.push(text(18, 13.8, 4.6, 'Demi-fond 2 × 800 m', ' font-weight="700" fill="' + navy + '"'));
    if (opts.spare) {
      o.push(text(14, 25, 3.2, 'Nom Prénom : ..............................................'));
      o.push(text(14, 31.5, 3.2, 'Classe : ' + (opts.className || '')));
      o.push(text(70, 18.6, 2.4, 'FICHE DE SECOURS', ' font-weight="700" fill="#b83246"'));
    } else {
      const name = String(opts.name || '');
      o.push(text(14, 24.4, 3, 'Élève :'));
      o.push(text(25, 24.6, name.length > 24 ? 4.2 : 5.4, name, ' font-weight="700"'));
      o.push(text(14, 31.5, 3, 'Classe :'));
      o.push(text(27, 31.5, 3.4, opts.className || '', ' font-weight="700"'));
    }
    o.push(text(14, 38, 3, 'Observateur : ................................'));
    o.push(text(14, 44, 3, 'Date : ......./......./..........'));
    o.push('<path d="' + qrPath(opts.payload) + '" fill="#000"/>');
    o.push(text(L.qr.x + L.qr.size / 2, L.qr.y + L.qr.size + 3, 2, 'ne pas masquer', ' text-anchor="middle" fill="#666"'));
    o.push('<rect x="12" y="47.5" width="124" height="15" rx="2" fill="#eef2f8"/>');
    o.push(text(14.5, 52.3, 2.6, '1. Écris le temps dans la case.  2. Noircis UNE bulle par colonne (stylo foncé).', ' fill="#333"'));
    o.push(text(14.5, 56.3, 2.6, 'Exemple 2:58 → minutes 2 · secondes 5 puis 8. Temps cumulés lus au chrono.', ' fill="#333"'));
    o.push(text(14.5, 60.3, 2.6, 'Erreur ? Noircis la case « corr. » de la ligne et écris le bon temps à côté.', ' fill="#333"'));
    const g = L.groups, gc = i => g[i].x + (g[i].n - 1) * L.sp / 2;
    for (const race of L.races) {
      o.push(text(12, race.y, 3.8, race.title, ' font-weight="700" fill="' + navy + '"'));
      const h1 = race.y + 4.4, h2 = race.y + 6.8, a = ' text-anchor="middle" fill="#555"';
      o.push(text(L.box.x + L.box.w / 2, h1, 2.2, 'temps écrit', a));
      o.push(text(gc(0), h1, 2.2, 'minutes', a));
      o.push(text((g[1].x + g[2].x + (g[2].n - 1) * L.sp) / 2, h1, 2.2, 'secondes', a));
      o.push(text(gc(1), h2, 2, '1er chiffre', a));
      o.push(text(gc(2), h2, 2, '2e chiffre', a));
      o.push(text(L.corr.x, h1, 2.2, 'corr.', a));
      race.rows.forEach((y, i) => {
        o.push(text(12, y + 1.1, 3, L.rowLabels[i], i === 4 ? ' font-weight="700"' : ''));
        o.push('<rect x="' + L.box.x + '" y="' + n2(y - L.box.h / 2) + '" width="' + L.box.w + '" height="' + L.box.h + '" fill="none" stroke="#555" stroke-width="0.3"/>');
        g.forEach(gr => {
          for (let k = 0; k < gr.n; k++) {
            const cx = n2(gr.x + k * L.sp);
            o.push('<circle cx="' + cx + '" cy="' + y + '" r="' + L.r + '" fill="none" stroke="#666" stroke-width="0.25"/>');
            o.push(text(cx, y + 0.68, 1.9, String(k), ' text-anchor="middle" fill="#999"'));
          }
        });
        o.push('<rect x="' + (L.corr.x - L.corr.s / 2) + '" y="' + n2(y - L.corr.s / 2) + '" width="' + L.corr.s + '" height="' + L.corr.s + '" fill="none" stroke="#666" stroke-width="0.25"/>');
      });
    }
    o.push(text(74, 199.8, 2.2, 'Imprimer en taille réelle · ne pas plier · photographier toute la fiche, les 4 carrés visibles', ' text-anchor="middle" fill="#777"'));
    o.push('</svg>');
    return o.join('');
  }

  /** Page A4 portrait : deux fiches A5 tournées d'un quart de tour, ligne de coupe au milieu */
  function pageSVG(fiches) {
    const o = ['<svg xmlns="http://www.w3.org/2000/svg" class="a4" viewBox="0 0 210 297" width="210mm" height="297mm">', '<rect width="210" height="297" fill="#fff"/>'];
    fiches.slice(0, 2).forEach((f, i) => o.push('<g transform="translate(0,' + (i ? 297 : 148) + ') rotate(-90)">' + ficheSVG(Object.assign({}, f, { inner: true })) + '</g>'));
    o.push('<line x1="0" y1="148.5" x2="210" y2="148.5" stroke="#aaa" stroke-width="0.2" stroke-dasharray="2 2"/>');
    o.push('</svg>');
    return o.join('');
  }

  const studentPayload = id => PREFIX + 'E:' + id;
  const sparePayload = classId => PREFIX + 'S:' + classId;
  function parsePayload(p) {
    if (typeof p !== 'string' || !p.startsWith(PREFIX)) return null;
    const rest = p.slice(PREFIX.length);
    if (rest.startsWith('E:')) return { kind: 'student', id: rest.slice(2) };
    if (rest.startsWith('S:')) return { kind: 'spare', classId: rest.slice(2) };
    return null;
  }

  /* ---------- Lecture ---------- */
  function toGray(rgba, w, h) {
    const g = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
    return g;
  }

  // Seuillage adaptatif (Bradley) : 1 = encre
  function binarize(gray, w, h) {
    const I = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) { row += gray[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; }
    }
    const s = Math.max(16, Math.round(Math.max(w, h) / 9)), half = s >> 1, out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - half), y1 = Math.min(h, y + half + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - half), x1 = Math.min(w, x + half + 1);
        const sum = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
        const count = (x1 - x0) * (y1 - y0);
        out[y * w + x] = gray[y * w + x] * count < sum * 0.78 ? 1 : 0;
      }
    }
    return out;
  }

  // Composantes connexes « carrées et pleines » (candidats repères)
  function squareBlobs(bin, w, h) {
    const N = w * h, minA = Math.max(60, N * 0.00004), maxA = N * 0.012, stack = new Int32Array(N), out = [];
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
      const tr = vx + vy, det = vx * vy - vxy * vxy;
      if (det <= 0) continue;
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

  // Ordonne les repères : haut-gauche, haut-droit, bas-droit, bas-gauche (orientation donnée par le QR si disponible)
  function orderMarkers(pts, qrLoc) {
    const c = pts.reduce((a, p) => [a[0] + p.x / 4, a[1] + p.y / 4], [0, 0]);
    let r = [1, 0], u = [0, -1];
    if (qrLoc) {
      const { topLeftCorner: tl, topRightCorner: trc, bottomLeftCorner: bl } = qrLoc;
      r = [trc.x - tl.x, trc.y - tl.y]; u = [tl.x - bl.x, tl.y - bl.y];
    }
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
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
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
      for (let i = 0; i < k; i++) {
        const t = i * 2 * Math.PI / k, [u, v] = H(cx + f * rad * Math.cos(t), cy + f * rad * Math.sin(t));
        s += bilinear(gray, w, h, u, v); n++;
      }
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

  function qrInZone(rgba, w, h, H) {
    const m = 4, c = [[L.qr.x - m, L.qr.y - m], [L.qr.x + L.qr.size + m, L.qr.y - m], [L.qr.x + L.qr.size + m, L.qr.y + L.qr.size + m], [L.qr.x - m, L.qr.y + L.qr.size + m]].map(([x, y]) => H(x, y));
    const x0 = Math.max(0, Math.floor(Math.min(...c.map(p => p[0])))), x1 = Math.min(w, Math.ceil(Math.max(...c.map(p => p[0]))));
    const y0 = Math.max(0, Math.floor(Math.min(...c.map(p => p[1])))), y1 = Math.min(h, Math.ceil(Math.max(...c.map(p => p[1]))));
    const cw = x1 - x0, ch = y1 - y0; if (cw < 20 || ch < 20) return null;
    const f = Math.max(1, Math.min(4, 500 / Math.max(cw, ch))), ow = Math.round(cw * f), oh = Math.round(ch * f), out = new Uint8ClampedArray(ow * oh * 4);
    for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
      const sx = Math.min(w - 1.001, x0 + x / f), sy = Math.min(h - 1.001, y0 + y / f), ix = sx | 0, iy = sy | 0, fx = sx - ix, fy = sy - iy, o = (y * ow + x) * 4;
      for (let ch4 = 0; ch4 < 3; ch4++) {
        const i = (iy * w + ix) * 4 + ch4;
        out[o + ch4] = rgba[i] * (1 - fx) * (1 - fy) + rgba[i + 4] * fx * (1 - fy) + rgba[i + w * 4] * (1 - fx) * fy + rgba[i + w * 4 + 4] * fx * fy;
      }
      out[o + 3] = 255;
    }
    const r = root.jsQR(out, ow, oh, { inversionAttempts: 'dontInvert' });
    return r ? r.data : null;
  }

  function analyse(rgba, w, h, qrZone) {
    const res = { markers: false, payload: null, ref: null, races: [], issues: [] };
    const qr = root.jsQR(rgba, w, h, { inversionAttempts: 'dontInvert' });
    if (qr) { res.payload = qr.data; res.ref = parsePayload(qr.data); }
    const gray = toGray(rgba, w, h);
    const pts = pickMarkers(squareBlobs(binarize(gray, w, h), w, h), w, h);
    if (!pts) { res.issues.push('Repères introuvables : reprends la photo à plat, les 4 carrés noirs bien visibles'); return finish(res); }
    const ordered = orderMarkers(pts, qr && qr.location);
    let H = homography(L.markers, ordered);
    if (!H) { res.issues.push('Photo trop déformée : reprends-la de face'); return finish(res); }
    res.markers = true;
    if (!qr) {
      // QR non lu sur l'image entière : on le cherche agrandi à l'endroit prévu, dans les 4 orientations possibles
      for (let k = 0; k < 4 && !res.payload; k++) {
        const Hk = k ? homography(L.markers, ordered.slice(k).concat(ordered.slice(0, k))) : H;
        if (!Hk) continue;
        const found = qrInZone(rgba, w, h, Hk) || (qrZone && qrZone(Hk));
        if (found) { res.payload = found; res.ref = parsePayload(found); H = Hk; }
      }
    }
    if (qr) {
      const [qx, qy] = H(L.qr.x + L.qr.size / 2, L.qr.y + L.qr.size / 2), loc = qr.location;
      const cx = (loc.topLeftCorner.x + loc.bottomRightCorner.x) / 2, cy = (loc.topLeftCorner.y + loc.bottomRightCorner.y) / 2;
      const [ax, ay] = H(0, 0), [bx, by] = H(L.W, 0);
      if (Math.hypot(qx - cx, qy - cy) > 0.08 * Math.hypot(bx - ax, by - ay)) res.issues.push('Repérage douteux : vérifie les temps sur la photo');
    }
    L.races.forEach((race, ri) => {
      const out = { est: '', passes: ['', '', '', ''], final: '' }; let filled = 0; const rowIssues = [];
      race.rows.forEach((y, i) => {
        const vals = L.groups.map(g => Array.from({ length: g.n }, (_, k) => sampleDisk(gray, w, h, H, g.x + k * L.sp, y, L.r * 0.62)));
        const digits = vals.map(readGroup);
        const all = vals.flat().sort((a, b) => a - b), med = all[Math.floor(all.length / 2)];
        const corr = sampleDisk(gray, w, h, H, L.corr.x, y, 1.3) < med * 0.8;
        const where = race.title + ' · ' + L.rowLabels[i];
        const nEmpty = digits.filter(d => d.state === 'empty').length;
        if (nEmpty === 3) { if (corr) rowIssues.push(where + ' : correction signalée, temps écrit à reporter'); else rowIssues.push({ empty: where }); return; }
        filled++;
        if (nEmpty) rowIssues.push(where + ' : ligne incomplète');
        if (digits.some(d => d.state === 'double')) rowIssues.push(where + ' : deux bulles noircies dans une colonne');
        if (corr) rowIssues.push(where + ' : correction signalée, compare avec le temps écrit');
        if (!nEmpty) {
          const v = digits[0].digit + ':' + digits[1].digit + digits[2].digit;
          if (i === 0) out.est = v; else out.passes[i - 1] = v;
        }
      });
      if (filled === 0) res.issues.push(race.title + ' non rempli');
      else rowIssues.forEach(x => res.issues.push(typeof x === 'string' ? x : x.empty + ' : ligne vide'));
      res.races.push(out);
    });
    if (!res.ref) res.issues.unshift(res.payload ? 'QR code inconnu : choisis l’élève' : 'QR code illisible : choisis l’élève');
    else if (res.ref.kind === 'spare') res.issues.unshift('Fiche de secours : choisis l’élève');
    return finish(res);
  }
  function finish(res) {
    while (res.races.length < 2) res.races.push({ est: '', passes: ['', '', '', ''], final: '' });
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

  /** src : File/Blob ou dataURL. Renvoie { markers, ref, races, issues } */
  async function read(src, maxSide) {
    const img = await loadImage(src), m = maxSide || 1800;
    const s = Math.min(1, m / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.naturalWidth * s); cv.height = Math.round(img.naturalHeight * s);
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    // Secours : relit la zone du QR dans la photo en pleine résolution
    const qrZone = s >= 1 ? null : Hk => {
      const m = 4, c = [[L.qr.x - m, L.qr.y - m], [L.qr.x + L.qr.size + m, L.qr.y + L.qr.size + m], [L.qr.x + L.qr.size + m, L.qr.y - m], [L.qr.x - m, L.qr.y + L.qr.size + m]].map(([x, y]) => Hk(x, y).map(v => v / s));
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
    return analyse(ctx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height, qrZone);
  }

  root.Fiche = { layout: L, ficheSVG, pageSVG, studentPayload, sparePayload, parsePayload, analyse, read };
})(typeof self !== 'undefined' ? self : globalThis);
