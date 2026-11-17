'use strict';
const filingModel = (() => {
  const calc = typeof capitalGains !== 'undefined' ? capitalGains : require('./capital-gains.js');
  const categories = [
    ['112','취득세',175.6,'acq'],['113','등록세',192.3,'acq'],['114','법무사 비용',208.9,'acq'],['115','취득 중개수수료',225.5,'acq'],['116','취득 기타 부대비용',242.1,'acq'],
    ['131','취득 시 변호사 비용',298.6,'acq'],['132','취득 시 기타 쟁송비',313,'acq'],['133','매수자 부담 양도소득세',332.4,'acq'],['134','취득 가산 기타',351.2,'acq'],
    ['260a','용도 변경·개량',419.3,'other'],['260b','엘리베이터·냉난방 설치',446,'other'],['260c','피난시설 설치',459.8,'other'],['260d','재해 원상복구',473.6,'other'],['261','개발·재건축부담금',494.9,'other'],['260e','자산가치 증가 수선비',516.2,'other'],['260f','자본적 지출 기타',530.5,'other'],
    ['271','취득 후 변호사 비용',558.7,'other'],['272','취득 후 기타 쟁송비',574,'other'],['281','수익자부담금',591.2,'other'],['280a','토지 장애 철거비',608.4,'other'],['280b','도로시설비',625,'other'],['280c','사방사업 비용',641.6,'other'],['280d','기타 비용',658.2,'other'],['290','양도 중개수수료 등',725.2,'other'],['291','채권 매각차손 등',748.3,'other']
  ];
  const metadata = [
    ['filingType','신고 구분','select',['예정신고','확정신고','수정신고','기한후신고']],['filingDate','신고일','date'],['taxpayerAddress','신고인 현재 주소'],['residentId','주민등록번호'],['phone','전화번호'],['email','전자우편주소'],['nationalityType','내·외국인','select',['내국인','외국인']],['country','거주지국'],['countryCode','거주지국 코드'],['nationality','국적'],['nationalityCode','국적 코드'],
    ['buyerName','양수인 성명'],['buyerId','양수인 주민등록번호'],['relationship','양도인과의 관계'],['rateCode','세율 구분 코드'],['assetCode','자산 종류·코드'],['propertyId','부동산 고유번호'],['deductionCode','장기보유특별공제 코드'],['office','관할 세무서'],['agentName','세무대리인 성명·상호'],['agentBusinessId','대리인 사업자등록번호'],['agentManagementId','대리인 관리번호'],['agentBirth','대리인 생년월일'],['agentPhone','대리인 전화번호'],['bank','환급 금융기관'],['account','환급 계좌번호']
  ];
  const adjustments = [['foreignCredit','외국납부세액공제'],['withholdingCredit','원천징수세액공제'],['pensionCredit','연금계좌세액공제'],['electronicCredit','전자신고세액공제'],['penaltyReturn','무·과소신고 가산세'],['penaltyLate','납부지연 가산세'],['penaltyOther','기장불성실 등 가산세'],['prepaid','기신고·결정·경정세액 및 조정공제'],['installment','분납·물납할 세액'],['ruralRelief','농특세: 소득세 감면세액'],['ruralRate','농특세: 세율 (%)'],['ruralAssessed','농특세: 산출세액'],['ruralPenalty','농특세: 수정신고가산세 등'],['ruralPrepaid','농특세: 기신고·결정·경정세액'],['ruralInstallment','농특세: 분납할 세액']];
  const parse = raw => { const o=JSON.parse(raw || '{}'); if (!o || Array.isArray(o) || typeof o !== 'object') throw Error('저장된 신고서 정보를 읽을 수 없습니다.'); return o; };
  const fingerprint = (row,index) => JSON.stringify([index,row.kind,row.description,row.amount]);
  // Keep all long descriptions by continuing them on another row/page.
  // One slot allows two lines; 18 slots fit within the A4 appendix body.
  function paginateExpenses(expenses) {
    const pages=[];let page=[],used=0;
    for(const expense of expenses){
      const limits={description:180,counterparty:60,businessId:40,paymentDate:20,evidenceCode:40};
      const parts=Object.fromEntries(Object.entries(limits).map(([key,limit])=>{const chars=Array.from(String(expense[key] || ''));return [key,Array.from({length:Math.max(1,Math.ceil(chars.length/limit))},(_,i)=>chars.slice(i*limit,(i+1)*limit).join(''))];}));
      const count=Math.max(...Object.values(parts).map(p=>p.length));
      for(let i=0;i<count;i++){
        const row={...expense,amount:i===0?expense.amount:0,continuation:i>0};
        for(const key of Object.keys(limits))row[key]=parts[key][i] || '';
        const lines=Math.max(1+Math.ceil(row.description.length/16),Math.ceil(row.counterparty.length/13)+Math.ceil(row.businessId.length/13),Math.ceil(row.paymentDate.length/8),Math.ceil(row.evidenceCode.length/7),2);
        const slots=Math.ceil(lines/2);
        if(page.length && used+slots>18){pages.push(page);page=[];used=0;}
        page.push(row);used+=slots;
      }
    }
    if(page.length)pages.push(page);return pages;
  }
  function build(data) {
    const errors=[],warnings=[]; let saved={},review={};
    try { saved=parse(data.filingDraftJson); if (saved.version && saved.version !== 1) throw Error('지원하지 않는 신고서 버전입니다.'); if (saved.fields && (Array.isArray(saved.fields) || typeof saved.fields !== 'object' || Object.values(saved.fields).some(v=>typeof v !== 'string'))) throw Error('신고서 입력값 형식을 확인하세요.'); if (saved.expenses && (Array.isArray(saved.expenses) || typeof saved.expenses !== 'object')) throw Error('비용 분류 형식을 확인하세요.'); } catch(e) { errors.push(e.message); }
    try { review=parse(data.capitalGainsReviewJson); } catch(e) { errors.push('세무 검토내용을 읽을 수 없습니다.'); }
    const r=calc.calculate(data,review), fields={filingType:'예정신고',taxpayerAddress:data.taxpayerAddress || '',phone:data.phoneNumber || '',buyerName:data.buyerName || '',buyerId:data.buyerId || '',relationship:data.buyerRelationship || '', ...saved.fields};
    errors.push(...r.errors);warnings.push(...r.warnings);
    for (const [key, source, label] of [['buyerName','buyerName','양수인 성명'],['buyerId','buyerId','양수인 주민등록번호'],['relationship','buyerRelationship','양도인과의 관계']]) {
      if (Object.hasOwn(saved.fields || {}, key) && data[source] && String(saved.fields[key]).trim() !== String(data[source]).trim()) warnings.push(`${label}: 신고서에 별도로 저장한 값이 사실확인서와 다릅니다. 확인 후 사실확인서 값으로 되돌릴 수 있습니다.`);
    }
    if (r.options.treatment==='pending' || r.options.rate==='pending') warnings.push('양도소득세 검토 탭에서 비과세·세율 판단을 확정하세요.');
    for (const [k,label] of metadata.filter(([k])=>['filingDate','taxpayerAddress','buyerName','rateCode','assetCode','office'].includes(k))) if (!fields[k]) warnings.push(`${label} 미입력`);
    if (fields.filingDate && !calc.date(fields.filingDate)) errors.push('신고일을 올바르게 입력하세요.');
    if (data.otherTransfers !== '없음') errors.push('이 신고서는 자산 1건 기준입니다. 같은 해 다른 양도 여부를 확인하세요. 다른 양도가 있으면 합산 신고서를 별도로 작성해야 합니다.');
    if (fields.filingType !== '예정신고') warnings.push('확정·수정·기한후 신고의 합산 및 가산세는 별도 검토가 필요합니다.');
    const a={};
    for (const [key,label] of adjustments) { a[key]=calc.money(fields[key] || '0'); if(a[key]===null) errors.push(`${label}: 0 이상의 원 단위 정수를 입력하세요.`); }
    if (a.ruralRate>100) errors.push('농어촌특별세 세율은 100% 이하여야 합니다.');
    const credit=a.foreignCredit+a.withholdingCredit+a.pensionCredit+a.electronicCredit;
    if (r.credit != null && credit !== r.credit) errors.push('신고서 세액공제 4개 항목 합계가 양도소득세 검토의 세액공제와 다릅니다.');
    let rows=[];
    try { rows=JSON.parse(data.expenseItemsJson || '[]'); if (!Array.isArray(rows) || rows.some(row=>!row || typeof row!=='object' || Array.isArray(row))) throw Error(); } catch(e) { errors.push('필요경비 명세를 읽을 수 없습니다.');rows=[]; }
    if(data.expensePresence==='없음') rows=[];
    if(!rows.length && r.expenses>0) rows=[{kind:'기타',description:'사실확인서 필요경비 합계',amount:String(r.expenses),personal:true}];
    const totals=Object.fromEntries(categories.map(c=>[c[0],0]));
    const expenses=rows.map((row,index)=>{
      const key=fingerprint(row,index), custom=saved.expenses?.[key] || {}, category=categories.find(c=>c[0]===custom.code);
      let amount=calc.money(row.amount); if(amount==null) errors.push(`비용 ${index+1} 금액 확인 필요`);
      if(amount!=null && !row.personal && data.ownership==='공동 소유' && r.options.amountBasis==='whole' && Number(r.options.shareDenominator)>0) amount=Number(BigInt(amount)*BigInt(r.options.shareNumerator)/BigInt(r.options.shareDenominator));
      if(!category && amount>0) errors.push(`비용 ${index+1}의 신고서 구분을 선택하세요.`);
      if(category) totals[category[0]]+=amount || 0;
      return {...row,...custom,key,amount,category:category?.[1] || '미분류'};
    });
    if(r.expenses!=null && expenses.reduce((s,v)=>s+(v.amount || 0),0)!==r.expenses) errors.push('신고자 지분 기준 비용 명세 합계가 계산상 필요경비와 다릅니다. 원 단위 안분을 확인하세요.');
    const sum=keys=>keys.reduce((s,k)=>s+totals[k],0), acqCosts=sum(categories.filter(c=>c[3]==='acq').map(c=>c[0]));
    const penalty=a.penaltyReturn+a.penaltyLate+a.penaltyOther, due=(r.assessed || 0)-(r.taxRelief || 0)-credit+penalty-a.prepaid;
    if(a.installment>Math.max(0,due)) errors.push('분납할 세액이 납부할 세액보다 큽니다.');
    const ruralDue=a.ruralAssessed+a.ruralPenalty-a.ruralPrepaid;
    if(a.ruralInstallment>Math.max(0,ruralDue)) errors.push('농특세 분납할 세액이 납부할 세액보다 큽니다.');
    if(r.taxRelief>0 && !fields.ruralAssessed) warnings.push('감면세액에 대한 농어촌특별세 적용 여부를 확인하세요.');
    const values={...fields,...a,taxpayerName:data.taxpayerName || '',year:r.end?.slice(0,4) || '',address:data.address || '',share:data.ownership==='단독 소유'?'1/1':`${r.options.shareNumerator || '?'}/${r.options.shareDenominator || '?'}`,resident:data.resident==='예'?'거주자':data.resident==='아니요'?'비거주자':'',income:r.income,priorIncome:0,incomeRelief:r.incomeRelief,basic:r.basic,base:r.base,rate:r.appliedRate==null?'':r.appliedRate+'%',assessed:r.assessed,taxRelief:r.taxRelief,penalty,due:Math.max(0,due),payable:Math.max(0,due)-a.installment,refund:Math.max(0,-due),ruralDue:Math.max(0,ruralDue),ruralPayable:Math.max(0,ruralDue)-a.ruralInstallment,ruralRefund:Math.max(0,-ruralDue),transfer:r.transfer,acquisition:r.acquisition==null?null:r.acquisition+acqCosts,expenses:r.expenses==null?null:r.expenses-acqCosts,gain:r.gain,exemptGain:r.gain==null?null:Math.max(0,r.gain)-r.taxableGain,taxableGain:r.taxableGain,deduction:r.deduction,transferDate:r.end?`${r.end.replaceAll('-','.')} (매매)`:'',acquisitionDate:r.start?`${r.start.replaceAll('-','.')} (${data.acquisitionMethod || ''})`:'',landArea:data.landArea || '',buildingArea:data.buildingArea || '',holding:r.holdingYears==null?'':`${r.holdingYears}년 이상 ${r.holdingYears+1}년 미만`,residence:r.residenceYears==null?'':`${r.residenceYears}년 이상 ${r.residenceYears+1}년 미만`,deductionResidence:r.deductionMode==='oneHome'&&r.residenceYears!=null?`${r.residenceYears}년 이상 ${r.residenceYears+1}년 미만`:'해당 없음',purchase:r.acquisition,acqSubtotal:(r.acquisition || 0)+sum(['112','113','114','115','116']),additionSubtotal:sum(['131','132','133','134']),capitalSubtotal:sum(['260a','260b','260c','260d','261','260e','260f']),otherSubtotal:sum(['281','280a','280b','280c','280d']),transferSubtotal:sum(['290','291']),zero:0};
    values.capitalTotal=values.capitalSubtotal+sum(['271','272'])+values.otherSubtotal;
    values.expenseTotal=values.capitalTotal+values.transferSubtotal;
    const date=fields.filingDate?.split('-') || [];[values.signYear,values.signMonth,values.signDay]=date;
    const appendixPages=paginateExpenses(expenses);
    return {data,fields,saved,r,values,expenses,appendixPages,totals,errors:[...new Set(errors)],warnings:[...new Set(warnings)],pageCount:3+appendixPages.length};
  }
  return {categories,metadata,adjustments,parse,fingerprint,paginateExpenses,build};
})();
if(typeof module!=='undefined') module.exports=filingModel;
