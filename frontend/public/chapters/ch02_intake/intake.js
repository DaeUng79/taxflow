const $ = id => document.getElementById(id);
let pages = [], results = [], pendingResults = null, index = 0, busy = false, view = 'table';
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
    data.payments.every(item => typeof item.payment_method === 'string') &&
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
        const row = document.createElement('div'); row.className = 'field-row';
        const label = document.createElement('dt'); label.textContent = item.label || '항목';
        const value = document.createElement('dd');
        const amount = document.createElement('span');
        const formatted = key === 'payments' ? paymentAmount(item.label, item.value) : null;
        amount.textContent = formatted || item.value || '미기재';
        value.append(amount);
        if (key === 'payments' && (formatted || item.payment_method)) {
          const method = document.createElement('span'); method.className = 'payment-method';
          method.textContent = `지급방식: ${item.payment_method || '확인되지 않음'}`;
          value.append(method);
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
  busy = true; const model = $('model').value; const nextResults = []; pendingResults = nextResults; show();
  for (let i = 0; i < pages.length; i++) {
    $('status').textContent = `${model.toUpperCase()} 모델로 구조화 중… 모델에 따라 수 분이 걸릴 수 있습니다.`;
    try {
      const data = await request('/api/intake/parse', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({image:pages[i], model})});
      try {
        if (!isCoreJson(JSON.parse(data.text))) throw new Error();
      } catch {
        throw new Error('서버가 핵심 항목 JSON을 반환하지 않았습니다. TAXFLOW 서버를 재시작한 뒤 다시 시도하세요.');
      }
      nextResults[i] = data.text; index = i; show();
    } catch (error) {
      $('status').textContent = `${i + 1}페이지 구조화 실패: ${error.message} 이전 결과는 유지됩니다. 다시 시도해 주세요.`;
      clearInterval(timer); updateElapsed();
      pendingResults = null; busy = false; show(); return;
    }
  }
  clearInterval(timer); updateElapsed();
  results = nextResults; pendingResults = null; busy = false; index = 0;
  $('status').textContent = `${model.toUpperCase()} 모델의 구조화가 완료되었습니다. 원본과 대조하고 필요한 내용을 수정하세요.`;
  show();
}
$('file').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = '';
  pages = []; results = []; index = 0; $('elapsed').hidden = true;
  $('filename').textContent = file ? file.name : '선택된 파일 없음';
  if (!file) { $('status').textContent = 'PDF를 선택해 주세요.'; show(); return; }
  if (file.size > 20 * 1024 * 1024) { $('status').textContent = 'PDF 크기는 20MB 이하여야 합니다.'; show(); return; }
  busy = true; show(); $('status').textContent = 'PDF를 페이지별 이미지로 변환하는 중입니다…';
  try {
    const data = await request('/api/intake/render', {method:'POST', headers:{'Content-Type':'application/pdf'}, body:file});
    pages = data.pages; results = Array(pages.length).fill('');
    await runAnalysis();
  } catch (error) { $('status').textContent = error.message; }
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
