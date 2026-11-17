(() => {
  'use strict';
  const form = document.querySelector('#consultation-form');
  const expensePresence = form.elements.expensePresence, transferPresence = form.elements.otherTransfers;
  const expenseStore = form.elements.expenseItemsJson, transferStore = form.elements.otherTransferItemsJson, checkStore = form.elements.transferReviewChecksJson;
  const expenseArea = document.querySelector('#expense-items-area'), transferArea = document.querySelector('#other-transfer-area');
  const expenseList = document.querySelector('#expense-items'), transferList = document.querySelector('#other-transfer-items');
  const expenseFields = [
    ['kind','비용 종류','select',['취득 관련','자본적 지출','양도 관련','기타']], ['description','비용 내용','text'],
    ['amount','금액 (원)','amount'], ['evidence','증빙 상태','select',['있음','요청 예정','없음','확인 필요']]
  ];
  const transferFields = [
    ['kind','자산 종류','select',['주택','토지','분양권·입주권','기타']], ['address','주소·자산명','text'],
    ['status','양도 상태','select',['양도 완료','양도 예정','확인 필요']], ['transferDate','양도일','date'], ['acquisitionDate','취득일','date'],
    ['transferPrice','양도가액 (원)','amount'], ['acquisitionPrice','취득가액 (원)','amount'], ['expenses','필요경비 (원)','amount'],
    ['taxReview','비과세 검토 (참고)','select',['해당 가능성 있음','과세 예상','확인 필요']], ['filing','신고 상태','select',['신고 전','예정신고 완료','확인 필요']],
    ['combined','다른 양도분과 합산 신고','select',['예','아니요','확인 필요']], ['memo','메모','textarea']
  ];
  let expenses = [], transfers = [], checks = {}, locked = false;
  const addExpense = document.querySelector('#expense-add'), addTransfer = document.querySelector('#other-transfer-add');
  function parseArray(raw) { const value = JSON.parse(raw || '[]'); if (!Array.isArray(value) || value.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error(); return value; }
  function sync() {
    if (locked) return;
    expenseStore.value = JSON.stringify(expenses); transferStore.value = JSON.stringify(transfers); checkStore.value = JSON.stringify(checks);
  }
  function mark() { sync(); expenseStore.dispatchEvent(new Event('input', {bubbles:true})); }
  function option(select, value, label=value) { const node = document.createElement('option'); node.value=value; node.textContent=label; select.append(node); }
  function rowCard(row, index, kind) {
    const fields = kind === 'expense' ? expenseFields : transferFields;
    const card = document.createElement('div'); card.className='expense-item';
    const heading = document.createElement('div'); heading.className='expense-item-heading';
    const title = document.createElement('strong'); title.textContent = `${kind === 'expense' ? '비용' : '다른 양도 자산'} ${index + 1}`;
    const remove = document.createElement('button'); remove.type='button'; remove.className='secondary'; remove.textContent='삭제'; remove.setAttribute('aria-label', `${title.textContent} 삭제`);
    remove.addEventListener('click', () => { if (!confirm(`${title.textContent} 입력 내용을 삭제할까요?`)) return; const hadAmount = kind === 'expense' && hasExpenseAmount(); (kind === 'expense' ? expenses : transfers).splice(index,1); if (kind === 'expense') syncExpenseTotal(hadAmount); render(); mark(); });
    heading.append(title, remove); card.append(heading);
    const grid = document.createElement('div'); grid.className='expense-item-grid';
    for (const [key,label,type,choices] of fields) {
      const wrapper=document.createElement('label'); wrapper.textContent=label;
      if (key === 'combined') { wrapper.dataset.combinedField='true'; wrapper.hidden = row.filing !== '예정신고 완료'; }
      let control;
      if (type === 'select') { control=document.createElement('select'); option(control,'','선택하세요'); choices.forEach(choice => option(control,choice)); }
      else if (type === 'textarea') { control=document.createElement('textarea'); control.rows=2; wrapper.className='expense-item-wide'; }
      else { control=document.createElement('input'); control.type=type === 'date' ? 'date' : 'text'; if (type === 'amount') { control.inputMode='numeric'; control.maxLength=20; } }
      control.value=String(row[key] || '');
      if (type === 'amount' && /^\d+$/.test(control.value)) control.value=BigInt(control.value).toLocaleString('ko-KR');
      control.addEventListener('input', () => { const hadAmount = kind === 'expense' && key === 'amount' && hasExpenseAmount(); row[key] = type === 'amount' ? control.value.replace(/[^0-9]/g,'') : control.value; if (type === 'amount') { control.value = row[key] ? BigInt(row[key]).toLocaleString('ko-KR') : ''; if (kind === 'expense') { syncExpenseTotal(hadAmount); setExpenseAvailability(); } } sync(); });
      control.addEventListener('change', () => { row[key] = type === 'amount' ? control.value.replace(/[^0-9]/g,'') : control.value; sync(); if (key === 'filing') grid.querySelector('[data-combined-field]').hidden = row.filing !== '예정신고 완료'; });
      wrapper.append(control); grid.append(wrapper);
    }
    card.append(grid); return card;
  }
  function hasExpenseAmount() { return expenses.some(row => /^\d+$/.test(String(row.amount ?? ''))); }
  function syncExpenseTotal(clearWhenEmpty = false, deferChange = false) {
    if (locked || expensePresence.value === '없음') return;
    const hasAmount = hasExpenseAmount();
    if (!hasAmount && !clearWhenEmpty) return;
    const total = expenses.reduce((sum,row) => sum + (/^\d+$/.test(String(row.amount ?? '')) ? BigInt(row.amount) : 0n), 0n);
    const input = form.elements.expenses, next = hasAmount ? total.toLocaleString('ko-KR') : '';
    if (input.value === next) return;
    input.value = next;
    const currentStore = expenseStore.value;
    const notify = () => { if (input.value === next && expenseStore.value === currentStore) input.dispatchEvent(new Event('input', {bubbles:true})); };
    if (deferChange) queueMicrotask(notify); else notify();
  }
  function setExpenseAvailability() {
    const unavailable = expensePresence.value === '없음';
    const input = form.elements.expenses;
    const automatic = !unavailable && hasExpenseAmount();
    input.readOnly = unavailable || automatic;
    input.setAttribute('aria-readonly', String(input.readOnly));
    input.title = automatic ? '비용 명세에 입력된 금액이 자동 합산됩니다.' : '';
    form.querySelectorAll('[data-amount-field="expenses"]').forEach(button => { button.disabled = unavailable || automatic; });
    expenseList.querySelectorAll('input,select,textarea,button').forEach(control => { control.disabled = unavailable || locked; });
    addExpense.disabled = unavailable || locked;
    document.querySelector('#expense-disabled-note').hidden = !(unavailable && (input.value.trim() || expenses.length));
  }
  function render() {
    if (locked) { setExpenseAvailability(); return; }
    expenseArea.hidden = expensePresence.value !== '있음' && expenses.length === 0;
    transferArea.hidden = transferPresence.value !== '있음' && transfers.length === 0;
    document.querySelector('.expense-transfer-advice').textContent = transferPresence.value === '있음' ? '합산 신고 검토 필요 · 각 자산의 양도 시기, 과세·비과세 여부와 신고 내용을 함께 확인하세요.' : '기존에 입력한 자산 명세가 있습니다. 선택 내용과 함께 확인해 주세요.';
    expenseList.replaceChildren(...expenses.map((row,i) => rowCard(row,i,'expense')));
    transferList.replaceChildren(...transfers.map((row,i) => rowCard(row,i,'transfer')));
    document.querySelectorAll('[data-check]').forEach(input => { input.checked=checks[input.dataset.check] === true; });
    setExpenseAvailability();
  }
  function updateYear() {
    const raw=form.elements.transferBalanceDate.value.trim(), match=raw.match(/^(\d{4})/);
    document.querySelector('#other-transfers-year').textContent=match ? `입력한 양도 잔금일 기준 ${match[1]}년 참고 · 실제 양도시기는 별도 확인` : '해당 주택의 양도연도를 확인해 주세요.';
  }
  function hydrate() {
    try { expenses=parseArray(expenseStore.value); transfers=parseArray(transferStore.value); checks=JSON.parse(checkStore.value || '{}'); if (!checks || typeof checks !== 'object' || Array.isArray(checks)) throw new Error(); }
    catch (_) { locked=true; expenseArea.hidden=false; expenseList.textContent='저장된 명세를 표시하지 못했습니다. 기존 데이터는 유지됩니다.'; transferArea.hidden=false; transferList.textContent='저장된 명세를 확인해 주세요.'; addExpense.disabled=true; addTransfer.disabled=true; setExpenseAvailability(); return; }
    locked=false; addExpense.disabled=false; addTransfer.disabled=false;
    if (transferPresence.value === '있음' && transfers.length === 0) transfers.push({});
    syncExpenseTotal(false, true); render(); updateYear();
  }
  expensePresence.addEventListener('change',() => { syncExpenseTotal(); render(); });
  transferPresence.addEventListener('change', () => {
    if (!locked && transferPresence.value === '있음' && transfers.length === 0) { transfers.push({}); sync(); }
    if (!locked && transferPresence.value !== '있음' && transfers.length === 1 && !Object.values(transfers[0]).some(value => String(value ?? '').trim())) { transfers = []; sync(); }
    render();
  });
  addExpense.addEventListener('click', () => { expenses.push({}); render(); mark(); });
  addTransfer.addEventListener('click', () => { transfers.push({}); render(); mark(); });
  document.querySelectorAll('[data-check]').forEach(input => input.addEventListener('change', () => { checks[input.dataset.check]=input.checked; sync(); }));
  form.elements.transferBalanceDate.addEventListener('input', updateYear);
  form.elements.transferBalanceDate.addEventListener('taxflow:transfer-date-updated', updateYear);
  form.addEventListener('taxflow:form-loaded',hydrate);
  form.addEventListener('reset', () => { form.elements.expenses.readOnly=false; form.elements.expenses.setAttribute('aria-readonly','false'); form.elements.expenses.title=''; form.querySelectorAll('[data-amount-field="expenses"]').forEach(button => {button.disabled=false;}); document.querySelector('#expense-disabled-note').hidden=true; expenses=[]; transfers=[]; checks={}; locked=false; expenseStore.value=''; transferStore.value=''; checkStore.value=''; expenseList.replaceChildren(); transferList.replaceChildren(); expenseArea.hidden=true; transferArea.hidden=true; addExpense.disabled=false; addTransfer.disabled=false; document.querySelectorAll('[data-check]').forEach(input => {input.checked=false;}); document.querySelector('#other-transfers-year').textContent='해당 주택의 양도연도를 확인해 주세요.'; });
  hydrate();
})();
