(() => {
  'use strict';
  const recordId = new URLSearchParams(window.location.search).get('id');
  const help = document.querySelector('#print-help');
  const printButton = document.querySelector('#print-report');
  const sections = document.querySelector('#report-sections');
  if (window.self !== window.top) document.querySelector('#back-to-consultation').hidden = true;

  const definitions = [
    ['납세자 정보', [
      ['신고자 성명','taxpayerName'], ['생년월일','birthDate'], ['연락처','phoneNumber'], ['국내 거주자 여부','resident'], ['납세자 주소','taxpayerAddress',true]
    ]],
    ['양도 주택 정보', [
      ['주택 주소','address',true], ['주택 종류','propertyType'], ['소유 형태','ownership'],
      ['토지 지목','landCategory'], ['토지 면적','landArea'], ['건물 용도','buildingUse'], ['건물 면적','buildingArea']
    ]],
    ['취득 정보', [
      ['취득 방법','acquisitionMethod'], ['취득가액','acquisitionPrice',false,'money'],
      ['취득 계약일','acquisitionContractDate'], ['취득 잔금일','acquisitionBalanceDate'],
      ['취득 등기접수일','acquisitionRegistrationDate',false,'optional'],
      ['조정대상지역','regulatedHistory',true]
    ]],
    ['양도 정보', [
      ['진행 상태','transferStatus'], ['양도가액','transferPrice',false,'money'],
      ['양도 계약일','transferContractDate'], ['양도 잔금일','transferBalanceDate'],
      ['양도 등기접수일','transferRegistrationDate',false,'optional'], ['양수인 성명','buyerName',false,'optional'], ['양수인 주민등록번호','buyerId',false,'optional'], ['양도인과의 관계','buyerRelationship',false,'optional'], ['보유기간','holdingPeriod',true]
    ]],
    ['실제 거주', [
      ['실제 거주 여부','livedThere'], ['주민등록 이력 일치','registrationMatch'], ['입주일','moveInDate'], ['퇴거일','moveOutDate'],
      ['실제 거주기간','residencePeriodReport',true], ['주민등록 이력 참고','residentHistory',true,'optional']
    ]],
    ['세대와 다른 주택', [
      ['세대 구성','household'], ['세대원의 다른 주택·지분','otherHomes'], ['세대원의 입주권·분양권','otherRights'],
      ['보유 현황 상세','householdDetails',true], ['1세대 1주택','householdReviewReport',true]
    ]],
    ['전출 후 거주', [
      ['현재 거주 형태','currentHousing'], ['전출 후 대상 주택 사용','propertyAfterMove']
    ]],
    ['비용과 다른 양도', [
      ['관련 비용 여부','expensePresence'], ['필요경비 합계','expenses',false,'money'],
      ['비용 명세','expenseItemsReport',true,'optional'], ['같은 해 다른 양도','otherTransfers'],
      ['다른 양도 자산','otherTransferItemsReport',true,'optional'], ['확인 사항','transferReviewReport',true,'optional']
    ]],
    ['참고사항', [
      ['준비사항','counselorPreparation',true]
    ]],
    ['신고서류 제출', [
      ['취득계약서','acquisitionDocument'], ['양도계약서','transferDocument'], ['주민등록초본','residentDocument']
    ]]
  ];
  const valueText = (data, key, format) => {
    let value = String(data[key] ?? '').trim();
    if (key === 'address') {
      const detail = String(data.addressDetail ?? '').trim();
      if (detail && !value.replace(/\s/g, '').includes(detail.replace(/\s/g, ''))) value = [value, detail].filter(Boolean).join(' ');
    }
    if (!value) return '미입력';
    if (['acquisitionDocument','transferDocument','residentDocument'].includes(key) && value === '받음') return '제출';
    if (format === 'money' && /^\d+$/.test(value.replace(/,/g, ''))) return `${Number(value.replace(/,/g, '')).toLocaleString('ko-KR')}원`;
    if (/Date$/.test(key) || ['acquisition_date','transfer_date'].includes(key)) return paymentUtils.formatDate(value) || value;
    return value;
  };
  function render(data) {
    document.querySelector('#report-date').textContent = `상담일 ${data.consultedAt || '미입력'}`;
    document.querySelector('#signature-name').textContent = data.taxpayerName || '________________';
    const printedAt = new Date(), pad = value => String(value).padStart(2, '0');
    document.querySelector('#report-printed').textContent = `출력일 ${printedAt.getFullYear()}-${pad(printedAt.getMonth()+1)}-${pad(printedAt.getDate())} ${pad(printedAt.getHours())}:${pad(printedAt.getMinutes())}:${pad(printedAt.getSeconds())}`;
    document.title = `${data.taxpayerName || '납세자'}_양도소득세 신고용 사실확인서_${recordId} · TAXFLOW`;
    for (const [index, [title, fields]] of definitions.entries()) {
      const section = document.createElement('section'); section.className = 'report-section';
      if (title === '전출 후 거주') section.className += ' report-section-relocation';
      const heading = document.createElement('h2'); heading.textContent = `${index + 1}. ${title}`;
      const columns = ['신고서류 제출','세대와 다른 주택'].includes(title) ? 3 : 2;
      const grid = document.createElement('dl'); grid.className = `report-grid${columns === 3 ? ' report-grid-three' : ''}`;
      let rowCount = 0;
      const completeRow = () => {
        while (rowCount) {
          const blank = document.createElement('div'); blank.className = 'report-field';
          blank.setAttribute('aria-hidden', 'true'); grid.append(blank); rowCount = (rowCount + 1) % columns;
        }
      };
      for (const [label, key, full, format] of fields) {
        if (format === 'optional' && !String(data[key] ?? '').trim()) continue;
        if (full) completeRow();
        const field = document.createElement('div'); field.className = `report-field field-${key}${full ? ' full' : ''}`;
        const dt = document.createElement('dt'); dt.textContent = label;
        const dd = document.createElement('dd'); dd.textContent = valueText(data, key, format);
        if (dd.textContent === '미입력' || dd.textContent === '확인 필요' || dd.textContent === '요청 예정') dd.className = 'pending';
        field.append(dt, dd); grid.append(field);
        if (!full) rowCount = (rowCount + 1) % columns;
      }
      completeRow();
      section.append(heading, grid); sections.append(section);
    }
    help.textContent = '내용을 확인한 뒤 인쇄하거나 인쇄 창에서 PDF로 저장하세요.';
    printButton.disabled = false;
  }
  printButton.addEventListener('click', () => window.print());
  if (!/^\d+$/.test(recordId || '')) { help.textContent = '올바른 상담 접수번호가 없습니다.'; return; }
  const get = async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error('자료를 불러오지 못했습니다.');
    return response.json();
  };
  Promise.allSettled([
    get(`/api/consultations/${recordId}`),
    get('/api/regulated-areas'),
    get(`/api/resident/result?consultation_id=${encodeURIComponent(recordId)}`)
  ]).then(([consultation, regulated, resident]) => {
    if (consultation.status !== 'fulfilled') throw new Error('상담 기록을 불러오지 못했습니다.');
    const data = {...consultation.value.data};
    data.holdingPeriod = residencePeriod(data.acquisitionBalanceDate, data.transferBalanceDate, paymentUtils.formatDate, {start:'취득 잔금일',end:'양도 잔금일',period:'보유기간'}).message.replace(' · ', ' (잔금일 기준) · ');
    data.residencePeriodReport = residencePeriod(data.moveInDate, data.moveOutDate, paymentUtils.formatDate).message;
    data.householdReviewReport = householdReview(data.otherHomes, data.otherRights);
    const money = value => /^\d+$/.test(String(value || '')) ? `${BigInt(value).toLocaleString('ko-KR')}원` : '미입력';
    const readList = value => { const rows = JSON.parse(value || '[]'); if (!Array.isArray(rows)) throw new Error(); return rows; };
    try {
      data.expenseItemsReport = readList(data.expenseItemsJson).map((row, index) =>
        `${index + 1}. ${row.kind || '종류 미입력'} · ${row.description || '내용 미입력'} · ${money(row.amount)} · 증빙 ${row.evidence || '미입력'}`).join('\n');
    } catch (_) { data.expenseItemsReport = '저장된 비용 명세를 읽지 못했습니다. 원본 확인 필요.'; }
    try {
      data.otherTransferItemsReport = readList(data.otherTransferItemsJson).map((row, index) => [
        `${index + 1}. ${row.kind || '종류 미입력'} · ${row.address || '주소·자산명 미입력'} · ${row.status || '양도 상태 미입력'}`,
        `양도일 ${row.transferDate || '미입력'} · 취득일 ${row.acquisitionDate || '미입력'}`,
        `양도가액 ${money(row.transferPrice)} · 취득가액 ${money(row.acquisitionPrice)} · 필요경비 ${money(row.expenses)}`,
        `비과세 검토 ${row.taxReview || '확인 필요'} · 신고 ${row.filing || '확인 필요'}${row.filing === '예정신고 완료' ? ` · 합산 신고 ${row.combined || '확인 필요'}` : ''}`,
        ...(row.memo ? [`메모: ${row.memo}`] : [])
      ].join('\n')).join('\n\n');
    } catch (_) { data.otherTransferItemsReport = '저장된 다른 자산 내역을 읽지 못했습니다. 원본 확인 필요.'; }
    try {
      const checks = JSON.parse(data.transferReviewChecksJson || '{}');
      const labels = [['dates','양도일과 순서'],['tax','과세·비과세 자료'],['filing','신고 및 합산 여부'],['loss','양도차손과 추가 비용']];
      if (data.transferReviewChecksJson && data.transferReviewChecksJson !== '{}') data.transferReviewReport = labels.map(([key,label]) => `${checks[key] ? '☑' : '□'} ${label}`).join('  ');
    } catch (_) { data.transferReviewReport = '저장된 확인 사항을 읽지 못했습니다.'; }
    const legacyFields = {'토지 지목':'landCategory','토지 면적':'landArea','건물 용도':'buildingUse','건물 면적':'buildingArea'};
    for (const line of [data.landDetails || '', data.buildingDetails || ''].join('\n').split('\n')) {
      const match = line.match(/^([^:]+):\s*(.*)$/);
      const key = match && legacyFields[match[1].trim()];
      if (key && !data[key]) data[key] = match[2];
    }
    if (regulated.status === 'fulfilled') {
      const result = matchRegulatedAddress(data.address, regulated.value.items);
      data.regulatedHistory = result.rows.length
        ? result.rows.map(row => `${row.region} · 지정 ${row.start_date} · 해제 ${row.end_date || 'DB에 기록 없음'}${row.review_required || row.needs_geometry || row.exclusions.length ? ' · 제외지역 확인 필요' : ''}`).join('\n')
        : result.error;
    } else data.regulatedHistory = '조회 자료를 불러오지 못했습니다. 원본 확인 필요.';
    if (resident.status === 'fulfilled' && resident.value.result?.reviewed_json) {
      try { data.residentHistory = residentComparison(JSON.parse(resident.value.result.reviewed_json), data).details; }
      catch (_) { data.residentHistory = '저장된 주민등록 이력을 불러오지 못했습니다.'; }
    } else if (resident.status === 'rejected') data.residentHistory = '주민등록 이력을 불러오지 못했습니다.';
    render(data);
  }).catch(error => { help.textContent = error.message; });
})();
