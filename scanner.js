let scannerStream = null;
let scannerWorker = null;
let scannerBusy = false;
let scannerMode = 'global';
let lastScanFile = null;
let previewUrl = null;
let lastScanText = '';

const scan = id => document.getElementById(id);
const catalog = () => Array.isArray(window.machines) ? window.machines : [];

function openScanner() {
  scan('scanner')?.classList.add('open');
  if (scan('scanStatus')) scan('scanStatus').textContent = 'Camera paused. Start the camera or upload an image.';
}

function closeScanner() {
  stopCamera();
  scan('scanner')?.classList.remove('open');
}

function resetScanFields() {
  for (const id of ['scanManufacturer', 'scanModel', 'scanSerial', 'scanText']) {
    if (scan(id)) scan(id).value = '';
  }
  if (scan('scanDetected')) {
    scan('scanDetected').textContent = 'Reading nameplate…';
    scan('scanDetected').dataset.good = 'false';
  }
  if (scan('scanOpen')) scan('scanOpen').disabled = true;
  window.scannedMachine = null;
  lastScanText = '';
}

async function startCamera() {
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API unavailable');
    scan('scanVideo').style.display = 'block';
    scan('scanPreview').style.display = 'none';
    scannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    });
    scan('scanVideo').srcObject = scannerStream;
    await scan('scanVideo').play();
    scan('scanCameraHint').style.display = 'none';
    scan('scanStatus').textContent = 'Point at the full plate. Keep model and serial text in focus.';
  } catch (error) {
    console.warn('Camera unavailable', error);
    scan('scanStatus').textContent = 'Camera unavailable or permission denied. Use Upload image instead.';
  }
}

function stopCamera() {
  if (scannerStream) {
    scannerStream.getTracks().forEach(track => track.stop());
    scannerStream = null;
  }
  if (scan('scanVideo')) scan('scanVideo').srcObject = null;
}

function showPreview(file) {
  const image = scan('scanPreview');
  if (!image || !file) return;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  image.src = previewUrl;
  image.style.display = 'block';
  scan('scanVideo').style.display = 'none';
  scan('scanCameraHint').style.display = 'none';
}

function capturePlate() {
  const video = scan('scanVideo');
  if (!video.videoWidth) {
    scan('scanStatus').textContent = 'Start the camera first.';
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  scan('scanStatus').textContent = 'Capturing plate…';
  canvas.toBlob(blob => {
    if (!blob) {
      scan('scanStatus').textContent = 'Could not capture the image. Try again or upload a photo.';
      return;
    }
    lastScanFile = blob;
    runScan(blob, { newImage: true });
  }, 'image/jpeg', 0.94);
}

function setMode(mode) {
  scannerMode = mode;
  scan('modeLocal')?.classList.toggle('active', mode === 'local');
  scan('modeGlobal')?.classList.toggle('active', mode === 'global');
  if (scan('scanStatus')) {
    scan('scanStatus').textContent = mode === 'global'
      ? 'Global mode: OCR first; unknown plates may be sent to secure visual AI and public search.'
      : 'Local mode: OCR and exact matching against the Freemantle catalog only.';
  }
}

function inferredManufacturer(machine, ocrText) {
  const fromPlate = String(ocrText || '').match(/\bT[\s-]*FREEMANTLE\b|\bFREEMANTLE\b/i);
  if (fromPlate) return fromPlate[0].replace(/\s+/g, '-');
  try {
    if (new URL(machine?.source).hostname.toLowerCase().includes('tfreemantle')) return 'T-Freemantle';
  } catch {}
  return '';
}

function parseCurrentPlate(text, { updateFields = true } = {}) {
  const parser = window.ScanParser;
  const parsed = parser?.parsePlate(text, catalog()) || { manufacturer: '', model: '', serial: '', match: null, matchedCode: '' };
  if (updateFields) {
    const manufacturer = parsed.manufacturer || inferredManufacturer(parsed.match, text);
    if (scan('scanManufacturer')) scan('scanManufacturer').value = manufacturer;
    if (scan('scanModel')) scan('scanModel').value = parsed.model || parsed.matchedCode || '';
    if (scan('scanSerial')) scan('scanSerial').value = parsed.serial || '';
  }
  return parsed;
}

function updateDetectedLabel(parsed, { candidate = false } = {}) {
  const found = parsed?.match;
  const box = scan('scanDetected');
  if (!box) return;
  if (found) {
    box.textContent = candidate
      ? `AI candidate: ${found.model} · ${found.name} · verify the plate before service`
      : `Catalog match: ${found.model} · ${found.name} · 3D reference is conceptual`;
    box.dataset.good = candidate ? 'candidate' : 'true';
    if (scan('scanOpen')) scan('scanOpen').disabled = false;
  } else {
    box.textContent = 'No exact model in the local catalog. OCR is saved; review AI candidates below.';
    box.dataset.good = 'false';
    if (scan('scanOpen')) scan('scanOpen').disabled = true;
  }
}

async function activateCatalogRecord(record, parsed, text, { source = 'OCR', candidate = false, autoView = true } = {}) {
  if (!record) return false;
  const scanContext = {
    manufacturer: parsed?.manufacturer || inferredManufacturer(record, text),
    model: parsed?.model || parsed?.matchedCode || record.model,
    serial: parsed?.serial || '',
    plateText: String(text || '').slice(0, 1800),
    source,
    confidence: candidate ? 'AI candidate; verify against the physical nameplate' : 'Exact catalog model-code match in OCR'
  };
  const selected = { ...record, scanContext };
  window.scannedMachine = selected;
  updateDetectedLabel({ match: record }, { candidate });
  window.setJarvisMachine?.(selected, { open: false });
  if (scan('scanStatus')) {
    scan('scanStatus').textContent = candidate
      ? 'A visual-AI candidate was loaded. Confirm the model code on the physical plate before relying on its record.'
      : 'Model code matched the local catalog. Loading its conceptual 3D reference and setting the assistant context…';
  }
  try {
    const loaded = await window.loadMachineModel?.(selected);
    if (loaded === false) throw new Error('No 3D asset is available for this catalog record.');
  } catch (error) {
    console.warn('Could not load selected machine model', error);
    if (scan('scanStatus')) scan('scanStatus').textContent = `Catalog record matched, but its 3D asset could not load: ${error.message}`;
    return false;
  }
  if (autoView) {
    closeScanner();
    document.getElementById('viewer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  return true;
}

function matchPlate(text, { autoView = false } = {}) {
  const parsed = parseCurrentPlate(text);
  window.scannedMachine = null;
  updateDetectedLabel(parsed);
  if (parsed.match) {
    window.scannedMachine = parsed.match;
    if (scan('scanOpen')) scan('scanOpen').disabled = false;
    if (autoView) activateCatalogRecord(parsed.match, parsed, text, { source: 'OCR', autoView: true });
  }
  return parsed;
}

async function runScan(file, { newImage = false } = {}) {
  if (!file) return;
  if (scannerBusy) {
    scan('scanStatus').textContent = 'A scan is already processing…';
    return;
  }
  scannerBusy = true;
  lastScanFile = file;
  if (newImage) resetScanFields();
  showPreview(file);
  scan('scanStatus').textContent = scannerMode === 'global'
    ? 'Image received. Reading the plate locally…'
    : 'Image received. Reading text locally…';
  scan('scanRun').disabled = true;
  if (scan('scanDetect')) scan('scanDetect').disabled = true;

  try {
    if (window.catalogReady) await window.catalogReady;
    if (!window.Tesseract && typeof Tesseract === 'undefined') throw new Error('OCR runtime unavailable');
    if (!scannerWorker) {
      const ocr = window.Tesseract || Tesseract;
      scannerWorker = await ocr.createWorker('eng', 1, {
        workerPath: './vendor/ocr/dist/worker.min.js',
        corePath: './vendor/ocr/tesseract-core-simd-lstm.wasm.js',
        langPath: './vendor/ocr/tessdata'
      });
    }
    const { data } = await scannerWorker.recognize(file);
    const text = String(data?.text || '').trim();
    lastScanText = text;
    if (scan('scanText')) scan('scanText').value = text;
    const parsed = matchPlate(text);
    if (parsed.match) {
      await activateCatalogRecord(parsed.match, parsed, text, { source: 'OCR', autoView: true });
    } else if (scannerMode === 'global') {
      await runGlobalResearch(file, text, parsed);
    } else {
      scan('scanStatus').textContent = text
        ? 'OCR complete. No exact catalog code was found. Check the fields or switch to Global AI + web.'
        : 'No readable text found. Retake a sharp, well-lit plate photo or enter its text manually.';
      renderGlobalResults([], scan('scanStatus').textContent);
    }
  } catch (error) {
    console.error(error);
    const message = `OCR could not complete: ${error.message || 'unknown error'}. You can still edit the plate text or retry.`;
    scan('scanStatus').textContent = message;
    if (scannerMode === 'global') await runGlobalResearch(file, '', null);
  } finally {
    scannerBusy = false;
    if (scan('scanRun')) scan('scanRun').disabled = false;
    if (scan('scanDetect')) scan('scanDetect').disabled = !lastScanFile;
    if (!window.scannedMachine && (scan('scanText')?.value || lastScanText)) onCatalogReady({ detail: catalog() });
  }
}

async function runGlobalResearch(file, text, parsed) {
  scan('scanStatus').textContent = 'No exact local model code yet. Asking visual AI for a cautious candidate…';
  let result = null;
  let visualError = '';
  try {
    const image = await fileToDataURL(file);
    const response = await fetch('/api/global-identify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        image,
        text,
        catalog: catalog().map(machine => ({ id: machine.id, model: machine.model, name: machine.name }))
      })
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) result = data;
    else visualError = data.detail || data.error || `Visual AI returned HTTP ${response.status}`;
  } catch (error) {
    visualError = error.message || 'Visual AI route unavailable';
  }

  const modelCode = String(result?.modelCode || result?.model || '').trim();
  const serial = String(result?.serialNumber || result?.serial || '').trim();
  const manufacturer = String(result?.manufacturer || '').trim();
  if (manufacturer && scan('scanManufacturer') && !parsed?.manufacturer) scan('scanManufacturer').value = manufacturer;
  if (modelCode && scan('scanModel') && !parsed?.match) scan('scanModel').value = modelCode;
  if (serial && scan('scanSerial') && !parsed?.serial) scan('scanSerial').value = serial;

  let aiCandidate = null;
  if (modelCode && window.ScanParser) {
    const match = window.ScanParser.findCatalogMatch('', modelCode, catalog());
    const confidence = String(result?.confidence || '').toLowerCase();
    const evidence = String(result?.evidence || '');
    const evidenceMatch = window.ScanParser.findCatalogMatch(evidence, modelCode, catalog());
    const claimed = String(result?.catalogMatch || '').trim();
    const claimFits = !claimed || claimed === match?.entry?.id || claimed === match?.entry?.model || claimed === match?.code;
    if (match && confidence === 'high' && evidenceMatch?.entry?.id === match.entry.id && claimFits) {
      aiCandidate = match.entry;
      const aiParsed = { manufacturer, model: modelCode, serial, matchedCode: match.code };
      await activateCatalogRecord(aiCandidate, aiParsed, text, {
        source: 'Visual AI; code and evidence returned for verification',
        candidate: true,
        autoView: true
      });
    }
  }

  const query = String(result?.query || [manufacturer, modelCode].filter(Boolean).join(' ') || scan('scanModel')?.value || text.split(/\n/).filter(Boolean).slice(0, 2).join(' ')).trim();
  let publicResults = [];
  if (query) {
    try {
      const response = await fetch(`/api/global-search?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      publicResults = (data.results || []).slice(0, 6);
    } catch (error) {
      console.warn('Public-source search unavailable', error);
    }
  }
  const visualItems = (result?.results || []).map(item => ({ ...item, source: item.source || result?.source || 'Visual AI' }));
  renderGlobalResults([...visualItems, ...publicResults], visualError ? `Visual AI unavailable: ${visualError}` : 'AI/web results are candidates only; verify the nameplate and approved manual.');

  if (aiCandidate) {
    scan('scanStatus').textContent = 'Visual AI suggested a catalog model and loaded its conceptual 3D candidate. Verify the model code on the physical plate before service.';
  } else if (result) {
    scan('scanDetected').textContent = 'OCR captured the plate. Visual AI returned candidates, not an exact catalog match.';
    scan('scanDetected').dataset.good = 'candidate';
    scan('scanStatus').textContent = 'Identification candidates ready. No exact catalog match was verified; there is no exact 3D model for this plate in the local catalog.';
  } else {
    const suffix = text ? ' OCR text was retained for review.' : ' No readable plate text was found.';
    scan('scanStatus').textContent = `No exact catalog match.${suffix} ${visualError || 'Visual AI did not return a result.'}`;
  }
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Could not read image file'));
    reader.readAsDataURL(file);
  });
}

function renderGlobalResults(items, note = '') {
  const box = scan('globalResults');
  if (!box) return;
  box.replaceChildren();
  const heading = document.createElement('b');
  heading.textContent = 'Global research results';
  box.appendChild(heading);
  if (note) {
    const summary = document.createElement('span');
    summary.textContent = note;
    box.appendChild(summary);
  }
  if (!items.length) {
    if (!note) {
      const empty = document.createElement('span');
      empty.textContent = 'No global candidates returned. Exact 3D matching is limited to catalog records with a model code and local asset.';
      box.appendChild(empty);
    }
    return;
  }
  for (const item of items.slice(0, 8)) {
    const row = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = item.title || item.name || 'Possible identification';
    const details = document.createElement('span');
    const confidence = item.confidence ? `Confidence: ${item.confidence}. ` : '';
    details.textContent = `${confidence}${item.description || item.reason || 'Review this candidate against the physical plate.'}`;
    row.append(title, document.createElement('br'), details);
    if (item.url) {
      try {
        const url = new URL(item.url, location.href);
        if (url.protocol === 'https:') {
          const link = document.createElement('a');
          link.href = url.href;
          link.target = '_blank';
          link.rel = 'noopener';
          link.textContent = `${item.source || 'Open source'} ↗`;
          row.append(document.createElement('br'), link);
        }
      } catch {}
    }
    box.appendChild(row);
  }
}

async function openDetected() {
  const selected = window.scannedMachine;
  if (!selected) return;
  closeScanner();
  window.setJarvisMachine?.(selected, { open: true });
  await window.loadMachineModel?.(selected);
  document.getElementById('viewer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function bindScanner() {
  const ids = ['scanStart', 'scanCapture', 'scanRun', 'scanFile', 'scanOpen', 'scanClose', 'scanText', 'modeLocal', 'modeGlobal'];
  if (!ids.every(id => scan(id))) return false;
  scan('scanStart').addEventListener('click', startCamera);
  scan('scanCapture').addEventListener('click', capturePlate);
  const chooseFile = () => {
    scan('scanStatus').textContent = 'Choose a nameplate or product image…';
    scan('scanFile').click();
  };
  scan('scanRun').addEventListener('click', chooseFile);
  document.getElementById('uploadGlobal')?.addEventListener('click', () => {
    openScanner();
    setTimeout(chooseFile, 80);
  });
  scan('scanFile').addEventListener('change', event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    lastScanFile = file;
    if (scan('scanDetect')) scan('scanDetect').disabled = false;
    runScan(file, { newImage: true });
  });
  scan('scanDetect')?.addEventListener('click', () => runScan(lastScanFile));
  scan('scanOpen').addEventListener('click', openDetected);
  scan('scanClose').addEventListener('click', closeScanner);
  scan('scanText').addEventListener('input', event => {
    const parsed = matchPlate(event.target.value);
    if (!parsed.match) scan('scanDetected').textContent = 'No exact local model code found. Check the model field or use Global AI + web.';
  });
  scan('scanModel')?.addEventListener('input', event => {
    const parsed = window.ScanParser?.parsePlate(`MODEL: ${event.target.value}\n${scan('scanText').value}`, catalog());
    if (parsed?.match) {
      window.scannedMachine = parsed.match;
      updateDetectedLabel(parsed);
    } else {
      window.scannedMachine = null;
      if (scan('scanOpen')) scan('scanOpen').disabled = true;
      scan('scanDetected').textContent = 'Model entered; no exact local catalog code match.';
    }
  });
  scan('modeLocal').addEventListener('click', () => setMode('local'));
  scan('modeGlobal').addEventListener('click', () => setMode('global'));
  document.querySelectorAll('[data-scan]').forEach(button => button.addEventListener('click', openScanner));
  return true;
}

function onCatalogReady(event) {
  const records = Array.isArray(event.detail) ? event.detail : event.detail?.machines;
  if (records?.length) window.machines = records;
  if (scannerBusy) return;
  const existingText = scan('scanText')?.value || lastScanText;
  if (!existingText || !lastScanFile || window.scannedMachine) return;
  const parsed = matchPlate(existingText);
  if (parsed.match) activateCatalogRecord(parsed.match, parsed, existingText, { source: 'OCR after catalog loaded', autoView: true });
}

if (!bindScanner()) window.addEventListener('DOMContentLoaded', bindScanner);
window.addEventListener('catalog:ready', onCatalogReady);
window.addEventListener('DOMContentLoaded', () => setMode('global'));
