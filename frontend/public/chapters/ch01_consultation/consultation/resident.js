'use strict';
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search), cid = params.get('consultation_id');
const token = params.get('request');
const years = [...new Set(['acquisition_year', 'transfer_year'].map(key => params.get(key)).filter(value => /^\d{4}$/.test(value || '')))];
let images = [], pages = [], index = 0, file = null, pdf = '', busy = false, model = '8b';
const startYear = years.length ? Math.min(...years.map(Number)) : null;
let startedAt = 0, timer = null;
const pendingApplications = new Map();
$('year-filter').textContent = startYear ? `표시 기간: ${startYear}년부터 · 변동 사유: 전입, 도로명주소` : '상담 화면에서 취득 또는 양도 계약일을 입력하면 해당 연도부터의 주소 이력을 볼 수 있습니다.';
async function request(url, options) {
  const response = await fetch(url, options), data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(data.error || '요청을 처리하지 못했습니다.');
  return data;
}
function elapsed() {
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
}
function matchesFilter(row) {
  const match = String(row.date).match(/^\s*(\d{4})/);
  return /전입|도로명\s*주소/.test(row.reason) && startYear !== null && !!match && Number(match[1]) >= startYear;
}
function show() {
  $('page').textContent = images.length ? `${index + 1} / ${images.length}` : '0 / 0';
  $('image').hidden = !images.length;
  if (images.length) $('image').src = 'data:image/jpeg;base64,' + images[index];
  $('prev').disabled = busy || index === 0;
  $('next').disabled = busy || index >= images.length - 1;
  $('analyze').disabled = busy || !images.length;
  $('save').disabled = busy || !pdf || pages.length !== images.length || !pages.length;
  $('add-row').disabled = busy || !pages[index]; $('file').disabled = busy;
  const root = $('result'); root.replaceChildren();
  if (!pages[index]) return;
  const data = pages[index], name = document.createElement('div'); name.className = 'resident-name';
  const label = document.createElement('label'); label.textContent = '초본 성명';
  const input = document.createElement('input'); input.value = data.name; input.oninput = () => data.name = input.value;
  label.append(input); name.append(label); root.append(name);
  let visible = 0;
  data.history.forEach((row, i) => {
    if (!row._editing && !matchesFilter(row)) return;
    visible++;
    const section = document.createElement('div'); section.className = 'history-row';
    const head = document.createElement('div'); head.className = 'history-head';
    const heading = document.createElement('strong'); heading.textContent = `주소 이력 ${visible}`; head.append(heading);
    const actions = document.createElement('div'); actions.className = 'history-actions';
    const feedback = document.createElement('p'); feedback.className = 'history-feedback'; feedback.setAttribute('role','status'); feedback.setAttribute('aria-live','polite');
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'secondary'; remove.textContent = '이 행 삭제';
    remove.onclick = () => { data.history.splice(i,1); show(); }; actions.append(remove);
    for (const [field, title] of [['moveInDate','입주일 반영'],['moveOutDate','퇴거일 반영']]) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'apply-date'; button.textContent = title;
      button.onclick = () => {
        const date = paymentUtils.formatDate(row.date);
        if (!date) { feedback.textContent = '전입일·변동일을 올바른 날짜로 입력해 주세요.'; feedback.className = 'history-feedback error'; return; }
        if (window.parent === window) { feedback.textContent = '상담 화면에서 분석 창을 열어 다시 시도해 주세요.'; feedback.className = 'history-feedback error'; return; }
        const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        feedback.className = 'history-feedback'; feedback.textContent = '상담 화면에 반영하고 있습니다…';
        const timeout = setTimeout(() => { pendingApplications.delete(requestId); feedback.className = 'history-feedback error'; feedback.textContent = '상담 화면과 연결되지 않았습니다. 창을 닫고 상담 화면을 새로고침한 뒤 다시 시도해 주세요.'; }, 3000);
        pendingApplications.set(requestId, {feedback, timeout});
        window.parent.postMessage({type:'taxflow:resident-apply-date',token,field,date,requestId}, location.origin);
      };
      actions.append(button);
    }
    const applyAddress = document.createElement('button'); applyAddress.type = 'button'; applyAddress.className = 'apply-date'; applyAddress.textContent = '주소 반영';
    applyAddress.onclick = () => {
      const address = row.address.trim();
      if (!address) { feedback.textContent = '주소를 입력한 뒤 반영해 주세요.'; feedback.className = 'history-feedback error'; return; }
      if (window.parent === window) { feedback.textContent = '상담 화면에서 분석 창을 열어 다시 시도해 주세요.'; feedback.className = 'history-feedback error'; return; }
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      feedback.className = 'history-feedback'; feedback.textContent = '상담 화면에 반영하고 있습니다…';
      const timeout = setTimeout(() => { pendingApplications.delete(requestId); feedback.className = 'history-feedback error'; feedback.textContent = '상담 화면과 연결되지 않았습니다. 창을 닫고 상담 화면을 새로고침한 뒤 다시 시도해 주세요.'; }, 3000);
      pendingApplications.set(requestId, {feedback, timeout});
      window.parent.postMessage({type:'taxflow:resident-apply-address',token,address,requestId}, location.origin);
    };
    actions.append(applyAddress);
    head.append(actions); section.append(head);
    const fields = document.createElement('div'); fields.className = 'history-fields';
    for (const [key,title] of [['address','주소'],['date','전입일·변동일'],['reason','변동 사유']]) {
      const l = document.createElement('label'); l.textContent = title; if (key === 'address') l.className = 'history-address';
      const el = document.createElement('input'); el.value = row[key]; el.oninput = () => row[key] = el.value; l.append(el); fields.append(l);
    }
    section.append(fields, feedback);
    root.append(section);
  });
  if (!visible) { const p = document.createElement('p'); p.textContent = years.length ? '이 페이지에 해당 기간의 전입·도로명주소 이력이 없습니다.' : '계약일을 입력하면 해당 연도부터의 주소 이력이 표시됩니다.'; root.append(p); }
}
async function analyze() {
  busy = true; const previous = pages; pages = []; show(); model = $('model').value;
  startedAt = Date.now(); $('elapsed-summary').hidden = false;
  const update = () => { $('elapsed-summary').textContent = `분석 시간 ${elapsed()}`; };
  update(); timer = setInterval(update, 1000);
  try {
    for (let i=0; i<images.length; i++) {
      index=i; $('status').textContent = `${i+1} / ${images.length}쪽 분석 중입니다…`; show();
      const data = await request('/api/resident/parse', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:images[i],model})});
      pages.push(data.result);
    }
    index=0; $('status').textContent='분석이 완료되었습니다. 해당 기간의 주소 이력을 원본과 대조해 주세요.';
  } catch (error) { pages=previous; index=0; $('status').textContent='분석 실패: '+error.message; }
  finally { clearInterval(timer); timer=null; update(); busy=false; show(); }
}
$('file').onchange = async event => {
  const selected = event.target.files[0]; event.target.value=''; if (!selected) return;
  if (selected.size > 20*1024*1024) { $('status').textContent='PDF는 20MB 이하여야 합니다.'; return; }
  busy=true; show(); $('status').textContent='PDF를 확인하고 있습니다…';
  try {
    const rendered=await request('/api/resident/render',{method:'POST',headers:{'Content-Type':'application/pdf'},body:selected});
    const bytes=new Uint8Array(await selected.arrayBuffer()); let binary='';
    for(let i=0;i<bytes.length;i+=32768) binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
    file=selected; pdf=btoa(binary); images=rendered.pages; pages=[]; index=0; $('filename').textContent=file.name;
    await analyze();
  } catch(error) { $('status').textContent=error.message; } finally {busy=false;show();}
};
$('add-row').onclick = () => { if (pages[index]) { pages[index].history.push({address:'',date:'',reason:'전입',_editing:true}); show(); } };
$('prev').onclick = () => {if(index>0){index--;show();}};
$('next').onclick = () => {if(index<images.length-1){index++;show();}};
$('analyze').onclick = analyze;
$('close').onclick = () => { if (window.parent !== window) window.parent.postMessage({type:'taxflow:resident-close',token},location.origin); else window.close(); };
$('save').onclick = () => {
  if(busy) return;
  if(pages.some(page=>page.history.some(row=>(row._editing || matchesFilter(row)) && (!row.address.trim() || !row.date.trim())))) { $('status').textContent='표시된 주소 이력의 주소와 날짜를 확인해 주세요.'; return; }
  const reviewed=pages.map(page=>({name:page.name,history:page.history.map(({address,date,reason})=>({address,date,reason}))}));
  busy=true;show();$('status').textContent='상담에 저장하고 있습니다…';
  window.parent.postMessage({type:'taxflow:resident-save',token,pages:reviewed,pdf,filename:file?.name||$('filename').textContent,model},location.origin);
};
window.addEventListener('message', event => {
  if(event.origin!==location.origin||event.source!==window.parent||event.data?.token!==token)return;
  if(event.data.type==='taxflow:resident-date-applied') {
    const pending = pendingApplications.get(event.data.requestId);
    if (pending) { clearTimeout(pending.timeout); pendingApplications.delete(event.data.requestId); pending.feedback.className = event.data.ok ? 'history-feedback success' : 'history-feedback error'; pending.feedback.textContent = event.data.message; }
    $('status').textContent=event.data.message; return;
  }
  if(event.data.type!=='taxflow:resident-saved')return;
  busy=false; $('status').textContent=event.data.ok?'상담에 저장했습니다.':event.data.message; show();
});
show();
if(cid) (async()=>{
  busy=true;show();
  try {
    const data=await request('/api/resident/result?consultation_id='+encodeURIComponent(cid));
    if(data.result){
      const response=await fetch('/api/resident/pdf?id='+encodeURIComponent(data.result.id));if(!response.ok)throw Error('저장된 PDF를 읽을 수 없습니다.');
      const blob=await response.blob();file=new File([blob],data.result.filename,{type:'application/pdf'});
      const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));pdf=btoa(binary);
      const rendered=await request('/api/resident/render',{method:'POST',headers:{'Content-Type':'application/pdf'},body:blob});
      images=rendered.pages;pages=JSON.parse(data.result.reviewed_json);model=data.result.model;$('model').value=model;$('filename').textContent=file.name;
      $('status').textContent='저장된 분석 결과입니다. 원본과 대조해 주세요.';
    }
  }catch(error){$('status').textContent=error.message;}finally{busy=false;show();}
})();
