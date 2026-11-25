const assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const {test}=require('node:test');
const capitalGains=require('../app/chapters/ch02_tax_housing/capital-gains.js');

class Element {
  constructor(){this.value='';this.textContent='';this.children=[];this.hidden=false;this.listeners={};this.classList={toggle(){}};}
  addEventListener(name,fn){(this.listeners[name] ||= []).push(fn);}
  setAttribute(name,value){this[name]=value;}
  dispatchEvent(event){(this.listeners[event.type] || []).forEach(fn=>fn(event));}
  append(...children){this.children.push(...children);} replaceChildren(){this.children=[];} closest(){return this;}
}
function setup(originalDocuments={acquisition:{},transfer:{},resident:{}}, history) {
  const elements={}, jobs=[], controls=Object.keys(capitalGains.defaults).map(key=>Object.assign(new Element(),{dataset:{cg:key}}));
  const panel=new Element(); panel.querySelector=selector=>elements[selector] ||= new Element(); panel.querySelectorAll=()=>controls;
  const store=new Element();
  // Native hidden inputs have value mode "default": assigning value also sets
  // the value restored by form.reset(), unlike ordinary text inputs.
  Object.defineProperty(store,'value',{get(){return this.defaultValue || '';},set(value){this.defaultValue=value;}});
  const form=new Element(); form.elements={capitalGainsReviewJson:store,taxpayerName:new Element()}; form.regulatedHistory=history;
  const context={capitalGains,document:{querySelector:()=>panel,createElement:()=>new Element()},FormData:class {constructor(){return Object.entries({capitalGainsReviewJson:store.value});}},queueMicrotask:fn=>jobs.push(fn),Event:class {constructor(type){this.type=type;}}};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('app/chapters/ch02_tax_housing/capital-gains-panel.js','utf8'),context);
  const opened=[];
  context.createCapitalGainsPanel({form,getState:()=>({id:1,dirty:false,saving:false,originalDocuments}),save:async()=>{},showFacts:()=>{},openContract:key=>opened.push(key)});
  const flush=()=>{while(jobs.length) jobs.shift()();};
  const reset=()=>{form.dispatchEvent({type:'reset'}); store.value=store.defaultValue;};
  const load=review=>{reset(); if(review!==undefined) store.value=JSON.stringify(review); form.dispatchEvent({type:'taxflow:form-loaded'}); flush();};
  const control=key=>controls.find(c=>c.dataset.cg===key);
  return {store,form,flush,reset,load,control,opened,facts:elements['#cg-facts-list']};
}
test('지정 이력과 미대상 상태에 따라 버튼과 문구 표시',()=>{
  const found=setup({}, {state:'found',rows:[{region:'마포구',start_date:'2017-09-06',end_date:'2023-01-05',exclusions:[]}]});
  const row=found.facts.children[5];
  assert.equal(row.children[0].children[0].disabled,false);
  assert.equal(row.children[1].children[0].children[1].children[0].textContent,'마포구 · 지정 2017-09-06 · 해제 2023-01-05');
  const absent=setup({}, {state:'no_history',rows:[]}).facts.children[5];
  assert.equal(absent.children[0].children[0].disabled,true);
  assert.equal(absent.children[1].children[0].children[0].textContent,'조정대상지역 (미대상)');
});
test('취득·양도 금액에서 각각 해당 계약서 열기',()=>{
  const ui=setup();
  const buttons=ui.facts.children.flatMap(row=>row.children.flatMap(cell=>cell.children)).filter(child=>child.className === 'cg-contract-link');
  assert.equal(buttons.length,3);
  buttons.forEach(button=>{assert.equal(button.disabled,false);button.dispatchEvent({type:'click'});});
  assert.deepEqual(ui.opened,['acquisition','transfer','resident']);
});
test('원본이 등록된 항목만 보기 버튼을 활성화',()=>{
  const ui=setup({transfer:{id:3}});
  const buttons=ui.facts.children.flatMap(row=>row.children.flatMap(cell=>cell.children)).filter(child=>child.className === 'cg-contract-link');
  assert.deepEqual(buttons.map(button=>button.disabled),[true,false,true]);
});
test('사실확인서 자료는 요청된 순서로 표시',()=>{
  const ui=setup();
  assert.deepEqual(ui.facts.children.map(row=>row.children[0].textContent),[
    '납세자','양도 자산','취득가액','양도가액','필요경비',
    '계산상 취득일','계산상 양도일','보유기간','보유 중 거주기간','세대원 다른 주택 / 권리','같은 해 다른 양도'
  ]);
});
test('consultation reset and old records cannot inherit prior taxpayer review',()=>{
  const ui=setup();
  ui.load({treatment:'oneHome',notes:'A 상담 검토'});
  assert.equal(ui.control('notes').value,'A 상담 검토');
  ui.reset();ui.flush();
  assert.equal(ui.store.value,'');assert.equal(ui.control('notes').value,'');assert.equal(ui.control('treatment').value,'pending');
  ui.load({treatment:'taxable',notes:'B 상담'});ui.load(undefined);
  assert.equal(ui.control('notes').value,'');assert.equal(ui.control('treatment').value,'pending');
});
test('review restores after record load and user edits serialize per consultation',()=>{
  const ui=setup();ui.load({treatment:'oneHome',notes:'저장된 판단'});
  assert.equal(ui.control('treatment').value,'oneHome');
  ui.control('notes').value='수정한 판단';ui.control('notes').dispatchEvent({type:'input'});ui.flush();
  assert.equal(JSON.parse(ui.store.value).notes,'수정한 판단');
  ui.load({notes:'다른 상담'});assert.equal(ui.control('notes').value,'다른 상담');
});
