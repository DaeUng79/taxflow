'use strict';
const filingRender = (() => {
  const layout=[[],[],[]];
  const put=(p,key,x,y,w=60,h=12,align='center',font=7)=>layout[p-1].push({key,x,y,w,h,align,font});
  put(1,'year',200,99,17,9,'center',4.8);
  [['taxpayerName',180,136,51,13],['residentId',286,136,51,13],['email',180,149,51,20],['phone',286,149,51,20],['taxpayerAddress',180,170,157,23],['country',404,169,44,12],['countryCode',518,169,23,12],['nationality',404,181,44,12],['nationalityCode',518,181,23,12],['buyerName',122,204,56,13],['buyerId',179,204,59,13],['address',239,204,99,13],['share',339,204,58,13],['relationship',398,204,143,13],['rateCode',296,217,41,13]].forEach(a=>put(1,...a));
  const taxRows=[['income',249],['priorIncome',266.2],['incomeRelief',283.5],['basic',296.3],['base',314],['assessed',344.7],['taxRelief',357.5],['foreignCredit',370.2],['withholdingCredit',383],['pensionCredit',395.8],['electronicCredit',408.5],['penaltyReturn',421.4],['penaltyLate',434.2],['penaltyOther',446.9],['penalty',459.7],['prepaid',472.5],['due',490.2],['installment',508],['payable',520.9],['refund',533.7]];
  taxRows.forEach(([key,y])=>{put(1,key,181,y-5,49,10,'right',6.8);put(1,key,232,y-5,52,10,'right',6.8);put(1,key,287,y-5,49,10,'right',6.8);});
  put(1,'rate',287,327,49,10);
  ['ruralRelief','ruralRate','ruralAssessed','ruralPenalty','ruralPrepaid','ruralDue','ruralInstallment','ruralPayable','ruralRefund'].forEach((k,i)=>put(1,k,181,[559.5,572.5,585.2,598,615,632.1,646.1,664.3,682.7][i]-5,49,10,'right'));
  [['signYear',457,595,21,12],['signMonth',493,595,12,12],['signDay',518,595,12,12],['taxpayerName',416,608,63,13],['agentName',405,655,72,14],['office',338,674,24,17],['bank',281,657,55,16],['account',281,674,55,15],['agentName',198,778,120,13],['agentBusinessId',390,778,151,13],['agentManagementId',167,791,93,12],['agentBirth',321,791,70,12],['agentPhone',438,791,103,12]].forEach(a=>put(1,...a));
  [['rateCode',270,140,87,15],['country',269,156,30,35],['address',301,156,56,18],['propertyId',301,174,56,17],['assetCode',269,192,88,17],['transferDate',269,209,88,18],['acquisitionDate',269,227,88,18],['landWithShare',269,245,88,17],['buildingWithShare',269,262,88,18],['landTransferred',269,280,88,17],['buildingTransferred',269,298,88,18],['landTransferred',269,315,88,18],['buildingTransferred',269,333,88,17],['holding',269,350,88,19],['residence',269,369,88,19]].forEach(a=>put(2,...a));
  [['transfer',418],['acquisition',435.6],['zero',470.9],['expenses',488.5],['gain',506.1],['exemptGain',523.7],['taxableGain',541.4],['deduction',559.1],['income',594.3],['zero',611.9],['incomeRelief',632.3]].forEach(([k,y])=>{put(2,k,181,y-6,85,12,'right',8);put(2,k==='deduction'?'deductionWithCode':k,270,y-6,87,12,'right',8);});
  put(2,'actualPrice',269,448,88,12);put(2,'deductionResidence',269,570,88,15);put(2,'reliefType',269,645,88,17);put(2,'standardNote',180,685,177,14);
  put(3,'purchase',458,153,72,12,'right',8);
  filingModel.categories.forEach(([key,,y])=>put(3,'cost:'+key,458,y-6,72,12,'right',8));
  [['zero',271],['zero',284.8],['additionSubtotal',365],['zero',378.8],['acquisition',392.6],['capitalSubtotal',544.9],['otherSubtotal',674.8],['capitalTotal',708.1],['transferSubtotal',771],['expenseTotal',787.6],['acqSubtotal',257.2]].forEach(([k,y])=>put(3,k,458,y-6,72,12,'right',8));
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text=v=>typeof v==='number'?v.toLocaleString('ko-KR'):v??'';
  const financial=new Set([...taxRows.map(r=>r[0]),...filingModel.adjustments.map(r=>r[0]),'ruralDue','ruralPayable','ruralRefund','rate','transfer','acquisition','expenses','gain','exemptGain','taxableGain','deduction','deductionWithCode','income','purchase','acqSubtotal','additionSubtotal','capitalSubtotal','otherSubtotal','capitalTotal','transferSubtotal','expenseTotal','zero']);
  // Without expense classification, totals from the review remain usable, but the
  // acquisition/other-expense allocation and each category must stay blank.
  const classificationDependent = new Set(['acquisition','expenses','acqSubtotal','additionSubtotal','capitalSubtotal','otherSubtotal','capitalTotal','transferSubtotal','expenseTotal','zero']);
  function render(model) {
    const {values:v,data,r,errors,warnings}=model;
    const portion=raw=>{const n=Number(String(raw).replace(/㎡|m²|m2|,/g,'').trim()); return raw && Number.isFinite(n) && data.ownership==='공동 소유' && Number(r.options.shareDenominator)>0 ? (n*Number(r.options.shareNumerator)/Number(r.options.shareDenominator)).toLocaleString('ko-KR',{maximumFractionDigits:4})+'㎡':raw;};
    const values={...v,landWithShare:`${v.landArea} (${v.share})`,buildingWithShare:`${v.buildingArea} (${v.share})`,landTransferred:portion(v.landArea),buildingTransferred:portion(v.buildingArea),actualPrice:'실지거래가액',deductionWithCode:v.deduction==null?'':text(v.deduction)+(v.deductionCode?` (${v.deductionCode})`:''),reliefType:r.taxRelief || r.incomeRelief?'별도 검토':'없음 / 0%',standardNote:'실가 신고: 기준시가란 미작성'};
    const status=(/교육용|가상/.test(data.notes || '')?'교육용 가상자료 · 실제 신고 금지 · ':'')+(model.partialAmounts?'검토 금액 반영 · 비용 분류 필요':errors.length?'작성 중 · 금액 확인 필요':warnings.length?'검토용 · 확인사항 있음':'검토용 신고서');
    const header=(n)=>`<header class="filing-print-heading"><strong>${esc(status)}</strong><span>${esc(v.taxpayerName)} · ${n} / ${model.pageCount}쪽</span></header>`;
    const cell=(item,value)=>`<span class="filing-value is-${item.align}" title="${esc(value)}" style="left:${item.x/595*100}%;top:${item.y/841*100}%;width:${item.w/595*100}%;height:${item.h/841*100}%;--field-font:${item.font/595*100}cqw;text-align:${item.align}">${esc(value)}</span>`;
    const pages=layout.map((items,i)=>{
      let body=items.map(item=>cell(item,errors.length&&(financial.has(item.key)||item.key.startsWith('cost:'))&&(!model.partialAmounts||classificationDependent.has(item.key)||item.key.startsWith('cost:'))?'':text(item.key.startsWith('cost:')?model.totals[item.key.slice(5)]:values[item.key]))).join('');
      if(i===0){
        const x={예정신고:257.5,확정신고:318,수정신고:379,기한후신고:439}[v.filingType];if(x)body+=cell({x,y:116.7,w:5,h:8,align:'center',font:5},'✓');
        if(v.nationalityType)body+=cell({x:v.nationalityType==='내국인'?410:465,y:138,w:6,h:9,align:'center',font:6},'✓');
        if(v.resident)body+=cell({x:v.resident==='거주자'?410:465,y:154.7,w:6,h:9,align:'center',font:6},'✓');
      }
      return `<article class="filing-sheet" aria-label="${['양도소득 과세표준신고 및 납부계산서','양도소득금액계산명세서','취득가액 및 필요경비 계산 상세명세서'][i]}"><img class="filing-template" src="filing/form-${i+1}.png" alt="${['별지 제84호서식','부표 1','부표 3'][i]} 빈 서식">${header(i+1)}${body}<footer class="filing-print-footer">첨부 R08 서식 기준 · ${model.partialAmounts?'검토 금액 반영 · 비용 구분 확인 전 취득·필요경비 명세 미표시':errors.length?'입력 오류로 계산금액 미표시': '입력 내용 및 세무 검토 결과 반영'}${i===2&&model.expenses.length?' · 거래상대방·지급일·증빙 세부 내역은 별지 참조':''}</footer></article>`;
    });
    for(const [i,rows] of model.appendixPages.entries()){
      pages.push(`<article class="filing-sheet filing-appendix">${header(4+i)}<div class="filing-appendix-content"><p>취득가액 및 필요경비 상세명세서 첨부</p><h1>필요경비 세부 내역</h1><p>신고자 지분 기준 · 단위: 원</p><table><thead><tr><th>구분·내용</th><th>거래상대방 / 사업자번호</th><th>지급일</th><th>지급금액</th><th>증빙 종류·코드</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${esc(row.code || '미분류')} · ${esc(row.category)}<br>${esc(row.description)}</td><td>${esc(row.counterparty)}<br>${esc(row.businessId)}</td><td>${esc(row.paymentDate)}</td><td>${row.continuation?'계속':esc(text(row.amount))}</td><td>${esc(row.evidenceCode)}</td></tr>`).join('')}</tbody></table><p class="filing-appendix-total">이 쪽 합계 ${text(rows.reduce((s,x)=>s+(x.amount || 0),0))}원 / 전체 ${text(model.expenses.reduce((s,x)=>s+(x.amount || 0),0))}원</p></div></article>`);
    }
    return pages.join('');
  }
  return {render,esc};
})();
