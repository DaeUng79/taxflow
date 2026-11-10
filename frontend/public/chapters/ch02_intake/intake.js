const $ = id => document.getElementById(id);
let pages = [], results = [], pendingResults = null, index = 0, busy = false, view = 'table';
const consultationId = new URLSearchParams(location.search).get('consultation_id');
const storageEnabled = /^[1-9]\d*$/.test(consultationId || '');
let documentId = null, runId = null, savedRuns = [];
if (storageEnabled) $('storage').hidden = false;
async function storageRequest(url, method, payload) {
  return request(url, {method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
}
async function refreshDocuments() {
  const data = await request(`/api/documents?consultation_id=${encodeURIComponent(consultationId)}`);
  const select = $('storedDocuments'); select.replaceChildren(new Option('새 파일 등록', ''));
  const labels = {registered:'등록됨', review_needed:'확인 필요', confirmed:'확인 완료', failed:'분석 실패'};
  for (const item of data.items) select.add(new Option(`${item.filename} · ${labels[item.status] || item.status} · ${item.created_at}`, String(item.id)));
  select.value = documentId ? String(documentId) : '';
}
async function refreshRuns() {
  const data = await request(`/api/documents/${documentId}/runs`); savedRuns = data.items;
  const select = $('storedRuns'); select.replaceChildren(new Option('분석 이력 선택', ''));
  for (const run of savedRuns) select.add(new Option(`${run.created_at} · ${run.model.toUpperCase()} · ${run.status === 'completed' ? '분석 완료' : '분석 실패'}`, String(run.id)));
  select.value = runId ? String(runId) : '';
}
function syncStorage() {
  if (!storageEnabled) return;
  $('storedDocuments').disabled = busy; $('storedRuns').disabled = busy || !documentId;
  $('saveReview').disabled = $('confirmReview').disabled = busy || !runId || !results.length;
}
async function saveAnalysis(state, model, pageResults, error='') {
  if (!storageEnabled || !documentId) return;
  const data = await storageRequest(`/api/documents/${documentId}/runs`, 'POST', {status:state, model, pages:pageResults, error:error.slice(0,2000)});
  if (state === 'completed') runId = data.id;
  await refreshRuns(); await refreshDocuments();
}
async function saveReview(confirmed) {
  try {
    const parsed = results.map((r,i) => { try { const value = JSON.parse(r); if (!isCoreJson(value)) throw new Error(); return value; } catch { throw new Error(`${i+1}쪽 JSON 형식을 확인하세요.`); } });
    await storageRequest(`/api/documents/${documentId}/runs/${runId}`, 'PUT', {pages:parsed, confirmed});
    $('status').textContent = confirmed ? '확인 결과를 저장했습니다. 상담 항목에는 자동 반영되지 않습니다.' : '수정 결과를 저장했습니다. 원본 확인 후 확인 완료를 눌러 주세요.';
    await refreshDocuments(); await refreshRuns();
  } catch(e) { $('status').textContent = `저장 실패: ${e.message}`; }
}
$('saveReview').onclick = () => saveReview(false);
$('confirmReview').onclick = () => saveReview(true);
$('storedRuns').onchange = () => {
  const run = savedRuns.find(item => String(item.id) === $('storedRuns').value);
  if (!run || run.status !== 'completed') { runId = null; $('status').textContent = run ? `분석 실패: ${run.error || '오류'}` : '분석 이력을 선택하세요.'; syncStorage(); return; }
  runId = run.id; results = JSON.parse(run.reviewed_json || run.raw_json).map(value => JSON.stringify(value,null,2)); index = 0;
  $('status').textContent = run.reviewed_json ? '저장된 확인 결과입니다. 원본과 대조하세요.' : '저장된 AI 추출 결과입니다. 원본과 대조하세요.'; show();
};
$('storedDocuments').onchange = async () => {
  const selected = $('storedDocuments').value;
  if (!selected) { documentId = null; runId = null; pages = []; results = []; index = 0; $('filename').textContent = '선택된 파일 없음'; $('storedRuns').replaceChildren(new Option('분석 이력 없음','')); show(); return; }
  busy = true; show(); $('status').textContent = '저장된 PDF를 불러오는 중입니다…';
  try {
    const response = await fetch(`/api/documents/${encodeURIComponent(selected)}/pdf`); if (!response.ok) throw new Error('저장된 PDF를 불러오지 못했습니다.');
    const blob = await response.blob(); const data = await request('/api/intake/render', {method:'POST',headers:{'Content-Type':'application/pdf'},body:blob});
    documentId = Number(selected); runId = null; pages = data.pages; results = []; index = 0; $('filename').textContent = $('storedDocuments').selectedOptions[0].textContent;
    await refreshRuns(); const latest = savedRuns.find(run => run.status === 'completed');
    if (latest) { $('storedRuns').value = String(latest.id); $('storedRuns').onchange(); } else $('status').textContent = '저장된 원본입니다. 계약 내용 구조화를 누르세요.';
  } catch(e) { $('status').textContent = e.message; } finally { busy = false; show(); }
};
if (storageEnabled) refreshDocuments().catch(e => { $('status').textContent = `서류 목록을 불러오지 못했습니다: ${e.message}`; });
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
function paymentAmount(label, value) {
  if (!/대금|계약금|중도금|잔금|금액/.test(label) || /날짜|지급일|입금일|기일/.test(label)) return null;
  const text = value.trim();
  // Only format an unambiguous integer amount, optionally accompanied by its Korean spelling.
  const standalone = text.match(/^(?:[₩W]\s*)?((?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+))(?:\s*원)?$/);
  const bilingual = text.match(/^(?:금\s*)?[가-힣\s]+\s*\(\s*[₩W]\s*((?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+))\s*\)$/);
  const match = standalone || bilingual;
  if (!match) return null;
  const digits = match[1].replaceAll(',', '');
  return `${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}원`;
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
  catch { message('핵심 정보를 표시할 수 없습니다. JSON 보기에서 형식을 확인해 주세요.'); return; }
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
          const value = document.createElement('dd'); value.textContent = person[field] || '이 페이지에서 확인되지 않음';
          row.append(label, value); list.append(row);
        });
        personBlock.append(list); section.append(personBlock);
      });
    } else {
      const list = document.createElement('dl'); list.className = 'field-list';
      data[key].forEach(item => {
        if (key === 'payments' && (!paymentUtils.hasAmount(item.value) || /날짜|지급일|입금일|기일|일자/.test(item.label))) return;
        const row = document.createElement('div'); row.className = 'field-row';
        const label = document.createElement('dt'); label.textContent = item.label || '항목';
        const value = document.createElement('dd');
        const amount = document.createElement('span');
        const formatted = key === 'payments' ? paymentAmount(item.label, item.value) : null;
        amount.textContent = formatted || item.value || '미기재';
        value.append(amount);
        if (key === 'payments' && !paymentUtils.isTotal(item.label)) {
          value.classList.add('payment-fields');
          const date = document.createElement('span'); date.className = 'payment-date';
          date.textContent = paymentUtils.formatDate(item.payment_date || '') || item.payment_date || '확인되지 않음';
          value.append(date);
        }
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
  $('file').disabled = busy;
  $('model').disabled = busy;
  $('download').disabled = busy || !results.some(Boolean);
  $('image').hidden = !count;
  $('preview').querySelector('span').hidden = !!count;
  if (count) $('image').src = `data:image/jpeg;base64,${pages[index]}`;
  else $('image').removeAttribute('src');
  $('result').disabled = busy || !count;
  const visibleResult = pendingResults ? (pendingResults[index] || '') : (results[index] || '');
  $('result').value = visibleResult;
  $('result').hidden = view !== 'json';
  $('renderedResult').hidden = view !== 'table';
  $('tableView').setAttribute('aria-pressed', String(view === 'table'));
  $('jsonView').setAttribute('aria-pressed', String(view === 'json'));
  renderResult(visibleResult);
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
    $('elapsed').textContent = `경과 시간 ${hours ? `${hours}:` : ''}${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }
  $('elapsed').hidden = false;
  updateElapsed();
  const timer = setInterval(updateElapsed, 1000);
  busy = true; const model = $('model').value; const nextResults = []; let dateWarning = false, contractDateWarning = false; const amountWarnings = new Set(); pendingResults = nextResults; show();
  for (let i = 0; i < pages.length; i++) {
    $('status').textContent = `${model.toUpperCase()} 모델로 구조화 중… 모델에 따라 수 분이 걸릴 수 있습니다.`;
    try {
      const data = await request('/api/intake/parse', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({image:pages[i], model})});
      try {
        if (!isCoreJson(JSON.parse(data.text))) throw new Error();
      } catch {
        throw new Error('서버가 핵심 항목 JSON을 반환하지 않았습니다. TAXFLOW 서버를 재시작한 뒤 다시 시도하세요.');
      }
      dateWarning ||= data.date_warning === true;
      contractDateWarning ||= data.contract_date_warning === true;
      if (Array.isArray(data.amount_warnings)) data.amount_warnings.filter(item => typeof item === 'string').forEach(item => amountWarnings.add(item));
      nextResults[i] = data.text; index = i; show();
    } catch (error) {
      $('status').textContent = `${i + 1}페이지 구조화 실패: ${error.message} 이전 결과는 유지됩니다. 다시 시도해 주세요.`;
      clearInterval(timer); updateElapsed();
      try { await saveAnalysis('failed', model, null, error.message); } catch (saveError) { $('status').textContent += ` 분석 실패 이력 저장 실패: ${saveError.message}`; }
      pendingResults = null; busy = false; show(); return;
    }
  }
  clearInterval(timer); updateElapsed();
  results = nextResults; pendingResults = null; index = 0;
  const warnings = [];
  if (contractDateWarning) warnings.push('계약금의 계약일자가 불명확합니다. 원본을 확인해 입력해 주세요.');
  if (amountWarnings.size) warnings.push(`${[...amountWarnings].join(', ')} 금액을 원문과 대조해 주세요.`);
  if (dateWarning) warnings.push('일부 지급일이 중복되어 확인이 필요합니다.');
  $('status').textContent = warnings.length ? warnings.join(' ') : `${model.toUpperCase()} 모델의 구조화이 완료되었습니다. 금액과 지급일을 원본과 대조하세요.`;
  try { await saveAnalysis('completed', model, results.map(JSON.parse)); } catch (error) { runId = null; $('status').textContent = `분석은 완료됐지만 DB 저장에 실패했습니다: ${error.message} JSON 저장으로 결과를 보관하세요.`; }
  busy = false; show();
}
$('file').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = '';
  pages = []; results = []; index = 0; documentId = null; runId = null; $('elapsed').hidden = true;
  $('filename').textContent = file ? file.name : '선택된 파일 없음';
  if (!file) { $('status').textContent = 'PDF를 선택해 주세요.'; show(); return; }
  if (file.size > 20 * 1024 * 1024) { $('status').textContent = 'PDF 크기는 20MB 이하여야 합니다.'; show(); return; }
  busy = true; show(); $('status').textContent = 'PDF를 페이지별 이미지로 변환하는 중입니다…';
  try {
    const data = await request('/api/intake/render', {method:'POST', headers:{'Content-Type':'application/pdf'}, body:file});
    pages = data.pages; results = Array(pages.length).fill('');
    if (storageEnabled) {
      const bytes = new Uint8Array(await file.arrayBuffer()); let binary = '';
      for (let i=0; i<bytes.length; i+=32768) binary += String.fromCharCode(...bytes.subarray(i,i+32768));
      const saved = await storageRequest('/api/documents', 'POST', {consultation_id:Number(consultationId),document_type:'acquisition_contract',filename:file.name,pdf:btoa(binary)});
      documentId = saved.id; runId = null; await refreshDocuments(); await refreshRuns();
    }
    await runAnalysis();
  } catch (error) { if (storageEnabled && !documentId) { pages = []; results = []; } $('status').textContent = error.message; }
  finally { busy = false; show(); }
});
$('tableView').onclick = () => { view = 'table'; show(); };
$('jsonView').onclick = () => { view = 'json'; show(); };
$('prev').onclick = () => { if (index > 0) { index--; show(); } };
$('next').onclick = () => { if (index < pages.length - 1) { index++; show(); } };
$('result').addEventListener('input', e => { results[index] = e.target.value; $('download').disabled = !results.some(Boolean); });
$('parse').onclick = runAnalysis;
$('download').onclick = () => {
  let data;
  try {
    data = {pages: results.map((result, i) => {
      try {
        const parsed = JSON.parse(result);
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error();
        return {page: i + 1, content: parsed};
      } catch { throw new Error(`${i + 1}페이지의 JSON 형식이 올바르지 않습니다. 수정 후 저장하세요.`); }
    })};
  } catch (error) { $('status').textContent = error.message; return; }
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type:'application/json;charset=utf-8'}));
  const link = document.createElement('a'); link.href = url; link.download = '계약서_구조화결과.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
show();
