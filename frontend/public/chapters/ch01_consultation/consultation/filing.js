'use strict';
function createFilingPanel({form,getState,save,showReview}) {
  const panel=document.querySelector('#filing-panel'),store=form.elements.filingDraftJson;
  panel.innerHTML=`<header class="filing-header"><div><p class="filing-eyebrow">TAX RETURN</p><h2>신고서 작성</h2><p id="filing-record"></p></div><div class="filing-actions"><button type="button" class="secondary" id="filing-review">양도소득세 검토</button><button type="button" class="secondary" id="filing-save">신고서 저장</button><button type="button" class="primary" id="filing-print">인쇄 / PDF 저장</button></div></header><div class="filing-summary"><div><span>출력 서식</span><strong>본표 + 부표 1 + 부표 3</strong></div><div><span>예상 출력</span><strong id="filing-count">A4 · 3장</strong></div><div><span>이번 납부세액</span><strong id="filing-total">계산 대기</strong></div></div><p class="filing-help">사실확인서와 양도소득세 검토 결과가 자동 반영됩니다. 신고서 추가 정보는 아래에서 입력하세요. 인쇄는 A4 세로 · 배율 100% · 여백 없음 · 머리글/바닥글 해제를 권장합니다.</p><p id="filing-save-status" role="status"></p><details class="filing-checks"><summary id="filing-check-summary">작성 상태 확인</summary><ul id="filing-check-list"></ul></details><div class="filing-workbench"><section class="filing-editor" aria-label="신고서 추가 정보"><details open><summary>01 신고인 · 신고 정보</summary><div id="filing-person-fields" class="filing-input-grid"></div></details><details><summary>02 양수인 · 자산 정보</summary><p class="filing-field-note">양수인 정보는 사실확인서에서 반영됩니다. 여기서 수정하면 신고서에 별도로 저장됩니다.</p><div id="filing-asset-fields" class="filing-input-grid"></div></details><details><summary>03 대리인 · 환급 계좌</summary><div id="filing-agent-fields" class="filing-input-grid"></div></details><details><summary>04 세액공제 · 가산세 · 분납</summary><p class="filing-field-note">검토 탭의 세액공제 합계와 아래 공제 항목 합계를 맞춰 주세요. 금액 단위는 원입니다. 미입력 금액은 0원입니다.</p><div id="filing-tax-fields" class="filing-input-grid"></div></details><details><summary>05 취득가액 · 필요경비 명세</summary><p class="filing-field-note">금액은 사실확인서에서 수정합니다. 비용별 구분과 거래 증빙을 입력하면 본표·부표 금액을 함께 맞추고 세부 내역을 별지에 출력합니다.</p><div id="filing-expense-fields"></div></details></section><section class="filing-preview" aria-label="신고서 미리보기"><div class="filing-preview-bar"><strong>출력 미리보기</strong><span>첨부 R08 서식 기준</span></div><iframe id="filing-preview-frame" title="신고서 전체 페이지 미리보기" src="filing-report.html?v=2"></iframe></section></div>`;
  const $=id=>panel.querySelector('#'+id),frame=$('filing-preview-frame');
  let draft={version:1,fields:{},expenses:{}},locked=false,scheduled=false,expenseSignature='';
  const controls=[];
  const makeInput=(field,target,onInput)=>{
    const [key,label,type='text',choices=[]]=field,wrapper=document.createElement('label');wrapper.textContent=label;
    const input=document.createElement(type==='select'?'select':'input');input.dataset.filing=key;
    if(type==='select'){for(const value of ['',...choices]){const o=document.createElement('option');o.value=value;o.textContent=value || '선택하세요';input.append(o);}}
    else {input.type=type==='amount'?'text':type;input.maxLength=key==='taxpayerAddress'?160:80;if(type==='amount'){input.inputMode='numeric';input.placeholder='0';input.maxLength=16;}}
    input.autocomplete='off';input.addEventListener('input',()=>onInput(input.value));wrapper.append(input);
    if (['buyerName','buyerId','relationship'].includes(key)) {
      const restore=document.createElement('button');restore.type='button';restore.className='filing-restore';restore.textContent='사실확인서 값 사용';restore.hidden=true;
      restore.addEventListener('click',()=>{delete draft.fields[key];persist();});wrapper.append(restore);
    }
    target.append(wrapper);return input;
  };
  for(const field of filingModel.metadata){const key=field[0],group=['buyerName','buyerId','relationship','rateCode','assetCode','propertyId','deductionCode'].includes(key)?'asset':['agentName','agentBusinessId','agentManagementId','agentBirth','agentPhone','bank','account'].includes(key)?'agent':'person';controls.push(makeInput(field,$(`filing-${group}-fields`),value=>{draft.fields[key]=value;persist();}));}
  for(const [key,label] of filingModel.adjustments) controls.push(makeInput([key,label,'amount'],$(`filing-tax-fields`),value=>{draft.fields[key]=value;persist();}));
  function persist(){if(locked)return;store.value=JSON.stringify(draft);store.dispatchEvent(new Event('input',{bubbles:true}));$('filing-save-status').textContent='변경내용은 아직 저장되지 않았습니다.';schedule();}
  function hydrate(){
    locked=false;try{const model=filingModel.build(Object.fromEntries(new FormData(form)));draft={version:1,fields:{...model.saved.fields},expenses:{...model.saved.expenses}};filingModel.parse(store.value);const raw=filingModel.parse(store.value);if(raw.version&&raw.version!==1)throw Error();if(raw.fields&&(Array.isArray(raw.fields)||typeof raw.fields!=='object'||Object.values(raw.fields).some(v=>typeof v!=='string')))throw Error();if(raw.expenses&&(Array.isArray(raw.expenses)||typeof raw.expenses!=='object'))throw Error();}
    catch(e){locked=true;draft={version:1,fields:{},expenses:{}};}
    for(const input of controls){input.value=filingModel.build(snapshot()).fields[input.dataset.filing] || '';input.disabled=locked;}
    expenseSignature='';refresh();
  }
  function renderExpenses(model){
    const signature=JSON.stringify(model.expenses.map(x=>[x.key,x.amount]));if(signature===expenseSignature)return;expenseSignature=signature;
    const area=$('filing-expense-fields');area.replaceChildren();
    if(!model.expenses.length){area.textContent='입력된 필요경비가 없습니다.';return;}
    model.expenses.forEach((row,index)=>{
      const card=document.createElement('div');card.className='filing-expense-card';const title=document.createElement('h4');title.textContent=`${index+1}. ${row.description || row.kind || '비용'} · ${(row.amount ?? 0).toLocaleString('ko-KR')}원`;card.append(title);
      const select=makeInput(['code','신고서 구분','select',filingModel.categories.map(c=>c[0])],card,value=>update(row.key,'code',value));
      [...select.options].forEach(o=>{const category=filingModel.categories.find(c=>c[0]===o.value);if(category)o.textContent=`${category[0].replace(/[a-z]/g,'')} · ${category[1]}`;});select.value=row.code || '';select.disabled=locked;
      for(const [key,label,type] of [['counterparty','거래상대방 상호'],['businessId','사업자등록번호'],['paymentDate','지급일','date'],['evidenceCode','증빙 종류·코드']]){const input=makeInput([key,label,type],card,value=>update(row.key,key,value));input.value=row[key] || '';input.disabled=locked;}
      area.append(card);
    });
  }
  function update(key,field,value){draft.expenses[key]={...draft.expenses[key],[field]:value};persist();}
  function snapshot(){return Object.fromEntries(new FormData(form));}
  function send(){frame.contentWindow?.postMessage({type:'taxflow:filing-data',data:snapshot()},location.origin);}
  function refresh(){
    const model=filingModel.build(snapshot()),state=getState();
    for(const input of controls){const overridden=Object.hasOwn(draft.fields,input.dataset.filing);if(!overridden&&document.activeElement!==input)input.value=model.fields[input.dataset.filing] || '';const restore=input.parentElement.querySelector('.filing-restore');if(restore){restore.hidden=!overridden;restore.disabled=locked;}}
    $('filing-record').textContent=[model.values.taxpayerName || '납세자 미선택',state.id==null?'새 상담':`접수번호 ${state.id}`,state.dirty?'미저장 변경 포함':'현재 입력 기준'].join(' · ');
    $('filing-count').textContent=`A4 · ${model.pageCount}장${model.pageCount>3?' (별지 포함)':''}`;
    $('filing-total').textContent=model.errors.length?'계산 대기':model.values.payable.toLocaleString('ko-KR')+'원';
    $('filing-save').disabled=state.saving || locked;
    $('filing-print').disabled=!model.values.taxpayerName || locked;
    const issues=[...(locked?['저장된 신고서 형식을 읽을 수 없습니다. 원본 데이터는 보존됩니다.']:[]),...model.errors,...model.warnings];
    $('filing-check-summary').textContent=issues.length?`확인사항 ${issues.length}건 · ${model.errors.length?'입력 확인 전 계산금액은 출력하지 않습니다.':'검토용으로 출력됩니다.'}`:'자동 반영 완료 · 신고 전 입력 내용을 확인하세요.';
    $('filing-check-list').replaceChildren();issues.forEach(issue=>{const li=document.createElement('li');li.textContent=issue;$('filing-check-list').append(li);});
    renderExpenses(model);send();
  }
  function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;refresh();});}
  form.addEventListener('reset',()=>{store.value='';queueMicrotask(()=>{$('filing-save-status').textContent='';hydrate();});});
  form.addEventListener('taxflow:form-loaded',()=>queueMicrotask(()=>{$('filing-save-status').textContent='';hydrate();}));
  for(const event of ['input','change'])form.addEventListener(event,schedule);
  window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==frame.contentWindow)return;if(event.data?.type==='taxflow:filing-ready')send();if(event.data?.type==='taxflow:filing-error')$('filing-save-status').textContent=event.data.message;});
  $('filing-review').addEventListener('click',showReview);
  $('filing-save').addEventListener('click',async()=>{if(!form.elements.taxpayerName.value.trim()){$('filing-save-status').textContent='사실확인서에서 신고자 성명을 입력하세요.';return;}$('filing-save').disabled=true;await save();const state=getState();$('filing-save-status').textContent=state.dirty||state.id==null?state.message || '저장하지 못했습니다. 입력 내용을 확인하세요.':'상담·검토 결과와 신고서 추가 정보를 저장했습니다.';refresh();});
  $('filing-print').addEventListener('click',()=>{send();frame.contentWindow.postMessage({type:'taxflow:filing-print'},location.origin);});
  hydrate();return {refresh:schedule};
}
