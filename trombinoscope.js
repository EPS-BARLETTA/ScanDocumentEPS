'use strict';

const rosterOCRFiles = {
  script: './ocr/client/tesseract.min.js',
  worker: './ocr/client/worker.min.js',
  core: './ocr/core/tesseract-core-lstm.js',
  language: './ocr/lang',
};
let ocrScript;

function loadRosterOCR() {
  if (!ocrScript) {
    ocrScript = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = rosterOCRFiles.script;
      script.integrity = 'sha384-r1ru3tcf6FhnCFR4B7pIFG+BhFF9LlFtz/P1y4pblWn3AGs9y3lBx5SKLNf4+rED';
      script.referrerPolicy = 'no-referrer';
      const previous = window.Tesseract;
      script.onload = () => {
        const engine = window.Tesseract;
        if (previous) window.Tesseract = previous;
        else delete window.Tesseract;
        resolve(engine);
      };
      script.onerror = () => {
        script.remove();
        reject(new Error('Le moteur de lecture est indisponible. Vérifie ta connexion et réessaie.'));
      };
      document.head.append(script);
    }).catch(error => {
      ocrScript = null;
      throw error;
    });
  }
  return ocrScript;
}

function rosterCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function imageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Choisis une capture d’écran au format JPG ou PNG.'));
    };
    img.src = url;
  });
}

function denseBands(values, threshold, minimum, gap = 2) {
  const bands = [];
  let start = -1;
  let last = -1;
  for (let i = 0; i <= values.length + gap; i++) {
    if (values[i] >= threshold) {
      if (start === -1) start = i;
      last = i;
    } else if (start !== -1 && i - last > gap) {
      if (last + 1 - start >= minimum) bands.push([start, last + 1]);
      start = -1;
    }
  }
  return bands;
}

async function rosterTiles(file) {
  if (file.size > 20 * 1024 * 1024) throw new Error('La capture dépasse 20 Mo.');
  const image = await imageFromFile(file);
  const scale = Math.min(1, 1800 / Math.max(image.width, image.height));
  const source = rosterCanvas(Math.round(image.width * scale), Math.round(image.height * scale));
  const {width, height} = source;
  const ctx = source.getContext('2d', {willReadFrequently: true});
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const dark = new Uint8Array(width * height);
  const rows = new Uint16Array(height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const point = y * width + x;
      const i = point * 4;
      if (Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) < 200) {
        dark[point] = 1;
        rows[y]++;
      }
    }
    if (rows[y] > 0.94 * width) rows[y] = 0;
  }
  const portraitRows = denseBands(rows, width * 0.085, Math.max(32, height * 0.045));
  const grid = portraitRows.map(([top, bottom]) => {
    const rowHeight = bottom - top;
    const cols = new Uint16Array(width);
    for (let y = top; y < bottom; y++) {
      for (let x = 0; x < width; x++) cols[x] += dark[y * width + x];
    }
    const portraits = denseBands(cols, rowHeight * 0.32, Math.max(22, width * 0.033));
    return {top, bottom, portraits};
  }).filter(row => row.portraits.length && row.portraits.every(([left, right]) => {
    const ratio = (right - left) / (row.bottom - row.top);
    return ratio >= 0.47 && ratio <= 1.37;
  }));
  const layout = grid.reduce((best, row) => row.portraits.length > best.length ? row.portraits : best, []);
  if (layout.length < 2 || grid.reduce((n, row) => n + row.portraits.length, 0) > 80) {
    throw new Error('La grille n’a pas été reconnue. Utilise une capture complète avec les photos et les noms en dessous.');
  }
  if (grid.some(row => row.portraits.some(([left, right]) =>
    !layout.some(([x, xEnd]) => Math.abs(x - left) <= 8 && Math.abs(xEnd - right) <= 10)
  ))) {
    throw new Error('Les portraits ne sont pas alignés. Recadre la capture sur la grille et réessaie.');
  }
  const tiles = [];
  for (const [i, row] of grid.entries()) {
    const portraitHeight = row.bottom - row.top;
    for (const [left, right] of row.portraits) {
      const col = layout.findIndex(([x]) => Math.abs(x - left) <= 8);
      const textLeft = Math.max(0, left - 3);
      const textRight = Math.min(width, (layout[col + 1]?.[0] ?? width) - 4);
      const textBottom = Math.min(height, grid[i + 1]?.top ?? height, row.bottom + Math.round(portraitHeight * 0.275));
      if (textBottom - row.bottom < 10) continue;
      const portraitWidth = right - left;
      const photo = rosterCanvas(84, Math.round(84 * portraitHeight / portraitWidth));
      photo.getContext('2d').drawImage(source, left, row.top, portraitWidth, portraitHeight, 0, 0, photo.width, photo.height);
      const label = rosterCanvas((textRight - textLeft) * 2 + 20, (textBottom - row.bottom) * 2 + 16);
      const labelCtx = label.getContext('2d');
      labelCtx.fillStyle = '#fff';
      labelCtx.fillRect(0, 0, label.width, label.height);
      labelCtx.drawImage(source, textLeft, row.bottom, textRight - textLeft, textBottom - row.bottom, 10, 8,
        label.width - 20, label.height - 16);
      tiles.push({photo: photo.toDataURL('image/jpeg', 0.72), label});
    }
  }
  return tiles;
}

async function readRosterTiles(tiles, onProgress) {
  const engine = await loadRosterOCR();
  let worker;
  let timer;
  let timerExpired = false;
  try {
    const started = engine.createWorker('fra', 1, {
      workerPath: new URL(rosterOCRFiles.worker, location.href).href,
      corePath: new URL(rosterOCRFiles.core, location.href).href,
      langPath: new URL(rosterOCRFiles.language, location.href).href,
      workerBlobURL: false,
      errorHandler: () => {},
    }, {load_system_dawg: '0', load_freq_dawg: '0'});
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        timerExpired = true;
        reject(new Error('Le moteur de lecture met trop de temps à démarrer.'));
      }, 25000);
    });
    started.then(late => {
      if (timerExpired) return late.terminate();
    }).catch(() => {});
    worker = await Promise.race([started, timeout]);
    clearTimeout(timer);
    await worker.setParameters({tessedit_pageseg_mode: '6'});
    for (const [i, tile] of tiles.entries()) {
      onProgress(i + 1);
      const {data} = await worker.recognize(tile.label);
      const lines = data.text.trim().split(/\n/).map(line => line.trim()).filter(Boolean);
      if (lines.length === 2 && /\s/.test(lines[0]) && /^\p{L}$/u.test(lines[1])) lines.pop();
      tile.name = lines.join(' ').replace(/\s+/g, ' ');
      delete tile.label;
    }
  } finally {
    clearTimeout(timer);
    if (worker) await worker.terminate();
  }
}

function portraitNameKey(name) {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr')
    .replace(/[’‘]/g, "'").trim().replace(/\s+/g, ' ');
}

function suggestPortraitStudent(students, name) {
  const key = portraitNameKey(name || '');
  if (!key) return '';
  const exact = students.filter(p => portraitNameKey(p.name) === key);
  if (exact.length) return exact.length === 1 ? exact[0].id : '';
  const parts = key.split(' ');
  const alternatives = new Set(parts.slice(1).map((_, i) => [...parts.slice(i + 1), ...parts.slice(0, i + 1)].join(' ')));
  const swapped = students.filter(p => alternatives.has(portraitNameKey(p.name)));
  return swapped.length === 1 ? swapped[0].id : '';
}

function validRosterPortrait(value) {
  return typeof value === 'string' && value.length <= 30000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function portraitStudentName(student) {
  const name = escapeHtml(student.name);
  if (!validRosterPortrait(student.portrait)) return name;
  return `<span class="student-portrait-name"><img class="student-portrait" src="${student.portrait}" alt="" loading="lazy">${name}</span>`;
}

document.addEventListener('DOMContentLoaded', () => {
  let portraitTiles = [];
  let portraitBusy = false;
  const savedStudents = new Set();
  const portraitSummary = $('portraitSummary');
  const saveButton = $('savePortraits');
  const portraitDialog = $('portraitDialog');
  const portraitStatus = $('portraitStatus');
  const portraitTarget = $('portraitTarget');
  const portraitClass = $('portraitClass');
  const portraitPreview = $('portraitPreview');

  function selectedPortraitClass() {
    return state.classes.find(c => c.id === portraitTarget.value);
  }

  window.openPortraitImport = classId => {
    portraitTarget.replaceChildren(
      ...state.classes.map(c => new Option(c.name + (c.folder ? ` · ${c.folder}` : ''), c.id)),
      new Option('Créer une classe', '')
    );
    portraitTarget.value = classId || '';
    portraitClass.value = '';
    $('portraitFile').value = '';
    portraitTiles = [];
    portraitStatus.textContent = '';
    portraitSummary.textContent = '';
    savedStudents.clear();
    portraitTarget.disabled = false;
    renderPortraitPreview();
    $('portraitDone').classList.add('hidden');
    portraitDialog.showModal();
  };

  function closePortraitImport() {
    if (portraitBusy) return;
    const target = selectedPortraitClass();
    portraitDialog.close();
    if (savedStudents.size && target) showPortraitSuccess(target, savedStudents.size);
    savedStudents.clear();
    portraitTiles = [];
    portraitPreview.replaceChildren();
    $('portraitFile').value = '';
  }

  $('cancelPortraits').onclick = closePortraitImport;
  portraitDialog.addEventListener('cancel', event => {
    event.preventDefault();
    closePortraitImport();
  });
  portraitTarget.onchange = renderPortraitPreview;
  portraitPreview.addEventListener('change', () => updatePortraitSummary());

  function renderPortraitPreview() {
    const target = selectedPortraitClass();
    $('portraitNewClass').hidden = Boolean(target);
    $('portraitMode').textContent = target ?
      'Aux élèves de cette classe, tu peux associer les portraits en conservant leurs relevés et leurs évaluations.' :
      'Les noms lus sous les portraits serviront à créer la liste de la classe.';
    const students = target ? state.students.filter(p => p.classId === target.id).sort((a, b) => a.name.localeCompare(b.name, 'fr')) : [];
    portraitPreview.innerHTML = portraitTiles.map((tile, i) => {
      const photo = `<img class="portrait-preview-image" alt="" src="${tile.photo}">`;
      if (target) {
        const match = suggestPortraitStudent(students, tile.name);
        const options = students.map(p => `<option value="${escapeHtml(p.id)}" ${p.id === match ? 'selected' : ''}>${escapeHtml(p.name)}${p.cls ? ` · ${escapeHtml(p.cls)}` : ''}</option>`).join('');
        return `<li>${photo}<span class="muted" id="portrait-read-${i}">${escapeHtml(tile.name || 'Nom illisible')}</span>
          <label>Associer à<select data-portrait-match="${i}" aria-describedby="portrait-read-${i}">
            <option value="" ${match ? '' : 'selected'}>Choisir un élève</option>
            <option value=":ignore">Ignorer ce portrait</option>${options}
          </select></label><small class="portrait-row-status hidden"></small></li>`;
      }
      return `<li>${photo}
        <label>Élève ${i + 1}<input data-portrait-name="${i}" value="${escapeHtml(tile.name)}" maxlength="120" autocomplete="off" spellcheck="false"></label>
        <label class="portrait-choice"><input type="checkbox" data-portrait-include="${i}" checked> Inclure</label></li>`;
    }).join('');
    updatePortraitSummary();
  }

  $('portraitFile').onchange = async () => {
    const input = $('portraitFile');
    const file = input.files[0];
    if (!file || portraitBusy) return;
    portraitBusy = true;
    input.disabled = portraitTarget.disabled = $('cancelPortraits').disabled = $('savePortraits').disabled = true;
    portraitTiles = [];
    portraitPreview.replaceChildren();
    portraitSummary.textContent = '';
    portraitStatus.textContent = 'Recherche des portraits…';
    try {
      const tiles = await rosterTiles(file);
      if (!tiles.length) throw new Error('Aucun portrait avec un espace pour le nom n’a été trouvé.');
      portraitStatus.textContent = 'Chargement du moteur de lecture…';
      try {
        await readRosterTiles(tiles, current => {
          portraitStatus.textContent = `Lecture des noms… ${current}/${tiles.length}`;
        });
        portraitStatus.textContent = `${tiles.length} portraits détectés. Vérifie chaque association avant d’enregistrer.`;
      } catch (error) {
        portraitStatus.textContent = `Lecture automatique interrompue. ${tiles.length} portraits détectés. Tu peux les associer à la main ou réessayer.`;
      }
      portraitTiles = tiles;
    } catch (error) {
      portraitStatus.textContent = error.message;
    } finally {
      input.value = '';
      portraitBusy = false;
      input.disabled = $('cancelPortraits').disabled = false;
      portraitTarget.disabled = savedStudents.size > 0;
      renderPortraitPreview();
    }
  };

  function portraitImportError(message, field) {
    portraitSummary.textContent = message;
    field?.scrollIntoView({block: 'center'});
  }

  function collectPortraitAssignments(target) {
    const students = new Map(state.students.filter(p => p.classId === target.id).map(p => [p.id, p]));
    const selects = Array.from(portraitPreview.querySelectorAll('[data-portrait-match]'));
    const counts = new Map();
    for (const {value} of selects) counts.set(value, (counts.get(value) || 0) + 1);
    const ready = [], ignored = [];
    let pending = 0;
    for (const select of selects) {
      const {value} = select;
      const row = select.closest('li');
      const tile = portraitTiles[select.dataset.portraitMatch];
      const issue = row.querySelector('.portrait-row-status');
      let message = '';
      if (value === ':ignore') ignored.push(row);
      else if (!students.has(value)) message = 'Choisis un élève ou ignore ce portrait.';
      else if (savedStudents.has(value)) message = 'Un portrait vient déjà d’être enregistré pour cet élève.';
      else if (counts.get(value) > 1) message = 'Cet élève est sélectionné pour plusieurs portraits.';
      else ready.push({student: students.get(value), photo: tile.photo, row});
      if (message) pending++;
      row.classList.toggle('portrait-pending', Boolean(message));
      issue.classList.toggle('hidden', !message);
      issue.textContent = message;
    }
    return {ready, ignored, pending};
  }

  function updatePortraitSummary() {
    const target = selectedPortraitClass();
    if (!target) {
      portraitSummary.textContent = '';
      saveButton.textContent = 'Créer la classe';
      saveButton.disabled = portraitBusy || !portraitTiles.length;
      return;
    }
    const {ready, pending, ignored} = collectPortraitAssignments(target);
    const count = ready.length;
    saveButton.textContent = pending && count ? `Ajouter ${count} photo${count > 1 ? 's' : ''}` : 'Ajouter les photos';
    saveButton.disabled = portraitBusy || !count;
    const parts = [];
    if (savedStudents.size) parts.push(`${savedStudents.size} enregistré(s)`);
    if (count) parts.push(`${count} prêt(s) à enregistrer`);
    if (pending) parts.push(`${pending} à vérifier`);
    if (ignored.length) parts.push(`${ignored.length} ignoré(s)`);
    portraitSummary.textContent = parts.join(' · ');
  }

  function createClassFromPortraits() {
    const name = portraitClass.value.trim();
    if (!name) return portraitImportError('Saisis le nom de la nouvelle classe.', portraitClass);
    const folder = schoolYear();
    if (state.classes.some(c => (c.folder || folder) === folder && portraitNameKey(c.name) === portraitNameKey(name))) {
      return portraitImportError('Cette classe existe déjà. Sélectionne-la dans la liste des classes.', portraitTarget);
    }
    const group = {id: uid(), name, folder};
    const students = [];
    const seen = new Set();
    for (const check of portraitPreview.querySelectorAll('[data-portrait-include]:checked')) {
      const i = check.dataset.portraitInclude;
      const field = portraitPreview.querySelector(`[data-portrait-name="${i}"]`);
      const name = field.value.trim().replace(/\s+/g, ' ');
      const key = portraitNameKey(name);
      if (!key) return portraitImportError('Complète le nom de chaque élève inclus.', field);
      if (seen.has(key)) return portraitImportError('Ce nom apparaît deux fois. Vérifie-le ou décoche le portrait en trop.', field);
      seen.add(key);
      students.push({id: uid(), classId: group.id, name, portrait: portraitTiles[i].photo});
    }
    if (!students.length) return portraitImportError('Sélectionne au moins un portrait.');
    return {group, students};
  }

  $('savePortraits').onclick = async () => {
    const target = selectedPortraitClass();
    const batch = target ? collectPortraitAssignments(target) : null;
    const assignments = batch?.ready;
    const created = target ? null : createClassFromPortraits();
    if (!assignments?.length && !created) {
      if (target) updatePortraitSummary();
      return;
    }
    portraitBusy = true;
    $('portraitFile').disabled = portraitTarget.disabled = $('cancelPortraits').disabled = $('savePortraits').disabled = true;
    let undo;
    if (target) {
      const old = assignments.map(({student}) => [student, student.portrait]);
      for (const {student, photo} of assignments) student.portrait = photo;
      undo = () => old.forEach(([student, portrait]) => {
        if (portrait === undefined) delete student.portrait;
        else student.portrait = portrait;
      });
    } else {
      state.classes.push(created.group);
      state.students.push(...created.students);
      undo = () => {
        state.classes = state.classes.filter(c => c !== created.group);
        state.students = state.students.filter(p => p.classId !== created.group.id);
      };
    }
    try {
      await persist();
    } catch {
      undo();
      return portraitImportError('Le stockage est indisponible ou plein. L’import peut être réessayé.');
    } finally {
      portraitBusy = false;
      $('portraitFile').disabled = $('cancelPortraits').disabled = saveButton.disabled = false;
      portraitTarget.disabled = savedStudents.size > 0;
    }
    if (target) {
      for (const {student, row} of assignments) {
        savedStudents.add(student.id);
        row.remove();
      }
      batch.ignored.forEach(row => row.remove());
      if (batch.pending) {
        portraitTarget.disabled = true;
        portraitStatus.textContent = 'Les portraits associés sont enregistrés. Tu peux régler ceux qui restent ou fermer.';
        updatePortraitSummary();
        return;
      }
      closePortraitImport();
    } else {
      closePortraitImport();
      showPortraitSuccess(created.group, created.students.length);
    }
  };

  function showPortraitSuccess(group, count) {
    classOpen(group.id);
    $('roster').closest('details.rosterbox').open = true;
    const done = $('portraitDone');
    done.textContent = `${count} portrait${count > 1 ? 's' : ''} enregistré${count > 1 ? 's' : ''}.`;
    done.classList.remove('hidden');
  }
});
