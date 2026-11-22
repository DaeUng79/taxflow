const fs=require('fs'),vm=require('vm'),assert=require('assert');
class Element {
  constructor(tag='div'){this.tag=tag;this.children=[];this.textContent='';this.value='';this.hidden=false;this.disabled=false;}
  append(...items){this.children.push(...items);} replaceChildren(){this.children=[];} setAttribute(){}
}
const elements={}; const get=id=>elements[id] ||= new Element();
const context={document:{getElementById:get,createElement:t=>new Element(t)},location:{search:'?request=token&acquisition_year=2010&transfer_year=2020',origin:'http://test'},window:{parent:{postMessage:msg=>context.lastMessage=msg},addEventListener:()=>{}},URLSearchParams,Date,setInterval,clearInterval,setTimeout,clearTimeout,console,paymentUtils:{formatDate:s=>/^\d{4}\.\d{2}\.\d{2}\.$/.test(s)?s:null}};
vm.createContext(context);
vm.runInContext(fs.readFileSync('app/chapters/ch01_tax_housing/resident.js','utf8'),context);
vm.runInContext(`images=['image']; pdf='pdf'; pages=[{name:'테스트',history:[{address:'이전연도',date:'2009.01.01.',reason:'전입'},{address:'대상',date:'2010.01.01.',reason:'전입'},{address:'도로명 주소',date:'2011.02.01.',reason:'도로명주소'},{address:'공백 도로명',date:'2012.02.01.',reason:'도로명 주소'},{address:'정정주소',date:'2010.02.01.',reason:'정정'},{address:'다른연도',date:'2015.01.01.',reason:'전입'},{address:'양도연도',date:'2020.01.01.',reason:'전입'}]}]; show();`,context);
const texts=el=>[el.textContent,el.value,...el.children.flatMap(texts)];
let rendered=texts(get('result'));
assert(rendered.includes('대상'));assert(rendered.includes('양도연도'));assert(!rendered.includes('정정주소'));assert(rendered.includes('도로명 주소'));assert(rendered.includes('공백 도로명'));assert(rendered.includes('다른연도'));assert(!rendered.includes('이전연도'));
const history=get('result').children.find(el=>texts(el).includes('대상'));
const buttons=history.children[0].children[1].children;
buttons.find(el=>el.textContent==='입주일 반영').onclick();assert.equal(context.lastMessage.field,'moveInDate');assert.equal(context.lastMessage.date,'2010.01.01.');
buttons.find(el=>el.textContent==='퇴거일 반영').onclick();assert.equal(context.lastMessage.field,'moveOutDate');
buttons.find(el=>el.textContent==='주소 반영').onclick();assert.equal(context.lastMessage.type,'taxflow:resident-apply-address');assert.equal(context.lastMessage.address,'대상');
for (const pending of vm.runInContext('[...pendingApplications.values()]',context)) clearTimeout(pending.timeout);
get('close').onclick();assert.equal(context.lastMessage.type,'taxflow:resident-close');
get('save').onclick();assert.equal(context.lastMessage.type,'taxflow:resident-save');assert.equal(context.lastMessage.pages[0].history.length,7);
assert.equal(get('status').textContent,'상담에 저장하고 있습니다…');
console.log('빠른 계약 연도 이후 전입·도로명주소 표시, 날짜 반영, 닫기 및 전체 이력 저장 검사 통과');
