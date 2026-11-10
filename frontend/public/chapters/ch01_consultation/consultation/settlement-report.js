(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const token = new URLSearchParams(location.search).get('request');
  const timeout = window.setTimeout(() => {
    $('#print-help').textContent = '정산 확인 내용을 불러오지 못했습니다. 창을 닫고 다시 열어 주세요.';
  }, 8000);
  const text = value => String(value ?? '').trim() || '미입력';
  const money = value => {
    const raw = String(value ?? '').trim();
    return /^\d{1,3}(?:,\d{3})+$|^\d+$/.test(raw) ? `${BigInt(raw.replace(/,/g, '')).toLocaleString('ko-KR')}원` : text(raw);
  };
  function render(data) {
    $('#report-name').textContent = text(data.taxpayerName);
    $('#report-number').textContent = `접수번호 ${data.recordId}`;
    $('#report-date').textContent = `상담일 ${text(data.consultedAt)}`;
    $('#report-printed').textContent = `출력 ${new Date().toLocaleString('ko-KR')}`;
    document.title = `${text(data.taxpayerName)}_정산확인서_${data.recordId} · TAXFLOW`;
    const container = $('#report-sections'); container.replaceChildren();
    data.transactions.forEach((transaction, index) => {
      const section = document.createElement('section'); section.className = 'report-section';
      const heading = document.createElement('h2'); heading.textContent = `${index + 1}. ${transaction.title}`; section.append(heading);
      const grid = document.createElement('dl'); grid.className = 'report-grid';
      const fields = [
        ['매도인 → 매수인', transaction.parties, true], ['약정 확인', transaction.badge],
        ['계약서상 매매대금', transaction.total], ['약정 합계', transaction.sum],
        ['실제 총수령액', money(transaction.amount)], ['실제 최종 정산일', transaction.date],
        ['', ''],
        [transaction.detailsLabel, transaction.details, true]
      ];
      for (const [label, value, full] of fields) {
        const field = document.createElement('div'); field.className = `report-field${full ? ' full' : ''}`;
        if (!label) { field.setAttribute('aria-hidden', 'true'); grid.append(field); continue; }
        const dt = document.createElement('dt'), dd = document.createElement('dd');
        dt.textContent = label; dd.textContent = text(value);
        if (dd.textContent === '미입력' || dd.textContent.includes('확인 필요')) dd.className = 'pending';
        field.append(dt, dd); grid.append(field);
      }
      section.append(grid);
      const table = document.createElement('table'); table.className = 'settlement-report-table';
      const header = document.createElement('thead'), headerRow = document.createElement('tr');
      for (const name of ['약정 지급일', '구분', '약정 금액']) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = name; headerRow.append(th); }
      header.append(headerRow); table.append(header);
      const body = document.createElement('tbody');
      for (const values of transaction.rows) {
        const row = document.createElement('tr');
        if (values.length === 1) { const cell = document.createElement('td'); cell.colSpan = 3; cell.textContent = values[0]; row.append(cell); }
        else for (const value of values) { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); }
        body.append(row);
      }
      table.append(body); section.append(table);
      for (const [value, source] of [[transaction.comparison, false], [transaction.receivedStatus, false], [transaction.source, true]]) {
        if (!value) continue;
        const note = document.createElement('p'); note.className = `settlement-report-note${source ? ' settlement-report-source' : ''}`; note.textContent = value; section.append(note);
      }
      container.append(section);
    });
    $('#print-help').textContent = '내용을 확인한 뒤 인쇄하거나 인쇄 창에서 PDF로 저장하세요.';
    $('#print-report').disabled = false;
  }
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== window.parent || event.data?.type !== 'taxflow:settlement-report' || !token || event.data.token !== token) return;
    const data = event.data.data;
    if (!data || !Array.isArray(data.transactions) || data.transactions.length !== 2) return;
    try {
      render(data);
      window.clearTimeout(timeout);
    } catch (error) {
      window.clearTimeout(timeout);
      $('#print-help').textContent = '정산 확인 내용을 표시하지 못했습니다. 창을 닫고 다시 열어 주세요.';
    }
  });
  $('#print-report').addEventListener('click', () => window.print());
  if (token && window.parent !== window) window.parent.postMessage({type:'taxflow:settlement-report-ready', token}, location.origin);
})();
