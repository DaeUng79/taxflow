(() => {
  'use strict';
  const form = document.querySelector('#consultation-form');
  const records = document.querySelector('#records');
  const message = document.querySelector('#message');
  const search = document.querySelector('#search');
  const reportButton = document.querySelector('#open-report');
  let id = null, dirty = false, items = [];
  const savedAt = () => { const d = new Date(); const pad = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  const amountFields = ['acquisitionPrice', 'transferPrice', 'expenses'];
  const formatAmount = value => { const digits = String(value).replace(/[^0-9]/g, ''); return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  const reportUrl = recordId => `report.html?id=${encodeURIComponent(recordId)}`;
  function updateReportButton() {
    reportButton.disabled = id === null || dirty;
    reportButton.title = dirty ? '변경 내용을 저장한 뒤 보고서를 열 수 있습니다' : id === null ? '상담을 저장한 뒤 보고서를 열 수 있습니다' : '저장된 상담의 A4 보고서 열기';
  }
  function clear() { form.reset(); id = null; dirty = false; message.textContent = ''; updateReportButton(); }
  function confirmDiscard() { return !dirty || window.confirm('저장하지 않은 변경 내용이 있습니다. 계속하시겠습니까?'); }
  async function request(url, options) { const response = await fetch(url, options); if (!response.ok) throw new Error('요청을 처리하지 못했습니다. 서버 상태를 확인하세요.'); return response.json(); }
  function draw() {
    records.replaceChildren();
    const filtered = items.filter(item => item.taxpayer_name.includes(search.value.trim()));
    if (!filtered.length) { records.textContent = '표시할 상담이 없습니다.'; return; }
    for (const item of filtered) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'record-button';
      const name = document.createElement('strong'); name.textContent = `${item.taxpayer_name} (${item.birth_date || '생년월일 미입력'})`;
      const detail = document.createElement('span'); detail.textContent = `상담일 ${item.consulted_at} · 접수번호 ${item.id}`;
      button.append(name, detail);
      button.addEventListener('click', async () => { if (!confirmDiscard()) return; try { const result = await request(`/api/consultations/${item.id}`); form.reset(); for (const [key, value] of Object.entries(result.data)) { const element = form.elements.namedItem(key); if (element) element.value = amountFields.includes(key) ? formatAmount(value) : value; } id = result.id; dirty = false; updateReportButton(); message.textContent = `접수번호 ${id} 상담을 수정 중입니다.`; window.scrollTo({top: 0, behavior: 'smooth'}); } catch (e) { message.textContent = e.message; } });
      const card = document.createElement('div'); card.className = 'record-card';
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'record-delete'; remove.textContent = '삭제';
      remove.setAttribute('aria-label', `${item.taxpayer_name} 접수번호 ${item.id} 상담 삭제`);
      remove.addEventListener('click', async () => {
        const warning = id === item.id && dirty ? '\n현재 수정 중인 저장되지 않은 내용도 사라집니다.' : '';
        if (!window.confirm(`${item.taxpayer_name} 님의 상담 (접수번호 ${item.id})을 삭제하시겠습니까?\n삭제 후에는 복구할 수 없습니다.${warning}`)) return;
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
  form.addEventListener('input', () => { dirty = true; updateReportButton(); });
  form.addEventListener('change', () => { dirty = true; updateReportButton(); });
  form.addEventListener('submit', async event => { event.preventDefault(); const data = Object.fromEntries(new FormData(form)); data.consultedAt = savedAt(); amountFields.forEach(name => { data[name] = data[name].replace(/,/g, ''); }); const button = form.querySelector('[type=submit]'); button.disabled = true; try { const result = await request(id === null ? '/api/consultations' : `/api/consultations/${id}`, {method: id === null ? 'POST' : 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)}); id = result.id; dirty = false; updateReportButton(); message.textContent = `접수번호 ${id} 상담을 저장했습니다. 보고서 보기를 눌러 A4 인쇄 또는 PDF 저장을 할 수 있습니다.`; await refresh(); } catch (e) { message.textContent = e.message; } finally { button.disabled = false; } });
  reportButton.addEventListener('click', () => { if (!reportButton.disabled) window.location.href = reportUrl(id); });
  document.querySelector('#new-record').addEventListener('click', () => { if (confirmDiscard()) clear(); });
  document.querySelector('#load-sample').addEventListener('click', () => {
    if (!confirmDiscard()) return;
    clear();
    const sample = {taxpayerName: '홍길동 (가상)', birthDate: '1985-03-15', resident: '예', ownership: '단독 소유', address: '서울특별시 마포구 상암동', addressDetail: '101동 1001호', propertyType: '아파트', acquisitionMethod: '매매', acquisitionContractDate: '2021-05-10', acquisitionBalanceDate: '2021-06-15', acquisitionRegistrationDate: '2021-06-15', acquisitionPrice: '650000000', transferStatus: '양도 완료', transferContractDate: '2026-01-10', transferBalanceDate: '2026-02-16', transferRegistrationDate: '2026-02-16', transferPrice: '1300000000', livedThere: '예', moveInDate: '2021-07-01', moveOutDate: '2022-07-01', registrationMatch: '확인 필요', household: '배우자, 자녀', otherHomes: '없음', otherRights: '없음', currentHousing: '임차', propertyAfterMove: '공실', expenses: '10000000', otherTransfers: '없음', acquisitionDocument: '확인 필요', transferDocument: '확인 필요', residentDocument: '확인 필요', paymentDocument: '확인 필요', notes: '가상 예시입니다. 증빙을 확인해 주세요.'};
    for (const [name, value] of Object.entries(sample)) form.elements[name].value = amountFields.includes(name) ? formatAmount(value) : value;
    dirty = true;
    updateReportButton();
    message.textContent = '가상 데이터를 입력했습니다. 저장하면 새 상담으로 등록됩니다.';
  });
  form.querySelectorAll('input[type="date"]').forEach(input => input.addEventListener('change', () => { if (input.value) input.blur(); }));
  search.addEventListener('input', draw);
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  const updateScrollHeader = () => document.body.classList.toggle('is-scrolled', window.scrollY > 80);
  window.addEventListener('scroll', updateScrollHeader, {passive: true});
  updateScrollHeader();
  clear(); refresh().catch(e => { records.textContent = e.message; });
})();
