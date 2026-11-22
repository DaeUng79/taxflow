/* 계약서 약정과 직접 확인한 실제 수수 내용을 별도로 표시합니다. */
function createSettlement({getId, request, isConsultationDirty, openReport}) {
  const $ = selector => document.querySelector(selector);
  const panel = $('#settlement-panel'), content = $('#settlement-content');
  const form = $('#settlement-confirmations'), status = $('#settlement-message');
  const inputs = [...form.querySelectorAll('input, textarea')];
  let dirty = false, loading = 0, saving = false, editVersion = 0, contractTotals = {}, loaded = false, hasSaved = false;
  const printButton = $('#settlement-print');
  function updatePrintButton() {
    printButton.disabled = !loaded || !hasSaved || dirty || saving || isConsultationDirty();
    printButton.title = printButton.disabled ? '상담과 수수 확인 내용을 저장한 뒤 출력할 수 있습니다.' : '정산 확인서 미리보기 및 출력';
  }
  const unique = values => [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
  function sourceDescription(item) {
    if (!item.document) return `${item.label}: 등록된 계약서 없음`;
    if (!item.result) return `${item.label}: 분석 결과 없음`;
    return `${item.label}: ${item.result.confirmed ? '원본 대조 완료' : '원본 대조 필요'} (${item.document.filename})`;
  }
  async function loadContract(consultationId, type, label) {
    const suffix = `document_type=${encodeURIComponent(type)}`;
    const list = await request(`/api/contracts/documents?consultation_id=${consultationId}&${suffix}`);
    const document = list.items[0];
    if (!document) return {label, document:null, result:null};
    const payload = await request(`/api/contracts/documents/${document.id}/result?${suffix}`);
    return {label, document, result:payload.result};
  }
  const clean = value => typeof value === 'string' && value.trim() && !/\[판독 불가\]/.test(value) ? value.trim() : '';
  const dateLabel = /날짜|지급일|입금일|기일|일자/;
  const paymentKinds = [['계약금', /계약금/], ['중도금', /중도금/], ['잔금', /잔금/]];
  function amountNumber(value) {
    const match = String(value || '').trim().match(/^(?:금\s*)?(?:[₩￦W]\s*)?(\d{1,3}(?:,\d{3})+|\d+)\s*(?:원(?:정)?)?$/i);
    return match ? BigInt(match[1].replace(/,/g, '')) : null;
  }
  const amountText = amount => `${amount.toLocaleString('ko-KR')}원`;
  function hasPaymentValue(value) {
    const text = String(value || '').trim();
    return !!text && !/^(?:금\s*)?(?:원(?:정)?(?:은|을)?)?\s*(?:년\s*월\s*일(?:에)?\s*(?:지불|지급)(?:하며|한다|함)?)?\s*$/.test(text);
  }
  function contractData(item) {
    const pages = item.result && Array.isArray(item.result.pages) ? item.result.pages : [];
    const sellers = unique(pages.flatMap(page => (page.seller || []).map(person => clean(person.name))));
    const buyers = unique(pages.flatMap(page => (page.buyer || []).map(person => clean(person.name))));
    const payments = pages.flatMap(page => Array.isArray(page.payments) ? page.payments : []).filter(row => row && typeof row.label === 'string' && typeof row.value === 'string');
    const names = list => list.length ? list.join(', ') : '확인 필요';
    const totalValues = unique(payments.filter(row => paymentUtils.isTotal(row.label)).map(row => row.value));
    const totalNumbers = totalValues.map(amountNumber);
    const distinctTotals = [...new Set(totalNumbers.filter(value => value !== null).map(String))];
    const totalAmount = totalValues.length && totalNumbers.every(value => value !== null) && distinctTotals.length === 1 ? BigInt(distinctTotals[0]) : null;
    const total = totalAmount !== null ? amountText(totalAmount) : totalValues.length ? `${totalValues.join(' / ')} (원본 확인 필요)` : '확인 필요';
    const candidates = payments.filter(row => !paymentUtils.isTotal(row.label) && !dateLabel.test(row.label) && (paymentKinds.some(([, expression]) => expression.test(row.label)) ? hasPaymentValue(row.value) : paymentUtils.hasAmount(row.value)));
    const paymentRows = candidates.filter(row => paymentKinds.some(([, expression]) => expression.test(row.label)));
    const otherRows = candidates.filter(row => !paymentKinds.some(([, expression]) => expression.test(row.label)) || paymentKinds.filter(([, expression]) => expression.test(row.label)).length > 1);
    const balances = paymentRows.filter(row => /잔금/.test(row.label));
    const balanceDates = balances.map(row => paymentUtils.formatDate(row.payment_date));
    const distinctDates = unique(balanceDates);
    const balanceDate = balances.length && balanceDates.every(Boolean) && distinctDates.length === 1 ? distinctDates[0].slice(0, -1).replace(/\./g, '-') : '';
    return {buyers:names(buyers), sellers:names(sellers), total, totalAmount, paymentRows, otherRows, balanceDate};
  }
  function render(contracts) {
    const defaults = {}, totals = {};
    for (const item of contracts) {
      const rows = $(`#${item.key}-rows`); rows.replaceChildren();
      $(`#${item.key}-source-status`).textContent = sourceDescription(item);
      const data = contractData(item);
      $(`#${item.key}-parties`).textContent = `${data.sellers} → ${data.buyers}`;
      $(`#${item.key}-total`).textContent = data.total;
      totals[item.key] = data.totalAmount;
      const badge = $(`#${item.key}-badge`), comparison = $(`#${item.key}-comparison`);
      badge.className = 'settlement-badge warning';
      badge.textContent = '약정 확인 필요';
      comparison.textContent = '';
      defaults[`${item.key}_date`] = data.balanceDate;
      if (!item.result) {
        $(`#${item.key}-sum`).textContent = '확인 필요';
        comparison.textContent = '계약서 분석 결과가 없어 금액을 비교할 수 없습니다.';
        const tr = document.createElement('tr'), td = document.createElement('td'); td.colSpan = 3; td.textContent = '표시할 약정 항목이 없습니다.'; tr.append(td); rows.append(tr);
        continue;
      }
      const appendRow = values => {
        const tr = document.createElement('tr');
        for (const value of values) { const td = document.createElement('td'); td.textContent = value; tr.append(td); }
        rows.append(tr);
      };
      const seen = [];
      let duplicate = false;
      for (const [kind, expression] of paymentKinds) {
        for (const payment of data.paymentRows.filter(row => expression.test(row.label) && paymentKinds.find(([, pattern]) => pattern.test(row.label))[0] === kind)) {
          const rawDate = clean(payment.payment_date), date = paymentUtils.formatDate(rawDate) || rawDate, amount = clean(payment.value);
          const label = payment.label.trim() || kind;
          const number = amountNumber(payment.value), normalizedAmount = number === null ? payment.value.trim() : String(number);
          const normalizedLabel = label.replace(/\s+/g, '');
          if (seen.some(previous => previous.label === normalizedLabel && previous.amount === normalizedAmount && (!previous.date || !date || previous.date === date))) duplicate = true;
          seen.push({label:normalizedLabel, amount:normalizedAmount, date});
          appendRow([date || '확인 필요', label, amount || '확인 필요']);
        }
      }
      if (!rows.children.length) { const tr = document.createElement('tr'), td = document.createElement('td'); td.colSpan = 3; td.textContent = '표시할 약정 항목이 없습니다.'; tr.append(td); rows.append(tr); }
      const amounts = data.paymentRows.map(row => paymentKinds.filter(([, expression]) => expression.test(row.label)).length === 1 ? amountNumber(row.value) : null);
      const validAmounts = amounts.filter(amount => amount !== null);
      const sum = validAmounts.reduce((result, amount) => result + amount, 0n);
      const complete = data.paymentRows.length && validAmounts.length === amounts.length && !data.otherRows.length;
      const difference = complete && data.totalAmount !== null ? sum - data.totalAmount : null;
      const sumText = data.paymentRows.length ? `${complete ? '' : '확인된 금액 '}${amountText(sum)}${complete ? '' : ' (미확인 항목 제외)'}` : '확인 필요';
      $(`#${item.key}-sum`).textContent = sumText;
      if (difference === null) {
        comparison.textContent = '비교 불가: 매매대금과 지급 항목의 숫자 금액 및 누락된 항목을 확인해 주세요.';
      } else if (difference !== 0n) {
        badge.textContent = '약정 불일치';
        comparison.textContent = `약정 합계가 매매대금보다 ${amountText(difference > 0n ? difference : -difference)} ${difference > 0n ? '초과' : '부족'}합니다.`;
      } else if (duplicate) {
        comparison.textContent = '합계는 같지만 동일한 지급 항목이 중복되어 원본 확인이 필요합니다.';
      } else {
        badge.className = 'settlement-badge match';
        badge.textContent = '약정 일치';
        defaults[`${item.key}_amount`] = data.totalAmount.toLocaleString('ko-KR');
      }
      if (duplicate && difference !== 0n) comparison.textContent += ' 동일한 지급 항목이 중복되어 있습니다.';
    }
    return {defaults, totals};
  }
  function updateReceivedStatus(key) {
    const input = inputs.find(field => field.name === `${key}_amount`);
    const message = $(`#${key}-received-status`), received = amountNumber(input.value), total = contractTotals[key];
    message.className = 'settlement-amount-status';
    if (!input.value.trim()) {
      message.textContent = '';
    } else if (received === null) {
      message.classList.add('warning');
      message.textContent = '수령액을 숫자 금액으로 입력해 주세요.';
    } else if (total === null || total === undefined) {
      message.textContent = '계약서상 매매대금이 확인되면 입력 금액을 비교할 수 있습니다.';
    } else if (received === total) {
      message.textContent = '';
    } else {
      const difference = received - total;
      message.classList.add('warning');
      message.textContent = `입력한 총수령액이 계약서상 매매대금보다 ${amountText(difference > 0n ? difference : -difference)} ${difference > 0n ? '초과' : '부족'}합니다. 수령액과 확인 근거를 확인해 주세요.`;
    }
  }
  async function load() {
    const token = ++loading, recordId = getId();
    loaded = false; hasSaved = false; updatePrintButton();
    status.textContent = ''; content.hidden = true; $('#settlement-empty').hidden = false;
    if (recordId === null) { $('#settlement-record').textContent = '상담을 선택해 주세요.'; $('#settlement-empty').textContent = '저장된 상담을 선택하거나 상담을 먼저 저장해 주세요.'; return; }
    $('#settlement-record').textContent = `접수번호 ${recordId} · 저장된 계약서 분석 결과`;
    $('#settlement-empty').textContent = '분석 결과를 불러오는 중입니다.';
    try {
      const [acquisition, transfer, confirmation] = await Promise.all([
        loadContract(recordId, 'acquisition_contract', '취득계약서'), loadContract(recordId, 'transfer_contract', '양도계약서'), request(`/api/consultations/${recordId}/settlement`)
      ]);
      if (token !== loading || recordId !== getId()) return;
      acquisition.key = 'acquisition'; transfer.key = 'transfer';
      const {defaults, totals} = render([acquisition, transfer]);
      contractTotals = totals;
      for (const input of inputs) input.value = Object.prototype.hasOwnProperty.call(confirmation.data, input.name) ? confirmation.data[input.name] : defaults[input.name] || '';
      for (const key of ['acquisition', 'transfer']) updateReceivedStatus(key);
      dirty = false; loaded = true; hasSaved = Object.keys(confirmation.data).length > 0; updatePrintButton(); content.hidden = false; $('#settlement-empty').hidden = true;
    } catch (error) { if (token === loading && recordId === getId()) $('#settlement-empty').textContent = '내용을 불러오지 못했습니다. 서버를 확인한 뒤 새로고침해 주세요.'; }
  }
  for (const input of inputs) input.addEventListener('input', () => {
    dirty = true; editVersion++; updatePrintButton(); status.textContent = '변경한 수수 확인 내용을 저장해 주세요.';
    if (input.name.endsWith('_amount')) updateReceivedStatus(input.name.replace(/_amount$/, ''));
  });
  $('#settlement-save').addEventListener('click', async () => {
    const recordId = getId(); if (recordId === null || saving) return;
    const version = editVersion, button = $('#settlement-save'); saving = true; button.disabled = true; updatePrintButton();
    try {
      await request(`/api/consultations/${recordId}/settlement`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(Object.fromEntries(inputs.map(input => [input.name, input.value])))});
      if (recordId === getId()) { hasSaved = true; dirty = editVersion !== version; status.textContent = dirty ? '저장 중 변경된 내용을 다시 저장해 주세요.' : '수수 확인 내용을 저장했습니다.'; }
    } catch (error) { status.textContent = '저장하지 못했습니다. 서버 상태를 확인해 주세요.'; }
    finally { saving = false; button.disabled = false; updatePrintButton(); }
  });
  printButton.addEventListener('click', () => {
    if (!loaded || !hasSaved || dirty || saving || isConsultationDirty()) return;
    const transactions = ['acquisition', 'transfer'].map(key => ({
      title: key === 'acquisition' ? '취득 거래' : '양도 거래',
      badge: $(`#${key}-badge`).textContent,
      parties: $(`#${key}-parties`).textContent,
      total: $(`#${key}-total`).textContent,
      sum: $(`#${key}-sum`).textContent,
      amount: form.querySelector(`[name="${key}_amount"]`).value,
      date: form.querySelector(`[name="${key}_date"]`).value,
      details: form.querySelector(`[name="${key}_details"]`).value,
      detailsLabel: key === 'acquisition' ? '미지급·대체 정산 및 확인 근거' : '미수금·대체 정산 및 확인 근거',
      rows: [...$(`#${key}-rows`).rows].map(row => [...row.cells].map(cell => cell.textContent)),
      comparison: $(`#${key}-comparison`).textContent,
      receivedStatus: $(`#${key}-received-status`).textContent,
      source: $(`#${key}-source-status`).textContent
    }));
    openReport({recordId:getId(), transactions});
  });
  $('#settlement-refresh').addEventListener('click', () => { if (!dirty || window.confirm('저장하지 않은 수수 확인 내용이 사라집니다. 새로고침하시겠습니까?')) load(); });
  return {load, updatePrintButton, isDirty:() => dirty, isSaving:() => saving, clear:() => { dirty = false; loaded = false; hasSaved = false; loading++; updatePrintButton(); }, isVisible:() => !panel.hidden};
}
