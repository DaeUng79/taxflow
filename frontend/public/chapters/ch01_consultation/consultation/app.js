(() => {
  'use strict';
  const form = document.querySelector('#consultation-form');
  const records = document.querySelector('#records');
  const message = document.querySelector('#message');
  const selectionStatus = document.querySelector('#selection-status');
  const search = document.querySelector('#search');
  const reportButton = document.querySelector('#open-report');
  let id = null, dirty = false, items = [], documentRequest = 0, retiredFields = {};
  let editVersion = 0, saving = false, pendingAutomaticSave = false, automaticSaveContext = null;
  const savedAt = () => { const d = new Date(); const pad = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  const amountFields = ['acquisitionPrice', 'transferPrice', 'expenses'];
  const dateFields = ['birthDate', 'acquisitionContractDate', 'acquisitionBalanceDate', 'acquisitionRegistrationDate', 'transferContractDate', 'transferBalanceDate', 'transferRegistrationDate', 'moveInDate', 'moveOutDate'];
  const formatAmount = value => { const digits = String(value).replace(/[^0-9]/g, ''); return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  function formatConsultationDate(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const match = /^\d{8}$/.test(raw) ? [raw, raw.slice(0, 4), raw.slice(4, 6), raw.slice(6, 8)] : raw.match(/^(\d{4})\s*(?:년|[.\/-])\s*(\d{1,2})\s*(?:월|[.\/-])\s*(\d{1,2})\s*(?:일|\.)?$/);
    if (!match) return null;
    const [year, month, day] = match.slice(1).map(Number);
    const date = new Date(0); date.setUTCFullYear(year, month - 1, day);
    if (year < 1 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return `${String(year).padStart(4, '0')}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}.`;
  }
  const displayValue = (name, value) => amountFields.includes(name) ? formatAmount(value) : dateFields.includes(name) ? (formatConsultationDate(value) ?? value) : value;
  const reportUrl = recordId => `report.html?v=20261110-2&id=${encodeURIComponent(recordId)}`;
  function updateReportButton() {
    syncContractAction();
    reportButton.disabled = id === null || dirty;
    reportButton.title = dirty ? '변경 내용을 저장한 뒤 상담서를 열 수 있습니다' : id === null ? '상담을 저장한 뒤 상담서를 열 수 있습니다' : '저장된 상담서 미리보기 및 출력';
    settlement.updatePrintButton();
  }
  const contractTypes = [
    {field:'acquisitionDocument', type:'acquisition_contract', key:'acquisition', name:'취득계약서'},
    {field:'transferDocument', type:'transfer_contract', key:'transfer', name:'양도계약서'}
  ];
  const comparisonFields = {};
  for (const contract of contractTypes) {
    contract.comparisons = [
      {name:`${contract.key}ContractDate`, kind:'contractDate'},
      {name:`${contract.key}BalanceDate`, kind:'balanceDate'},
      {name:`${contract.key}Price`, kind:'amount'}
    ];
    for (const field of contract.comparisons) {
      const input = form.elements[field.name], hint = document.createElement('span');
      hint.className = 'contract-comparison';
      hint.id = `comparison-${field.name}`;
      hint.setAttribute('role', 'status');
      input.setAttribute('aria-describedby', hint.id);
      const label = input.closest('label');
      label.insertBefore(hint, input.closest('.amount-control') || input);
      comparisonFields[field.name] = {input, hint, contract, ...field};
      input.addEventListener('input', () => updateComparison(comparisonFields[field.name]));
    }
  }
  function uniqueValue(values, normalize) {
    if (!values.length) return null;
    const normalized = values.map(normalize);
    if (normalized.some(value => value === null || value === '')) return null;
    return new Set(normalized).size === 1 ? normalized[0] : null;
  }
  function numericAmount(value) {
    const match = String(value ?? '').trim().match(/^(?:금\s*)?(?:[₩￦W]\s*)?(\d{1,3}(?:,\d{3})+|\d+)\s*(?:원(?:정)?)?$/i);
    return match ? BigInt(match[1].replace(/,/g, '')).toString() : null;
  }
  function analysisValues(result) {
    const pages = Array.isArray(result?.pages) ? result.pages : [];
    const properties = pages.flatMap(page => Array.isArray(page.property) ? page.property : []);
    const payments = pages.flatMap(page => Array.isArray(page.payments) ? page.payments : []);
    const dates = properties.filter(row => row && /^(?:계약\s*체결일|계약일|계약일자)$/.test(String(row.label || '').trim())).map(row => row.value);
    const balances = payments.filter(row => row && /잔금/.test(row.label || '') && !/날짜|지급일|입금일|기일|일자/.test(row.label || ''));
    const totals = payments.filter(row => row && paymentUtils.isTotal(row.label || '')).map(row => row.value);
    return {
      contractDate: uniqueValue(dates, formatConsultationDate),
      balanceDate: uniqueValue(balances.map(row => row.payment_date), formatConsultationDate),
      amount: uniqueValue(totals, numericAmount)
    };
  }
  function updateComparison(field) {
    const {input, hint, contract, kind} = field;
    const label = input.closest('label');
    label.insertBefore(hint, input.closest('.amount-control') || input);
    hint.className = 'contract-comparison';
    input.classList.remove('comparison-different');
    const showWarning = () => { hint.classList.add('warning'); label.append(hint); };
    if (id === null) { hint.textContent = ''; return; }
    if (contract.comparisonState === 'loading') { hint.textContent = '계약서 분석 결과를 불러오는 중입니다.'; return; }
    if (contract.comparisonState === 'error') { hint.textContent = '분석 결과를 불러오지 못했습니다. 다시 확인해 주세요.'; showWarning(); return; }
    if (!contract.comparisonValues) { hint.textContent = ''; return; }
    const analyzed = contract.comparisonValues[kind];
    if (analyzed === null) { hint.textContent = 'AI 분석값을 확인할 수 없습니다.'; showWarning(); return; }
    const formattedAI = kind === 'amount' ? `${BigInt(analyzed).toLocaleString('ko-KR')}원` : analyzed;
    if (!input.value.trim()) { hint.textContent = `AI 분석: ${formattedAI} · 입력 후 비교 가능`; return; }
    const entered = kind === 'amount' ? numericAmount(input.value) : formatConsultationDate(input.value);
    if (entered === null) { hint.textContent = `AI 분석: ${formattedAI} · 입력값을 확인해 주세요.`; showWarning(); return; }
    if (entered === analyzed) { hint.textContent = `AI 분석과 일치 · ${formattedAI}`; hint.classList.add('match'); return; }
    let difference;
    if (kind === 'amount') {
      const delta = BigInt(entered) - BigInt(analyzed);
      difference = `${(delta < 0n ? -delta : delta).toLocaleString('ko-KR')}원 차이`;
    } else {
      const timestamp = date => { const [y,m,d] = date.split('.').map(Number); const value = new Date(0); value.setUTCHours(0,0,0,0); value.setUTCFullYear(y,m-1,d); return value.getTime(); };
      difference = `${Math.abs(Math.round((timestamp(entered) - timestamp(analyzed)) / 86400000))}일 차이`;
    }
    const formattedInput = kind === 'amount' ? `${BigInt(entered).toLocaleString('ko-KR')}원` : entered;
    hint.textContent = `AI 분석: ${formattedAI} / 입력: ${formattedInput} · ${difference}`;
    showWarning(); input.classList.add('comparison-different');
  }
  function updateContractComparisons(contract) {
    for (const field of contract.comparisons) updateComparison(comparisonFields[field.name]);
  }
  const contractDialog = document.querySelector('#contract-dialog');
  const contractFrame = document.querySelector('#contract-frame');
  for (const contract of contractTypes) {
    contract.select = form.elements[contract.field];
    contract.action = document.createElement('div');
    contract.action.className = 'contract-action';
    contract.action.innerHTML = '<button type="button" class="secondary">계약서 등록 · 분석</button><div class="registered-documents" aria-live="polite"></div>';
    contract.registered = contract.action.querySelector('.registered-documents');
    contract.select.closest('label').append(contract.action);
    contract.select.addEventListener('change', () => {
      syncContractAction();
      if (contract.select.value === '받음') openContract(contract);
    });
    contract.action.querySelector('button').addEventListener('click', () => openContract(contract));
  }
  function syncContractAction() {
    for (const contract of contractTypes) contract.action.hidden = contract.select.value !== '받음';
  }
  async function refreshRegisteredDocuments() {
    const requestId = ++documentRequest, consultationId = id;
    for (const contract of contractTypes) contract.registered.replaceChildren();
    for (const contract of contractTypes) { contract.comparisonValues = null; contract.comparisonState = consultationId === null ? '' : 'loading'; updateContractComparisons(contract); }
    if (consultationId === null) return;
    for (const contract of contractTypes) contract.registered.textContent = '등록 파일을 불러오는 중입니다.';
    await Promise.all(contractTypes.map(async contract => {
      try {
        const data = await request(`/api/contracts/documents?consultation_id=${encodeURIComponent(consultationId)}&document_type=${encodeURIComponent(contract.type)}`);
        if (requestId !== documentRequest || id !== consultationId) return;
        if (data.items.length) {
          const payload = await request(`/api/contracts/documents/${encodeURIComponent(data.items[0].id)}/result?document_type=${encodeURIComponent(contract.type)}`);
          if (requestId !== documentRequest || id !== consultationId) return;
          contract.comparisonValues = payload.result ? analysisValues(payload.result) : null;
        }
        contract.comparisonState = 'ready'; updateContractComparisons(contract);
        contract.registered.replaceChildren();
        if (!data.items.length) { contract.registered.textContent = '등록된 파일이 없습니다.'; return; }
        const title = document.createElement('strong'); title.textContent = '등록된 파일';
        const list = document.createElement('ul');
        const row = document.createElement('li');
        const name = document.createElement('span'); name.textContent = data.items[0].filename;
        row.append(name); list.append(row); contract.registered.append(title, list);
      } catch (error) {
        if (requestId === documentRequest && id === consultationId) { contract.registered.textContent = '등록 파일 정보를 불러오지 못했습니다.'; contract.comparisonState = 'error'; updateContractComparisons(contract); }
      }
    }));
  }
  function openContract(contract) {
    if (id === null) { message.textContent = `${contract.name}를 등록하려면 먼저 상담을 저장해 주세요.`; return; }
    contractDialog.setAttribute('aria-label', `${contract.name} 분석`);
    contractFrame.title = `${contract.name} 분석 화면`;
    const target = `acquisition.html?v=18&consultation_id=${encodeURIComponent(id)}&type=${contract.key}`;
    if (contractFrame.getAttribute('src') !== target) contractFrame.src = target;
    if (!contractDialog.open) contractDialog.showModal();
  }
  window.addEventListener('message', event => {
    if (event.origin === location.origin && event.source === contractFrame.contentWindow &&
        event.data?.type === 'taxflow:contract-close' && contractDialog.open) contractDialog.close();
  });
  contractDialog.addEventListener('close', refreshRegisteredDocuments);
  function clear() { settlement.clear(); retiredFields = {}; form.reset(); for (const name of dateFields) form.elements[name].setCustomValidity(''); id = null; dirty = false; message.textContent = ''; selectionStatus.textContent = ''; updateReportButton(); refreshRegisteredDocuments(); if (settlement.isVisible()) settlement.load(); draw(); }
  function confirmDiscard() {
    if (saving || settlement.isSaving()) { message.textContent = '상담을 저장하고 있습니다. 잠시 후 다시 시도해 주세요.'; return false; }
    return !(dirty || settlement.isDirty()) || window.confirm('저장하지 않은 변경 내용이 있습니다. 계속하시겠습니까?');
  }
  async function request(url, options) { const response = await fetch(url, options); if (!response.ok) throw new Error('요청을 처리하지 못했습니다. 서버 상태를 확인하세요.'); return response.json(); }
  function draw() {
    records.replaceChildren();
    const filtered = items.filter(item => item.taxpayer_name.includes(search.value.trim()));
    if (!filtered.length) { records.textContent = '표시할 상담이 없습니다.'; return; }
    for (const item of filtered) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'record-button';
      if (item.id === id) { button.classList.add('is-current'); button.setAttribute('aria-current', 'true'); }
      const name = document.createElement('strong'); name.textContent = `${item.taxpayer_name} (${item.birth_date || '생년월일 미입력'})`;
      if (item.id === id) { const badge = document.createElement('span'); badge.className = 'current-badge'; badge.textContent = '조회 중'; name.append(' ', badge); }
      const detail = document.createElement('span'); detail.textContent = `상담일 ${item.consulted_at} · 접수번호 ${item.id}`;
      button.append(name, detail);
      button.addEventListener('click', async () => { if (!confirmDiscard()) return; try { const result = await request(`/api/consultations/${item.id}`); form.reset(); retiredFields = Object.fromEntries(['consultationResult', 'nextActions'].filter(key => Object.hasOwn(result.data, key)).map(key => [key, result.data[key]])); for (const name of dateFields) form.elements[name].setCustomValidity(''); for (const [key, value] of Object.entries(result.data)) { const element = form.elements.namedItem(key); if (element) element.value = displayValue(key, value); } id = result.id; dirty = false; settlement.clear(); updateReportButton(); refreshRegisteredDocuments(); if (settlement.isVisible()) settlement.load(); draw(); message.textContent = ''; selectionStatus.textContent = `접수번호 ${id} 상담을 수정 중입니다.`; window.scrollTo({top: 0, behavior: 'smooth'}); } catch (e) { message.textContent = e.message; } });
      const card = document.createElement('div'); card.className = 'record-card';
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'record-delete'; remove.textContent = '삭제';
      remove.setAttribute('aria-label', `${item.taxpayer_name} 접수번호 ${item.id} 상담 삭제`);
      remove.addEventListener('click', async () => {
        if (saving || settlement.isSaving()) { message.textContent = '저장 중입니다. 잠시 후 다시 시도해 주세요.'; return; }
        const warning = id === item.id && (dirty || settlement.isDirty()) ? '\n현재 수정 중인 저장되지 않은 내용도 사라집니다.' : '';
        if (!window.confirm(`${item.taxpayer_name} 님의 상담 (접수번호 ${item.id})을 삭제하시겠습니까?\n연결된 계약서 원본과 분석 결과도 함께 삭제되며 복구할 수 없습니다.${warning}`)) return;
        remove.disabled = true;
        try {
          await request(`/api/consultations/${item.id}`, {method: 'DELETE', headers: {'Content-Type': 'application/json'}});
          if (id === item.id) clear();
          message.textContent = `접수번호 ${item.id} 상담을 삭제했습니다.`;
          await refresh();
        } catch (e) { message.textContent = e.message; remove.disabled = false; }
      });
      card.append(button, remove); records.append(card);
    }
  }
  async function refresh() {
    const result = await request('/api/consultations');
    items = await Promise.all(result.items.map(async item => {
      if ('birth_date' in item) return item;
      const detail = await request(`/api/consultations/${item.id}`);
      return {...item, birth_date: detail.data.birthDate || ''};
    }));
    draw();
  }
  document.querySelectorAll('[data-amount-step]').forEach(button => button.addEventListener('click', () => {
    const input = form.elements[button.dataset.amountField];
    const current = Number(input.value.replace(/,/g, '')) || 0;
    input.value = formatAmount(Math.max(0, current + Number(button.dataset.amountStep)));
    input.dispatchEvent(new Event('input', {bubbles: true}));
  }));
  amountFields.forEach(name => form.elements[name].addEventListener('input', event => { const input = event.target; const position = input.selectionStart; const digitsBefore = input.value.slice(0, position).replace(/[^0-9]/g, '').length; input.value = formatAmount(input.value); let cursor = 0, seen = 0; while (cursor < input.value.length && seen < digitsBefore) { if (/\d/.test(input.value[cursor])) seen++; cursor++; } input.setSelectionRange(cursor, cursor); }));
  dateFields.forEach(name => {
    const input = form.elements[name];
    input.addEventListener('keydown', event => {
      const position = input.selectionStart;
      if (event.key === 'Backspace' && position === input.selectionEnd && position > 1 && input.value[position - 1] === '.') {
        event.preventDefault();
        input.value = input.value.slice(0, position - 2) + input.value.slice(position);
        input.setSelectionRange(position - 2, position - 2);
        input.dispatchEvent(new Event('input', {bubbles:true}));
      }
    });
    input.addEventListener('input', () => {
      const position = input.selectionStart, raw = input.value;
      const digitsBefore = raw.slice(0, position).replace(/\D/g, '').length;
      input.value = paymentUtils.maskDate(raw);
      let cursor = 0, seen = 0;
      while (cursor < input.value.length && seen < digitsBefore) { if (/\d/.test(input.value[cursor])) seen++; cursor++; }
      if (position === raw.length) cursor = input.value.length;
      input.setSelectionRange(cursor, cursor);
      input.setCustomValidity('');
    });
  });
  function markDirty() { editVersion++; dirty = true; updateReportButton(); }
  form.addEventListener('input', markDirty);
  form.addEventListener('change', markDirty);
  function notifyAutomaticSaveFailure(text) {
    if (!automaticSaveContext) return;
    contractFrame.contentWindow.postMessage({type:'taxflow:consultation-save-failed', ...automaticSaveContext, message:text}, location.origin);
  }
  async function saveConsultation(automatic = false) {
    if (saving) { if (automatic) pendingAutomaticSave = true; return; }
    if (automatic && id === null) return;
    if (!form.elements.taxpayerName.value.trim()) {
      dirty = true; updateReportButton();
      message.textContent = '서류는 등록됐지만 상담 자동 저장에 실패했습니다. 신고자 성명을 확인해 주세요.';
      notifyAutomaticSaveFailure(message.textContent);
      return;
    }
    const recordId = id, savedVersion = editVersion;
    const data = {...retiredFields, ...Object.fromEntries(new FormData(form))};
    for (const name of dateFields) {
      const input = form.elements[name], formatted = formatConsultationDate(input.value);
      if (formatted === null) {
        const label = input.closest('label').firstChild.textContent.trim();
        input.setCustomValidity('올바른 날짜를 YYYY.MM.DD. 형식으로 입력해 주세요.');
        dirty = true; updateReportButton();
        message.textContent = `${label}: 올바른 날짜를 입력해 주세요.`;
        if (automatic) notifyAutomaticSaveFailure(message.textContent);
        else input.reportValidity();
        return;
      }
      input.setCustomValidity('');
      data[name] = formatted ? formatted.slice(0, -1).replace(/\./g, '-') : '';
    }
    data.consultedAt = savedAt();
    amountFields.forEach(name => { data[name] = data[name].replace(/,/g, ''); });
    const button = form.querySelector('[type=submit]');
    saving = true; button.disabled = true;
    try {
      const result = await request(recordId === null ? '/api/consultations' : `/api/consultations/${recordId}`, {
        method: recordId === null ? 'POST' : 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
      });
      id = result.id;
      if (settlement.isVisible() && !settlement.isDirty()) settlement.load();
      selectionStatus.textContent = `접수번호 ${id} 상담을 수정 중입니다.`;
      dirty = editVersion !== savedVersion;
      updateReportButton();
      refreshRegisteredDocuments();
      message.textContent = dirty ? '상담을 저장했습니다. 저장 중 수정한 내용은 다시 저장해 주세요.' :
        automatic ? '서류 등록과 상담 내용을 자동 저장했습니다.' : `접수번호 ${id} 상담을 저장했습니다. 상담서 출력에서 인쇄 또는 PDF 저장을 할 수 있습니다.`;
      try { await refresh(); } catch (error) { records.textContent = '상담은 저장됐으나 목록을 불러오지 못했습니다.'; }
    } catch (error) {
      dirty = true; updateReportButton();
      message.textContent = automatic ? '서류는 등록됐지만 상담 자동 저장에 실패했습니다. 상담 저장을 다시 눌러 주세요.' : error.message;
      if (automatic) notifyAutomaticSaveFailure(message.textContent);
    } finally {
      saving = false; button.disabled = false;
      settlement.updatePrintButton();
      if (pendingAutomaticSave) { pendingAutomaticSave = false; saveConsultation(true); }
    }
  }
  form.addEventListener('submit', event => { event.preventDefault(); saveConsultation(); });
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== contractFrame.contentWindow || !event.data ||
        event.data.type !== 'taxflow:contract-registered' || event.data.consultationId !== id) return;
    const contract = contractTypes.find(item => item.type === event.data.documentType);
    if (!contract) return;
    contract.select.value = '받음';
    automaticSaveContext = {consultationId:id, documentType:contract.type};
    markDirty();
    saveConsultation(true);
  });
  const reportDialog = document.querySelector('#report-dialog');
  const reportFrame = document.querySelector('#report-frame');
  let pendingSettlementReport = null;
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== reportFrame.contentWindow ||
        event.data?.type !== 'taxflow:settlement-report-ready' || !pendingSettlementReport ||
        event.data.token !== pendingSettlementReport.token) return;
    reportFrame.contentWindow.postMessage({type:'taxflow:settlement-report', token:pendingSettlementReport.token, data:pendingSettlementReport.data}, location.origin);
  });
  reportButton.addEventListener('click', () => {
    if (reportButton.disabled) return;
    document.querySelector('#report-dialog-title').textContent = '상담서 출력';
    document.querySelector('.report-dialog-head p').textContent = '저장된 상담 내용을 확인하고 인쇄하거나 PDF로 저장합니다.';
    reportFrame.title = '상담서 출력 미리보기';
    pendingSettlementReport = null;
    reportFrame.src = reportUrl(id);
    reportDialog.showModal();
  });
  document.querySelector('#report-close').addEventListener('click', () => reportDialog.close());
  reportDialog.addEventListener('close', () => { pendingSettlementReport = null; });
  document.querySelector('#new-record').addEventListener('click', () => { if (confirmDiscard()) clear(); });
  document.querySelector('#load-sample').addEventListener('click', () => {
    if (!confirmDiscard()) return;
    clear();
    const sample = {taxpayerName: '홍길동 (가상)', birthDate: '1985-03-15', resident: '예', ownership: '단독 소유', address: '서울특별시 마포구 상암동', addressDetail: '101동 1001호', propertyType: '아파트', acquisitionMethod: '매매', acquisitionContractDate: '2021-05-10', acquisitionBalanceDate: '2021-06-15', acquisitionRegistrationDate: '2021-06-15', acquisitionPrice: '650000000', transferStatus: '양도 완료', transferContractDate: '2026-01-10', transferBalanceDate: '2026-02-16', transferRegistrationDate: '2026-02-16', transferPrice: '1300000000', livedThere: '예', moveInDate: '2021-07-01', moveOutDate: '2022-07-01', registrationMatch: '확인 필요', household: '배우자, 자녀', otherHomes: '없음', otherRights: '없음', currentHousing: '임차', propertyAfterMove: '공실', expenses: '10000000', otherTransfers: '없음', acquisitionDocument: '확인 필요', transferDocument: '확인 필요', residentDocument: '확인 필요', paymentDocument: '확인 필요', notes: '가상 예시입니다. 증빙을 확인해 주세요.'};
    for (const [name, value] of Object.entries(sample)) form.elements[name].value = displayValue(name, value);
    dirty = true;
    updateReportButton();
    message.textContent = '가상 데이터를 입력했습니다. 저장하면 새 상담으로 등록됩니다.';
  });
  search.addEventListener('input', draw);
  window.addEventListener('beforeunload', event => { if (dirty || settlement.isDirty()) { event.preventDefault(); event.returnValue = ''; } });
  const settlement = createSettlement({getId: () => id, request, isConsultationDirty:() => dirty || saving, openReport: snapshot => {
    document.querySelector('#report-dialog-title').textContent = '정산 확인서 출력';
    document.querySelector('.report-dialog-head p').textContent = '저장된 수수 확인 내용을 확인하고 인쇄하거나 PDF로 저장합니다.';
    reportFrame.title = '정산 확인서 출력 미리보기';
    const data = {...snapshot, taxpayerName:form.elements.taxpayerName.value.trim(), consultedAt:items.find(item => item.id === id)?.consulted_at || ''};
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    pendingSettlementReport = {token, data};
    reportFrame.src = `settlement-report.html?v=3&request=${encodeURIComponent(token)}`;
    reportDialog.showModal();
  }});
  const tabs = [...document.querySelectorAll('[role=tab]')];
  function activateTab(tab) {
    for (const item of tabs) { const selected = item === tab; item.setAttribute('aria-selected', String(selected)); item.tabIndex = selected ? 0 : -1; }
    form.hidden = tab.id !== 'tab-consultation';
    document.querySelector('#settlement-panel').hidden = tab.id !== 'tab-settlement';
    if (tab.id === 'tab-settlement' && !settlement.isDirty()) settlement.load();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateTab(tab));
    tab.addEventListener('keydown', event => { if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return; event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; activateTab(tabs[next]); tabs[next].focus(); });
  });
  const updateScrollHeader = () => document.body.classList.toggle('is-scrolled', window.scrollY > 80);
  window.addEventListener('scroll', updateScrollHeader, {passive: true});
  updateScrollHeader();
  clear(); refresh().catch(e => { records.textContent = e.message; });
})();
