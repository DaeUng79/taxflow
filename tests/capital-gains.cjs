const assert=require('node:assert/strict');
const {test}=require('node:test');
const tax=require('../app/chapters/ch01_tax_housing/capital-gains.js');
const facts={taxpayerName:'검증용',resident:'예',ownership:'단독 소유',propertyType:'아파트',acquisitionMethod:'매매',acquisitionBalanceDate:'2006-05-07',acquisitionRegistrationDate:'2006-05-07',transferBalanceDate:'2022-01-03',transferRegistrationDate:'2022-01-03',acquisitionPrice:'800000000',transferPrice:'1500000000',expenses:'30000000',expensePresence:'있음',livedThere:'예',moveInDate:'2006-05-07',moveOutDate:'2022-01-03',registrationMatch:'예',otherHomes:'없음',otherRights:'없음',otherTransfers:'없음',transferStatus:'양도 완료'};
const calculate=(data={},review={}) => tax.calculate({...facts,...data},{treatment:'taxable',rate:'general',...review});
const ready=r => { assert.deepEqual(r.errors,[]); return r; };

test('NTS published high-value home example: 2022, 15억/8억/3천만, 80%',()=>{
  const r=ready(calculate({}, {treatment:'oneHome'}));
  assert.equal(r.gain,670000000); assert.equal(r.taxableGain,134000000);
  assert.equal(r.deductionRate,80); assert.equal(r.deduction,107200000); assert.equal(r.income,26800000);
  assert.equal(r.base,24300000); assert.equal(r.assessed,2565000);
});
test('all modern bracket edges are continuous and use correct progressive offsets',()=>{
  const limits=[14000000,50000000,88000000,150000000,300000000,500000000,1000000000];
  const expected=[840000,6240000,15360000,37060000,94060000,174060000,384060000];
  limits.forEach((base,i)=>{ assert.equal(tax.progressive(base,2023).tax,expected[i]); assert.equal(tax.progressive(base+1,2023).tax,expected[i]); });
  assert.equal(tax.progressive(2000000000,2023).tax,834060000);
  assert.equal(tax.progressive(14000000,2022).tax,1020000);
});
test('ordinary 3-year deduction boundary and 15-year cap',()=>{
  for (const [end,rate] of [['2022-01-02',0],['2022-01-03',6],['2023-01-03',8],['2039-01-03',30]]) {
    assert.equal(ready(calculate({acquisitionBalanceDate:'2019-01-03',acquisitionRegistrationDate:'2019-01-03',transferBalanceDate:end,transferRegistrationDate:end})).deductionRate,rate);
  }
});
test('home deduction needs 3 years holding and 2 years residence',()=>{
  const d={acquisitionBalanceDate:'2019-01-03',acquisitionRegistrationDate:'2019-01-03',moveInDate:'2020-01-03',moveOutDate:'2022-01-03'};
  assert.equal(ready(calculate(d,{treatment:'oneHome'})).deductionRate,20);
  assert.equal(ready(calculate({...d,moveOutDate:'2022-01-02'},{treatment:'oneHome'})).deductionRate,6);
  assert(calculate({...d,moveOutDate:''},{treatment:'oneHome',deduction:'oneHome'}).errors.length);
  assert.equal(ready(calculate({...d,livedThere:'아니요'},{treatment:'oneHome'})).deductionRate,6);
});
test('one-home threshold changes on 2021-12-08 and exemption below threshold',()=>{
  const common={transferPrice:'1000000000',moveOutDate:'2021-01-01'};
  const before=ready(calculate({...common,transferBalanceDate:'2021-12-07',transferRegistrationDate:'2021-12-07'},{treatment:'oneHome'}));
  const after=ready(calculate({...common,transferBalanceDate:'2021-12-08',transferRegistrationDate:'2021-12-08'},{treatment:'oneHome'}));
  assert.equal(before.taxableGain,17000000); assert.equal(after.taxableGain,0); assert.equal(after.netTax,0);
});
test('short-term homes: 70 / 60 / progressive at anniversaries',()=>{
  for (const [start,rate] of [['2021-01-04',70],['2021-01-03',60],['2020-01-03',42]]) {
    assert.equal(ready(calculate({acquisitionBalanceDate:start,acquisitionRegistrationDate:start})).appliedRate,rate);
  }
});
test('2021 June short-term rate transition and ordinary land rates',()=>{
  const d={acquisitionBalanceDate:'2020-09-01',acquisitionRegistrationDate:'2020-09-01',transferPrice:'810000000',expenses:'0'};
  assert.equal(ready(calculate({...d,transferBalanceDate:'2021-05-31',transferRegistrationDate:'2021-05-31'})).appliedRate,40);
  assert.equal(ready(calculate({...d,transferBalanceDate:'2021-06-01',transferRegistrationDate:'2021-06-01'})).appliedRate,70);
  assert.equal(ready(calculate({...d,transferBalanceDate:'2021-06-01',transferRegistrationDate:'2021-06-01'},{asset:'land'})).appliedRate,50);
});
test('heavy rates compare with short-term tax and deny holding deduction',()=>{
  const d={acquisitionBalanceDate:'2020-06-01',acquisitionRegistrationDate:'2020-06-01'};
  const r=ready(calculate(d,{rate:'heavy3'}));
  assert.equal(r.deductionRate,0); assert.equal(r.appliedRate,72); assert(r.progressiveTax>r.shortTax);
  assert(calculate(d,{rate:'heavy3',deduction:'general'}).errors.length);
  assert(calculate({transferBalanceDate:'2024-01-03',transferRegistrationDate:'2024-01-03'},{rate:'heavy2'}).errors.length);
});
test('unregistered excludes both deductions and uses flat 70%',()=>{
  const r=ready(calculate({}, {rate:'unregistered'}));
  assert.equal(r.basic,0);assert.equal(r.deduction,0);assert.equal(r.offset,0);assert.equal(r.netTax,469000000);
});
test('co-owned home uses whole home threshold, taxes only taxpayer share',()=>{
  const o={treatment:'oneHome',amountBasis:'whole',shareNumerator:'1',shareDenominator:'2'};
  const r=ready(calculate({ownership:'공동 소유'},o));
  assert.equal(r.transfer,750000000);assert.equal(r.taxableGain,67000000);assert.equal(r.deduction,53600000);
  const personal=ready(calculate({ownership:'공동 소유',transferPrice:'750000000',acquisitionPrice:'400000000',expenses:'15000000'},{...o,amountBasis:'personal',wholePrice:'1500000000'}));
  assert.equal(personal.netTax,r.netTax);
  assert(calculate({ownership:'공동 소유'},{}).errors.length);
  assert(calculate({ownership:'공동 소유'},{...o,shareDenominator:'0'}).errors.length);
});
test('missing, invalid, unsupported facts never silently produce zero tax',()=>{
  for (const d of [{transferPrice:''},{acquisitionPrice:'abc'},{expenses:''},{acquisitionPrice:'-1'},{transferBalanceDate:'2022-02-30'},{acquisitionMethod:'증여'},{resident:'아니요'},{ownership:''},{transferBalanceDate:'2020-01-01',transferRegistrationDate:'2020-01-01'}]) assert(calculate(d).errors.length,JSON.stringify(d));
  assert.equal(tax.money('1,23'),null);assert.equal(tax.money('1,234'),1234);assert.equal(tax.date('2021-02-29'),null);
});
test('zero expenses and loss are valid, stale costs excluded for no expenses',()=>{
  assert.equal(ready(calculate({transferPrice:'700000000',expenses:'0'})).netTax,0);
  const r=ready(calculate({expensePresence:'없음',expenses:'30000000'}));
  assert.equal(r.expenses,0);assert(r.warnings.some(s=>s.includes('제외')));
  assert(calculate({expenseItemsJson:JSON.stringify([{amount:''}])}).errors.length);
  assert(calculate({expenseItemsJson:JSON.stringify([{amount:'1000',evidence:'있음'}])}).errors.length);
});
test('annual deduction must be supplied for other disposals, and cannot exceed allowance',()=>{
  assert(calculate({otherTransfers:'있음'}).errors.length);
  assert.equal(ready(calculate({otherTransfers:'있음'},{basic:'0'})).basic,0);
  assert(calculate({}, {basic:'2500001'}).errors.length);
});
test('income relief, credits, and tax relief affect correct steps; excessive values rejected',()=>{
  const base=ready(calculate());
  const r=ready(calculate({}, {incomeRelief:'1000000',credit:'10000',taxRelief:'20000'}));
  assert.equal(r.base,base.base-1000000);assert.equal(r.netTax,r.assessed-30000);
  assert(calculate({}, {incomeRelief:'99999999999'}).errors.length);
  assert(calculate({}, {credit:'99999999999'}).errors.length);
});
test('earlier registration is applied; residence clipped; leap anniversary is calendar based',()=>{
  const r=ready(calculate({acquisitionRegistrationDate:'2005-05-07',moveInDate:'2000-01-01',moveOutDate:'2030-01-01'}));
  assert.equal(r.start,'2005-05-07');assert.equal(r.residenceYears,16);
  assert.equal(tax.years(tax.date('2020-02-29'),tax.date('2023-02-28')),3);
});
