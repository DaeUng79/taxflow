(() => {
  'use strict';
  const form = document.querySelector('#consultation-form');
  function showConsultation() { document.body.classList.remove('documents-only'); }
  document.querySelector('#show-consultation').addEventListener('click', () => { showConsultation(); document.querySelector('#section-taxpayer').scrollIntoView({behavior:'smooth',block:'start'}); });
  const records = document.querySelector('#records');
  const message = document.querySelector('#message');
  const search = document.querySelector('#search');
  const reportButton = document.querySelector('#open-report');
  let id = null, dirty = false, items = [], documentRequest = 0, retiredFields = {};
  let capitalGainsPanel = null, filingPanel = null;
  let originalDocuments = {};
  let editVersion = 0, saving = false, pendingAutomaticSave = false, automaticSaveContext = null;
  const savedAt = () => { const d = new Date(); const pad = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  function combinedAddress(address, detail) {
    const base = String(address || '').trim(), extra = String(detail || '').trim();
    if (!extra || base.replace(/\s/g, '').includes(extra.replace(/\s/g, ''))) return base;
    return [base, extra].filter(Boolean).join(' ');
  }
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
  const removedResidenceNotes = new Set(['초본 성명과 신고자 성명이 일치하는지 확인해 주세요.', '주택 주소와 정확히 일치하는 초본 주소를 찾지 못했습니다. 원본의 지번·도로명과 동·호수를 확인해 주세요.', '주민등록 이력만으로 실제 거주 여부는 확정할 수 없습니다.']);
  const displayValue = (name, value) => amountFields.includes(name) ? formatAmount(value) : dateFields.includes(name) ? (formatConsultationDate(value) ?? value) : name === 'residenceDetails' ? String(value ?? '').split('\n').filter(line => !removedResidenceNotes.has(line.trim())).join('\n').trim() : value;
  const provenance = createFieldProvenance(form, (name, value) => amountFields.includes(name) ? String(value || '').replace(/[^0-9]/g,'') : dateFields.includes(name) ? (paymentUtils.formatDate(value) || String(value || '').trim()) : String(value || '').normalize('NFKC').replace(/\s+/g,' ').trim());
  const reportUrl = recordId => `report.html?v=20261117-1&id=${encodeURIComponent(recordId)}`;
  function updateReportButton() {
    filingPanel?.refresh();
    capitalGainsPanel?.refresh();
    syncContractAction();
    reportButton.disabled = id === null || dirty;
    reportButton.title = dirty ? '변경 내용을 저장한 뒤 사실확인서를 열 수 있습니다' : id === null ? '상담을 저장한 뒤 사실확인서를 열 수 있습니다' : '저장된 사실확인서 미리보기 및 출력';
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
    const dates = properties.filter(row => row && row.source !== 'model_unverified' && /^(?:계약\s*체결일|계약일|계약일자)$/.test(String(row.label || '').trim())).map(row => row.value);
    const balances = payments.filter(row => row && /잔금/.test(row.label || '') && !/날짜|지급일|입금일|기일|일자/.test(row.label || ''));
    const totals = payments.filter(row => row && paymentUtils.isTotal(row.label || '')).map(row => row.value);
    return {
      contractDate: uniqueValue(dates, formatConsultationDate),
      contractDateUserConfirmed: properties.some(row => row && /^(?:계약\s*체결일|계약일|계약일자)$/.test(String(row.label || '').trim()) && row.source === 'user_confirmed_deposit_date'),
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
    if (analyzed === null) { hint.textContent = kind === 'contractDate' ? '계약일이 추출되지 않았습니다. 원본을 확인해 직접 입력해 주세요.' : 'AI 분석값을 확인할 수 없습니다.'; showWarning(); return; }
    const sourceLabel = kind === 'contractDate' && contract.comparisonValues.contractDateUserConfirmed ? '사용자 확인값' : 'AI 분석';
    const formattedAI = kind === 'amount' ? `${BigInt(analyzed).toLocaleString('ko-KR')}원` : analyzed;
    if (!input.value.trim()) { hint.textContent = `${sourceLabel}: ${formattedAI} · 입력 후 비교 가능`; return; }
    const entered = kind === 'amount' ? numericAmount(input.value) : formatConsultationDate(input.value);
    if (entered === null) { hint.textContent = `${sourceLabel}: ${formattedAI} · 입력값을 확인해 주세요.`; showWarning(); return; }
    if (entered === analyzed) { hint.textContent = `${sourceLabel}과 일치 · ${formattedAI}`; hint.classList.add('match'); return; }
    let difference;
    if (kind === 'amount') {
      const delta = BigInt(entered) - BigInt(analyzed);
      difference = `${(delta < 0n ? -delta : delta).toLocaleString('ko-KR')}원 차이`;
    } else {
      const timestamp = date => { const [y,m,d] = date.split('.').map(Number); const value = new Date(0); value.setUTCHours(0,0,0,0); value.setUTCFullYear(y,m-1,d); return value.getTime(); };
      difference = `${Math.abs(Math.round((timestamp(entered) - timestamp(analyzed)) / 86400000))}일 차이`;
    }
    const formattedInput = kind === 'amount' ? `${BigInt(entered).toLocaleString('ko-KR')}원` : entered;
    hint.textContent = `${sourceLabel}: ${formattedAI} / 입력: ${formattedInput} · ${difference}`;
    showWarning(); input.classList.add('comparison-different');
  }
  function updateContractComparisons(contract) {
    for (const field of contract.comparisons) updateComparison(comparisonFields[field.name]);
  }
  let sellerPages = null, sellerDocumentHash = '', savedAddressNotice = '';
  const sellerHints = {};
  {
    for (const name of ['taxpayerName','birthDate','phoneNumber','taxpayerAddress']) {
      const input = form.elements.namedItem(name);
      const hint = document.createElement('span'); hint.className = 'seller-comparison';
      hint.id = `seller-comparison-${name}`; hint.setAttribute('role','status');
      input.closest('label').append(hint); input.setAttribute('aria-describedby',hint.id);
      sellerHints[name] = hint;
      input.addEventListener('input', updateSellerComparison);
      input.addEventListener('change', updateSellerComparison);
    }
  }
  function updateSellerComparison() {
    for (const hint of Object.values(sellerHints)) hint.textContent = '';
    if (!sellerPages) return;
    const taxpayer = Object.fromEntries(Object.keys(sellerHints).map(name=>[name,form.elements[name].value]));
    const comparison = contractSellerComparison(sellerPages,taxpayer);
    if (comparison.ambiguous) {
      sellerHints.taxpayerName.textContent = '양도인이 여러 명이거나 식별 정보가 불명확합니다. 계약서에서 신고자를 확인해 주세요.';
      return;
    }
    for (const [name, extracted] of Object.entries(comparison.fields)) {
      const current = taxpayer[name].trim();
      if (!current || !extracted) continue;
      const normalize = value => name === 'phoneNumber' ? value.replace(/\D/g,'') : name === 'birthDate' ? (paymentUtils.formatDate(value) || value) : value.replace(/\s+/g,'');
      if (normalize(current) !== normalize(extracted)) {
        const hint = sellerHints[name];
        hint.textContent = `양도계약서 매도인: ${extracted} · 납세자 정보와 다릅니다. 확인해 주세요. `;
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'seller-apply'; button.textContent = '(반영)';
        const labels = {taxpayerName:'신고자 성명', birthDate:'생년월일', phoneNumber:'연락처', taxpayerAddress:'납세자 주소'};
        button.setAttribute('aria-label', `양도계약서 ${labels[name]} 반영`);
        button.addEventListener('click', event => {
          event.preventDefault(); event.stopPropagation();
          const input = form.elements[name];
          input.value = displayValue(name, extracted);
          input.dispatchEvent(new Event('input', {bubbles:true}));
          provenance.set(name, '양도', input.value);
          message.textContent = `${labels[name]}에 양도계약서 분석값을 반영했습니다. 상담 저장을 눌러 주세요.`;
        });
        hint.append(button);
      }
    }
  }
  const propertyHints = {};
  const dismissedAddressHints = new Set();
  const propertyLabels = {address:'주택 주소',landCategory:'토지 지목',landArea:'토지 면적',buildingUse:'건물 용도',buildingArea:'건물 면적'};
  {
    for (const name of Object.keys(propertyLabels)) {
      const input = form.elements.namedItem(name), hint = document.createElement('span');
      hint.className = 'seller-comparison'; hint.id = `property-comparison-${name}`; hint.setAttribute('role','status');
      input.closest('label').append(hint); input.setAttribute('aria-describedby',hint.id); propertyHints[name] = hint;
      input.addEventListener('input', updatePropertyComparison);
      input.addEventListener('change', updatePropertyComparison);
    }
  }
  function updatePropertyComparison() {
    for (const hint of Object.values(propertyHints)) hint.textContent = '';
    if (!sellerPages) return;
    const compared = contractPropertyComparison(sellerPages);
    const normalize = value => value.normalize('NFKC').replace(/\s+/g,'').toLowerCase();
    const addressHintKey = value => JSON.stringify([id, sellerDocumentHash, form.elements.address.value.trim(), value]);
    function addAddressDismiss(hint, key) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'seller-apply'; button.textContent = '(삭제)';
      button.setAttribute('aria-label', '주택 주소 분석 안내 삭제');
      button.addEventListener('click', async event => {
        event.preventDefault(); event.stopPropagation();
        if (id === null || !sellerDocumentHash) { dismissedAddressHints.add(key); hint.textContent = ''; return; }
        if (saving) { message.textContent = '상담을 저장하고 있습니다. 잠시 후 다시 시도해 주세요.'; return; }
        button.disabled = true; saving = true;
        try {
          const response = await fetch(`/api/consultations/${id}/address-notice`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'dismiss',marker:key,sha256:sellerDocumentHash})});
          const result = await response.json().catch(()=>({})); if (!response.ok) throw Error(result.error || '안내 선택을 저장하지 못했습니다.');
          savedAddressNotice = key; dismissedAddressHints.add(key); updatePropertyComparison();
          message.textContent = '주택 주소 안내를 삭제했습니다.';
        } catch(error) { message.textContent = error.message; } finally { saving = false; button.disabled = false; }
      });
      hint.append(' ', button);
    }
    for (const name of compared.ambiguous) {
      const key = addressHintKey(JSON.stringify((sellerPages || []).map(page => page.property || [])));
      if (name === 'address' && (dismissedAddressHints.has(key) || savedAddressNotice === key)) continue;
      propertyHints[name].textContent = '양도계약서에서 여러 값이 확인됩니다. 원본을 확인해 주세요.';
      if (name === 'address') addAddressDismiss(propertyHints[name], key);
    }
    for (const [name, extracted] of Object.entries(compared.fields)) {
      const input = form.elements[name], current = input.value.trim();
      if (current && normalize(current) === normalize(extracted)) continue;
      const key = addressHintKey(extracted);
      if (name === 'address' && (dismissedAddressHints.has(key) || savedAddressNotice === key)) continue;
      const hint = propertyHints[name];
      hint.textContent = `양도계약서: ${extracted} · ${current ? '기존 주택 정보와 다릅니다.' : '주택 정보가 비어 있습니다.'} 확인해 주세요. `;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'seller-apply'; button.textContent = '(반영)';
      button.setAttribute('aria-label', `양도계약서 ${propertyLabels[name]} 반영`);
      button.addEventListener('click', async event => {
        event.preventDefault(); event.stopPropagation();
        if (name === 'address' && id !== null && sellerDocumentHash) {
          if (saving) { message.textContent = '상담을 저장하고 있습니다. 잠시 후 다시 시도해 주세요.'; return; }
          saving = true; button.disabled = true;
          try {
            const response = await fetch(`/api/consultations/${id}/address-notice`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'apply',marker:key,sha256:sellerDocumentHash,address:extracted})});
            const result = await response.json().catch(()=>({})); if (!response.ok) throw Error(result.error || '주소를 반영하지 못했습니다.');
            savedAddressNotice = ''; input.value = extracted; input.dispatchEvent(new Event('input', {bubbles:true})); provenance.set(name, '양도', input.value);
            message.textContent = '양도계약서 주소를 반영해 저장했습니다. 다른 변경 내용은 상담 저장을 눌러 주세요.';
          } catch(error) { message.textContent = error.message; } finally { saving = false; button.disabled = false; }
          return;
        }
        input.value = extracted; input.dispatchEvent(new Event('input', {bubbles:true})); provenance.set(name, '양도', input.value);
        message.textContent = `${propertyLabels[name]}에 양도계약서 분석값을 반영했습니다. 상담 저장을 눌러 주세요.`;
      });
      hint.append(button);
      if (name === 'address') addAddressDismiss(hint, key);
    }
  }
  const contractDialog = document.querySelector('#contract-dialog');
  const contractFrame = document.querySelector('#contract-frame');
  let analysisContext = null;
  for (const contract of contractTypes) {
    contract.select = form.elements[contract.field];
    contract.action = document.createElement('div');
    contract.action.className = 'contract-action';
    contract.action.innerHTML = '<button type="button" class="secondary">계약서 등록 · 분석</button><div class="registered-documents" aria-live="polite"></div>';
    contract.registered = contract.action.querySelector('.registered-documents');
    contract.hasSavedResult = false;
    contract.select.closest('label').append(contract.action);
    contract.select.addEventListener('change', () => {
      syncContractAction();
      if (contract.select.value === '받음') openContract(contract);
    });
    contract.action.querySelector('button').addEventListener('click', () => openContract(contract));
  }
  function syncContractAction() {
    for (const contract of contractTypes) {
      {
        contract.action.hidden = !contract.hasSavedResult && contract.select.value !== '받음';
        contract.action.querySelector('button').textContent = contract.hasSavedResult ? '분석 결과 확인 및 수정' : '계약서 등록 · 분석';
      }
    }
  }
  async function refreshRegisteredDocuments() {
    const requestId = ++documentRequest, consultationId = id;
    originalDocuments = {}; capitalGainsPanel?.refresh();
    if (consultationId !== null) {
      request(`/api/documents?consultation_id=${encodeURIComponent(consultationId)}`).then(data => {
        if (requestId !== documentRequest || id !== consultationId) return;
        const mapping = {acquisition_contract:'acquisition', transfer_contract:'transfer', resident_extract:'resident'};
        for (const document of data.items || []) {
          const key = mapping[document.document_type];
          if (key && document.size_bytes != null && !originalDocuments[key]) originalDocuments[key] = document;
        }
        capitalGainsPanel?.refresh();
      }).catch(() => { if (requestId === documentRequest && id === consultationId) capitalGainsPanel?.refresh(); });
    }
    refreshResidentDocument(consultationId, requestId);
    sellerPages = null; sellerDocumentHash = ''; updateSellerComparison(); updatePropertyComparison();
    for (const contract of contractTypes) { contract.registered.replaceChildren(); contract.hasSavedResult = false; }
    syncContractAction();
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
          contract.hasSavedResult = !!payload.result;
          contract.comparisonValues = payload.result ? analysisValues(payload.result) : null;
          syncContractAction();
          if (payload.result) {
            if (contract.type === 'transfer_contract') { sellerDocumentHash = data.items[0].sha256 || ''; sellerPages = payload.result.pages || []; updateSellerComparison(); updatePropertyComparison(); }
            const mapped = contractAutofill(payload.result.pages || [], contract.type);
            const selectedTaxpayer = contract.type === 'transfer_contract' && payload.result.confirmed && form.elements.taxpayerName.value.trim() ? contractAutofill(payload.result.pages || [], contract.type, form.elements.taxpayerName.value.trim()) : null;
            const prefix = contract.type === 'acquisition_contract' ? 'acquisition' : 'transfer';
            let added = 0;
            for (const name of [prefix+'ContractDate', prefix+'BalanceDate', prefix+'Price', ...(contract.type === 'transfer_contract' && payload.result.confirmed ? ['buyerName','buyerId'] : [])]) {
              const input = form.elements[name], value = mapped.fields[name];
              if (value && !input.value.trim()) { input.value = displayValue(name,value); provenance.set(name, prefix === 'acquisition' ? '매수' : '양도', input.value); added++; }
            }
            for (const [name, value] of Object.entries(mapped.fields)) provenance.compare(name, prefix === 'acquisition' ? '매수' : '양도', value);
            if (contract.type === 'transfer_contract' && payload.result.confirmed && mapped.warnings.some(w => w.startsWith('양수인'))) document.querySelector('#autofill-status').textContent = mapped.warnings.filter(w => w.startsWith('양수인')).join(' ');
            if (selectedTaxpayer?.fields.taxpayerId && !form.elements.taxpayerId.value.trim()) {
              form.elements.taxpayerId.value = selectedTaxpayer.fields.taxpayerId;
              provenance.set('taxpayerId', '양도', form.elements.taxpayerId.value);
              added++;
            }
            if (added) {
              filingPanel?.refresh();
              form.dispatchEvent(new Event('taxflow:holding-updated'));
              markDirty();
              document.querySelector('#autofill-status').textContent = `${prefix === 'acquisition' ? '취득' : '양도'}계약서 분석값을 빈 항목에 입력했습니다. 원본과 실제 지급일을 확인한 뒤 상담 저장을 눌러 주세요.`;
            }
          }
        }
        contract.comparisonState = 'ready'; updateContractComparisons(contract);
        contract.registered.replaceChildren();
        if (!data.items.length) { contract.registered.textContent = '등록된 파일이 없습니다.'; return; }
        const list = document.createElement('ul');
        const row = document.createElement('li');
        const name = document.createElement('span'); name.textContent = data.items[0].filename;
        row.append(name); list.append(row); contract.registered.append(list);
      } catch (error) {
        if (requestId === documentRequest && id === consultationId) { contract.registered.textContent = '등록 파일 정보를 불러오지 못했습니다.'; contract.comparisonState = 'error'; updateContractComparisons(contract); }
      }
    }));
  }
  const originalPdfDialog = document.querySelector('#original-pdf-dialog');
  const originalPdfFrame = document.querySelector('#original-pdf-frame');
  const originalPdfStatus = document.querySelector('#original-pdf-status');
  const originalPdfFallback = document.querySelector('#original-pdf-fallback');
  const originalPdfLink = document.querySelector('#original-pdf-link');
  let originalPdfRequest = 0;
  document.querySelector('#original-pdf-close').addEventListener('click', () => originalPdfDialog.close());
  originalPdfDialog.addEventListener('close', () => { originalPdfRequest++; originalPdfFrame.removeAttribute('src'); });
  function openOriginalPdf(key) {
    const document = originalDocuments[key];
    if (!document || id === null) return;
    const name = {acquisition:'취득계약서', transfer:'양도계약서', resident:'주민등록초본'}[key];
    if (!name) return;
    ++originalPdfRequest;
    window.document.querySelector('#original-pdf-title').textContent = `${name} 원본`;
    originalPdfFrame.title = `${name} PDF 원본`;
    const url = `/api/documents/${encodeURIComponent(document.id)}/pdf`;
    originalPdfStatus.textContent = document.filename;
    originalPdfFrame.src = url; originalPdfFrame.hidden = false;
    originalPdfLink.href = url; originalPdfFallback.hidden = false;
    if (!originalPdfDialog.open) originalPdfDialog.showModal();
  }
  function openContract(contract) {
    if (analysisContext?.submission && analysisContext.id === null && id === null) {
      if (!contractDialog.open) contractDialog.showModal(); return;
    }
    contractDialog.setAttribute('aria-label', `${contract.name} 분석`);
    contractFrame.title = `${contract.name} 분석 화면`;
    analysisContext = {id, type:contract.type, token:crypto.randomUUID(), autofilled:{}};
    const consultationQuery = id === null ? '' : `&consultation_id=${encodeURIComponent(id)}`;
    const target = `acquisition.html?v=19&type=${contract.key}${consultationQuery}&request=${analysisContext.token}&consultation=1`;
    if (contractFrame.getAttribute('src') !== target) contractFrame.src = target;
    if (!contractDialog.open) contractDialog.showModal();
  }
  window.addEventListener('message', event => {
    if (event.origin === location.origin && event.source === contractFrame.contentWindow &&
        event.data?.type === 'taxflow:contract-close' && contractDialog.open) contractDialog.close();
  });
  function applyContractFields(pages, selectedName = '', confirmed = false) {
    const mapped = contractAutofill(pages, analysisContext.type, selectedName);
    if (analysisContext.type === 'transfer_contract') { sellerDocumentHash = ''; sellerPages = pages; updateSellerComparison(); updatePropertyComparison(); }
    if (selectedName && id === null) mapped.fields.taxpayerName = selectedName;
    let count = 0;
    for (const [name, value] of Object.entries(mapped.fields)) {
      if (['buyerName','buyerId','taxpayerId'].includes(name) && !confirmed) continue;
      if (name === 'taxpayerId' && id !== null && form.elements.taxpayerName.value.trim().replace(/\s/g,'') !== (mapped.fields.taxpayerName || '').replace(/\s/g,'')) continue;
      if (analysisContext.type === 'transfer_contract' && id !== null && ['taxpayerName','taxpayerAddress','birthDate','phoneNumber','address','landCategory','landArea','buildingUse','buildingArea'].includes(name)) continue;
      const input = form.elements.namedItem(name);
      if (!input || !value) continue;
      const formatted = displayValue(name, value);
      if (input.value.trim() && input.value !== formatted && input.value !== analysisContext.autofilled[name]) continue;
      if (input.value !== formatted) { input.value = formatted; provenance.set(name, analysisContext.type === 'acquisition_contract' ? '매수' : '양도', input.value); count++; }
      analysisContext.autofilled[name] = formatted;
    }
    if (count) markDirty();
    form.dispatchEvent(new Event('taxflow:holding-updated'));
    form.elements.address.dispatchEvent(new Event('taxflow:address-updated'));
    form.elements.transferBalanceDate.dispatchEvent(new Event('taxflow:transfer-date-updated'));
    updateSellerComparison(); updatePropertyComparison();
    filingPanel?.refresh();
    document.querySelector('#autofill-status').textContent = [count ? `계약서에서 ${count}개 항목을 입력했습니다.` : '', ...mapped.warnings].filter(Boolean).join('\n');
  }
  window.addEventListener('message', async event => {
    if (event.origin !== location.origin || event.source !== contractFrame.contentWindow ||
        !['taxflow:contract-fields','taxflow:save-reviewed-contract'].includes(event.data?.type) || !analysisContext ||
        event.data.token !== analysisContext.token || analysisContext.id !== id ||
        event.data.documentType !== analysisContext.type || !Array.isArray(event.data.pages)) return;
    if (saving) return;
    applyContractFields(event.data.pages, typeof event.data.taxpayerName === 'string' ? event.data.taxpayerName.trim() : '', event.data.type === 'taxflow:save-reviewed-contract');
    if (event.data.type !== 'taxflow:save-reviewed-contract') return;
    const context = analysisContext;
    const reply = value => contractFrame.contentWindow.postMessage({type:'taxflow:review-saved', token:context.token, ...value},location.origin);
    const button = form.querySelector('[type=submit]');
    try {
      const data = {...retiredFields, ...Object.fromEntries(new FormData(form)), addressDetail: ''};
      if (!data.taxpayerName.trim()) throw new Error('신고자 성명을 확인하세요. 여러 당사자가 있으면 신고자 한 명을 입력하세요.');
      for (const name of dateFields) {
        const formatted = formatConsultationDate(data[name]);
        if (formatted === null) throw new Error('상담에 입력된 날짜를 확인해 주세요.');
        data[name] = formatted ? formatted.slice(0,-1).replaceAll('.','-') : '';
      }
      amountFields.forEach(name => { data[name] = data[name].replaceAll(',',''); });
      data.consultedAt = savedAt();
      saving = true; button.disabled = true;
      if (!context.submission) context.submission = id === null ? {
        url:`/api/contracts/intake?document_type=${context.type}`, method:'POST',
        body:{token:context.token, filename:event.data.filename, pdf:event.data.pdf, pages:event.data.pages, model:event.data.model, confirmed:true, data}
      } : {url:`/api/consultations/${id}`, method:'PUT', body:data};
      const submission = context.submission;
      const response = await fetch(submission.url,{method:submission.method,headers:{'Content-Type':'application/json'},body:JSON.stringify(submission.body)});
      const result = await response.json().catch(()=>({}));
      if (!response.ok) { if (response.status < 500) context.submission = null; throw new Error(result.error || '상담 저장에 실패했습니다. 다시 저장해 주세요.'); }
      id = result.id; context.id = id; dirty = false; showConsultation();
      const contract = contractTypes.find(c=>c.type===context.type); contract.select.value='받음';
      message.textContent = '분석 내용과 상담을 저장했습니다. 상담 현황에서 확인할 수 있습니다.';
      updateReportButton(); await refreshRegisteredDocuments();
      try { await refresh(); } catch { records.textContent='상담은 저장됐습니다. 목록은 새로고침해 주세요.'; }
      reply({ok:true,id}); contractDialog.close(); window.scrollTo({top:0,behavior:'smooth'});
    } catch (error) { reply({ok:false,message:error.message,locked:!!context.submission}); }
    finally { saving=false; button.disabled=false; updateReportButton(); }
  });
  contractDialog.addEventListener('close', refreshRegisteredDocuments);
  function clear() { document.body.classList.add('documents-only'); dismissedAddressHints.clear(); savedAddressNotice = ''; sellerDocumentHash = ''; document.querySelector('#autofill-status').textContent = ''; settlement.clear(); retiredFields = {}; form.reset(); for (const name of dateFields) form.elements[name].setCustomValidity(''); id = null; dirty = false; message.textContent = ''; updateReportButton(); refreshRegisteredDocuments(); if (settlement.isVisible()) settlement.load(); draw(); }
  function migratePropertyFields(data) {
    const mapping = {'토지 지목':'landCategory','토지 면적':'landArea','건물 용도':'buildingUse','건물 면적':'buildingArea'};
    for (const line of [data.landDetails || '',data.buildingDetails || ''].join('\n').split('\n')) {
      const match = line.match(/^([^:]+):\s*(.*)$/); if (!match) continue;
      const name = mapping[match[1].trim()]; if (name && !form.elements[name].value) form.elements[name].value=match[2];
    }
  }
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
      button.addEventListener('click', async () => { if (!confirmDiscard()) return; try { const result = await request(`/api/consultations/${item.id}`); form.reset(); savedAddressNotice = result.data._addressNoticeDismissed || ''; retiredFields = Object.fromEntries(Object.entries(result.data).filter(([key]) => key !== '_addressNoticeDismissed' && key !== 'consultedAt' && key !== 'addressDetail' && !form.elements.namedItem(key)));  for (const name of dateFields) form.elements[name].setCustomValidity(''); for (const [key, value] of Object.entries(result.data)) { const element = form.elements.namedItem(key); if (element) element.value = displayValue(key, value); } form.elements.address.value = combinedAddress(result.data.address, result.data.addressDetail); provenance.load(result.data._fieldSources); form.elements.address.dispatchEvent(new Event('taxflow:address-updated')); form.dispatchEvent(new Event('taxflow:form-loaded')); showConsultation(); migratePropertyFields(result.data); document.querySelector('#autofill-status').textContent = ''; id = result.id; dirty = false; settlement.clear(); updateReportButton(); refreshRegisteredDocuments(); if (settlement.isVisible()) settlement.load(); draw(); message.textContent = ''; message.textContent = `접수번호 ${id} 상담을 수정 중입니다.`; window.scrollTo({top: 0, behavior: 'smooth'}); } catch (e) { message.textContent = e.message; } });
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
  function markDirty(event) { if (event?.target?.closest?.('#property-regulated')) return; editVersion++; dirty = true; updateReportButton(); }
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
    const data = {...retiredFields, ...Object.fromEntries(new FormData(form)), addressDetail: ''};
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
      dirty = editVersion !== savedVersion;
      updateReportButton();
      refreshRegisteredDocuments();
      message.textContent = dirty ? '상담을 저장했습니다. 저장 중 수정한 내용은 다시 저장해 주세요.' :
        automatic ? '서류 등록과 상담 내용을 자동 저장했습니다.' : `접수번호 ${id} 상담을 저장했습니다. 사실확인서 출력에서 인쇄 또는 PDF 저장을 할 수 있습니다.`;
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
  const residentSelect = form.elements.residentDocument;
  const residentAction = document.createElement('div'); residentAction.className = 'contract-action'; residentAction.hidden = true;
  const residentButton = document.createElement('button'); residentButton.type = 'button'; residentButton.className = 'secondary'; residentButton.textContent = '초본 등록 · 분석';
  const residentRegistered = document.createElement('div'); residentRegistered.className = 'registered-documents'; residentRegistered.setAttribute('aria-live', 'polite');
  residentAction.append(residentButton, residentRegistered); residentSelect.closest('label').append(residentAction);
  let residentContext = null, residentPages = null;
  const residentHint = document.createElement('p'); residentHint.className = 'seller-comparison'; residentHint.setAttribute('role','status'); residentHint.style.whiteSpace = 'pre-line'; document.querySelector('#section-residence h2').after(residentHint);
  function updateResidentComparison() {
    provenance.clearComparisons('초본');
    const comparison = residentPages ? residentComparison(residentPages, Object.fromEntries(new FormData(form))) : null;
    residentHint.textContent = comparison?.details || '';
    if (comparison) for (const name of ['moveInDate','moveOutDate']) provenance.compare(name, '초본', comparison[name]);
  }
  for (const name of ['taxpayerName','address','acquisitionContractDate','transferContractDate']) form.elements[name].addEventListener('input', updateResidentComparison);
  async function refreshResidentDocument(consultationId, requestId) {
    residentPages = null; updateResidentComparison(); residentAction.hidden = residentSelect.value !== '받음'; residentButton.textContent = '초본 등록 · 분석'; residentRegistered.replaceChildren();
    if (consultationId === null) return;
    try {
      const result = await request(`/api/resident/result?consultation_id=${encodeURIComponent(consultationId)}`);
      if (requestId !== documentRequest || consultationId !== id) return;
      if (result.result) {
        residentPages = JSON.parse(result.result.reviewed_json); updateResidentComparison();
        residentAction.hidden = false; residentButton.textContent = '분석 결과 확인 및 수정';
        const list = document.createElement('ul'), row = document.createElement('li'), name = document.createElement('span');
        name.textContent = result.result.filename; row.append(name); list.append(row); residentRegistered.replaceChildren(list);
      }
    } catch (_) { if (requestId === documentRequest && consultationId === id) residentRegistered.textContent = '등록 파일 정보를 불러오지 못했습니다.'; }
  }
  function openResident() {
    residentContext = {id, token:crypto.randomUUID()};
    contractDialog.setAttribute('aria-label', '주민등록초본 분석'); contractFrame.title = '주민등록초본 분석 화면';
    const years = ['acquisitionContractDate', 'transferContractDate'].map(name => formatConsultationDate(form.elements[name].value)?.slice(0,4) || '');
    const query = new URLSearchParams({request:residentContext.token, acquisition_year:years[0], transfer_year:years[1]});
    if (id !== null) query.set('consultation_id', String(id));
    contractFrame.src = `resident.html?${query}`;
    if (!contractDialog.open) contractDialog.showModal();
  }
  residentSelect.addEventListener('change', () => { residentAction.hidden = residentSelect.value !== '받음'; if (residentSelect.value === '받음') openResident(); });
  residentButton.addEventListener('click', openResident);
  window.addEventListener('message', async event => {
    if (event.origin !== location.origin || event.source !== contractFrame.contentWindow || !residentContext) return;
    if (event.data?.type === 'taxflow:resident-close' && event.data.token === residentContext.token) { if (contractDialog.open) contractDialog.close(); return; }
    if (event.data?.type === 'taxflow:resident-apply-address' && event.data.token === residentContext.token) {
      const reply = (ok, message) => contractFrame.contentWindow.postMessage({type:'taxflow:resident-date-applied',token:residentContext.token,requestId:event.data.requestId,ok,message}, location.origin);
      if (residentContext.id !== id || saving) { reply(false, '상담 상태가 변경되었거나 저장 중입니다. 창을 닫고 다시 열어 주세요.'); return; }
      const address = typeof event.data.address === 'string' ? event.data.address.trim() : '';
      if (!address || address.length > 2000) { reply(false, '주소를 확인한 뒤 다시 시도해 주세요.'); return; }
      form.elements.address.value = address; form.elements.address.dispatchEvent(new Event('input', {bubbles:true})); provenance.set('address', '초본', address);
      message.textContent = '초본 주소를 주택 주소에 반영했습니다. 주소를 확인한 뒤 상담 저장을 눌러 주세요.';
      reply(true, '주택 주소 반영 완료');
      return;
    }
    if (event.data?.type === 'taxflow:resident-apply-date' && event.data.token === residentContext.token) {
      const reply = (ok, message) => contractFrame.contentWindow.postMessage({type:'taxflow:resident-date-applied',token:residentContext.token,requestId:event.data.requestId,ok,message}, location.origin);
      if (residentContext.id !== id || saving) { reply(false, '상담 상태가 변경되었거나 저장 중입니다. 창을 닫고 다시 열어 주세요.'); return; }
      const field = event.data.field, value = formatConsultationDate(event.data.date);
      if (!['moveInDate','moveOutDate'].includes(field) || !value) { reply(false, '날짜를 확인한 뒤 다시 시도해 주세요.'); return; }
      const label = field === 'moveInDate' ? '입주일' : '퇴거일';
      form.elements[field].value = value; form.elements.livedThere.value = '예'; form.elements.registrationMatch.value = '예';
      form.elements[field].dispatchEvent(new Event('input', {bubbles:true})); provenance.set(field, '초본', form.elements[field].value);
      message.textContent = `${label}에 초본 날짜를 반영했습니다. 실제 거주일을 확인한 뒤 상담 저장을 눌러 주세요.`;
      reply(true, `${label} ${value} 반영 완료`);
      return;
    }
    if (event.data?.type !== 'taxflow:resident-save' || event.data.token !== residentContext.token) return;
    const respond = payload => contractFrame.contentWindow.postMessage({type:'taxflow:resident-saved',token:residentContext.token,...payload},location.origin);
    if (residentContext.id !== id || saving) { respond({ok:false,message:'상담 상태가 변경되었거나 저장 중입니다. 잠시 후 다시 시도해 주세요.'}); return; }
    try {
      if (!Array.isArray(event.data.pages)) throw Error('초본 분석 결과를 확인해 주세요.');
      const data = {...retiredFields, ...Object.fromEntries(new FormData(form)), addressDetail: ''};
      if (!data.taxpayerName.trim()) throw Error('상담 화면에 신고자 성명을 먼저 입력해 주세요.');
      const result = residentComparison(event.data.pages, data);
      const residentMoveInAdded = !!(result.moveInDate && !data.moveInDate.trim());
      if (residentMoveInAdded) { data.moveInDate = result.moveInDate; data.livedThere = '예'; data.registrationMatch = '예'; const sources = JSON.parse(provenance.serialize()); sources.moveInDate = {source:'초본',value:paymentUtils.formatDate(result.moveInDate)}; data._fieldSources = JSON.stringify(sources); }
      if (!data.livedThere) data.livedThere = '확인 필요';
      if (!data.registrationMatch) data.registrationMatch = '확인 필요';
      for (const name of dateFields) { const date = formatConsultationDate(data[name]); if (date === null) throw Error('상담에 입력된 날짜를 확인해 주세요.'); data[name] = date ? date.slice(0,-1).replaceAll('.','-') : ''; }
      amountFields.forEach(name => { data[name] = data[name].replaceAll(',',''); });
      const savedVersion = editVersion; saving = true; const response = await fetch('/api/resident/save', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({consultation_id:id,token:residentContext.token,pages:event.data.pages,pdf:event.data.pdf,filename:event.data.filename,model:event.data.model,data})});
      const saved = await response.json().catch(()=>({})); if (!response.ok) throw Error(saved.error || '초본을 저장하지 못했습니다.');
      id = saved.id; residentContext.id = id; showConsultation(); residentPages = event.data.pages; updateResidentComparison();
      if (editVersion === savedVersion) { for (const name of ['moveInDate','livedThere','registrationMatch']) form.elements[name].value = displayValue(name, data[name]); if (residentMoveInAdded) provenance.set('moveInDate', '초본', form.elements.moveInDate.value); form.dispatchEvent(new Event('taxflow:residence-updated')); residentSelect.value = '받음'; dirty = false; } else dirty = true;
      residentAction.hidden = false; residentButton.textContent = '분석 결과 확인 및 수정'; updateReportButton();
      message.textContent = dirty ? '초본은 저장되었습니다. 저장 중 변경한 상담 내용을 다시 저장해 주세요.' : '초본과 상담을 저장했습니다. 주민등록 이력과 실제 거주 여부를 확인해 주세요.';
      respond({ok:true});
      if (contractDialog.open) contractDialog.close();
      refresh().catch(() => { records.textContent = '상담은 저장됐으나 목록을 불러오지 못했습니다.'; });
    } catch(error) { respond({ok:false,message:error.message}); } finally { saving = false; }
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
    document.querySelector('#report-dialog-title').textContent = '사실확인서 출력';
    document.querySelector('.report-dialog-head p').textContent = '저장된 상담 내용을 확인하고 인쇄하거나 PDF로 저장합니다.';
    reportFrame.title = '사실확인서 출력 미리보기';
    pendingSettlementReport = null;
    reportFrame.src = reportUrl(id);
    reportDialog.showModal();
  });
  document.querySelector('#report-close').addEventListener('click', () => reportDialog.close());
  reportDialog.addEventListener('close', () => { pendingSettlementReport = null; });
  document.querySelector('#new-record').addEventListener('click', () => { if (confirmDiscard()) clear(); });
  function loadSample(sample, label) {
    if (!confirmDiscard()) return;
    clear(); showConsultation();
    for (const [name, value] of Object.entries(sample)) form.elements[name].value = displayValue(name, value);
    form.elements.address.dispatchEvent(new Event('taxflow:address-updated'));
    form.dispatchEvent(new Event('taxflow:form-loaded'));
    dirty = true;
    updateReportButton();
    message.textContent = `교육용 사례 ${label}를 입력했습니다. 상담 저장 후 양도소득세 탭에서 계산 결과를 확인하세요.`;
  }
  document.querySelector('#load-sample').addEventListener('click', () => loadSample(caseA, 'A'));
  document.querySelector('#load-sample-b').addEventListener('click', () => loadSample(caseB, 'B'));
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
  capitalGainsPanel = createCapitalGainsPanel({form, getState:() => ({id, dirty, saving, message:message.textContent, originalDocuments}), save:() => saveConsultation(), openContract:openOriginalPdf, showFacts:() => { activateTab(document.querySelector('#tab-consultation')); showConsultation(); }});
  filingPanel = createFilingPanel({form, getState:() => ({id, dirty, saving, message:message.textContent}), save:() => saveConsultation(), showReview:() => activateTab(document.querySelector('#tab-capital-gains'))});
  const tabs = [...document.querySelectorAll('[role=tab]')];
  function activateTab(tab) {
    for (const item of tabs) { const selected = item === tab; item.setAttribute('aria-selected', String(selected)); item.tabIndex = selected ? 0 : -1; }
    form.hidden = tab.id !== 'tab-consultation';
    document.querySelector('#filing-panel').hidden = tab.id !== 'tab-filing';
    document.querySelector('.workspace').classList.toggle('filing-workspace', tab.id === 'tab-filing');
    if (tab.id === 'tab-filing') filingPanel.refresh();
    document.querySelector('#capital-gains-panel').hidden = tab.id !== 'tab-capital-gains';
    if (tab.id === 'tab-capital-gains') capitalGainsPanel.refresh();
    document.querySelector('#settlement-panel').hidden = tab.id !== 'tab-settlement';
    document.querySelector('#regulated-panel').hidden = tab.id !== 'tab-regulated';
    document.querySelector('.summary-panel').hidden = ['tab-regulated', 'tab-filing'].includes(tab.id);
    document.querySelector('.workspace').classList.toggle('regulated-workspace', tab.id === 'tab-regulated');
    if (tab.id === 'tab-settlement' && !settlement.isDirty()) settlement.load();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateTab(tab));
    tab.addEventListener('keydown', event => { if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return; event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; activateTab(tabs[next]); tabs[next].focus(); });
  });
  const updateScrollHeader = () => document.body.classList.toggle('is-scrolled', window.scrollY > 80);
  window.addEventListener('scroll', updateScrollHeader, {passive: true});
  updateScrollHeader();
  clear();
  const entryViews = {
    documents: 'tab-consultation', facts: 'tab-consultation',
    settlement: 'tab-settlement', regions: 'tab-regulated',
    review: 'tab-capital-gains', filing: 'tab-filing'
  };
  const entryView = new URLSearchParams(location.search).get('view');
  if (Object.prototype.hasOwnProperty.call(entryViews, entryView)) {
    activateTab(document.getElementById(entryViews[entryView]));
    if (entryView === 'facts') showConsultation();
  }
  refresh().catch(e => { records.textContent = e.message; });
})();
