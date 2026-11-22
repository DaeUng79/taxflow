const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function harness() {
  const elements = new Map(), requests = [], events = {};
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {
      innerHTML:'', textContent:'', style:{}, hidden:false, open:false,
      addEventListener(){}, setAttribute(){}, focus(){}, select(){},
      showModal(){this.open=true;}, close(){this.open=false;},
      classList:{add(){},remove(){},toggle(){},contains(){return false;}}
    });
    return elements.get(selector);
  };
  const sandbox = {
    URLSearchParams,
    document:{querySelector:element,querySelectorAll:()=>[],body:element('body'),addEventListener:(name,fn)=>{events[name]=fn;}},
    window:{addEventListener(){},scrollTo(){},setTimeout(){return 0;},clearTimeout(){}},
    location:{hash:'#mission-4',search:'',origin:'http://127.0.0.1:8765'},navigator:{clipboard:{writeText:async text=>{sandbox.copied=text;}}},
    fetch:async (url,options) => {
      requests.push({url,options});
      return {ok:true,json:async()=>({items:[
        {id:1,checks:[true,true,true],completed:true},
        {id:4,checks:[true,true,true],completed:true}, // old curriculum: must not complete new lesson 4
        {id:10,checks:[true,true,true],completed:true},
        {id:105,checks:[true,true,true],completed:true} // revised lesson 5
      ]})};
    }
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root,'app/assets/js/missions.js'),'utf8'),context);
  context.COURSE=context.window.COURSE;
  let app=fs.readFileSync(path.join(root,'app/assets/js/app.js'),'utf8');
  const startup='  render();\n  loadProgress();';
  assert.ok(app.includes(startup));
  app=app.replace(startup,'  globalThis.guideTest={state,render,loadProgress,saveProgress,flushProgress,buildPrompt,showBuildPrompt};');
  vm.runInContext(app,context);
  return {context,api:context.guideTest,element,requests,events};
}

test('revised progress preserves setup and does not inherit the old lesson completion', async()=>{
  const h=harness();
  await h.api.loadProgress();
  assert.deepEqual([...h.api.state.done],[1,5]);
  assert.equal(h.api.state.checks[4],undefined);
  h.context.location.hash='#overview';
  h.api.render();
  assert.ok(h.element('#main').innerHTML.includes('2 / 9 완료'));
  h.context.location.hash='#mission-4';
  h.api.state.checks[4]=[true,false,false];
  h.api.saveProgress(h.context.COURSE.missions[3]);
  await h.api.flushProgress();
  const save=h.requests.find(r=>r.options?.method==='PUT');
  assert.equal(save.url,'/api/mission-progress/104');
  assert.deepEqual(JSON.parse(save.options.body),{checks:[true,false,false],completed:false});
});

test('all guides render with valid tool targets and all copy actions include the selected step', async()=>{
  const h=harness(),course=h.context.COURSE;
  assert.equal(course.missions.length,9);
  for (const [index,mission] of course.missions.entries()) {
    h.context.location.hash=`#mission-${mission.id}`;
    h.api.state.tab='guide'; h.api.render();
    let html=h.element('#main').innerHTML;
    assert.ok(html.includes(mission.title));
    if(index<3){assert.ok(!html.includes('class="coding-step"'));continue;}
    assert.equal(mission.view,course.practice[index-3].id);
    assert.ok(html.includes(`?view=${mission.view}`));
    assert.equal((html.match(/class="coding-step"/g)||[]).length,mission.build.stages.length);
    for (const key of ['context',...mission.build.stages.map((_,i)=>String(i)),'verify']) {
      const target={closest:selector=>selector==='[data-build-prompt]'?{dataset:{buildPrompt:key}}:null};
      h.events.click({target});
      await Promise.resolve();
      const expected=h.api.buildPrompt(mission,key);
      assert.equal(h.context.copied,expected);
      assert.ok(expected.includes('별도 테스트 DB'));
      if(/^\d+$/.test(key))assert.ok(expected.includes(mission.build.stages[Number(key)].prompt));
    }
    h.api.state.tab='sample';h.api.render();
    html=h.element('#main').innerHTML;
    assert.ok(html.includes('실제 작업 화면 열기'));
    assert.ok(!html.includes('미리 작성한 교육용 예시'));
  }
});

test('clipboard failure exposes the full prompt for manual copying', async()=>{
  const h=harness();
  h.context.navigator.clipboard.writeText=async()=>{throw Error('not permitted');};
  h.events.click({target:{closest:selector=>selector==='[data-build-prompt]'?{dataset:{buildPrompt:'0'}}:null}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.element('#dialog').open,true);
  assert.ok(h.element('#dialog-content').innerHTML.includes('복사할 개발 프롬프트'));
  assert.ok(h.element('#dialog-content').innerHTML.includes('아직 저장하지 않은 상담에서도 계약서 분석'));
});

test('timeline, overview and legacy final lesson URLs remain renderable',()=>{
  const h=harness();
  for(const route of ['overview','agenda','mission-10','mission-11']){
    h.context.location.hash=`#${route}`;h.api.render();
    assert.ok(h.element('#main').innerHTML.length>0);
  }
  assert.ok(h.element('#main').innerHTML.includes('검토한 내용을 신고서와 부표로 연결해요.'));
});
