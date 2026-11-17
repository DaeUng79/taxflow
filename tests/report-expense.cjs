'use strict';
const assert = require('node:assert/strict');
global.residencePeriod = require('../frontend/public/chapters/ch01_tax_housing/residence-period.js').residencePeriod;
global.householdReview = require('../frontend/public/chapters/ch01_tax_housing/exemption-review.js').householdReview;
global.paymentUtils = {formatDate: value => {
  const match = String(value || '').match(/^(\d{4})[-.](\d{2})[-.](\d{2})\.?$/);
  return match ? `${match[1]}.${match[2]}.${match[3]}.` : '';
}};
class Node {
  constructor(tag='div') { this.tag=tag; this.children=[]; this.textContent=''; this.className=''; this.disabled=false; }
  append(...children) { this.children.push(...children); }
  setAttribute() {}
  addEventListener() {}
}
const ids = new Map();
global.document = {title:'', querySelector(selector) { if (!ids.has(selector)) ids.set(selector,new Node()); return ids.get(selector); }, createElement(tag) { return new Node(tag); }};
global.window = {location:{search:'?id=1'}, print(){}};
window.self = window.top = window;
global.matchRegulatedAddress = () => ({rows:[], error:'이력 확인 필요'});
global.residentComparison = () => ({details:''});
const data = {taxpayerName:'가상',consultedAt:'2026',expenses:'10000',otherTransfers:'있음',
  acquisitionBalanceDate:'2010-12-30',transferBalanceDate:'2021-10-29',moveInDate:'2010-12-28',moveOutDate:'2017-05-02',otherHomes:'없음',otherRights:'없음',expenseDetails:'삭제된 메모',residenceDetails:'과거 거주 메모',paymentDocument:'받음',acquisitionDocument:'받음',transferDocument:'요청 예정',notes:'세무사 전달 메모',counselorPreparation:'준비할 자료',
  expenseItemsJson:JSON.stringify([{kind:'취득 관련',description:'등기비용',amount:'10000',evidence:'있음'}]),
  otherTransferItemsJson:JSON.stringify([{kind:'주택',address:'가상 지역',status:'양도 완료',filing:'예정신고 완료',combined:'아니요'}]),
  transferReviewChecksJson:JSON.stringify({dates:true})};
global.fetch = async url => ({ok:true, json:async () => url.includes('/api/consultations/1/settlement') ? {data:{}} : url.includes('/api/consultations/1') ? {data} : url.includes('/api/resident/') ? {result:null} : {items:[]}});
require('../frontend/public/chapters/ch01_tax_housing/report.js');
setImmediate(() => {
  const flatten = node => [node.textContent,...node.children.flatMap(flatten)];
  const text=flatten(ids.get('#report-sections')).join('\n');
  assert.match(text,/등기비용/); assert.match(text,/10,000원/); assert.match(text,/가상 지역/); assert.match(text,/합산 신고 아니요/); assert.match(text,/☑ 양도일과 순서/);
  assert.match(text,/10년 9개월 29일/); assert.match(text,/6년 4개월 4일/); assert.match(text,/세대원의 다른 주택·권리 없음/);
  assert.match(text,/2021\.10\.29\. \(잔금일 기준\) · 10년/);
  assert.doesNotMatch(text,/조정대상지역 참고 이력|1세대 1주택 여부 확인|보유기간 \(잔금일 기준\)/);
  assert.match(text,/2010\.12\.30\./); assert.match(text,/참고사항/); assert.match(text,/준비할 자료/);
  assert.doesNotMatch(text,/비용·양도 메모|삭제된 메모|과거 거주 메모|대금자료|세무사 전달 메모|저장된 매매대금 수수 확인/);
  assert.equal(ids.get('#signature-name').textContent,'가상'); assert.equal(ids.get('#report-date').textContent,'상담일 2026');
  assert.match(ids.get('#report-printed').textContent,/^출력일 \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  const sections=ids.get('#report-sections').children;
  const documents=sections.find(section => section.children[0].textContent.includes('신고서류 제출'));
  const household=sections.find(section => section.children[0].textContent.includes('세대와 다른 주택'));
  const relocation=sections.find(section => section.children[0].textContent.includes('전출 후 거주'));
  assert.match(sections[0].children[0].textContent,/납세자 정보/);
  assert.match(sections.at(-1).children[0].textContent,/신고서류 제출/);
  assert.equal(documents.children[1].children[0].children[1].textContent,'제출');
  assert.equal(documents.children[1].children[1].children[1].textContent,'요청 예정');
  assert.match(text,/취득 정보/); assert.match(text,/양도 정보/);
  assert.match(documents.children[1].className,/report-grid-three/); assert.equal(documents.children[1].children.length,3);
  assert.match(household.children[1].className,/report-grid-three/); assert.equal(household.children[1].children.length,5);
  assert.match(relocation.className,/report-section-relocation/);
  console.log('사실확인서의 비용·양도 명세 표시 확인 통과');
});
