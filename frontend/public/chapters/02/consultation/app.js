(() => {
  'use strict';
  const form = document.querySelector('#consultation-form');
  const list = document.querySelector('#summary-list');
  const followUp = document.querySelector('#summary-followup');
  const fields = [
    ['사건 ID', 'caseId'], ['상담일', 'consultedAt'], ['자산 유형', 'assetType'],
    ['거래 상태', 'transactionStatus'], ['취득일 진술', 'acquiredAt'],
    ['양도일 진술', 'transferredAt'], ['세대·주택 진술', 'householdStatement'],
    ['거주 진술', 'residenceStatement']
  ];
  const value = name => form.elements[name].value.trim() || '미입력';
  function render() {
    list.replaceChildren();
    for (const [label, name] of fields) {
      const row = document.createElement('div');
      const term = document.createElement('dt');
      const detail = document.createElement('dd');
      term.textContent = label;
      detail.textContent = value(name);
      row.append(term, detail);
      list.append(row);
    }
    const evidence = [...form.querySelectorAll('input[name="evidence"]:checked')].map(input => input.value);
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = '수취한 증빙';
    detail.textContent = evidence.length ? evidence.join(' · ') : '미입력';
    row.append(term, detail);
    list.append(row);
    followUp.textContent = value('followUp') === '미입력' ? '입력된 질문이 없습니다.' : value('followUp');
  }
  document.querySelector('#load-sample').addEventListener('click', () => {
    Object.entries({
      caseId: 'CASE-A', consultedAt: '2026-11-03', assetType: '주택',
      transactionStatus: '양도 예정', acquiredAt: '2020-07-15',
      transferredAt: '2026-12-15',
      householdStatement: '세대원 보유 주택 수를 상담에서 1주택으로 진술함. 객관 자료 확인 필요.',
      residenceStatement: '2020년 하반기부터 거주했다고 진술함. 초본 및 실제 입주 시점 대조 필요.',
      followUp: '취득·양도 대금일 확인, 세대원 보유 현황 및 실제 입주 시점 증빙 요청.'
    }).forEach(([name, text]) => { form.elements[name].value = text; });
    ['양도계약서', '취득계약서', '주민등록초본'].forEach(text => {
      form.querySelector(`input[name="evidence"][value="${text}"]`).checked = true;
    });
    render();
  });
  form.addEventListener('input', render);
  form.addEventListener('change', render);
  form.addEventListener('reset', () => requestAnimationFrame(render));
  render();
})();
