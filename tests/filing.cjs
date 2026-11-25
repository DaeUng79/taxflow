const {test}=require('node:test'),assert=require('node:assert/strict');
const model=require('../app/chapters/ch02_tax_housing/filing-model.js');
const caseB=require('../app/chapters/ch02_tax_housing/case-b.js');
const data=()=>({...caseB,capitalGainsReviewJson:JSON.stringify({treatment:'oneHome',rate:'general'}),filingDraftJson:JSON.stringify({version:1,fields:{filingDate:'2026-04-10',rateCode:'1-10',assetCode:'고가주택 (2)'},expenses:{}})});
test('R08 case B reconciles all three forms',()=>{const m=model.build(data());assert.deepEqual(m.errors,[]);assert.equal(m.pageCount,3);for(const [key,value] of Object.entries({transfer:1300000000,acquisition:650000000,taxableGain:50000000,deduction:4000000,income:46000000,base:43500000,assessed:5265000,payable:5265000,purchase:650000000,expenseTotal:0}))assert.equal(m.values[key],value,key);});
test('acquisition incidental expenses move to acquisition total without double counting',()=>{const d=data(),row={kind:'취득 관련',description:'취득세',amount:'10000000',evidence:'있음'};d.expensePresence='있음';d.expenses='10000000';d.expenseItemsJson=JSON.stringify([row]);const f=JSON.parse(d.filingDraftJson);f.expenses[model.fingerprint(row,0)]={code:'112'};d.filingDraftJson=JSON.stringify(f);const m=model.build(d);assert.deepEqual(m.errors,[]);assert.equal(m.values.acquisition,660000000);assert.equal(m.values.expenses,0);assert.equal(m.values.gain,640000000);assert.equal(m.values.acqSubtotal,m.values.acquisition);assert.equal(m.pageCount,4);});
test('expense category stays unassigned after source amount changes',()=>{const d=data(),row={description:'수수료',amount:'1000000',evidence:'있음'};d.expensePresence='있음';d.expenses='2000000';d.expenseItemsJson=JSON.stringify([{...row,amount:'2000000'}]);d.filingDraftJson=JSON.stringify({version:1,expenses:{[model.fingerprint(row,0)]:{code:'290'}}});assert.ok(model.build(d).errors.some(s=>s.includes('구분을 선택')));});
test('credit allocation and installment validation prevent inconsistent returns',()=>{let d=data();d.capitalGainsReviewJson=JSON.stringify({treatment:'oneHome',rate:'general',credit:'20000'});assert.ok(model.build(d).errors.some(s=>s.includes('세액공제')));d.filingDraftJson=JSON.stringify({fields:{electronicCredit:'20000',installment:'6000000'}});assert.ok(model.build(d).errors.some(s=>s.includes('분납')));d.filingDraftJson=JSON.stringify({fields:{electronicCredit:'20000',installment:'1000000'}});const m=model.build(d);assert.deepEqual(m.errors,[]);assert.equal(m.values.payable,4245000);});
test('malformed saved data and incomplete facts never become a ready return',()=>{assert.ok(model.build({}).errors.length);assert.ok(model.build({...data(),filingDraftJson:'{bad'}).errors.length);assert.ok(model.build({...data(),filingDraftJson:'{"fields":{"phone":3}}'}).errors.length);});
test('appendix page count grows by 18 expense lines',()=>{const d=data();d.expensePresence='있음';d.expenses='19000';d.expenseItemsJson=JSON.stringify(Array.from({length:19},(_,i)=>({description:`비용 ${i}`,amount:'1000',evidence:'있음'})));assert.equal(model.build(d).pageCount,5);});

test('consultation phone/address follow source changes unless explicitly overridden',()=>{const d=data();d.phoneNumber='010-0000-0000';d.taxpayerAddress='서울시';assert.equal(model.build(d).values.phone,d.phoneNumber);assert.equal(model.build(d).values.taxpayerAddress,d.taxpayerAddress);d.filingDraftJson=JSON.stringify({fields:{phone:'010-1111-1111'}});assert.equal(model.build(d).values.phone,'010-1111-1111');});
test('corrupt expense rows remain recoverable and multi-disposal returns are not fabricated',()=>{assert.ok(model.build({...data(),expenseItemsJson:'[null]'}).errors.length);assert.ok(model.build({...data(),otherTransfers:'있음'}).errors.length);});

test('long expense descriptions continue without truncation and preserve amounts',()=>{const description='긴 비용 명세 '.repeat(200);const pages=model.paginateExpenses([{description,amount:12345}]);assert.ok(pages.length>1);assert.equal(pages.flat().map(r=>r.description).join(''),description);assert.equal(pages.flat().reduce((s,r)=>s+r.amount,0),12345);});

test('buyer information follows consultation, while saved overrides remain visible and recoverable',()=>{
  const d={...data(),buyerName:'김매수',buyerId:'800101-*******',buyerRelationship:'타인'};
  let m=model.build(d);
  assert.equal(m.values.buyerName,'김매수');assert.equal(m.values.buyerId,'800101-*******');assert.equal(m.values.relationship,'타인');
  d.buyerName='이매수';assert.equal(model.build(d).values.buyerName,'이매수');
  d.filingDraftJson=JSON.stringify({fields:{buyerName:'직접 입력',buyerId:'',relationship:'가족'}});
  m=model.build(d);assert.equal(m.values.buyerName,'직접 입력');assert.equal(m.values.buyerId,'');assert.equal(m.values.relationship,'가족');
  assert.equal(m.warnings.filter(w=>w.includes('사실확인서와 다릅니다')).length,3);
  d.filingDraftJson=JSON.stringify({fields:{}});assert.equal(model.build(d).values.buyerName,'이매수');
  assert.equal(model.build({...data()}).values.buyerName,'');
});

test('saved taxpayer identity and residence flow to return with explicit override preserved',()=>{
  const d={...data(),taxpayerId:'900101-1234567',resident:'예'};
  let m=model.build(d);
  assert.equal(m.fields.residentId,'900101-1234567');
  assert.equal(m.values.residentId,'900101-1234567');
  assert.equal(m.values.resident,'거주자');
  assert.equal(model.build({...d,resident:'아니요'}).values.resident,'비거주자');
  assert.equal(model.build({...d,resident:'확인 필요'}).values.resident,'');
  assert.ok(model.build({...d,resident:'확인 필요'}).warnings.some(s=>s.includes('국내 거주자 여부')));
  d.filingDraftJson=JSON.stringify({fields:{residentId:'수동 확인값'}});
  m=model.build(d);assert.equal(m.values.residentId,'수동 확인값');
  assert.ok(m.warnings.some(s=>s.includes('신고자 주민등록번호') && s.includes('다릅니다')));
  d.filingDraftJson=JSON.stringify({fields:{residentId:''}});
  assert.equal(model.build(d).values.residentId,'');
  d.filingDraftJson=JSON.stringify({fields:{}});
  assert.equal(model.build(d).values.residentId,d.taxpayerId);
});

test('missing tax review blocks amounts but preserves independently entered identity and residence',()=>{
  const m=model.build({...data(),taxpayerId:'900101-1234567',resident:'예',acquisitionPrice:''});
  assert.ok(m.errors.length);
  assert.equal(m.values.residentId,'900101-1234567');
  assert.equal(m.values.resident,'거주자');
  const fs=require('node:fs'),vm=require('node:vm');
  const context={filingModel:model};vm.createContext(context);
  vm.runInContext(fs.readFileSync('app/chapters/ch02_tax_housing/filing-render.js','utf8')+'\nthis.render=filingRender.render;',context);
  const html=context.render(m);
  assert.ok(html.includes('900101-1234567'));
  assert.ok(html.includes('금액 확인 필요'));
  assert.ok(!html.includes('1,300,000,000'));
  assert.ok(html.includes('✓'));
});

test('unclassified expense shows independent reviewed amounts but withholds category-dependent boxes',()=>{
  const d=data();
  d.expensePresence='있음'; d.expenses='10000000';
  d.expenseItemsJson=JSON.stringify([{kind:'취득 관련',description:'가상 비용',amount:'10000000',evidence:'있음'}]);
  const m=model.build(d);
  assert.equal(m.partialAmounts,true);
  assert.equal(m.r.errors.length,0);
  assert.ok(m.errors.some(x=>x.includes('비용 1의 신고서 구분')));
  const fs=require('node:fs'),vm=require('node:vm'),context={filingModel:model};vm.createContext(context);
  vm.runInContext(fs.readFileSync('app/chapters/ch02_tax_housing/filing-render.js','utf8')+'\nthis.render=filingRender.render;',context);
  const html=context.render(m), money=n=>n.toLocaleString('ko-KR');
  assert.ok(html.includes('검토 금액 반영 · 비용 분류 필요'));
  assert.ok(html.includes(`title="${money(m.r.transfer)}"`));
  assert.ok(html.includes(`title="${money(m.r.gain)}"`));
  assert.ok(html.includes(`title="${money(m.r.assessed)}"`));
  assert.ok(!html.includes(`title="${money(m.r.expenses)}"`));
  assert.ok(html.includes('미분류'));
  d.filingDraftJson=JSON.stringify({fields:{foreignCredit:'1'}});
  assert.equal(model.build(d).partialAmounts,false);
  d.filingDraftJson=JSON.stringify({fields:{}}); d.acquisitionPrice='';
  assert.equal(model.build(d).partialAmounts,false);
});
