const $ = id => document.getElementById(id);
let pages = [], results = [], pendingResults = null, index = 0, busy = false, analyzing = false, reviewSaving = false;
const parameters = new URLSearchParams(location.search);
const consultationId = parameters.get('consultation_id');
const documentType = parameters.get('type') === 'transfer' ? 'transfer_contract' : 'acquisition_contract';
const contractName = documentType === 'transfer_contract' ? '양도계약서' : '취득계약서';
const api = path => `/api/contracts/${path}?document_type=${encodeURIComponent(documentType)}`;
const closeButton = $('contract-close');
if (window.parent !== window) {
  closeButton.hidden = false;
  closeButton.addEventListener('click', () => window.parent.postMessage({type:'taxflow:contract-close'}, location.origin));
}
document.title = `${contractName} 분석 · TAXFLOW`;
$('contract-page-title').textContent = `${contractName} 분석`;
$('contract-guidance').hidden = documentType !== 'transfer_contract';
const storageEnabled = /^[1-9]\d*$/.test(consultationId || '');
let documentId = null, resultModel = null, currentDocument = null, documentsLoaded = !storageEnabled;
if (storageEnabled) $('storage').hidden = false;
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== window.parent || !event.data ||
      event.data.type !== 'taxflow:consultation-save-failed' ||
      event.data.consultationId !== Number(consultationId) || event.data.documentType !== documentType ||
      typeof event.data.message !== 'string') return;
  $('consultation-save-warning').textContent = event.data.message;
  $('consultation-save-warning').hidden = false;
});
async function storageRequest(url, method, payload) {
  return request(url, {method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
}
async function refreshDocuments() {
  const data = await request(`${api('documents')}&consultation_id=${encodeURIComponent(consultationId)}`);
  currentDocument = data.items[0] || null;
  documentsLoaded = true;
  $('file-label-text').textContent = currentDocument ? 'PDF 교체' : 'PDF 등록';
  return data.items;
}
function syncStorage() {
  if (!storageEnabled) return;
  $('saveReview').disabled = $('confirmReview').disabled = busy || reviewSaving || !documentId || !resultModel || !results.length;
}
async function saveCurrentResult(model, pageResults, confirmed) {
  if (!storageEnabled || !documentId) return;
  await storageRequest(api(`documents/${documentId}/result`), 'PUT', {model, pages:pageResults, confirmed, expected_sha256:currentDocument?.sha256});
  resultModel = model;
  await refreshDocuments();
}
async function saveReview(confirmed) {
  if (reviewSaving) return;
  reviewSaving = true; closeButton.disabled = true; syncStorage();
  try {
    const parsed = results.map((r,i) => { try {
      const value = JSON.parse(r); if (!isCoreJson(value)) throw new Error();
      for (const item of value.payments) {
        if (paymentUtils.hasAmount(item.value) && !/날짜|지급일|입금일|기일|일자/.test(item.label) && !paymentUtils.isTotal(item.label) && item.payment_date) {
          const date = paymentUtils.formatDate(item.payment_date);
          if (!date) throw new Error('지급일자는 올바른 연월일 8자리로 입력해 주세요.');
          item.payment_date = date;
        }
      }
      return value;
    } catch (error) { throw new Error(`${i+1}쪽 ${error.message === '지급일자는 올바른 연월일 8자리로 입력해 주세요.' ? error.message : '분석 내용을 확인해 주세요.'}`); } });
    await saveCurrentResult(resultModel, parsed, confirmed);
    if (confirmed) $('review-confirmation').showModal();
    else $('status').textContent = '수정 결과를 저장했습니다. 원본 확인 후 확인 완료를 눌러 주세요.';
  } catch(e) { $('status').textContent = `저장 실패: ${e.message}`; }
  finally { reviewSaving = false; closeButton.disabled = false; syncStorage(); }
}
$('saveReview').onclick = () => saveReview(false);
$('confirmReview').onclick = () => saveReview(true);
$('review-confirmation').addEventListener('close', () => {
  if (window.parent !== window) window.parent.postMessage({type:'taxflow:contract-close'}, location.origin);
  else location.href = 'index.html';
});
async function loadDocument(selected) {
  busy = true; show(); $('status').textContent = '저장된 PDF를 불러오는 중입니다…';
  try {
    const response = await fetch(api(`documents/${encodeURIComponent(selected.id)}/pdf`)); if (!response.ok) throw new Error('저장된 PDF를 불러오지 못했습니다.');
    const blob = await response.blob(); const data = await request(api('render'), {method:'POST',headers:{'Content-Type':'application/pdf'},body:blob});
    const saved = await request(api(`documents/${encodeURIComponent(selected.id)}/result`));
    documentId = Number(selected.id); pages = data.pages; results = []; index = 0; resultModel = null;
    $('filename').textContent = selected.filename;
    if (saved.result) {
      if (!Array.isArray(saved.result.pages) || saved.result.pages.length !== pages.length || !saved.result.pages.every(isCoreJson)) throw new Error('저장된 결과의 형식을 확인할 수 없습니다.');
      results = saved.result.pages.map(value => JSON.stringify(value,null,2)); resultModel = saved.result.model;
      $('status').textContent = saved.result.confirmed ? '' : '저장된 AI 추출 결과입니다. 원본과 대조하세요.';
    } else $('status').textContent = '저장된 원본입니다. 분석하려면 다시 분석을 눌러 주세요.';
  } catch(e) { documentId = null; resultModel = null; pages = []; results = []; index = 0; $('status').textContent = e.message; } finally { busy = false; show(); }
}
const sections = [
  {key:'property', title:'부동산의 표시', number:'01', description:'소재지 · 토지 · 건물'},
  {key:'payments', title:'매매대금 및 지급', number:'02', description:'총액 · 계약금 · 중도금 · 잔금'},
  {key:'seller', title:'매도인', number:'03', description:'성명 · 주소 · 주민등록번호'},
  {key:'buyer', title:'매수인', number:'04', description:'성명 · 주소 · 주민등록번호'}
];
const personFields = [
  ['name', '성명'], ['address', '주소'],
  ['resident_registration_number', '주민등록번호'], ['ownership_share', '지분']
];
function isCoreJson(data) {
  return !!data && ['property', 'payments'].every(key => Array.isArray(data[key]) &&
    data[key].every(item => item && typeof item.label === 'string' && typeof item.value === 'string')) &&
    data.payments.every(item => item.payment_date === undefined || typeof item.payment_date === 'string') &&
    ['seller', 'buyer'].every(key => Array.isArray(data[key]) && data[key].every(person =>
      person && personFields.every(([field]) => typeof person[field] === 'string')));
}
function renderResult(text) {
  const container = $('renderedResult');
  container.replaceChildren();
  function message(text) {
    const p = document.createElement('p'); p.className = 'empty-result'; p.textContent = text; container.append(p);
  }
  if (!text) { message('분석이 완료되면 핵심 정보가 표시됩니다.'); return; }
  let data;
  try { data = JSON.parse(text); if (!isCoreJson(data)) throw new Error(); }
  catch { message('분석 결과를 표시할 수 없습니다. 다시 분석해 주세요.'); return; }
  function editable(value, labelText, onChange) {
    const input = document.createElement('textarea'); input.className = 'result-edit'; input.rows = 1;
    input.value = value; input.placeholder = '확인되지 않음'; input.setAttribute('aria-label', labelText);
    input.disabled = busy || !!pendingResults;
    input.addEventListener('input', () => { onChange(input.value); results[index] = JSON.stringify(data); $('status').textContent = '수정한 내용을 저장하려면 수정 결과 저장을 눌러 주세요.'; });
    return input;
  }
  sections.forEach(({key, title, number, description}) => {
    const section = document.createElement('section'); section.className = 'info-card';
    const head = document.createElement('div'); head.className = 'card-heading';
    const marker = document.createElement('span'); marker.className = 'card-number'; marker.textContent = number;
    const headingGroup = document.createElement('div');
    const heading = document.createElement('h3'); heading.textContent = title;
    const subtitle = document.createElement('p'); subtitle.className = 'card-subtitle'; subtitle.textContent = description;
    headingGroup.append(heading, subtitle); head.append(marker, headingGroup); section.append(head);
    const isPerson = key === 'seller' || key === 'buyer';
    if (!data[key].length) {
      const empty = document.createElement('p'); empty.className = 'card-empty'; empty.textContent = '이 페이지에서 확인된 내용이 없습니다.'; section.append(empty);
    } else if (isPerson) {
      const status = document.createElement('p'); status.className = 'ownership-status';
      status.textContent = data[key].length > 1 ? `이 페이지에서 ${data[key].length}명 확인 · 공동명의 여부 원본 확인` : '이 페이지에서 1명 확인 · 추가 공동명의자 확인되지 않음';
      section.append(status);
      data[key].forEach((person, i) => {
        const personBlock = document.createElement('div'); personBlock.className = 'person-block';
        const personTitle = document.createElement('h4'); personTitle.textContent = `${title} ${i + 1}`; personBlock.append(personTitle);
        const list = document.createElement('dl'); list.className = 'field-list';
        personFields.forEach(([field, labelText]) => {
          const row = document.createElement('div'); row.className = 'field-row';
          const label = document.createElement('dt'); label.textContent = labelText;
          const value = document.createElement('dd'); value.append(editable(person[field], `${title} ${i + 1} ${labelText}`, next => { person[field] = next; }));
          row.append(label, value); list.append(row);
        });
        personBlock.append(list); section.append(personBlock);
      });
    } else {
      const list = document.createElement('dl'); list.className = 'field-list';
      data[key].forEach((item, i) => {
        if (key === 'payments' && (!paymentUtils.hasAmount(item.value) || /날짜|지급일|입금일|기일|일자/.test(item.label))) return;
        const row = document.createElement('div'); row.className = 'field-row';
        const label = document.createElement('dt');
        label.append(editable(item.label, `${title} ${i + 1} 항목 이름`, next => { item.label = next; }));
        const value = document.createElement('dd');
        if (key === 'payments') {
          value.classList.add('payment-fields');
          const amountLabel = document.createElement('label');
          amountLabel.append(editable(item.value, `${title} ${i + 1} 금액`, next => { item.value = next; }));
          value.append(amountLabel);
          if (!paymentUtils.isTotal(item.label)) {
            const dateLabel = document.createElement('label');
            const dateInput = document.createElement('input'); dateInput.type = 'text'; dateInput.className = 'result-edit';
            dateInput.inputMode = 'numeric'; dateInput.autocomplete = 'off'; dateInput.maxLength = 11;
            dateInput.setAttribute('aria-label', `${title} ${i + 1} 지급일자`); dateInput.placeholder = 'YYYY.MM.DD.';
            dateInput.value = paymentUtils.formatDate(item.payment_date || '') ?? (item.payment_date || '');
            dateInput.disabled = busy || !!pendingResults;
            dateInput.addEventListener('keydown', event => {
              const position = dateInput.selectionStart;
              if (event.key === 'Backspace' && position === dateInput.selectionEnd && position > 1 && dateInput.value[position - 1] === '.') {
                event.preventDefault();
                dateInput.value = dateInput.value.slice(0, position - 2) + dateInput.value.slice(position);
                dateInput.dispatchEvent(new Event('input', {bubbles:true}));
                dateInput.setSelectionRange(position - 2, position - 2);
              }
            });
            dateInput.addEventListener('input', () => { dateInput.value = paymentUtils.maskDate(dateInput.value); item.payment_date = dateInput.value; results[index] = JSON.stringify(data); $('status').textContent = '수정한 내용을 저장하려면 수정 결과 저장을 눌러 주세요.'; });
            dateLabel.append(dateInput); value.append(dateLabel);
          } else value.classList.add('payment-total');
        } else value.append(editable(item.value, `${title} ${i + 1} 내용`, next => { item.value = next; }));
        row.append(label, value); list.append(row);
      });
      section.append(list);
    }
    container.append(section);
  });
}
function show() {
  const count = pages.length;
  $('page').textContent = count ? `${index + 1} / ${count}` : '0 / 0';
  $('prev').disabled = busy || index === 0;
  $('next').disabled = busy || index >= count - 1;
  $('parse').disabled = busy || !count;
  $('file').disabled = busy || !documentsLoaded;
  $('model').disabled = busy;
  $('image').hidden = !count;
  $('preview').querySelector('span').hidden = !!count;
  if (count) $('image').src = `data:image/jpeg;base64,${pages[index]}`;
  else $('image').removeAttribute('src');
  $('status-row').hidden = analyzing;
  $('renderedResult').hidden = analyzing;
  $('analysis-progress').hidden = !analyzing;
  if (!analyzing) renderResult(results[index] || '');
  syncStorage();
}
async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `요청 실패 (${response.status})`);
  return data;
}
async function runAnalysis() {
  const started = performance.now();
  function updateElapsed() {
    const seconds = Math.floor((performance.now() - started) / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds / 60) % 60;
    const remainder = seconds % 60;
    const elapsed = `경과 시간 ${hours ? `${hours}:` : ''}${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
    $('elapsed').textContent = elapsed;
    $('elapsed-summary').textContent = elapsed;
  }
  $('elapsed-summary').hidden = true;
  updateElapsed();
  const timer = setInterval(updateElapsed, 1000);
  busy = true; analyzing = true; const model = $('model').value; const nextResults = []; let dateWarning = false, contractDateWarning = false; const amountWarnings = new Set(); pendingResults = nextResults;
  $('analysis-progress-message').textContent = `${model.toUpperCase()} 모델로 분석 중… 지급일도 다시 확인하므로 수 분이 걸릴 수 있습니다.`;
  show();
  for (let i = 0; i < pages.length; i++) {
    $('analysis-progress-message').textContent = `${model.toUpperCase()} 모델로 분석 중… 지급일도 다시 확인하므로 수 분이 걸릴 수 있습니다.`;
    try {
      const data = await request(api('parse'), {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({image:pages[i], model})});
      try {
        if (!isCoreJson(JSON.parse(data.text))) throw new Error();
      } catch {
        throw new Error('분석 결과를 읽을 수 없습니다. TAXFLOW 서버를 재시작한 뒤 다시 시도하세요.');
      }
      dateWarning ||= data.date_warning === true;
      contractDateWarning ||= data.contract_date_warning === true;
      if (Array.isArray(data.amount_warnings)) data.amount_warnings.filter(item => typeof item === 'string').forEach(item => amountWarnings.add(item));
      nextResults[i] = data.text; index = i; show();
    } catch (error) {
      $('status').textContent = `${i + 1}페이지 분석 실패: ${error.message} ${results.some(Boolean) ? '이전 결과는 유지됩니다.' : '저장된 원본을 다시 분석해 주세요.'}`;
      clearInterval(timer); updateElapsed();
      pendingResults = null; busy = false; analyzing = false; $('elapsed-summary').hidden = false; show(); return;
    }
  }
  clearInterval(timer); updateElapsed();
  results = nextResults; pendingResults = null; index = 0;
  const warnings = [];
  if (contractDateWarning) warnings.push('계약금의 계약일자가 불명확합니다. 원본을 확인해 입력해 주세요.');
  if (amountWarnings.size) warnings.push(`${[...amountWarnings].join(', ')} 금액을 원문과 대조해 주세요.`);
  if (dateWarning) warnings.push('일부 지급일이 중복되어 확인이 필요합니다.');
  $('status').textContent = warnings.length ? warnings.join(' ') : `${model.toUpperCase()} 모델의 분석이 완료되었습니다. 금액과 지급일을 원본과 대조하세요.`;
  resultModel = model;
  $('analysis-progress-message').textContent = '분석이 완료되어 결과를 저장하고 있습니다…';
  try { await saveCurrentResult(model, results.map(JSON.parse), false); } catch (error) { $('status').textContent = `분석은 완료됐지만 결과 저장에 실패했습니다: ${error.message} 수정 결과 저장을 다시 시도해 주세요.`; }
  busy = false; analyzing = false; $('elapsed-summary').hidden = false; show();
}
$('file').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) { $('status').textContent = 'PDF 크기는 20MB 이하여야 합니다.'; return; }
  if (storageEnabled && currentDocument && !window.confirm(`기존 ${contractName} “${currentDocument.filename}”를 새 파일로 교체할까요?\n기존 원본과 분석 결과는 삭제되며 복구할 수 없습니다.`)) return;
  busy = true; show(); $('status').textContent = 'PDF를 확인하고 있습니다…';
  try {
    const data = await request(api('render'), {method:'POST', headers:{'Content-Type':'application/pdf'}, body:file});
    if (storageEnabled) {
      const bytes = new Uint8Array(await file.arrayBuffer()); let binary = '';
      for (let i=0; i<bytes.length; i+=32768) binary += String.fromCharCode(...bytes.subarray(i,i+32768));
      const saved = await storageRequest(api('documents'), 'POST', {
        consultation_id:Number(consultationId), document_type:documentType, filename:file.name, pdf:btoa(binary),
        expected_document_id:currentDocument?.id ?? null, expected_sha256:currentDocument?.sha256 ?? null
      });
      currentDocument = {id:saved.id, sha256:saved.sha256, filename:file.name};
      documentId = saved.id;
      $('consultation-save-warning').hidden = true;
      if (window.parent !== window) {
        window.parent.postMessage({type:'taxflow:contract-registered', consultationId:Number(consultationId), documentType}, location.origin);
      }
    }
    pages = data.pages; results = Array(pages.length).fill(''); index = 0; resultModel = null;
    $('filename').textContent = file.name; $('elapsed-summary').hidden = true;
    $('file-label-text').textContent = storageEnabled ? 'PDF 교체' : 'PDF 등록';
    await runAnalysis();
  } catch (error) { $('status').textContent = `등록하지 못했습니다: ${error.message}`; }
  finally { busy = false; show(); }
});
$('prev').onclick = () => { if (index > 0) { index--; show(); } };
$('next').onclick = () => { if (index < pages.length - 1) { index++; show(); } };
$('parse').onclick = runAnalysis;
show();
if (storageEnabled) {
  (async () => {
    busy = true; show(); $('status').textContent = `등록된 ${contractName}를 확인하는 중입니다…`;
    try {
      const documents = await refreshDocuments();
      if (documents.length) {
        await loadDocument(documents[0]);
      } else {
        busy = false; $('status').textContent = `등록된 ${contractName}가 없습니다. PDF를 선택해 주세요.`; show();
      }
    } catch (error) {
      busy = false; $('status').textContent = `서류 목록을 불러오지 못했습니다: ${error.message}`; show();
    }
  })();
}
