'use strict';

// NTS: 7709 (flow), 7710 (holding deduction), 7711 (rates), 8799 (high-value home).
// Single disposal, actual purchase cost, resident individual, transfers from 2021.
// Eligibility decisions belong to the reviewing tax professional; never infer exemption.
const capitalGains = (() => {
  const defaults = {asset:'auto', treatment:'pending', rate:'pending', deduction:'auto', amountBasis:'', shareNumerator:'', shareDenominator:'', wholePrice:'', basic:'', incomeRelief:'0', credit:'0', taxRelief:'0', notes:''};
  const money = raw => {
    const s = String(raw ?? '').trim();
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(s)) return null;
    const n = Number(s.replaceAll(',', ''));
    return Number.isSafeInteger(n) && n <= 100000000000000 ? n : null;
  };
  const date = raw => {
    const s = String(raw ?? '').trim();
    const m = s.match(/^(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})\.?$/) || s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!m) return null;
    const [y, mo, d] = m.slice(1).map(Number), value = new Date(Date.UTC(y, mo - 1, d));
    return y >= 1900 && value.getUTCFullYear() === y && value.getUTCMonth() === mo - 1 && value.getUTCDate() === d ? value : null;
  };
  const iso = d => d.toISOString().slice(0,10);
  function years(start, end) {
    let n = end.getUTCFullYear() - start.getUTCFullYear();
    const y = start.getUTCFullYear() + n, m = start.getUTCMonth();
    const anniversary = new Date(Date.UTC(y, m, Math.min(start.getUTCDate(), new Date(Date.UTC(y, m + 1, 0)).getUTCDate())));
    if (anniversary > end) n--;
    return Math.max(0, n);
  }
  // Integer rational arithmetic avoids floating-point errors at won boundaries.
  const ratio = (value, numerator, denominator) => Number(BigInt(value) * BigInt(numerator) / BigInt(denominator));
  function progressive(base, year) {
    const modern = year >= 2023;
    const brackets = modern ? [14000000,50000000,88000000,150000000,300000000,500000000,1000000000,Infinity] : [12000000,46000000,88000000,150000000,300000000,500000000,1000000000,Infinity];
    const rates = [6,15,24,35,38,40,42,45];
    const offsets = modern ? [0,1260000,5760000,15440000,19940000,25940000,35940000,65940000] : [0,1080000,5220000,14900000,19400000,25400000,35400000,65400000];
    const i = brackets.findIndex(limit => base <= limit);
    return {rate:rates[i], offset:offsets[i], tax:Math.max(0, ratio(base,rates[i],100)-offsets[i])};
  }
  function calculate(data, review = {}) {
    const o = {...defaults, ...review}, errors = [], warnings = [];
    const result = {errors, warnings, options:o};
    const choice = (key, allowed) => { if (!allowed.includes(o[key])) errors.push('저장된 세무 검토 선택값을 다시 확인하세요.'); };
    choice('asset',['auto','home','building','land']); choice('treatment',['pending','taxable','oneHome']);
    choice('rate',['pending','general','heavy2','heavy3','nonbusiness','unregistered']);
    choice('deduction',['auto','general','oneHome','none']);
    const readMoney = (raw,label) => { const n=money(raw); if (n === null) errors.push(`${label}을 원 단위의 0 이상 정수로 입력하세요.`); return n; };
    const sale=readMoney(data.transferPrice,'사실확인서의 양도가액'), purchase=readMoney(data.acquisitionPrice,'사실확인서의 취득가액');
    if (sale === 0 || purchase === 0) errors.push('취득가액과 양도가액은 0원보다 커야 합니다.');
    let expense;
    if (data.expensePresence === '없음') {
      expense=0;
      if (money(data.expenses)>0) warnings.push('관련 비용이 “없음”이므로 보존된 필요경비 금액은 계산에서 제외했습니다.');
    } else expense=readMoney(data.expenses,'사실확인서의 필요경비 합계 (없으면 0)');
    try {
      const items=JSON.parse(data.expenseItemsJson || '[]');
      if (!Array.isArray(items)) throw Error();
      if (data.expensePresence !== '없음' && items.length) {
        if (items.some(row => !row || money(row.amount) === null)) errors.push('필요경비 명세에 금액이 빠진 항목이 있습니다.');
        else if (items.reduce((sum,row) => sum+money(row.amount),0) !== expense) errors.push('필요경비 명세 합계와 사실확인서 합계가 다릅니다.');
        if (items.some(row => row?.evidence !== '있음')) warnings.push('필요경비 명세 중 증빙이 확인되지 않은 항목이 있습니다.');
      }
    } catch (_) { errors.push('필요경비 명세를 읽을 수 없습니다. 사실확인서를 확인하세요.'); }
    const effective = (prefix,label) => {
      const balanceRaw=data[prefix+'BalanceDate'], registrationRaw=data[prefix+'RegistrationDate'];
      const balance=date(balanceRaw), registration=date(registrationRaw);
      if ((balanceRaw && !balance) || (registrationRaw && !registration)) errors.push(`${label} 잔금일·등기접수일의 날짜 형식을 확인하세요.`);
      if (!balance && !registration) { errors.push(`사실확인서의 ${label} 잔금일 또는 등기접수일이 필요합니다.`); return null; }
      if (!balance || !registration) warnings.push(`${label}일은 입력된 ${balance ? '잔금일' : '등기접수일'} 기준입니다.`);
      return !balance ? registration : !registration ? balance : balance < registration ? balance : registration;
    };
    const start=effective('acquisition','취득'), end=effective('transfer','양도');
    if (start && end && end < start) errors.push('양도일이 취득일보다 빠릅니다.');
    if (end && end < date('2021-01-01')) errors.push('2021년 이전 양도분은 이 계산표의 지원 범위 밖입니다.');
    if (data.acquisitionMethod !== '매매') errors.push('매매 취득의 실지거래가액 계산을 지원합니다. 상속·증여·환산취득가액 등은 별도 세무 계산이 필요합니다.');
    if (data.resident !== '예') errors.push('국내 거주자 여부를 확인하세요. 비거주자 계산은 별도 검토가 필요합니다.');
    const asset=o.asset === 'auto' ? (['아파트','단독·다가구','다세대·연립'].includes(data.propertyType) ? 'home' : '') : o.asset;
    if (!asset) errors.push('과세 자산 구분을 선택하세요. 겸용주택·권리 등은 별도 안분 검토가 필요합니다.');
    const unregistered=o.rate === 'unregistered', heavy=['heavy2','heavy3'].includes(o.rate);
    if (heavy && asset !== 'home') errors.push('다주택 중과는 주택에만 적용할 수 있습니다.');
    if (o.rate === 'nonbusiness' && asset !== 'land') errors.push('비사업용 토지 세율은 토지에만 적용할 수 있습니다.');
    if (o.treatment === 'oneHome' && (asset !== 'home' || heavy || unregistered)) errors.push('1세대 1주택 비과세 요건 충족 선택과 자산·세율 선택이 서로 맞지 않습니다.');
    if (o.treatment === 'pending') warnings.push('비과세 판단 전: 전체 양도차익을 과세하는 가계산입니다.');
    if (o.rate === 'pending') warnings.push('중과 판단 전: 일반 세율을 가정합니다. 조정대상지역·주택 수·중과 유예 및 경과규정을 확인하세요.');
    if (data.transferStatus !== '양도 완료') warnings.push('예정 또는 미확인 양도입니다. 실제 양도일과 해당 시점의 법령을 다시 확인하세요.');
    if (data.otherHomes !== '없음' || data.otherRights !== '없음') warnings.push('다른 주택·권리 보유 여부와 1세대 1주택 특례·중과 적용 여부를 검토하세요.');
    if (o.treatment === 'oneHome') warnings.push('비과세 요건 충족은 세무사 선택값입니다. 보유·거주요건, 부수토지 범위 및 특례를 확인하세요.');
    let numerator=1, denominator=1, wholePrice=sale;
    if (data.ownership === '공동 소유') {
      numerator=readMoney(o.shareNumerator,'신고자 지분 분자'); denominator=readMoney(o.shareDenominator,'신고자 지분 분모');
      if (!numerator || !denominator || numerator>denominator) errors.push('신고자 지분은 0 초과 1 이하의 분수여야 합니다.');
      if (!['whole','personal'].includes(o.amountBasis)) errors.push('사실확인서 금액이 전체 금액인지 신고자 지분 금액인지 선택하세요.');
      if (o.amountBasis === 'personal' && o.treatment === 'oneHome') {
        wholePrice=readMoney(o.wholePrice,'고가주택 판정용 주택 전체 양도가액');
        if (wholePrice !== null && sale !== null && wholePrice < sale) errors.push('주택 전체 양도가액은 신고자 양도가액보다 작을 수 없습니다.');
        if (wholePrice && numerator && denominator && Math.abs(ratio(wholePrice,numerator,denominator)-sale)>1) warnings.push('주택 전체 양도가액 × 지분과 신고자 양도가액이 다릅니다. 지분별 거래가액을 검토하세요.');
      }
    } else if (data.ownership !== '단독 소유') errors.push('사실확인서의 소유 형태를 확인하세요.');
    let basic;
    if (unregistered) basic=0;
    else if (String(o.basic).trim()) basic=readMoney(o.basic,'연간 기본공제 잔액');
    else if (data.otherTransfers === '없음') basic=2500000;
    else errors.push('같은 해 다른 양도 여부를 확인하고 적용할 연간 기본공제 잔액을 입력하세요.');
    if (basic>2500000) errors.push('연간 기본공제 잔액은 250만 원 이하여야 합니다.');
    if (data.otherTransfers !== '없음') warnings.push('이 자산 1건의 계산입니다. 다른 양도와의 손익통산·누진세액 합산 및 기납부세액 정산은 포함하지 않습니다.');
    const incomeRelief=readMoney(o.incomeRelief,'감면대상소득금액'), credit=readMoney(o.credit,'세액공제'), taxRelief=readMoney(o.taxRelief,'감면세액');
    const holdingYears=start && end ? years(start,end) : null;
    let residenceYears=0, residenceKnown=data.livedThere === '아니요';
    if (data.livedThere === '예') {
      const from=date(data.moveInDate), to=date(data.moveOutDate);
      if (from && to && from <= to && start && end) {
        const clippedStart=from<start ? start : from, clippedEnd=to>end ? end : to;
        residenceYears=clippedStart <= clippedEnd ? years(clippedStart,clippedEnd) : 0;
        residenceKnown=true;
        if (from<start || to>end) warnings.push('거주기간은 보유기간과 겹치는 구간으로 제한했습니다.');
      } else warnings.push('유효한 입주일·퇴거일이 없어 거주기간 공제 요건을 확인할 수 없습니다.');
    }
    if (data.livedThere === '예' && data.registrationMatch !== '예') warnings.push('실제 거주기간과 주민등록 이력의 일치 여부를 확인하세요.');
    let deductionMode=o.deduction;
    if (deductionMode === 'auto') deductionMode=unregistered || heavy ? 'none' : o.treatment === 'oneHome' && residenceKnown && residenceYears>=2 && holdingYears>=3 ? 'oneHome' : 'general';
    if ((heavy || unregistered) && deductionMode !== 'none') errors.push('미등기·다주택 중과 대상은 장기보유특별공제를 적용할 수 없습니다.');
    if (deductionMode === 'oneHome' && (o.treatment !== 'oneHome' || holdingYears<3 || !residenceKnown || residenceYears<2)) errors.push('1세대 1주택 특별공제는 비과세 요건 판단과 3년 이상 보유·2년 이상 거주 확인이 필요합니다.');
    if (o.treatment === 'oneHome' && !residenceKnown) warnings.push('거주기간이 확인되지 않아 자동 선택에서는 일반 장기보유특별공제만 가정합니다.');
    const deductionRate=deductionMode === 'none' ? 0 : deductionMode === 'oneHome' ? Math.min(holdingYears,10)*4+Math.min(residenceYears,10)*4 : holdingYears>=3 ? Math.min(holdingYears,15)*2 : 0;
    Object.assign(result,{asset, start:start && iso(start), end:end && iso(end), holdingYears, residenceYears:residenceKnown ? residenceYears : null, deductionMode, deductionRate, wholePrice});
    if (errors.length) return result;
    const prorate=value => data.ownership === '공동 소유' && o.amountBasis === 'whole' ? ratio(value,numerator,denominator) : value;
    const transfer=prorate(sale), acquisition=prorate(purchase), expenses=prorate(expense);
    const gain=transfer-acquisition-expenses;
    const threshold=end < date('2021-12-08') ? 900000000 : 1200000000;
    const highNumerator=o.treatment === 'oneHome' ? Math.max(0,wholePrice-threshold) : 1;
    const highDenominator=o.treatment === 'oneHome' ? wholePrice : 1;
    const taxableGain=ratio(Math.max(0,gain),highNumerator,highDenominator);
    // Apply the high-value ratio to the whole holding deduction, per the NTS formula.
    const deduction=Number(BigInt(Math.max(0,gain))*BigInt(deductionRate)*BigInt(highNumerator)/(100n*BigInt(highDenominator)));
    const income=Math.max(0,taxableGain-deduction);
    if (incomeRelief>income) errors.push('감면대상소득금액이 양도소득금액을 초과합니다.');
    const appliedBasic=Math.min(basic,Math.max(0,income-incomeRelief)), base=Math.max(0,income-incomeRelief-appliedBasic);
    const standard=progressive(base,end.getUTCFullYear());
    const surcharge=o.rate === 'heavy2' ? 20 : o.rate === 'heavy3' ? 30 : o.rate === 'nonbusiness' ? 10 : 0;
    let shortRate=0;
    if (holdingYears<2) shortRate=asset === 'home' ? end>=date('2021-06-01') ? (holdingYears<1 ? 70 : 60) : holdingYears<1 ? 40 : 0 : holdingYears<1 ? 50 : 40;
    if (heavy && end < date('2021-06-01')) errors.push('2021년 6월 이전 다주택 중과는 별도 세무 계산이 필요합니다.');
    if (heavy && holdingYears>=2 && end>=date('2022-05-10') && end<=date('2026-05-09')) errors.push('입력한 양도일은 국세청 안내상 2년 이상 보유 주택 중과 한시 배제 기간입니다. 일반·중과 배제를 선택하세요.');
    const progressiveTax=standard.tax+ratio(base,surcharge,100), shortTax=ratio(base,shortRate,100);
    const useFlat=unregistered || shortTax>progressiveTax;
    const appliedRate=unregistered ? 70 : useFlat ? shortRate : standard.rate+surcharge;
    const offset=useFlat ? 0 : standard.offset;
    const assessed=unregistered ? ratio(base,70,100) : Math.max(shortTax,progressiveTax);
    if (credit+taxRelief>assessed) errors.push('세액공제와 감면세액 합계가 산출세액을 초과합니다.');
    const netTax=Math.max(0,assessed-credit-taxRelief);
    Object.assign(result,{transfer,acquisition,expenses,gain,threshold,highNumerator,highDenominator,taxableGain,deduction,income,incomeRelief,basic:appliedBasic,base,appliedRate,offset,assessed,credit,taxRelief,netTax,shortRate,surcharge,progressiveTax,shortTax,rateYear:end.getUTCFullYear()>=2023 ? 2023 : 2021});
    return result;
  }
  return {defaults,money,date,years,progressive,calculate};
})();

if (typeof module !== 'undefined') module.exports = capitalGains;
