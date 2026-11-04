(() => {
  'use strict';
  const params = new URLSearchParams(window.location.search);
  const recordId = params.get('id');
  const help = document.querySelector('#print-help');
  const printButton = document.querySelector('#print-report');
  const sections = document.querySelector('#report-sections');
  const sheet = document.querySelector('#sheet');
  const content = document.querySelector('#report-content');
  const definitions = [
    ['1. 납세자와 대상 주택', [
      ['생년월일','birthDate'],['국내 거주자','resident'],['소유 형태','ownership'],['주택 종류','propertyType'],
      ['주택 주소','address',true],['상세 주소','addressDetail',true]
    ]],
    ['2. 취득 및 양도', [
      ['취득 방법','acquisitionMethod'],['취득가액','acquisitionPrice',false,'money'],
      ['취득 계약일','acquisitionContractDate'],['취득 잔금일','acquisitionBalanceDate'],
      ['취득 등기접수일','acquisitionRegistrationDate'],['진행 상태','transferStatus'],
      ['양도 계약일','transferContractDate'],['양도 잔금일','transferBalanceDate'],
      ['양도 등기접수일','transferRegistrationDate'],['양도가액','transferPrice',false,'money']
    ]],
    ['3. 실제 거주와 세대 현황', [
      ['실제 거주','livedThere'],['입주일','moveInDate'],['퇴거일','moveOutDate'],['주민등록 이력 일치','registrationMatch'],
      ['현재 거주 형태','currentHousing'],['전출 후 주택 사용','propertyAfterMove'],
      ['세대 구성','household'],['다른 주택·지분','otherHomes'],['입주권·분양권','otherRights'],
      ['추가 거주 이력','residenceDetails',true],['보유 현황 상세','householdDetails',true]
    ]],
    ['4. 비용과 다른 양도', [
      ['필요경비','expenses',false,'money'],['같은 해 다른 양도','otherTransfers'],['비용·양도 상세','expenseDetails',true]
    ]],
    ['5. 수집 자료와 후속 확인', [
      ['취득계약서','acquisitionDocument'],['양도계약서','transferDocument'],
      ['주민등록초본','residentDocument'],['대금자료','paymentDocument'],
      ['세무사 전달 내용','notes',true]
    ]]
  ];
  const valueText = (data, key, format) => {
    const value = String(data[key] || '').trim();
    if (!value) return '미입력';
    if (format === 'money' && /^\d+$/.test(value.replace(/,/g, ''))) return `${Number(value.replace(/,/g, '')).toLocaleString('ko-KR')}원`;
    return value;
  };
  const excerpt = (value, limit) => {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length <= limit) return normalized;
    document.querySelector('#report-overflow').hidden = false;
    return `${normalized.slice(0, limit).trimEnd()}… (원본 확인)`;
  };
  function fitPage() {
    content.style.transform = '';
    const style = getComputedStyle(sheet);
    const room = sheet.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const scale = Math.min(1, room / content.scrollHeight);
    if (scale < 1) content.style.transform = `scale(${scale})`;
  }
  function render(data) {
    document.querySelector('#report-name').textContent = data.taxpayerName || '성명 미입력';
    document.querySelector('#report-number').textContent = `접수번호 ${recordId}`;
    document.querySelector('#report-date').textContent = `상담일 ${data.consultedAt || '미입력'}`;
    document.querySelector('#report-printed').textContent = `출력 ${new Date().toLocaleString('ko-KR')}`;
    document.title = `${data.taxpayerName || '납세자'}_상담보고서_${recordId} · TAXFLOW`;
    for (const [title, fields] of definitions) {
      const section = document.createElement('section'); section.className = 'report-section';
      const heading = document.createElement('h2'); heading.textContent = title;
      const grid = document.createElement('dl'); grid.className = 'report-grid';
      for (const [label, key, full, format] of fields) {
        const field = document.createElement('div'); field.className = `report-field${full ? ' full' : ''}`;
        const dt = document.createElement('dt'); dt.textContent = label;
        const dd = document.createElement('dd');
        const raw = valueText(data, key, format);
        dd.textContent = raw === '미입력' ? raw : excerpt(raw, full ? 110 : 70);
        if (raw === '미입력') dd.className = 'empty';
        field.append(dt, dd); grid.append(field);
      }
      section.append(heading, grid); sections.append(section);
    }
    help.textContent = 'A4 한 장으로 인쇄하거나, 인쇄 창에서 ‘PDF로 저장’을 선택하세요.';
    printButton.disabled = false;
    requestAnimationFrame(fitPage);
    if (document.fonts) document.fonts.ready.then(fitPage);
  }
  printButton.addEventListener('click', () => window.print());
  window.addEventListener('beforeprint', fitPage);
  if (!/^\d+$/.test(recordId || '')) { help.textContent = '올바른 상담 접수번호가 없습니다.'; return; }
  fetch(`/api/consultations/${recordId}`)
    .then(response => { if (!response.ok) throw new Error('상담 기록을 불러오지 못했습니다.'); return response.json(); })
    .then(result => render(result.data))
    .catch(error => { help.textContent = error.message; document.querySelector('#report-name').textContent = '상담 기록 없음'; });
})();
