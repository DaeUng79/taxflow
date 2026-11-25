/* Learning guides and entry points to the implemented local practice workspace. */
(() => {
  'use strict';
  const M = COURSE.missions;
  // Stable storage IDs keep revised lessons 4–9 separate from legacy completion records.
  const progressId = mission => mission.progressId || mission.id;
  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const practiceUrl = view => `chapters/ch02_tax_housing/index.html?view=${view}`;
  const embeddedGuide = new URLSearchParams(location.search).get('guidePopup') === '1' && window.parent !== window;
  if(embeddedGuide) document.body.classList.add('embedded-guide');
  const state = {done:new Set(),checks:{},tab:'guide',reviewItem:6,progressReady:false};
  const $ = selector => document.querySelector(selector);
  const icons = {
    grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    file:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5"/>',
    files:'<path d="M14 6H7a2 2 0 0 0-2 2v12h13V10zM14 6v4h4M9 14h5M9 17h4M9 3h8l4 4v10"/>',
    briefcase:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3M3 12a22 22 0 0 0 18 0M10 13v3h4v-3"/>',
    timeline:'<path d="M6 3v18M10 6h10M10 12h6M10 18h10"/><circle cx="6" cy="6" r="2" fill="currentColor" stroke="none"/><circle cx="6" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="6" cy="18" r="2" fill="currentColor" stroke="none"/>',
    home:'<path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8"/>',
    search:'<circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6M7 8h6M7 11h4"/>',
    calculator:'<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8M8 11h1M12 11h1M16 11h0M8 15h1M12 15h1M16 15h0M8 19h1M12 19h1M16 19h0"/>',
    compare:'<rect x="3" y="4" width="7" height="16" rx="1"/><rect x="14" y="4" width="7" height="16" rx="1"/><path d="M5 8h3M5 12h3M16 8h3M16 12h3M5 16h3M16 16h3"/>',
    send:'<path d="m3 10 18-7-7 18-3-8-8-3ZM11 13l10-10"/>',
    archive:'<rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v13h14V8M9 12h6"/>',
    spark:'<path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6ZM20 2v4M18 4h4"/>',
    arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
    back:'<path d="M20 12H4m6-6-6 6 6 6"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    shield:'<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6zM8 12l3 3 5-6"/>',
    screen:'<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    close:'<path d="m6 6 12 12M18 6 6 18"/>',
    teacher:'<path d="m2 9 10-5 10 5-10 5zM6 12v5c4 3 8 3 12 0v-5M22 9v8"/>',
    coffee:'<path d="M4 8h12v8c0 3-12 3-12 0zM16 9h2a3 3 0 0 1 0 6h-2M3 21h16M7 2v3M12 2v3"/>',
    folder:'<path d="M3 6h7l2 3h9v11H3zM3 6V4h7l2 2h8v3"/>',
    refresh:'<path d="M20 7a8 8 0 1 0 0 10M20 3v5h-5"/>'
  };
  const icon = (name,cls='') => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.file}</svg>`;
  const num = n => String(n).padStart(2,'0');
  const badge = m => `<span class="badge ${m.type==='흐름 소개'?'outline':m.type==='조건부 실습'?'amber':'purple'}">${m.type}</span>`;
  const route = () => {const value=location.hash.slice(1)||'overview';return ({'mission-10':'mission-8','mission-11':'mission-9'})[value]||value;};
  const currentMission = () => M.find(m=>route()===`mission-${m.id}`);
  let openedGuideHash = null;
  const pendingProgress = new Map();
  let savingProgress = null;
  let progressMessage='학습 기록을 불러오는 중';
  let progressRetry=false;
  function progressStatusMarkup(){
    return `<span class="progress-status" role="status">${escapeHtml(progressMessage)}</span><button class="progress-retry" data-action="progress-retry" type="button" ${progressRetry?'':'hidden'}>저장 다시 시도</button>`;
  }
  function setProgressStatus(message, retry=false){
    progressMessage=message==='학습 기록 자동 저장'?'':message;
    progressRetry=retry;
    document.querySelectorAll('.progress-status').forEach(el=>el.textContent=progressMessage);
    document.querySelectorAll('.progress-retry').forEach(el=>el.hidden=!retry);
  }
  async function loadProgress(){
    try{
      const response=await fetch('/api/mission-progress',{cache:'no-store'});
      if(!response.ok)throw new Error();
      const data=await response.json();
      if(!Array.isArray(data.items))throw new Error();
      for(const item of data.items){
        const mission=M.find(m=>progressId(m)===item.id);
        if(!mission||!Array.isArray(item.checks))continue;
        const checks=mission.checks.map((_,i)=>item.checks[i]===true);
        state.checks[mission.id]=checks;
        if(item.completed===true&&checks.length>0&&checks.every(Boolean))state.done.add(mission.id);
      }
      state.progressReady=true;
      setProgressStatus('학습 기록 자동 저장');
    }catch(error){setProgressStatus('학습 기록을 불러오지 못했습니다. 서버를 다시 시작한 뒤 새로고침해 주세요.');}
    render(false);
  }
  function saveProgress(m){
    pendingProgress.set(progressId(m),JSON.stringify({checks:[...state.checks[m.id]],completed:state.done.has(m.id)}));
    flushProgress();
  }
  function flushProgress(){
    if(savingProgress)return savingProgress;
    savingProgress=(async()=>{
      while(pendingProgress.size){
        const [id,body]=pendingProgress.entries().next().value;
        setProgressStatus('학습 기록 저장 중');
        try{
          const response=await fetch(`/api/mission-progress/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body});
          if(!response.ok)throw new Error();
          if(pendingProgress.get(id)===body)pendingProgress.delete(id);
        }catch(error){setProgressStatus('학습 기록을 저장하지 못했습니다.',true);return;}
      }
      setProgressStatus('학습 기록 자동 저장');
    })().finally(()=>{savingProgress=null;});
    return savingProgress;
  }
  async function resetProgress(){
    if(!state.progressReady)return;
    state.progressReady=false;
    render(false);
    if(savingProgress)await savingProgress;
    try{
      const response=await fetch('/api/mission-progress',{method:'DELETE',headers:{'Content-Type':'application/json'}});
      if(!response.ok)throw new Error();
      pendingProgress.clear();state.done.clear();state.checks={};
      setProgressStatus('학습 기록 자동 저장');close();toast('학습 표시를 초기화했습니다.');
    }catch(error){setProgressStatus('학습 기록을 초기화하지 못했습니다.',pendingProgress.size>0);toast('초기화하지 못했습니다. 서버 상태를 확인해 주세요.');}
    state.progressReady=true;render(false);
  }


  function updateBreadcrumb(){
    const r=route();
    $('#breadcrumb-current').textContent=currentMission()?.short||({instructor:'강사소개',agenda:'강의 타임라인',overview:'양도소득세 주택분과',review:'내용 정리 · 업무 검토표',gate:'제출 전 신고서 검토',draft:'신고서 작성',submission:'신고·납부 인계'}[r]||'양도소득세');
  }

  function instructorPage(){return `<section class="page instructor-page"><div class="page-header"><div><div class="eyebrow">INSTRUCTOR</div><h1>강사소개</h1><p>강사 소개 페이지를 이 화면에서 확인하세요.</p></div><a class="button secondary" href="https://daeung79.github.io/MeetMe/" target="_blank" rel="noopener noreferrer">원본 사이트 열기 ${icon('arrow')}</a></div><iframe class="instructor-frame" title="강사소개 — MeetMe" src="https://daeung79.github.io/MeetMe/" referrerpolicy="no-referrer"></iframe><a class="instructor-url" href="https://daeung79.github.io/MeetMe/" target="_blank" rel="noopener noreferrer">https://daeung79.github.io/MeetMe/ ↗</a></section>`;}
  function overview(){
    return `<section class="page overview-page">
      <div class="studio-hero">
        <div class="studio-hero-copy"><div class="eyebrow"><span class="line"></span>TAXFLOW · 실무를 직접 만드는 워크숍</div>
          <h1>양도소득세(주택분)<span>로컬 AI를 활용한 바이브 코딩</span></h1>
          <p>로컬 AI로 개인정보가 담긴 문서를 분석하고, 양도소득세 신고에 필요한 도구를 만듭니다.<br> 취득·양도계약서와 주민등록초본을 분석하여 사실확인서와 양도소득세 신고서를 작성하고 출력해 보세요.</p>
        </div>
        <article class="home-instructor">
          <div class="instructor-identity">
            <img src="assets/images/instructor.jpg" alt="오대웅 강사" width="100" height="128">
            <div><h2>강사 소개</h2><h3>오대웅</h3><p>양산시 지방전산주사<br>공공행정 AI 프로젝트 · 업무자동화 강의</p>
            <button type="button" class="instructor-profile-button" data-action="instructor-profile">강사 프로필 보기 ${icon('arrow')}</button></div>
          </div>
          <a class="instructor-demo" href="${practiceUrl('documents')}"><span>양도소득세(주택분) 자동화 워크플로우<small>강의에 앞서 완성된 업무 흐름 살펴보기</small></span>${icon('arrow')}</a>
        </article>
      </div>
      <section class="home-agenda" aria-labelledby="home-agenda-title">
        <div class="home-agenda-head"><h2 id="home-agenda-title">강의 타임라인</h2><a href="#agenda">상세 일정 ${icon('arrow')}</a></div>
        <ol>${[...COURSE.sessions.slice(0,3), {time:"17:00 — 17:50", title:"양도세 계산·신고서 작성 자동화"}, COURSE.sessions[5]].map(s=>`<li><span>${s.time}</span><strong>${s.title}</strong></li>`).join('')}</ol>
        <section class="home-progress" aria-label="나의 학습 여정">
        <div class="home-progress-heading"><span>나의 학습 여정 ${state.done.size} / ${M.length} 완료</span><button type="button" class="progress-reset" data-action="reset-dialog">(학습표시 초기화)</button></div>
        <div class="home-progress-track" role="progressbar" aria-label="학습 완료 미션" aria-valuemin="0" aria-valuemax="${M.length}" aria-valuenow="${state.done.size}"><span style="width:${state.done.size/M.length*100}%"></span></div>
        <div class="home-progress-status">${progressStatusMarkup()}</div>
        </section>
      </section>
      <section class="module-group studio-setup" aria-labelledby="setup-modules"><div class="studio-section-heading"><div><div class="eyebrow">LOCAL AI SETUP</div><h2 id="setup-modules">로컬 AI 설치·실행 준비</h2><p>양도소득세(주택분) AI 자동화를 위한 바이브 코딩 도구와 로컬 AI 환경을 설정합니다.</p></div><span class="studio-count">01–03</span></div><div class="mission-grid setup-grid">${missionCards(M.slice(0,3))}</div></section>
      <section class="home-about dialog-inner" aria-labelledby="home-about-title">
        <div class="eyebrow">LOCAL AI</div>
        <h2 id="home-about-title">로컬 AI 실행 및 운영 구조</h2>
        ${aboutContent()}
        <div class="home-about-actions">${aboutReferences()}</div>
      </section>
      <section class="studio-guide-section" aria-labelledby="guide-heading">
        <div class="studio-section-heading"><div><div class="eyebrow">VIBE CODING PRACTICE</div><h2 id="guide-heading">양도소득세(주택분) 바이브 코딩 실습 가이드</h2><p>개발 순서와 요청 프롬프트를 따라 실무 도구를 만들고 결과를 확인해 보세요.</p></div><span class="studio-count">04–09</span></div>
        <div class="mission-grid">${missionCards(M.slice(3))}</div>
      </section>
    </section>`;
  }
  function missionCards(missions){return missions.map(m=>`<a href="#mission-${m.id}" class="mission-card ${state.done.has(m.id)?'done':''}"><div class="card-top"><span class="card-icon">${icon(state.done.has(m.id)?'check':m.icon)}</span><span class="card-num">${num(m.id)}</span></div><h3>${m.short}</h3>${m.workflowStep?`<span class="mission-workflow">업무 단계 ${num(m.workflowStepNumber)} · ${m.workflowStep} 관련 미션</span>`:''}<div class="card-output">${m.output}</div><div class="card-bottom"><span>${m.minutes}분 · ${m.type}</span>${state.done.has(m.id)?'<b class="green">학습 완료</b>':icon('arrow')}</div></a>`).join('');}

  function reviewPage(gate){
    const item=COURSE.checklist.find(x=>x.id===state.reviewItem)||COURSE.checklist[0];
    return `<section class="page"><div class="page-header"><div><div class="eyebrow" style="margin-bottom:9px">${gate?'BEFORE SUBMISSION / 4 → 5':'AI WORKSPACE / STEP 03'}</div><h1>${gate?'작성한 신고서를, 제출 전에.':'사실을 정리하고, 쟁점을 연결합니다.'}</h1><p>${gate?'승인된 기준과 신고서 사이의 차이를 확인하는 검토 화면':'11개 검토 항목을 따라 사실·근거·부족자료를 함께 정리하는 화면'}</p></div><span class="badge purple">AI 활용 중심 ${gate?'②':'①'}</span></div><div class="review-mode-tabs"><a class="${!gate?'active':''}" href="#review">03 내용 정리</a><a class="${gate?'active':''}" href="#gate">04 → 05 제출 전 검토</a><span>작성된 교육용 화면 예시</span></div>${gate?`<div class="gate-comparison"><div><span class="eyebrow">CHECK 10</span><h3>계산 자체가 맞는가?</h3><p>승인된 입력·규칙 → 구현 결과<br>독립 검산과 중간값을 대조합니다.</p><span class="badge amber">검산 기준 확인 필요</span></div>${icon('arrow')}<div><span class="eyebrow">CHECK 11</span><h3>신고서에 정확히 옮겼는가?</h3><p>검증한 계산 결과 → 신고서 기재값<br>항목·쪽수·최초 차이를 대조합니다.</p><span class="badge amber">담당자 확인 후 제출</span></div></div>`:`<div class="review-intro"><span class="review-ai-symbol">${icon('spark')}</span><div><strong>AI가 준비할 것</strong><p>사실관계 요약 · 법적 쟁점 후보 · 출처 연결 · 충돌·누락 목록</p></div><div class="review-human"><strong>세무사가 확인할 것</strong><p>사실 확정 · 적용 규칙 · 예외 판단 · 최종 승인</p></div></div>`}<div class="review-layout"><div class="review-list"><div class="review-list-head"><h2>업무 검토표 <span>11</span></h2><small>항목을 선택해 확인사항을 살펴보세요</small></div>${COURSE.checklist.map(c=>`<button class="review-row ${c.id===item.id?'selected':''} ${gate&&c.id>=10?'gate-focus':''}" data-review-item="${c.id}"><span class="review-row-number">${num(c.id)}</span><span class="review-row-label"><strong>${c.title}</strong><small>${c.source}</small></span><span class="review-row-status">${gate&&c.id>=10?'대조 대상':'확인 항목'}</span>${icon('arrow')}</button>`).join('')}</div><aside class="review-detail"><div class="eyebrow">CHECKPOINT ${num(item.id)}</div><h2>${item.title}</h2><p class="review-question">${item.question}</p><div class="review-detail-block"><small>필요한 근거</small><p>${item.evidence}</p></div><div class="review-detail-block"><small>검토할 때 유의할 점</small><p>${item.note}</p></div><div class="review-detail-block"><small>결과에 남길 항목</small><p>확인 사실 / 출처·쪽수 / 판단상태<br>추가 요청자료 / 담당자 확인</p></div>${item.id===6?'<button class="button secondary" data-action="residence">초본과 계약서로 충분할까요? →</button>':''}<a class="button primary" href="#mission-${item.mission}">관련 학습 미션 보기 ${icon('arrow')}</a><p class="detail-disclaimer">이 화면의 항목은 검토 구조를 보여줍니다. 실제 AI 분석이나 법적 결론은 생성하지 않습니다.</p></aside></div><div class="review-bottom-flow"><span>① 상담</span>${icon('arrow')}<span>② 자료</span>${icon('arrow')}<b>③ 정리</b>${icon('arrow')}<a href="#draft">④ 작성</a>${icon('arrow')}<a href="#gate">제출 전 검토</a>${icon('arrow')}<span>⑤ 제출</span></div></section>`;
  }
  function draftPage(){return `<section class="page"><div class="page-header"><div><div class="eyebrow" style="margin-bottom:9px">STEP 04 / PREPARE THE RETURN</div><h1>검토한 내용을, 신고서로.</h1><p>세무사가 확인한 사실과 적용 규칙을 신고서 작성에 연결합니다.</p></div><span class="badge outline">세무사 작성·확인</span></div><div class="draft-layout"><div class="draft-paper"><div class="draft-paper-top"><span>EDUCATIONAL WORKSHEET</span><span>CASE A / 04</span></div><h2>양도소득세 신고서<br><span>작성 항목 구성 예시</span></h2><p class="draft-paper-note">실제 신고서 서식이나 제출용 문서가 아닙니다.</p>${table(['작성할 항목','가져올 검토 결과'],[['납세자·대상 자산','사건 접수 카드 / 자산 현황'],['취득·양도 일자 및 가액','사실관계표 / 원문 증빙'],['비과세·공제 적용','세대·거주·지역·예외 검토'],['필요경비','지출 내역 / 경비 해당 여부'],['과세표준·산출세액 등','승인된 규칙의 계산 검토표'],['첨부자료','자료대장 / 해당 증빙']])}<div class="draft-signoff"><span>작성 담당</span><span>최종 확인 담당</span><span>확인일</span></div></div><aside class="draft-side"><span class="eyebrow">BEFORE YOU SUBMIT</span><h2>작성 후, 검토를 한 번 더.</h2><p>11개 업무 항목의 확인사항이 신고서에 반영되었는지 점검합니다. 계산 자체의 검증과 신고서로 옮긴 값의 대조를 구분합니다.</p><a class="button primary" href="#gate">제출 전 검토로 이동 ${icon('arrow')}</a><a class="button secondary" href="#review">내용 정리 다시 보기</a><div class="draft-note">제출은 별도의 5단계입니다.<br>이 프로토타입은 신고서 작성·제출을 실행하지 않습니다.</div></aside></div></section>`;}
  function residenceModal(){modal(`<div class="dialog-inner"><div class="dialog-top"><h2>거주기간 자료, 어디까지 알 수 있나요?</h2><button class="icon-button" data-action="close" aria-label="닫기">${icon('close')}</button></div><p><b>주민등록초본 + 주택 취득 시 매매계약서</b>는 첫 정리를 시작할 자료입니다. 자료의 이름만으로 실제 거주와 비과세 요건 전체를 확정할 수는 없습니다.</p>${table(['자료','확인할 수 있는 내용'],[['주민등록초본','주소 변동·전입·전출 이력'],['주택 취득계약서','취득 거래·계약일·약정내용'],['상담메모','실제 입주·퇴거·전입 지연 등 진술']])}<p>기본 이력과 실제 거주 진술이 일치하는지 먼저 대조합니다. 불일치나 의문이 있는 경우에 한해 실제 입주·퇴거 및 사용을 뒷받침하는 추가 자료를 요청합니다. 매매계약서 자체는 실제 거주를 증명하는 자료가 아닙니다.</p><p>취득시기·보유기간까지 검토하려면 실제 잔금 지급·등기접수 자료도 함께 확인합니다. 기존 교육사례는 E05에 주소이력과 실제 거주가 일치한다는 가정을 별도로 제공합니다.</p><div class="reference-links"><a href="https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1032215465" target="_blank" rel="noopener noreferrer">시행령 제154조 ↗</a><a href="https://taxlaw.nts.go.kr/pd/USEPDA002P.do?ntstDcmId=000000000000130780" target="_blank" rel="noopener noreferrer">국세법령정보시스템 판례 ↗</a></div><p style="font-size:10px">실제 자료의 내용과 해당 거래일 적용 규정은 담당 세무사가 확인합니다. 이 화면은 자료의 역할을 설명하는 교육 예시입니다.</p><div class="dialog-actions"><button class="button primary" data-action="close">검토표로 돌아가기</button></div></div>`);}
  function shell(title,body,footer='미리 작성한 교육용 예시 · 실제 처리 결과가 아닙니다.'){
    return `<div class="sample-canvas"><div class="sample-bar"><strong>${title}</strong><span>CASE A · SAMPLE</span></div>${body}<div class="sample-footer">${icon('shield')}<span>${footer}</span></div></div>`;
  }
  function table(headers,rows){return `<table class="sample-table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(v=>`<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table>`;}
  function doc(name,id){return `<div class="doc-cell">${icon('file')}<span><strong>${name}</strong><br><span class="sample-id">${id}</span></span></div>`;}


  function worksheet(id){
    const m=M[id-1];
    if(m.build)return `<div class="build-result"><span class="eyebrow">IMPLEMENTED WORKSPACE</span><h2>${escapeHtml(m.short)}</h2><p>${escapeHtml(m.subtitle)}</p>${table(['연결할 항목','구현 결과'],m.sampleRows)}<p class="sample-note">이 표는 구현 내용 안내입니다.</p></div>`;
    return shell(m.output, `<div class="automation-stage"><span class="eyebrow">AUTOMATION MODULE ${num(id)}</span><h3>${m.short}</h3><p>${m.subtitle}</p></div>${table(['항목','처리 결과·조건 예시'],m.sampleRows)}<div class="automation-handoff"><b>다음 단계로 넘기는 조건</b><p>${m.checks.join(' / ')}</p></div>`, '미리 작성한 교육용 예시 · OCR 실행·AI 분석·계산·평가 결과가 아닙니다.');
  }
  function submissionPage(){return `<section class="page"><div class="page-header"><div><div class="eyebrow">STEP 05 / HUMAN HANDOFF</div><h1>승인한 자료를, 신고 담당자에게.</h1><p>자동화 실습의 산출물을 실제 신고 업무에 인계합니다.</p></div></div>${shell('제출·납부 인계 확인',table(['업무','담당자 확인사항'],[['최종 승인','미해결 사항 처리·신고서와 첨부자료 확정'],['제출','담당자가 실제 신고 경로에서 제출'],['접수 확인','접수 결과 및 오류 여부 확인'],['납부 확인','국세·지방소득세 해당 업무와 납부 확인'],['기록 보관','최종본·접수·납부 확인자료 보관']]))}<div class="submission-actions"><a class="button primary" href="#gate">제출 전 검토 확인 ${icon('arrow')}</a></div></section>`;}
  function vscodeGuide(){return `<div class="setup-guide"><section class="model-section"><div class="model-step">1 / 처음 한 번</div><h3>VS Code 설치하기</h3><p>VS Code는 프로그램 파일과 폴더를 살펴보고, 내장 터미널에서 TAXFLOW 서버와 AI 모델 서버를 실행·종료할 때 사용하는 도구입니다.</p><ol><li><a href="https://code.visualstudio.com/download" target="_blank" rel="noopener noreferrer">VS Code 공식 다운로드 페이지 ↗</a>에서 사용하는 운영체제에 맞는 설치 파일을 받습니다.</li><li>Mac은 다운로드한 앱을 응용 프로그램 폴더로 옮겨 실행하고, Windows는 설치 파일을 실행해 안내에 따라 설치합니다.</li><li>VS Code에서 <b>파일 → 폴더 열기</b>로 프로젝트 폴더를 선택합니다. 아직 프로젝트를 내려받지 않았다면 다음 미션에서 GitHub 코드를 내려받은 뒤 생성된 <code>taxflow</code> 폴더를 여세요.</li><li>왼쪽 탐색기에서 파일 구조를 확인하고, 상단 메뉴 <b>터미널 → 새 터미널</b>을 엽니다. 다음 미션에서 명령을 이 터미널에 입력할 수 있습니다.</li></ol><p>TAXFLOW 서버와 AI 모델 서버는 각각 별도의 터미널에서 실행합니다. 각 서버를 종료하려면 해당 터미널을 선택하고 <b>Ctrl+C</b>를 누르세요.</p></section><section class="model-section codex-install-guide"><div class="model-step">2 / 처음 한 번</div><h3>Codex 앱 설치하기</h3><p>Codex는 프로젝트 파일을 살펴보고 프로그램 작업을 요청할 수 있는 데스크톱 도구입니다. 현재 Codex는 <b>ChatGPT 데스크톱 앱</b>에서 사용할 수 있습니다.</p><ol><li><a href="https://learn.chatgpt.com/docs/app" target="_blank" rel="noopener noreferrer">OpenAI 공식 데스크톱 앱 안내 ↗</a>를 열고 사용하는 운영체제에 맞는 다운로드 및 설치 안내를 확인합니다.</li><li><b>Mac:</b> 공식 안내에서 macOS용 앱을 내려받고 설치 화면의 안내를 따라 설치합니다. <b>Windows:</b> <a href="https://learn.chatgpt.com/docs/windows/windows-app" target="_blank" rel="noopener noreferrer">Windows 설치 안내 ↗</a>에서 Microsoft Store를 열어 앱을 설치합니다.</li><li>설치한 앱을 실행하고 <b>ChatGPT 계정으로 로그인</b>합니다. 기존에 앱을 설치했다면 실행하거나 최신 버전으로 업데이트합니다.</li><li>앱의 선택 메뉴에서 <b>Codex</b>를 선택하고 새 대화를 시작합니다. 프로젝트 폴더를 선택해 작업할 수 있습니다. TAXFLOW 폴더는 2번 미션에서 내려받습니다.</li></ol><p><b>첫 질문 예시:</b> “이 프로젝트의 폴더 구조와 서버 실행 방법을 쉽게 설명해 줘.” Codex가 제안하는 변경이나 실행 요청은 내용을 확인한 뒤 진행하세요.</p><p>계정과 이용 가능 여부는 사용 중인 서비스 및 요금제에 따라 다를 수 있습니다. Codex 앱은 3번 미션에서 설치하는 로컬 AI 모델과 별개의 도구입니다.</p></section><section class="vscode-visual-guide" aria-labelledby="vscode-visual-title"><div class="model-step">화면으로 미리 보기</div><h3 id="vscode-visual-title">VS Code에서 이렇게 사용합니다</h3><p>아래 그림은 이해를 돕는 예시입니다. 프로젝트는 2번 미션에서 내려받고, AI 모델 파일은 3번 미션에서 준비합니다.</p>
<figure class="vscode-example"><figcaption><b>실제 VS Code 화면에서 버튼 찾기</b><span>번호는 버튼 위치를 가리키는 안내 표시입니다</span></figcaption><div class="vscode-real-shot"><img src="assets/images/vscode-screen.png" alt="VS Code에서 왼쪽 탐색기와 아래 터미널 패널이 열린 화면"><span class="vscode-pin pin-explorer" aria-hidden="true">1</span><span class="vscode-pin pin-panel" aria-hidden="true">2</span><span class="vscode-pin pin-terminal" aria-hidden="true">3</span></div><ol class="vscode-shot-legend"><li><b>탐색기:</b> 왼쪽 위 파일 모양 아이콘을 눌러 프로젝트 폴더를 봅니다.</li><li><b>패널:</b> 오른쪽 위 아래쪽이 채워진 사각형 아이콘을 눌러 아래 패널을 열거나 닫습니다.</li><li><b>터미널:</b> 아래 패널의 ‘터미널’ 탭을 선택합니다. 새 터미널은 상단 메뉴 <b>터미널 → 새 터미널</b>로 열 수 있습니다.</li></ol><p>예시 화면에서는 탐색기와 터미널이 이미 열려 있습니다. VS Code 버전과 창 크기에 따라 버튼 배치가 달라질 수 있습니다.</p></figure>

<figure class="vscode-example"><figcaption><b>① 프로젝트 폴더 구조 확인</b><span>파일 → 폴더 열기 → taxflow 선택</span></figcaption><div class="vscode-window"><div class="vscode-titlebar"><span>● ● ●</span> Visual Studio Code · 예시</div><div class="vscode-layout"><div class="vscode-tree"><small>탐색기</small><strong>▾ TAXFLOW</strong><span>▸ app <i>서비스 화면·서버 코드</i></span><span>▸ data <i>저장 데이터</i></span><span>▸ models <i>AI 모델 파일</i></span><span>　 README.md</span><span>　 requirements.txt</span></div><div class="vscode-editor"><b>프로젝트 폴더</b><p>왼쪽에서 폴더를 펼쳐<br>프로그램 구조를 살펴보세요.</p></div></div></div><p>폴더나 파일은 설치·실행 단계에 따라 다르게 보일 수 있습니다.</p></figure>
<figure class="vscode-example"><figcaption><b>② TAXFLOW 서버 켜기</b><span>터미널 → 새 터미널</span></figcaption><div class="vscode-window"><div class="vscode-titlebar"><span>● ● ●</span> 터미널 1 · TAXFLOW 서버</div><div class="vscode-terminal"><div><em>프로젝트 폴더에서</em></div><div><span>$</span> python -m app</div><div class="terminal-result">TAXFLOW http://127.0.0.1:8765/</div><div class="terminal-muted">서버 실행 중 · 이 터미널을 열어 두세요</div></div></div><p>가상환경을 활성화한 뒤 실행합니다. 종료하려면 이 터미널에서 <b>Ctrl+C</b>를 누르세요. 자세한 순서는 <a href="#mission-2">2번 미션</a>에 있습니다.</p></figure>
<figure class="vscode-example"><figcaption><b>③ AI 모델 서버 켜기</b><span>별도의 새 터미널 사용</span></figcaption><div class="vscode-window"><div class="vscode-titlebar"><span>● ● ●</span> 터미널 2 · AI 모델 서버 · macOS 8B 예시</div><div class="vscode-terminal"><div><em>프로젝트 폴더에서 · 모델 파일과 llama.cpp 준비 후</em></div><div><span>$</span> llama-server -m models/qwen3-vl-8b/Qwen3VL-8B-Instruct-Q4_K_M.gguf &#92;</div><div>　 --mmproj models/qwen3-vl-8b/mmproj-Qwen3VL-8B-Instruct-F16.gguf &#92;</div><div>　 --host 127.0.0.1 --port 8080 -ngl 99 -c 8192</div><div class="terminal-muted">AI 서버 실행 중 · 종료: Ctrl+C</div></div></div><p>TAXFLOW와 AI는 각각 별도의 터미널에서 켭니다. 4B 또는 8B 중 하나를 선택하고 설치·실행 명령은 <a href="#mission-3">3번 미션</a>에서 확인하세요.</p></figure></section></div>`;}
  function setupGuide(){return `<div class="setup-guide"><div class="mission-brief"><strong>내 컴퓨터에서 TAXFLOW 열기</strong>GitHub는 프로그램 코드를 보관하는 곳입니다. 코드를 내 컴퓨터에 내려받고 프로그램을 실행한 뒤 인터넷 브라우저로 화면을 엽니다. 아래에서 사용하는 컴퓨터에 맞는 순서를 따라 하세요.</div><div class="setup-architecture"><h3>프로그램은 어떻게 연결될까요?</h3><div class="architecture-flow"><div><b>GitHub</b><span>프로그램 코드 보관</span></div><span class="architecture-arrow">→ 코드 내려받기 →</span><div><b>내 컴퓨터</b><span>프로그램 폴더 · Python 서버</span></div><span class="architecture-arrow">↔ 화면 열기 · 저장 ↔</span><div><b>브라우저와 저장 파일</b><span>화면: 127.0.0.1:8765<br>상담 기록: data/taxflow.sqlite3</span></div></div><p>상담 기록은 이 PC의 저장 파일에 남습니다. GitHub에서 코드를 받는 것과 상담 기록을 저장하는 것은 별개의 과정입니다.</p></div><div class="setup-architecture"><h3>Python 서버 운영 구성도</h3><div class="architecture-flow"><div><b>① 웹 브라우저</b><span>사용자가 화면을 열고 상담 내용을 입력합니다.</span></div><span class="architecture-arrow">↔ 화면과 저장 요청 ↔</span><div><b>② Python 서버</b><span>내 PC에서 실행하며 화면을 제공하고 상담 요청을 처리합니다.<br>127.0.0.1:8765</span></div><span class="architecture-arrow">↔ 기록 저장·조회 ↔</span><div><b>③ SQLite 저장 파일</b><span>상담 기록이 내 PC의 data/taxflow.sqlite3에 보관됩니다.</span></div></div><p>서버를 실행한 터미널을 열어 두면 브라우저에서 사용할 수 있습니다. Ctrl+C로 서버를 끄면 화면에 다시 접속하려면 서버를 다시 켜야 합니다. 저장된 상담 기록은 파일에 남습니다.</p></div><div class="setup-codex"><h3>Codex로 실행하기</h3><p>Codex를 사용하면 명령어를 직접 입력하는 대신 아래 내용을 요청할 수 있습니다. TAXFLOW를 실행하려면 Python이 필요합니다. Codex가 설치 여부를 확인하고, 설치되어 있지 않으면 설치를 안내하거나 필요한 승인을 받은 뒤 설치를 진행합니다. 실행이 끝나면 Codex가 알려주는 주소를 브라우저에서 여세요. 서버가 실행 중이어야 화면에 접속할 수 있습니다.</p><div class="codex-request" id="codex-prompt">GitHub에서 https://github.com/DaeUng79/taxflow.git을 내려받아 내 컴퓨터에서 실행해 줘. Python과 Git이 설치되어 있는지 먼저 확인하고, 설치되어 있지 않으면 설치 방법을 안내하거나 필요한 승인을 받은 뒤 설치해 줘. 서버를 실행한 뒤 접속 주소를 알려줘. 오류가 발생하면 원인과 해결 방법도 쉽게 설명해 줘.</div><button type="button" class="button secondary codex-copy" data-action="copy-codex">프롬프트 복사</button><p>Codex에서 프로그램을 개발하거나 수정할 때는 <b>GPT-6.1 Terra 모델의 High 추론 수준</b>을 권장합니다.</p></div><p class="setup-intro">명령어는 한 줄씩 입력하고 Enter를 누르세요. <b>가상환경</b>은 이 프로그램의 실행 환경을 따로 보관하는 폴더입니다.</p><div class="setup-platforms"><section><h3>🍎 맥북 · macOS</h3><ol><li>Spotlight에서 <b>터미널</b>을 검색해 엽니다. Git과 Python이 설치됐는지 확인합니다.<pre>git --version\npython3 --version</pre></li><li>작업할 폴더에서 코드를 내려받고 프로젝트 폴더로 이동합니다.<pre>git clone https://github.com/DaeUng79/taxflow.git\ncd taxflow</pre>이미 내려받았다면 기존 프로젝트 폴더로 이동하세요.</li><li>처음 한 번 실행 환경을 만들고 켭니다.<pre>python3 -m venv .venv\nsource .venv/bin/activate</pre></li><li>필요한 항목을 확인하고 서버를 켭니다.<pre>python -m pip install -r requirements.txt\npython -m app</pre></li></ol><p>다음에 실행할 때는 프로젝트 폴더에서 <code>source .venv/bin/activate</code>와 <code>python -m app</code>를 차례로 입력하세요.</p></section><section><h3>🪟 윈도우 · Windows</h3><ol><li>시작 메뉴에서 <b>PowerShell</b>을 검색해 엽니다. Git과 Python이 설치됐는지 확인합니다.<pre>git --version\npy -3 --version</pre></li><li>작업할 폴더에서 코드를 내려받고 프로젝트 폴더로 이동합니다.<pre>git clone https://github.com/DaeUng79/taxflow.git\ncd taxflow</pre>이미 내려받았다면 기존 프로젝트 폴더로 이동하세요.</li><li>처음 한 번 실행 환경을 만들고 켭니다.<pre>py -3 -m venv .venv\n.venv\\Scripts\\Activate.ps1</pre>실행이 차단되면 이 창에서 <code>Set-ExecutionPolicy -Scope Process RemoteSigned</code>를 입력하고 활성화 명령을 다시 실행하세요.</li><li>필요한 항목을 확인하고 서버를 켭니다.<pre>python -m pip install -r requirements.txt\npython -m app</pre></li></ol><p>다음에 실행할 때는 프로젝트 폴더에서 <code>.venv\\Scripts\\Activate.ps1</code>와 <code>python -m app</code>를 차례로 입력하세요.</p></section></div><div class="setup-finish"><h3>화면 열기와 종료</h3><p>터미널에 <code>TAXFLOW http://127.0.0.1:8765/</code>가 표시되면 창을 열어 둔 채 브라우저에서 <a href="http://127.0.0.1:8765/index.html#mission-2">TAXFLOW 화면</a>을 여세요. 이 주소는 내 컴퓨터를 가리킵니다.</p><p>마칠 때는 서버를 실행한 창에서 <b>Ctrl+C</b>를 누릅니다. 가상환경도 종료하려면 <code>deactivate</code>를 입력하세요. 버전 확인이 안 되면 Git 또는 Python 3를 먼저 설치하고 새 창을 여세요.</p><p>상담 저장과 로컬 계약서 분석 화면을 사용할 수 있습니다. 세액 계산은 아직 연결되지 않았습니다.</p></div></div>`;}
  function modelGuide(){return `<div class="model-guide">
    <div class="mission-brief"><strong>내 컴퓨터에서 계약서 읽기</strong>2번 미션에서 TAXFLOW를 실행했다면 그 터미널은 그대로 두세요. AI는 별도의 새 터미널에서 실행합니다. 사용하는 컴퓨터에 맞는 안내를 펼쳐 따라 하세요.</div>
    <div class="model-flow"><span>① 준비하기</span><b>→</b><span>② AI 파일 받기</span><b>→</b><span>③ AI 켜기</span><b>→</b><span>④ 계약서 확인</span></div>
    <section class="ai-architecture" aria-label="인공지능 운영 구성도"><div class="model-step">HOW IT WORKS</div><h3>인공지능 운영 구성도</h3><p>내 컴퓨터 안에서 계약서가 분석되는 과정입니다. AI와 웹 화면은 각각 켜야 합니다.</p><div class="ai-architecture-flow"><div><span>01</span><strong>웹 화면</strong><small>PDF 선택 · 결과 확인<br>127.0.0.1:8765</small></div><b aria-hidden="true">→</b><div><span>02</span><strong>TAXFLOW 서버</strong><small>PDF를 페이지별 이미지로 변환<br>이미지와 요청을 AI에 전달</small></div><b aria-hidden="true">→</b><div><span>03</span><strong>AI 서버</strong><small>llama-server · 127.0.0.1:8080<br>8B 모델 + 이미지 인식 파일</small></div><b aria-hidden="true">→</b><div><span>04</span><strong>결과 확인</strong><small>부동산 · 대금 · 당사자<br>원본 대조 후 JSON 저장</small></div></div><p>모델 파일과 이미지 인식 파일은 하나의 AI 서버에서 함께 작동합니다. 분석 결과는 자동으로 데이터베이스에 저장되지 않으며 JSON 저장 버튼으로 파일을 받을 수 있습니다. 4B는 8081번을 사용합니다.</p></section>
    <section class="model-section model-fit-guide"><div class="model-step">BEFORE YOU START</div><h3>내 컴퓨터에서 어떤 AI를 쓸 수 있을까요?</h3><p>외부 사이트 <b>CanIRunLLM</b>에서 컴퓨터의 메모리와 AI 모델을 선택하면 필요한 메모리를 대략 비교할 수 있습니다. 사이트는 영문이지만 아래 순서로 확인할 수 있습니다.</p><ol><li>아래 버튼을 눌러 사이트를 엽니다.</li><li><b>What can I run?</b>을 선택하고, Mac 모델 또는 Windows의 그래픽카드와 메모리를 선택합니다. 특정 모델을 확인하려면 <b>Will it run?</b>을 선택합니다.</li><li>현재 서비스의 8B 모델과 비교할 때는 가능한 경우 모델, <b>Q4_K_M</b>과 문맥 길이 <b>8K</b>를 선택해 결과를 확인합니다. 목록에 Qwen3-VL이 없다면 유사한 8B 텍스트 모델은 대략적인 참고만 됩니다.</li></ol><a class="model-open" href="https://canirunllm.dev/" target="_blank" rel="noopener noreferrer">내 컴퓨터에 맞는 AI 확인하기 ↗</a><p><b>내 컴퓨터 사양 확인:</b> Mac은 화면 왼쪽 위  메뉴 → <b>이 Mac에 관하여</b>에서 칩과 메모리를 확인합니다. Windows는 <b>설정 → 시스템 → 정보</b>에서 메모리를, 작업 관리자 → <b>성능 → GPU</b>에서 그래픽카드와 전용 GPU 메모리를 확인합니다.</p><p class="model-fit-note">사이트의 결과는 보장된 실행 여부가 아니라 추정치입니다. 계약서에 사용하는 Qwen3-VL은 별도의 이미지 인식 파일과 이미지 처리 메모리가 더 필요할 수 있으며, 사이트가 이를 포함하는지 확인해야 합니다. 다른 앱 사용량과 문서 크기에 따라서도 달라지므로 실제 분석으로 확인하세요.</p></section>
    <details class="platform-guide" id="windows-guide"><summary>🪟 Windows 사용자 안내 · 여기를 눌러 펼치기</summary><div class="platform-content">
      <p class="platform-intro">Windows에서는 <b>PowerShell</b>이라는 명령 입력 창을 사용합니다. 아래 명령은 한 줄씩 복사해 붙여 넣고 Enter를 누르세요. 기본 8B 모델을 안내합니다. 메모리가 부족하거나 느리면 4B를 사용하세요.</p>
      <section class="model-section"><div class="model-step">1 / 처음 한 번</div><h3>PowerShell 열고 준비하기</h3><ol><li>파일 탐색기에서 <b>TAXFLOW_VibeCode</b> 폴더를 엽니다.</li><li>창 위쪽의 폴더 경로가 표시된 주소창을 클릭하고 <code>powershell</code>을 입력한 뒤 Enter를 누릅니다. 해당 폴더에서 PowerShell이 열립니다.</li><li>아래 명령으로 현재 폴더와 Python을 확인합니다. 경로 끝에 프로젝트 폴더 이름이 보이고 Python 버전이 표시되어야 합니다.</li></ol><pre>Get-Location
py -3 --version</pre><p>Python이 없으면 <a href="https://www.python.org/downloads/windows/" target="_blank" rel="noopener noreferrer">Python 공식 다운로드 페이지</a>에서 설치하고 새 PowerShell 창을 여세요.</p><p>AI 실행 프로그램이 설치됐는지 확인합니다.</p><pre>llama-server --version</pre><p>명령을 찾을 수 없다면 Windows 패키지 관리자 <b>winget</b>이 있는 경우 아래 명령으로 설치합니다. 설치 후 PowerShell을 새로 열고 위 버전 확인을 다시 실행하세요.</p><pre>winget install llama.cpp</pre><p>winget을 사용할 수 없거나 명령을 찾지 못하면 <a href="https://github.com/ggml-org/llama.cpp/blob/master/docs/install.md" target="_blank" rel="noopener noreferrer">llama.cpp 공식 설치 안내</a>를 확인하세요. 설치 후 Qwen3-VL을 읽지 못하면 최신 버전이 필요한지 확인합니다.</p><p>2번 미션에서 가상환경과 필요한 패키지를 이미 준비했다면 다시 설치할 필요가 없습니다. AI를 실행하는 이 창에서는 가상환경을 활성화하지 않아도 됩니다. 아직 준비하지 않았다면 2번 미션의 설치 순서를 먼저 완료하세요.</p></section>
      <section class="model-section"><div class="model-step">2 / 처음 한 번</div><h3>8B AI 파일 두 개 받기</h3><p>이미 받았다면 건너뛰세요. 인터넷이 필요하며 두 파일은 합쳐 약 6.2GB입니다. <b>curl.exe</b>를 입력해야 합니다. 메모리가 부족하면 아래의 4B 안내를 선택하세요.</p><pre>New-Item -ItemType Directory -Force -Path "models/qwen3-vl-8b"
curl.exe -fL --progress-bar -o models/qwen3-vl-8b/Qwen3VL-8B-Instruct-Q4_K_M.gguf https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct-GGUF/resolve/main/Qwen3VL-8B-Instruct-Q4_K_M.gguf
curl.exe -fL --progress-bar -o models/qwen3-vl-8b/mmproj-Qwen3VL-8B-Instruct-F16.gguf https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct-GGUF/resolve/main/mmproj-Qwen3VL-8B-Instruct-F16.gguf
Get-ChildItem models/qwen3-vl-8b</pre><p>마지막 명령으로 모델 파일과 이미지 인식 파일 두 개가 보이는지 확인합니다.</p><details><summary>더 가벼운 4B 파일을 받으려면?</summary><p>4B 파일은 합쳐 약 3.3GB입니다. 이미 받았다면 건너뛰세요.</p><pre>New-Item -ItemType Directory -Force -Path "models/qwen3-vl-4b"
curl.exe -fL --progress-bar -o models/qwen3-vl-4b/Qwen3VL-4B-Instruct-Q4_K_M.gguf https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct-GGUF/resolve/main/Qwen3VL-4B-Instruct-Q4_K_M.gguf
curl.exe -fL --progress-bar -o models/qwen3-vl-4b/mmproj-Qwen3VL-4B-Instruct-F16.gguf https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct-GGUF/resolve/main/mmproj-Qwen3VL-4B-Instruct-F16.gguf
Get-ChildItem models/qwen3-vl-4b</pre></details></section>
      <section class="model-section"><div class="model-step">3 / 사용할 때마다</div><h3>8B AI 켜기</h3><p>프로젝트 폴더에서 아래 명령을 실행합니다. 이 명령은 CPU로 실행하므로 컴퓨터에 따라 시간이 걸릴 수 있습니다. <code>server is listening</code>이 표시되면 창을 열어 둡니다.</p><pre>llama-server -m models/qwen3-vl-8b/Qwen3VL-8B-Instruct-Q4_K_M.gguf --mmproj models/qwen3-vl-8b/mmproj-Qwen3VL-8B-Instruct-F16.gguf --host 127.0.0.1 --port 8080 -ngl 0 -c 8192</pre><details><summary>더 가벼운 4B AI를 켜려면?</summary><p>8B가 실행 중이면 먼저 해당 창에서 Ctrl+C를 눌러 종료하세요.</p><pre>llama-server -m models/qwen3-vl-4b/Qwen3VL-4B-Instruct-Q4_K_M.gguf --mmproj models/qwen3-vl-4b/mmproj-Qwen3VL-4B-Instruct-F16.gguf --host 127.0.0.1 --port 8081 -ngl 0 -c 8192</pre></details><p>화면에서 8B를 선택하면 8080번, 4B를 선택하면 8081번으로 연결합니다. 사용을 마치면 AI 창에서 Ctrl+C를 누르세요.</p></section>
      <section class="model-section"><div class="model-step">4 / 사용할 때마다</div><h3>TAXFLOW를 켜고 계약서 확인하기</h3><p>2번에서 TAXFLOW가 이미 실행 중이면 그대로 사용하세요. <b>꺼져 있을 때만</b> AI 창을 열어 둔 채 프로젝트 폴더에서 새 PowerShell 창을 열고 아래 명령을 실행합니다. 기존 가상환경의 Python을 직접 사용하므로 활성화 명령은 필요하지 않습니다.</p><pre>&amp; "./.venv/Scripts/python.exe" -m app</pre><p><code>TAXFLOW http://127.0.0.1:8765/</code>가 표시되면 아래 화면을 열고, 기본 모델인 8B를 선택한 뒤 PDF를 등록하세요. 4B를 실행했다면 4B를 선택하세요.</p><a class="model-open" href="/chapters/ch01_pdf_Parsing/">계약서 분석 화면 열기 →</a><details><summary>AI 연결 확인하기</summary><p>새 PowerShell 창에서 현재 켠 모델의 명령 하나만 실행하세요. <code>{"status":"ok"}</code>가 보이면 준비된 상태입니다.</p><p>4B:</p><pre>curl.exe -sS http://127.0.0.1:8081/health</pre><p>8B:</p><pre>curl.exe -sS http://127.0.0.1:8080/health</pre></details></section>
      <section class="model-section troubleshooting"><div class="model-step">도움말</div><h3>잘 안 될 때</h3><ul><li><b>명령을 찾을 수 없음</b> — 설치 후 PowerShell을 새로 열고 프로젝트 폴더에서 다시 시도하세요.</li><li><b>파일을 찾을 수 없음</b> — <code>Get-Location</code>으로 프로젝트 폴더인지 확인하고, 2번의 파일 확인 명령을 실행하세요.</li><li><b>서버에 연결할 수 없음</b> — AI 창이 켜져 있는지와 화면에서 고른 4B·8B가 일치하는지 확인하세요.</li><li><b>느리거나 메모리 부족</b> — 다른 앱과 다른 모델을 종료한 후 4B를 사용해 보세요. CPU 실행은 시간이 오래 걸릴 수 있습니다.</li><li><b>추출 결과가 다름</b> — AI는 오류를 낼 수 있으므로 금액과 인적사항을 원본과 비교해 수정하세요.</li></ul></section>
    </div></details>
    <details class="platform-guide" open><summary>🍎 Mac 사용자 안내 · 여기를 눌러 접기</summary><div class="platform-content">
    <section class="model-section"><div class="model-step">먼저 알아두세요</div><h3>무엇이 필요한가요?</h3><p><b>llama.cpp</b>는 AI를 실행하는 프로그램입니다. <b>Qwen3-VL</b>은 계약서 내용을 읽는 AI입니다. 사진을 읽기 위해 AI 파일과 이미지 인식 파일, 두 파일이 함께 필요합니다.</p><p>지금 사용한 <b>8B</b>는 더 큰 모델입니다. 속도가 느리거나 메모리가 부족하면 더 작은 <b>4B</b>를 시험할 수 있습니다. 맥북 16GB에서는 하나씩 실행하는 것을 권장합니다.</p><p>프로그램과 AI 파일을 설치할 때는 인터넷이 필요합니다. 설치 후 계약서 분석은 내 컴퓨터에서 진행합니다. 결과의 금액과 이름은 꼭 계약서 원본과 비교해 주세요.</p></section>
    <section class="model-section"><div class="model-step">1 / 처음 한 번</div><h3>터미널 열고 폴더로 이동하기</h3><p>맥북에서 <b>Command + 스페이스</b>를 누르고 <b>터미널</b>을 검색해 여세요. 명령은 한 줄씩 복사해 붙여 넣고 <b>Enter</b>를 누릅니다.</p><ol><li>Finder에서 <b>TAXFLOW_VibeCode</b> 폴더를 찾습니다.</li><li>터미널에 <code>cd </code>를 입력하고, <b>cd 뒤에 공백 한 칸</b>을 둡니다.</li><li>Finder의 <b>TAXFLOW_VibeCode</b> 폴더를 터미널 창에 끌어놓고 Enter를 누릅니다.</li></ol><p>다음 명령을 입력했을 때 경로 끝에 <code>TAXFLOW_VibeCode</code>가 보이면 맞습니다. 아래 명령은 모두 이 폴더에서 실행합니다.</p><pre>pwd</pre><p>AI 실행 프로그램이 설치되어 있는지 확인합니다. 숫자가 표시되면 설치되어 있습니다.</p><pre>llama-server --version</pre><p><code>command not found</code>가 나오고 Homebrew가 이미 설치되어 있다면 다음 명령으로 설치합니다. Homebrew가 없다면 먼저 Homebrew를 설치해야 합니다.</p><pre>brew install llama.cpp</pre><p>2번 미션에서 가상환경과 필요한 패키지를 이미 준비했다면 다시 설치할 필요가 없습니다. AI를 실행하는 이 터미널에서는 가상환경을 활성화하지 않아도 됩니다. 아직 준비하지 않았다면 2번 미션의 설치 순서를 먼저 완료하세요.</p></section>
    <section class="model-section"><div class="model-step">2 / 처음 한 번</div><h3>계약서를 읽을 AI 파일 받기</h3><p>이미 8B 파일을 받았다면 이 단계는 건너뛰세요. 처음이라면 인터넷에 연결한 뒤 아래 명령을 <b>한 줄씩</b> 실행합니다. 두 파일을 합쳐 약 6.2GB이므로 다운로드에 시간이 걸릴 수 있습니다.</p><p><b>① 저장할 폴더 만들기</b></p><pre>mkdir -p models/qwen3-vl-8b</pre><p><b>② 계약서 내용을 정리하는 AI 파일 받기</b></p><pre>curl -fL --progress-bar -o models/qwen3-vl-8b/Qwen3VL-8B-Instruct-Q4_K_M.gguf https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct-GGUF/resolve/main/Qwen3VL-8B-Instruct-Q4_K_M.gguf</pre><p><b>③ 이미지를 읽는 파일 받기</b></p><pre>curl -fL --progress-bar -o models/qwen3-vl-8b/mmproj-Qwen3VL-8B-Instruct-F16.gguf https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct-GGUF/resolve/main/mmproj-Qwen3VL-8B-Instruct-F16.gguf</pre><p>다운로드가 끝나면 다음 명령으로 파일 두 개가 있는지 확인합니다.</p><pre>ls -lh models/qwen3-vl-8b</pre><details><summary>더 가벼운 4B를 사용하고 싶어요</summary><p>4B 파일 두 개는 약 3.3GB입니다. 8B 대신 4B를 사용하려면 아래 명령을 프로젝트 폴더에서 한 줄씩 실행하세요. 이미 받았다면 건너뛰어도 됩니다.</p><pre>mkdir -p models/qwen3-vl-4b
curl -fL --progress-bar -o models/qwen3-vl-4b/Qwen3VL-4B-Instruct-Q4_K_M.gguf https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct-GGUF/resolve/main/Qwen3VL-4B-Instruct-Q4_K_M.gguf
curl -fL --progress-bar -o models/qwen3-vl-4b/mmproj-Qwen3VL-4B-Instruct-F16.gguf https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct-GGUF/resolve/main/mmproj-Qwen3VL-4B-Instruct-F16.gguf
ls -lh models/qwen3-vl-4b</pre></details></section>
    <section class="model-section"><div class="model-step">3 / 사용할 때마다</div><h3>계약서를 읽는 AI 켜기</h3><p>터미널이 <b>TAXFLOW_VibeCode 폴더</b>에 있는지 확인하고, 8B를 사용하려면 아래 명령을 실행하세요.</p><pre>llama-server -m models/qwen3-vl-8b/Qwen3VL-8B-Instruct-Q4_K_M.gguf --mmproj models/qwen3-vl-8b/mmproj-Qwen3VL-8B-Instruct-F16.gguf --host 127.0.0.1 --port 8080 -ngl 99 -c 8192</pre><p>글자가 여러 줄 나타난 뒤 <code>server is listening</code>이 보이면 준비된 것입니다. <b>이 터미널은 닫지 마세요.</b> AI를 처음 불러올 때는 잠시 기다려야 합니다.</p><details><summary>8B 대신 4B를 켜려면?</summary><p>8B가 켜져 있다면 해당 터미널에서 <b>Ctrl+C</b>로 끄고, 프로젝트 폴더에서 다음 명령을 실행하세요.</p><pre>llama-server -m models/qwen3-vl-4b/Qwen3VL-4B-Instruct-Q4_K_M.gguf --mmproj models/qwen3-vl-4b/mmproj-Qwen3VL-4B-Instruct-F16.gguf --host 127.0.0.1 --port 8081 -ngl 99 -c 8192</pre></details><p>두 AI를 구별하기 위해 8B는 <b>8080</b>, 4B는 <b>8081</b>이라는 연결 번호를 사용합니다. AI를 끄려면 해당 터미널에서 <b>Ctrl+C</b>를 누르세요.</p></section>
    <section class="model-section"><div class="model-step">4 / 사용할 때마다</div><h3>TAXFLOW를 열고 계약서 확인하기</h3><p>2번에서 TAXFLOW가 이미 실행 중이면 그대로 사용하세요. <b>꺼져 있을 때만</b> AI를 켠 터미널은 그대로 두고 새 터미널을 열어 프로젝트 폴더로 이동한 다음 아래 명령을 한 줄씩 실행합니다. 새 터미널에서는 기존 가상환경을 다시 활성화합니다.</p><pre>source .venv/bin/activate
python -m app</pre><p>화면에 <code>TAXFLOW http://127.0.0.1:8765/</code>가 나타나면 준비됐습니다. 아래 버튼을 누르고, <b>실행한 AI와 같은 모델</b>을 선택한 뒤 PDF를 등록하세요.</p><a class="model-open" href="/chapters/ch01_pdf_Parsing/">계약서 분석 화면 열기 →</a><p>왼쪽에서 원본을 보고 오른쪽에서 부동산, 매매대금, 매도인·매수인 정보를 확인합니다. 필요하면 JSON 보기에서 내용을 수정하고 저장할 수 있습니다.</p><details><summary>AI가 켜져 있는지 확인하는 방법</summary><p>새 터미널에서 <b>실행한 모델에 해당하는 명령 하나만</b> 입력하세요. <code>{"status":"ok"}</code>가 나오면 연결할 수 있습니다.</p><p>8B를 켰을 때:</p><pre>curl -sS http://127.0.0.1:8080/health</pre><p>4B를 켰을 때:</p><pre>curl -sS http://127.0.0.1:8081/health</pre></details></section>
    <section class="model-section troubleshooting"><div class="model-step">도움말</div><h3>잘 안 될 때 확인해 보세요</h3><ul><li><b>파일을 찾을 수 없다고 나와요.</b> — 1번처럼 프로젝트 폴더로 이동한 뒤 다시 실행하세요. 이미 모델 폴더 안에 있다면 명령의 <code>models/qwen3-vl-8b/</code> 부분을 빼고 파일 이름만 적어야 합니다.</li><li><b>모델 서버에 연결할 수 없어요.</b> — 3번 터미널이 열려 있는지, 계약서 화면에서 실행한 모델과 같은 8B 또는 4B를 선택했는지 확인하세요.</li><li><b>이미 사용 중인 번호라고 나와요.</b> — 같은 모델 서버가 다른 터미널에서 이미 실행 중일 수 있습니다. 기존 터미널을 확인하세요.</li><li><b>너무 느리거나 메모리가 부족해요.</b> — 사용하지 않는 앱을 닫고, 8B를 종료한 뒤 4B를 실행해 보세요.</li><li><b>계약서의 숫자나 이름이 달라요.</b> — AI는 잘못 읽을 수 있습니다. 원본과 대조해 수정해 주세요.</li></ul></section>
    </div></details>
    <div class="model-links"><a href="https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct-GGUF" target="_blank" rel="noopener noreferrer">8B 파일 출처 ↗</a><a href="https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct-GGUF" target="_blank" rel="noopener noreferrer">4B 파일 출처 ↗</a><a href="https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md" target="_blank" rel="noopener noreferrer">AI 실행 프로그램 안내 ↗</a></div>
  </div>`;}

  function buildPrompt(m, index){
    const context = m.id>=4 && m.id<=9 ? `TAXFLOW의 ${m.short} 기능을 작업합니다. 기존 기능과 저장 구조를 먼저 확인하고 재사용하며, 이번 단계에 필요한 부분만 변경해 주세요. 상담 데이터와 원본 자료를 보존하고 저장 구조를 초기화하지 마세요. 검증에는 가상 자료와 별도 테스트 DB를 사용하고, 변경 내용과 실제로 실행한 검증 및 미검증 항목을 알려 주세요.` : `TAXFLOW 프로젝트의 ${m.id}번 ${m.short} 기능을 작업합니다. 먼저 README와 관련 코드를 읽고 현재 동작을 확인해 주세요. 이미 구현된 기능은 재사용하고 이번 단계에 필요한 부분만 변경하세요. 상담 데이터와 원본 자료를 보존하고 스키마를 초기화하지 마세요. 검증에는 가상 자료와 별도 테스트 DB를 사용하세요. 변경 후 수정 파일, 확인 방법, 실제로 실행한 검증과 미검증 항목을 알려 주세요.`;
    if(m.id>=5 && m.id<=9 && index==='connect')return `제가 구현한 ${m.short} 화면을 가상 자료로 실행하고 화면 이미지를 만들어 이 미션의 “내가 만든 화면” 탭에 표시해 주세요. 기존 결과 이미지 위치를 확인해 교체하고 실제 상담 정보는 이미지에 포함하지 마세요. 기존 기능과 저장 데이터는 보존해 주세요.`;
    if(m.id>=5 && m.id<=9 && index==='context')return `TAXFLOW의 ${m.short} 기능을 작업합니다. 기존 기능과 저장 구조를 먼저 확인하고 재사용하며 상담 데이터와 원본 자료를 보존해 주세요. 아직 변경하지 말고 현재 동작과 다음 단계의 진행 순서를 설명해 주세요:\n${m.build.stages.map((step,i)=>`${i+1}. ${step.title}`).join('\n')}`;
    if(m.id>=5 && m.id<=9 && index==='verify')return `TAXFLOW의 ${m.short} 기능을 점검해 주세요. 가상 자료와 별도 테스트 데이터를 사용하고 기존 저장 자료를 보존하세요. 다음 확인사항과 관련된 기존 검증을 찾아 실행하고, 실행한 검증과 미검증 항목을 구분해 알려 주세요:\n${m.build.stages.map((step,i)=>`${i+1}. ${step.verify}`).join('\n')}`;
    if(m.id===4 && index==='connect')return '제가 구현한 신고서류 등록·분석 화면을 가상 자료로 실행하고 화면 이미지를 만들어 이 미션의 “내가 만든 화면” 탭에 표시해 주세요. 기존 결과 이미지 위치를 확인해 교체하고, 실제 상담 정보는 이미지에 포함하지 마세요. 기존 기능과 저장 데이터는 보존해 주세요.';
    if(m.id===4 && index==='context')return `${context}\n\n준비: 1~3번을 마치고 TAXFLOW와 로컬 AI를 실행해 주세요. 기존 서류 등록, 분석, 상담 저장 기능을 먼저 살펴보고 재사용해 주세요. 아직 변경하지 말고 현재 동작과 단계별 진행 순서를 설명해 주세요:\n${m.build.stages.map((step,i)=>`${i+1}. ${step.title}`).join('\n')}`;
    if(m.id===4 && index==='verify')return `${context}\n\n서류 등록부터 AI 분석, 원본 대조, 상담 반영까지 전체 흐름을 점검해 주세요.\n${m.build.stages.map((step,i)=>`${i+1}. ${step.verify}`).join('\n')}\n\n관련된 기존 검증을 찾아 실행하고, 실제 AI 분석과 테스트용 응답을 구분해 결과와 미검증 항목을 알려 주세요.`;
    if(index==='context')return `${context}\n\n준비: ${m.build.prerequisite}\n참고 파일:\n${m.build.files.join('\n')}\n\n아직 변경하지 말고 구현 상태와 아래 순서의 의존성을 먼저 설명해 주세요:\n${m.build.stages.map((step,i)=>`${i+1}. ${step.title}`).join('\n')}`;
    if(index==='verify')return `${context}\n\n현재 기능의 전체 흐름을 점검해 주세요.\n${m.build.stages.map((step,i)=>`${i+1}. ${step.verify}`).join('\n')}\n\n${m.build.tests.length?`프로젝트 루트에서 기존 검증 명령을 실행하세요. Python은 2번에서 준비한 가상환경을 사용하세요.\n${m.build.tests.join('\n')}`:'이 기능은 아래 화면 확인 절차를 중심으로 검증하고, 자동 검증이 필요한 항목은 별도 테스트 데이터로 확인해 주세요.'}\n실제 모델 분석, 테스트용 응답, 독립 세무 검산, 인쇄 미리보기 검증을 구분해 보고하세요. 실패한 항목은 재현 조건과 원인부터 설명하고 그 부분만 수정해 주세요.`;
    const step=m.build.stages[Number(index)];
    return `${context}\n\n${Number(index)+1}단계: ${step.title}\n${step.prompt}\n\n완료 확인: ${step.verify}\n이번 단계의 검증까지 마친 뒤 결과를 알려 주세요.`;
  }
  const learnerFlow = {
    5:[['서류 확인','확인된 값 살펴보기'],['상담 입력','질문과 답변 정리'],['상담 저장','다시 열어 수정'],['사실확인서','내용 확인 · 출력']],
    6:[['계약 확인','취득 · 양도 내역'],['금액 대조','합계 · 누락 확인'],['수수 기록','실제 날짜 · 금액'],['확인서 출력','저장 내용 확인']],
    7:[['지역 검색','주소 또는 지역명'],['이력 확인','지정 · 해제 기간'],['근거 대조','원문 · 제외 범위'],['상담 연결','기준일 검토 후보']],
    8:[['사실 확인','주소 · 날짜 · 가액'],['담당자 검토','조건과 선택 확인'],['계산 결과','중간값 · 확인사항'],['결과 저장','상담별 검토 기록']],
    9:[['자료 확인','상담 · 검토 결과'],['추가 정보','신고 항목 입력'],['신고서 저장','상담별 초안'],['출력 확인','본표 · 부표 대조']]
  };
  function missionPreview(m){
    const tabs=['사실확인서','매매대금 정산 및 수수 확인서','양도소득세 검토','신고서 작성','조정대상지역 현황'];
    const active={4:0,5:0,6:1,7:4,8:2,9:3}[m.id];
    const field=(label,value='선택하세요')=>`<div class="screen-field"><small>${label}</small><span>${value}</span></div>`;
    const content={
      4:`<h4>신고서류 등록</h4><p>등록되는 자료는 스캔한 PDF로 준비해 주세요.</p><div class="screen-fields">${field('취득계약서')}${field('양도계약서')}${field('주민등록초본')}</div><div class="screen-action">상담 내용 직접 입력</div>`,
      5:`<h4>납세자와 대상 주택</h4><p>상담 내용을 확인하고 사실확인서를 작성합니다.</p><div class="screen-fields">${field('납세자 성명','가상 교육생')}${field('대상 주택 주소','가상 주소')}${field('상담일','날짜 선택')}</div><h4>취득과 양도</h4><div class="screen-fields">${field('취득일','날짜 입력')}${field('양도일','날짜 입력')}${field('양도가액','금액 입력')}</div><div class="screen-action">상담 저장</div>`,
      6:`<h4>매매대금 정산 및 수수 확인서</h4><p>계약서의 지급 약정과 실제 수수 내용을 확인합니다.</p><div class="screen-fields">${field('거래 구분','취득계약')}${field('매매대금','가상 금액')}${field('원본 확인','확인 필요')}</div><div class="screen-table"><b>지급 항목</b><span>계약금</span><span>중도금</span><span>잔금</span></div><div class="screen-action">수수 확인 내용 저장</div>`,
      7:`<h4>조정대상지역 현황</h4><p>지역별 지정·해제 이력과 원본 자료를 확인합니다.</p><div class="screen-fields">${field('자료 선택','지역별 자료')}${field('지역명 검색','지역명 입력')}</div><div class="screen-table"><b>지역　　지정일　　해제일</b><span>원본 문서와 지정 이력 확인</span><span>예외·제외 범위 확인</span></div><div class="screen-action">검색</div>`,
      8:`<h4>양도소득세</h4><p>세무사 검토용 · 사실확인서 연동</p><h4>01　사실확인서에서 가져온 자료</h4><div class="screen-fields">${field('대상 주택','가상 주소')}${field('취득일','확인 필요')}${field('양도가액','확인 필요')}</div><h4>02　세무 적용 판단</h4><div class="screen-fields">${field('자산 구분')}${field('과세 처리')}${field('세율')}</div><div class="screen-action">상담·검토내용 저장</div>`,
      9:`<h4>양도소득세 신고서 작성</h4><p>상담과 세액 검토 내용을 확인하고 신고서 정보를 입력합니다.</p><h4>01　신고 기본정보</h4><div class="screen-fields">${field('신고인','가상 교육생')}${field('신고일','날짜 선택')}${field('양수인','확인 필요')}</div><h4>02　신고서 항목</h4><div class="screen-fields">${field('양도가액','검토 결과 확인')}${field('필요경비','분류 확인')}${field('납부할 세액','검토 필요')}</div><div class="screen-action">신고서 저장 · 출력</div>`
    };
    return `<div class="screen-preview" role="img" aria-label="${escapeHtml(m.short)} 작업 화면 구성 예시"><div class="screen-top"><b>양도소득세(주택분)</b><span>로컬 AI를 활용한 바이브 코딩</span></div><div class="screen-title"><small>로컬 AI 활용</small><strong>양도소득세(주택분) 자동화 워크플로우</strong><span>서류 분석부터 사실확인서와 신고서 작성까지</span></div><div class="screen-tabs">${tabs.map((label,i)=>`<span class="${active===i?'selected':''}">${label}</span>`).join('')}</div><div class="screen-main"><aside class="screen-aside"><b>상담 현황</b><div>납세자 이름 검색</div><small>교육용 가상 화면</small></aside><div class="screen-content">${content[m.id]}</div></div></div>`;
  }
  function learnerGuide(m){return `<div class="document-guide"><section class="doc-preview"><div class="doc-section-head"><div><span class="eyebrow">완성 화면 미리보기</span><h2>${escapeHtml(m.short)}</h2><p>${escapeHtml(m.subtitle)}</p></div><span class="doc-example-badge">화면 예시</span></div>${missionPreview(m)}</section><section class="doc-flow-section" aria-labelledby="learner-flow-title"><span class="eyebrow">한눈에 보는 구현 흐름</span><h2 id="learner-flow-title">이 순서로 만들어 봅니다</h2><div class="doc-flow">${learnerFlow[m.id].map(([title,desc],i)=>`${i?'<span aria-hidden="true">→</span>':''}<div><b>${num(i+1)}</b><strong>${escapeHtml(title)}</strong><small>${escapeHtml(desc)}</small></div>`).join('')}</div></section><section class="doc-practice"><span class="eyebrow">실습 시작</span><h2>단계별로 요청하고 확인하세요</h2><p>먼저 프로젝트를 살펴보고, 아래 단계를 하나씩 펼쳐 진행합니다.</p><div class="doc-practice-actions">${copyBuildButton('context','프로젝트 파악 프롬프트 복사')}</div><div class="doc-steps">${m.build.stages.map((step,i)=>`<details class="doc-step"><summary><span>${num(i+1)}</span><b>${escapeHtml(step.title)}</b></summary><div class="doc-step-body"><p>${escapeHtml(step.purpose)}</p><div class="coding-prompt"><div class="coding-prompt-label">AI 코딩 도구에 요청하기</div><p>${escapeHtml(step.prompt)}</p>${copyBuildButton(i)}</div><div class="coding-verify">${icon('check')}<p><b>완료 확인</b>${escapeHtml(step.verify)}</p></div></div></details>`).join('')}</div><details class="doc-step"><summary><span>✓</span><b>완성 후 전체 흐름 점검</b></summary><div class="doc-step-body"><p>가상 자료와 별도 테스트 데이터로 확인하고, 실행한 검증과 미검증 항목을 구분하세요.</p>${copyBuildButton('verify','전체 검증 프롬프트 복사')}</div></details></section></div>`;}
  function learnerResult(m){return `<section class="learner-result"><div class="learner-result-intro"><span class="eyebrow">내가 만든 화면</span><h2>구현한 화면을 이미지로 확인하세요</h2><p>교육생이 만든 화면을 이미지로 표시하는 공간입니다. 아래 예시는 화면 구성 참고용입니다.</p><div class="learner-prompt"><b>Codex에 이미지 등록 요청하기</b><p>${escapeHtml(buildPrompt(m,'connect'))}</p>${copyBuildButton('connect','이미지 등록 요청 복사')}</div><p>가상 자료로 화면을 확인한 뒤 이미지를 등록하세요. 화면을 수정했다면 이미지를 다시 만들어야 변경 사항이 보입니다.</p></div><div class="learner-image-wrap"><img class="learner-result-image" src="assets/images/mission-${m.id}-result.png?v=${Date.now()}" alt="교육생이 구현한 ${escapeHtml(m.short)} 화면" hidden onload="this.hidden=false;this.nextElementSibling.hidden=true"><div class="learner-image-placeholder"><span class="doc-example-badge">등록 전 · 화면 구성 예시</span>${missionPreview(m)}</div></div></section>`;}
  function copyBuildButton(index,label='이 단계 프롬프트 복사'){return `<button type="button" class="button secondary" data-build-prompt="${index}">${label}</button>`;}
  function documentBuildGuide(m){return `<div class="document-guide">
    <section class="doc-preview" aria-labelledby="doc-preview-title"><div class="doc-section-head"><div><span class="eyebrow">완성 화면 미리보기</span><h2 id="doc-preview-title">서류를 읽고, 확인한 값을 상담으로</h2><p>실제 작업 화면을 참고한 구성 예시입니다.</p></div><span class="doc-example-badge">화면 예시</span></div>
      ${missionPreview(m)}
      </section>
    <section class="doc-flow-section" aria-labelledby="doc-flow-title"><span class="eyebrow">한눈에 보는 구현 흐름</span><h2 id="doc-flow-title">이 순서로 만들어 봅니다</h2><div class="doc-flow" aria-label="PDF 등록 후 로컬 AI 분석, 원본 대조, 확인 후 상담 반영"><div><b>01</b><strong>PDF 등록</strong><small>서류와 상담 선택</small></div><span aria-hidden="true">→</span><div><b>02</b><strong>로컬 AI 분석</strong><small>페이지별 정보 추출</small></div><span aria-hidden="true">→</span><div><b>03</b><strong>원본 대조</strong><small>사람이 확인 · 수정</small></div><span aria-hidden="true">→</span><div><b>04</b><strong>상담에 반영</strong><small>확인한 값만 저장</small></div></div><p class="doc-flow-note">AI가 읽은 내용은 원본과 비교하고, 확인한 값만 상담에 반영합니다.</p></section>
    <section class="mission-downloads" aria-labelledby="mission-downloads-title"><div><span class="eyebrow">실습 자료</span><h2 id="mission-downloads-title">PDF 세 가지를 내려받으세요</h2><p>다운로드한 자료를 신고서류 등록·분석 실습에 사용합니다.</p></div><div class="mission-download-links"><a href="/practice-data/mission04/acquisition.pdf" download="매수용부동산계약서.pdf">매수용 계약서 PDF ↓</a><a href="/practice-data/mission04/transfer.pdf" download="매도용부동산계약서.pdf">매도용 계약서 PDF ↓</a><a href="/practice-data/mission04/resident.pdf" download="초본_가상.pdf">주민등록초본 PDF ↓</a></div></section>
    <section class="doc-practice"><span class="eyebrow">실습 시작</span><h2>단계별로 요청하고 확인하세요</h2><p>먼저 프로젝트를 살펴보고, 아래 단계를 하나씩 펼쳐 진행합니다.</p><div class="doc-practice-actions">${copyBuildButton('context','프로젝트 파악 프롬프트 복사')}<a class="button secondary" href="/chapters/ch01_pdf_Parsing/" target="_blank" rel="noopener">개별 파싱 화면 열기 ${icon('arrow')}</a></div>
      <div class="doc-steps">${m.build.stages.map((step,i)=>`<details class="doc-step"><summary><span>${num(i+1)}</span><b>${escapeHtml(step.title)}</b></summary><div class="doc-step-body"><p>${escapeHtml(step.purpose)}</p><div class="coding-prompt"><div class="coding-prompt-label">AI 코딩 도구에 요청하기</div><p>${escapeHtml(step.prompt)}</p>${copyBuildButton(i)}</div><div class="coding-verify">${icon('check')}<p><b>완료 확인</b>${escapeHtml(step.verify)}</p></div></div></details>`).join('')}</div>
      <details class="doc-step"><summary><span>✓</span><b>완성 후 전체 흐름 점검</b></summary><div class="doc-step-body"><p>가상 자료와 별도 테스트 DB로 확인하고, 실제 AI 분석 여부를 따로 기록하세요.</p>${copyBuildButton('verify','전체 검증 프롬프트 복사')}</div></details>
    </section>
  </div>`;}
  function buildGuide(m){if(m.id===4)return documentBuildGuide(m);return `<div class="current-build-guide">
    <div class="build-intro"><span class="eyebrow">BUILD ${num(m.id)} · 현재 구현 기준</span><h2>한 단계씩 요청하고, 결과를 확인하세요.</h2><p>${escapeHtml(m.build.prerequisite)}</p><div class="build-entry-actions">${copyBuildButton('context','프로젝트 파악 프롬프트 복사')}</div><p class="build-instruction">기존 프로젝트에서 동작을 살펴본 뒤, 아래 순서로 필요한 부분을 구현·개선합니다. 새로 만들어 보는 경우에는 별도 작업 사본에서 진행하세요. 프롬프트는 현재 단계까지 확인한 후 다음 것을 사용합니다.</p></div>
    <ol class="build-roadmap" aria-label="개발 순서">${m.build.stages.map((step,i)=>`<li><span>${num(i+1)}</span>${escapeHtml(step.title)}</li>`).join('')}</ol>
    ${m.build.stages.map((step,i)=>`<section class="coding-step" aria-labelledby="build-step-${i}"><div class="coding-step-heading"><span>${num(i+1)}</span><div><h3 id="build-step-${i}">${escapeHtml(step.title)}</h3><p>${escapeHtml(step.purpose)}</p></div></div><div class="coding-prompt"><div class="coding-prompt-label">AI 코딩 도구에 요청하기</div><p>${escapeHtml(step.prompt)}</p>${copyBuildButton(i)}</div><div class="coding-verify">${icon('check')}<p><b>다음 단계로 가기 전</b>${escapeHtml(step.verify)}</p></div></section>`).join('')}
    <section class="coding-validation"><h3>완성 후 전체 흐름 점검</h3><p>프로젝트 루트에서 실행합니다. Python 명령은 2번에서 만든 가상환경을 활성화한 뒤 사용하세요. 아래 테스트 통과와 실제 AI 분석·세무 검산·인쇄 확인은 구분해서 기록합니다.</p>${m.build.tests.length?`<pre><code>${escapeHtml(m.build.tests.join('\n'))}</code></pre>`:'<p>이 기능은 단계별 화면 확인과 저장·재조회·인쇄를 중심으로 점검합니다. 아래 검증 프롬프트에 전체 확인 순서가 포함되어 있습니다.</p>'}${copyBuildButton('verify','전체 검증·수정 프롬프트 복사')}<p class="build-validation-note">문제가 생기면 발생 단계, 입력한 가상 자료, 예상 결과, 실제 결과와 오류 메시지를 함께 전달하세요. 실제로 실행하지 못한 검증은 미검증으로 남깁니다.</p></section>
    <details class="build-source-files"><summary>현재 구현의 참고 파일 ${m.build.files.length}개</summary><p>프로젝트 루트 기준 경로입니다. AI 코딩 도구에 아래 파일부터 읽도록 요청하세요.</p><ul>${m.build.files.map(file=>`<li><code>${escapeHtml(file)}</code></li>`).join('')}</ul></details>
  </div>`;}
  function documentResult(m){return `<section class="learner-result"><div class="learner-result-intro"><span class="eyebrow">내가 만든 화면</span><h2>구현한 화면을 이미지로 확인하세요</h2><p>교육생이 만든 화면을 이미지로 표시하는 공간입니다. 아래 예시는 화면 구성 참고용입니다.</p><div class="learner-prompt"><b>Codex에 이미지 등록 요청하기</b><p>${escapeHtml(buildPrompt(m,'connect'))}</p>${copyBuildButton('connect','이미지 등록 요청 복사')}</div><p>가상 자료로 화면을 확인한 뒤 이미지를 등록하세요. 화면을 수정했다면 이미지를 다시 만들어야 변경 사항이 보입니다.</p></div><div class="learner-image-wrap"><img class="learner-result-image" src="assets/images/mission-4-result.png?v=${Date.now()}" alt="교육생이 구현한 신고서류 등록·분석 화면" hidden onload="this.hidden=false;this.nextElementSibling.hidden=true"><div class="learner-image-placeholder"><span class="doc-example-badge">등록 전 · 화면 구성 예시</span>${missionPreview(m)}</div></div></section>`;}
  function tabContent(m){
    if(m.id===4)return state.tab==='sample'?documentResult(m):buildGuide(m);
    if(m.id>=5 && m.id<=9)return state.tab==='sample'?learnerResult(m):learnerGuide(m);
    if(m.build)return state.tab==='sample'?worksheet(m.id):buildGuide(m);
    if(state.tab==='sample')return `<div class="sample-caption"><span>WORKSPACE PREVIEW</span><span>미리 작성한 예시</span></div>${worksheet(m.id)}<p class="sample-note">이 미션에서 남길 결과물: <b>${m.output}</b></p>`;
    return `${m.id===1?vscodeGuide():m.id===2?setupGuide():modelGuide()}<div class="prompt-box"><div class="prompt-label"><span>수업에서 사용할 질문 예시</span>${icon('spark')}</div><p>${m.prompt}</p></div>`;
  }
  function missionPage(m){
    const checks=state.checks[m.id]||Array(m.checks.length).fill(false);
    return `<section class="page mission-page ${m.build?'coding-mission-page':''}"><a class="back-link" href="#overview">${icon('back')}전체 여정으로</a><div class="mission-heading"><div><div class="eyebrow">MISSION ${num(m.id)} <span style="color:#c6bfd0">/ ${M.length}</span> <span>· ${m.phase}</span>${m.workflowStep?` <span>· 업무 단계 ${num(m.workflowStepNumber)} ${m.workflowStep}</span>`:''}</div><h1>${m.title}</h1><p>${m.subtitle}</p></div><div class="mission-time">${badge(m)}${icon('clock')}<span class="duration">${m.minutes}분${m.build?' · 강의 배정':''}</span></div></div><div class="mini-path" aria-label="전체 ${M.length}개 미션에서 현재 위치">${M.map(x=>`<a href="#mission-${x.id}" class="${x.id===m.id?'active':''} ${state.done.has(x.id)?'done':''}" aria-label="미션 ${x.id}: ${x.short}" ${x.id===m.id?'aria-current="step"':''}></a>`).join('')}</div>
      <div class="mission-layout"><div><div class="mission-workspace">${!m.build?'':`<div class="workspace-tabs" role="tablist" aria-label="미션 화면">${[['guide',m.id>=4&&m.id<=9?'실습 안내':m.build?'개발 순서·프롬프트':'미션 안내'],['sample',m.id>=4&&m.id<=9?'내가 만든 화면':m.build?'구현 내용·바로가기':'작업 화면']].map(([t,n])=>`<button role="tab" id="tab-${t}" aria-controls="mission-panel" aria-selected="${state.tab===t}" class="${state.tab===t?'active':''}" data-tab="${t}">${n}</button>`).join('')}</div>`}<div class="tab-content" id="mission-panel" ${!m.build?'':`role="tabpanel" aria-labelledby="tab-${state.tab}"`}>${tabContent(m)}</div></div><div class="mission-nav-bottom">${m.id>1?`<a href="#mission-${m.id-1}">${icon('back')}이전 미션</a>`:'<span></span>'}${m.id<M.length?`<a href="#mission-${m.id+1}">다음 미션 미리보기${icon('arrow')}</a>`:'<a href="#overview">전체 여정으로 돌아가기 →</a>'}</div></div>
      <aside class="completion-panel"><div class="mission-progress-status">${progressStatusMarkup()}</div>${m.build?`<p class="build-progress-note">개편된 4~9번은 새 학습 기록으로 저장합니다. 기존 설치 1~3번 기록은 유지됩니다.</p>`:''}<div class="eyebrow">YOUR TAKEAWAY</div><h3>완료하면 남는 것</h3><div class="deliverable-mini">${icon('file')}<span><small>MISSION ${num(m.id)} OUTPUT</small>${m.output}</span></div><div class="check-heading"><span>학습 확인</span><span id="check-count">${checks.filter(Boolean).length} / ${m.checks.length}</span></div><div class="checks">${m.checks.map((t,i)=>`<label class="completion-check"><input type="checkbox" data-check="${i}" ${checks[i]?'checked':''} ${!state.progressReady?'disabled':''}><span>${t}</span></label>`).join('')}</div><button class="button primary" id="complete-button" data-action="complete" ${!state.progressReady||!checks.every(Boolean)?'disabled':''}>${state.done.has(m.id)?'완료한 미션 다시 보기':'학습 완료 표시'}${icon('check')}</button><p class="completion-help">학습 확인 ${m.checks.length}개를 체크하면 완료할 수 있어요.<br>학습 확인과 완료 표시는 이 컴퓨터에 저장됩니다.</p></aside></div></section>`;
  }
  function agenda(){
    return `<section class="page"><div class="page-header"><div><div class="eyebrow" style="margin-bottom:9px">THE CLASS, AT A GLANCE</div><h1>오늘, 이렇게 진행합니다.</h1><p>업무를 배우는 시간을 줄이고, 자동화를 검증하는 시간을 늘립니다.</p></div><span class="badge purple">14:00–18:00 · 4시간 워크숍</span></div><div class="agenda-summary"><div><div class="eyebrow">ONE CASE. FIVE CHAPTERS.</div><h2>실행하고, 확인하고, 적용하기.</h2><p>로컬 실행 환경을 준비하고 ${M.length}개 가이드를 따라 실습한 뒤, 결과물의 실무 적용 범위를 토의합니다.<br><b>장소: 서면 지오파트너스 소회의실</b></p></div><div class="agenda-duration"><strong>240</strong><span>분의 여정<small>강의·실습 200분 + 의견수렴 10분 + 휴식 30분</small></span></div></div><div class="agenda-track">${COURSE.sessions.map((s,i)=>`<article class="agenda-card"><div class="agenda-time"><b>${s.n}</b><span>${s.time}<br>${s.minutes}분</span></div><div class="agenda-content"><h3>${s.title}</h3><p>${s.desc}</p><div class="agenda-tags">${s.missions.map(id=>`<a href="#mission-${id}">${num(id)} ${M[id-1].short}</a>`).join('')}</div></div></article>${i<3?`<div class="break-row">${icon('coffee')}10분 휴식 · 질문을 정리하고 다음 미션을 준비하세요</div>`:''}`).join('')}</div></section>`;
  }
  function render(resetScroll=true){
    const r=route(),m=currentMission();
    document.body.classList.toggle('course-home', !m && !['instructor','agenda','review','gate','draft','submission'].includes(r));
    document.body.classList.toggle('agenda-page',r==='agenda');
    $('#main').innerHTML=m?missionPage(m):r==='instructor'?instructorPage():r==='agenda'?agenda():r==='review'?reviewPage(false):r==='gate'?reviewPage(true):r==='draft'?draftPage():r==='submission'?submissionPage():overview();updateBreadcrumb();
    document.title=`${m?m.short:r==='instructor'?'강사소개':r==='agenda'?'강의 타임라인':COURSE.title} — TAXFLOW`;
    if(resetScroll)window.scrollTo({top:0,behavior:'instant'});
  }
  function updateTab(tab){
    state.tab=tab;const m=currentMission();if(!m)return;
    document.querySelectorAll('.workspace-tabs button').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tab);b.setAttribute('aria-selected',String(b.dataset.tab===tab));});
    $('#mission-panel').setAttribute('aria-labelledby',`tab-${tab}`);$('#mission-panel').innerHTML=tabContent(m);
  }
  function showBuildPrompt(prompt){modal(`<div class="dialog-inner"><div class="dialog-top"><h2>프롬프트를 직접 복사하세요</h2><button class="icon-button" data-action="close" aria-label="닫기">${icon('close')}</button></div><p>자동 복사를 사용할 수 없습니다. 아래 내용을 선택해 복사하세요.</p><textarea class="build-copy-fallback" readonly aria-label="복사할 개발 프롬프트">${escapeHtml(prompt)}</textarea></div>`);const input=$('.build-copy-fallback');input.focus();input.select();}
  function modal(content){$('#dialog-content').innerHTML=content;$('#dialog').showModal();}
  function close(){if($('#dialog').open)$('#dialog').close();}
  function aboutContent(){return `<div class="runtime-diagram"><span>계약서·초본<br>PDF 등록</span>${icon('arrow')}<span>PDF 페이지<br>이미지 변환</span>${icon('arrow')}<span>llama.cpp<br>Qwen3-VL 4B · 8B</span>${icon('arrow')}<span>원본 대조<br>상담 반영</span>${icon('arrow')}<span>세액 계산<br>신고서 작성</span></div><p>등록한 PDF를 페이지 이미지로 변환해 로컬 Qwen3-VL 모델로 분석합니다. 확인한 내용을 상담에 반영하고, 별도 계산 로직으로 세액을 검토한 뒤 신고서를 작성·출력합니다.</p>`;}
  function aboutReferences(){return `<div class="reference-links"><a href="https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md" target="_blank" rel="noopener noreferrer">llama.cpp 공식 문서 ↗</a><a href="https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7709&mi=2310" target="_blank" rel="noopener noreferrer">국세청 계산 흐름 ↗</a></div>`;}
  function completed(){
    const m=currentMission();if(!state.progressReady||!m||!(state.checks[m.id]||[]).every(Boolean)||(state.checks[m.id]||[]).length!==m.checks.length)return;
    state.done.add(m.id);saveProgress(m);render(false);
    modal(`<div class="complete-dialog"><div class="complete-seal">${icon('check')}</div><div class="eyebrow">MISSION ${num(m.id)} · LEARNING CHECKED</div><h2>${m.id===M.length?'다음은, 나의 실무입니다.':'하나의 단계를 완성했어요.'}</h2><p>${m.output}<br>전체 ${M.length}개 미션 중 ${state.done.size}개 학습 확인</p><div class="dialog-actions"><button class="button secondary" data-action="close">이 단계 다시 보기</button><button class="button primary" data-action="next">${m.id===M.length?'전체 여정으로':'다음 미션으로'}${icon('arrow')}</button></div><p style="font-size:9px;margin-top:20px">스스로 표시한 학습 완료입니다. 실제 세무 검토의 승인을 의미하지 않습니다.</p></div>`);
  }
  function toast(t){$('#toast').textContent=t;$('#toast').classList.add('show');window.clearTimeout(state.toastTimer);state.toastTimer=window.setTimeout(()=>$('#toast').classList.remove('show'),3000);}
  document.addEventListener('click',e=>{
    const guideLink=e.target.closest('.studio-guide-section a.mission-card, .studio-setup a.mission-card');
    if(guideLink && e.button===0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey){
      e.preventDefault();
      const missionHash=guideLink.getAttribute('href');
      openedGuideHash=missionHash;
      const popupTitle=guideLink.closest('.studio-setup')?'로컬 AI 설치·실행 준비':'양도소득세(주택분) 바이브 코딩 실습 가이드';
      modal(`<div class="guide-popup"><div class="guide-popup-bar"><strong>${popupTitle}</strong><button class="icon-button" data-action="close" aria-label="실습 가이드 닫기">${icon('close')}</button></div><iframe title="${popupTitle}" src="index.html?guidePopup=1&v=20261125-layout44${missionHash}"></iframe></div>`);
      return;
    }
    const optionalPage=e.target.closest('a[data-optional-page]');
    if(optionalPage&&!e.defaultPrevented&&e.button===0&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){
      e.preventDefault();
      const fallback=optionalPage.getAttribute('href');
      const url=new URL(optionalPage.dataset.optionalPage,location.href);
      fetch(url,{method:'HEAD',cache:'no-store'}).then(response=>{
        if(response.ok&&response.headers.get('content-type')?.includes('text/html'))location.assign(url.href);
        else location.hash=fallback;
      }).catch(()=>{location.hash=fallback;});
      return;
    }
    const buildCopy=e.target.closest('[data-build-prompt]');
    if(buildCopy){
      const mission=currentMission(), index=buildCopy.dataset.buildPrompt;
      if(!mission?.build||!(index==='context'||index==='verify'||mission.id>=4&&mission.id<=9&&index==='connect'||/^\d+$/.test(index)&&mission.build.stages[Number(index)]))return;
      const prompt=buildPrompt(mission,index);
      if(!navigator.clipboard?.writeText){showBuildPrompt(prompt);return;}
      navigator.clipboard.writeText(prompt).then(()=>toast('공통 작업 조건을 포함한 프롬프트를 복사했습니다.')).catch(()=>showBuildPrompt(prompt));
      return;
    }
    const tab=e.target.closest('[data-tab]');if(tab){updateTab(tab.dataset.tab);return;}
    const review=e.target.closest('[data-review-item]');if(review){state.reviewItem=Number(review.dataset.reviewItem);render(false);return;}
    const action=e.target.closest('[data-action]')?.dataset.action;
    if(action==='copy-codex'){
      const prompt=$('#codex-prompt').textContent;
      if(!navigator.clipboard?.writeText){toast('복사할 수 없습니다. 요청문을 선택해 직접 복사해 주세요.');return;}
      navigator.clipboard.writeText(prompt).then(()=>toast('프롬프트를 복사했습니다.')).catch(()=>toast('복사할 수 없습니다. 요청문을 선택해 직접 복사해 주세요.'));
      return;
    }
    if(action==='instructor-profile')modal(`<div class="dialog-inner instructor-profile-dialog"><div class="dialog-top"><h2>강사 주요 경력 및 강의 이력</h2><button class="icon-button" data-action="close" aria-label="닫기">${icon('close')}</button></div><img src="assets/images/instructor-career.jpg" alt="오대웅 강사의 주요 경력 및 강의 이력" width="1280" height="720"></div>`);
    if(action==='residence')residenceModal();
    if(action==='close')close();
    if(action==='complete')completed();
    if(action==='next'){const m=currentMission();close();location.hash=m.id===M.length?'overview':`mission-${m.id+1}`;}
    if(action==='reset-dialog'){if(!$('#dialog').open)$('#dialog').showModal();$('#dialog-content').innerHTML=`<div class="dialog-inner"><div class="dialog-top"><h2>학습 표시를 초기화할까요?</h2><button class="icon-button" data-action="close" aria-label="닫기">${icon('close')}</button></div><p>저장된 학습 확인 항목과 완료 표시를 모두 초기화합니다. 상담 기록은 변경되지 않습니다.</p><div class="dialog-actions"><button class="button secondary" data-action="close">유지하기</button><button class="button primary" data-action="reset">초기화</button></div></div>`;}
    if(action==='progress-retry')flushProgress();
    if(action==='reset')resetProgress();
  });
  document.addEventListener('change',e=>{
    if(!e.target.matches('[data-check]')||!state.progressReady)return;const m=currentMission();if(!m)return;
    state.checks[m.id]??=Array(m.checks.length).fill(false);state.checks[m.id][Number(e.target.dataset.check)]=e.target.checked;
    $('#check-count').textContent=`${state.checks[m.id].filter(Boolean).length} / ${m.checks.length}`;
    $('#complete-button').disabled=!state.checks[m.id].every(Boolean);
    if(state.done.has(m.id)&&!state.checks[m.id].every(Boolean)){state.done.delete(m.id);$('#complete-button').innerHTML=`학습 완료 표시${icon('check')}`;}
    saveProgress(m);
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape' && embeddedGuide && !$('#dialog').open){window.parent.postMessage('close-guide-popup',location.origin);return;}
    if(e.target.matches('[role="tab"]')&&['ArrowLeft','ArrowRight'].includes(e.key)){const tabs=['guide','sample'];const i=(tabs.indexOf(state.tab)+1)%tabs.length;updateTab(tabs[i]);$(`#tab-${tabs[i]}`).focus();e.preventDefault();}
  });
  window.addEventListener('hashchange',()=>{
    if(embeddedGuide && route()==='overview'){window.parent.postMessage('close-guide-popup',location.origin);return;}
    state.tab='guide';render();
  });
  window.addEventListener('message',event=>{
    if(event.origin===location.origin && event.data==='close-guide-popup' && event.source===$('.guide-popup iframe')?.contentWindow)close();
  });
  $('#dialog').addEventListener('close',async()=>{
    if(!$('.guide-popup'))return;
    const guideHash=openedGuideHash;
    openedGuideHash=null;
    $('#dialog-content').innerHTML='';
    state.done.clear();state.checks={};
    await loadProgress();
    if(guideHash) document.querySelector(`.studio-guide-section a[href="${guideHash}"], .studio-setup a[href="${guideHash}"]`)?.focus({preventScroll:true});
  });
  render();
  loadProgress();
})();
