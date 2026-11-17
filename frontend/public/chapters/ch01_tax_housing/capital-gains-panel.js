'use strict';

function createCapitalGainsPanel({form, getState, save, showFacts, openContract}) {
  const panel=document.querySelector('#capital-gains-panel');
  const store=form.elements.capitalGainsReviewJson;
  panel.innerHTML=`
    <header class="cg-header"><div><p class="cg-kicker">세무사 검토용 · 사실확인서 연동</p><h2>양도소득세</h2><p id="cg-record"></p></div><div class="cg-actions"><button type="button" class="secondary" id="cg-facts">사실확인서 수정</button><button type="button" class="primary" id="cg-save">상담·검토내용 저장</button></div></header>
    <p id="cg-save-status" class="cg-save-status" role="status"></p>
    <div class="cg-total"><div><span>이 자산의 예상 양도소득세</span><strong id="cg-total">—</strong><p>양도소득세(국세) 기준 · 지방소득세·가산세·기납부세액 정산 제외</p></div><span id="cg-badge" class="cg-badge">자료 확인 필요</span></div>
    <section class="cg-section"><div class="cg-section-heading"><h3>01 <span>사실확인서에서 가져온 자료</span></h3><span>원자료 자동 반영</span></div><dl id="cg-facts-list" class="cg-facts"></dl></section>
    <section class="cg-section"><div class="cg-section-heading"><h3>02 <span>세무 적용 판단</span></h3><span>상담별 저장</span></div><div class="cg-fields">
      <label>과세 자산 구분<select data-cg="asset"><option value="auto">사실확인서 주택 종류 기준</option><option value="home">주택</option><option value="building">일반 건물</option><option value="land">토지</option></select></label>
      <label>비과세 적용 판단<select data-cg="treatment"><option value="pending">검토 전 · 일반 과세 가정</option><option value="taxable">일반 과세</option><option value="oneHome">1세대 1주택 비과세 요건 충족</option></select></label>
      <label>세율 적용 구분<select data-cg="rate"><option value="pending">검토 전 · 일반 세율 가정</option><option value="general">일반 · 다주택 중과 배제</option><option value="heavy2">조정대상지역 2주택 중과 (+20%p)</option><option value="heavy3">조정대상지역 3주택 이상 (+30%p)</option><option value="nonbusiness">비사업용 토지 (+10%p, 지정지역 제외)</option><option value="unregistered">미등기 양도 (70%)</option></select></label>
      <label>장기보유특별공제<select data-cg="deduction"><option value="auto">선택한 과세 구분·기간으로 계산</option><option value="general">일반 공제 (최대 30%)</option><option value="oneHome">1세대 1주택 공제 (최대 80%)</option><option value="none">공제 배제</option></select></label>
    </div>
    <fieldset id="cg-joint" class="cg-joint" hidden><legend>공동소유 · 신고자 지분 확인</legend><div class="cg-fields"><label>사실확인서 금액의 기준<select data-cg="amountBasis"><option value="">선택하세요</option><option value="whole">주택 전체의 가액·경비</option><option value="personal">신고자 지분의 가액·경비</option></select></label><div class="cg-share"><label>지분 분자<input data-cg="shareNumerator" inputmode="numeric" placeholder="예: 1"></label><label>지분 분모<input data-cg="shareDenominator" inputmode="numeric" placeholder="예: 2"></label></div><label id="cg-whole-price" hidden>주택 전체 양도가액 (고가주택 판정, 원)<input data-cg="wholePrice" inputmode="numeric"></label></div><p class="cg-help">전체 금액이면 입력한 지분으로 안분합니다. 이미 지분별 금액인 경우 다시 안분하지 않으며, 고가주택 기준은 주택 전체 양도가액으로 판단합니다.</p></fieldset>
    <div class="cg-fields cg-adjustments"><label>연간 기본공제 잔액 (원)<input data-cg="basic" inputmode="numeric" placeholder="다른 양도 없음: 자동 2,500,000"></label><label>감면대상소득금액 (원)<input data-cg="incomeRelief" inputmode="numeric"></label><label>세액공제 (원)<input data-cg="credit" inputmode="numeric"></label><label>감면세액 (원)<input data-cg="taxRelief" inputmode="numeric"></label></div>
    <label>세무 검토 메모<textarea data-cg="notes" rows="3" maxlength="2000" placeholder="비과세·중과 판단 근거, 필요경비 증빙, 특례 및 추가 확인사항"></textarea></label></section>
    <section class="cg-section"><div class="cg-section-heading"><h3>03 <span>세액 계산 명세</span></h3><span>단위: 원</span></div><p id="cg-calculation-status" class="cg-calculation-status" role="status"></p><div class="cg-table-wrap"><table class="cg-table"><thead><tr><th scope="col">항목</th><th scope="col">계산 근거</th><th scope="col">금액</th></tr></thead><tbody id="cg-rows"></tbody></table></div></section>
    <footer class="cg-sources"><strong>국세청 계산 근거</strong><nav aria-label="양도소득세 계산 근거"><a href="https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=2310&amp;cntntsId=7709" target="_blank" rel="noopener">세액계산 흐름도 ↗</a><a href="https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=2311&amp;cntntsId=7710" target="_blank" rel="noopener">장기보유특별공제율 ↗</a><a href="https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=2312&amp;cntntsId=7711" target="_blank" rel="noopener">세율 ↗</a><a href="https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=12271&amp;cntntsId=8799" target="_blank" rel="noopener">1세대 1주택 고가주택 ↗</a></nav><p>2021년 이후 양도 · 거주자의 매매 취득 부동산 1건 기준. 상속·증여, 환산취득가액, 부담부증여, 겸용주택 안분, 권리 양도, 임대주택 공제 특례 및 연간 합산세액은 별도 검토 대상입니다.</p></footer>`;
  const $=id => panel.querySelector('#'+id), controls=[...panel.querySelectorAll('[data-cg]')];
  const won=n => n == null ? '미확인' : n.toLocaleString('ko-KR')+'원';
  let options={...capitalGains.defaults}, locked=false, scheduled=false;
  function hydrate() {
    try {
      const parsed=JSON.parse(store.value || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.values(parsed).some(v => typeof v !== 'string')) throw Error();
      options={...capitalGains.defaults,...parsed}; locked=false;
    } catch (_) { options={...capitalGains.defaults}; locked=true; }
    for (const control of controls) { control.value=options[control.dataset.cg]; control.disabled=locked; }
    refresh();
  }
  function refresh() {
    const data=Object.fromEntries(new FormData(form)), state=getState();
    const r=capitalGains.calculate(data,options);
    if (locked) r.errors.unshift('저장된 검토내용을 읽을 수 없습니다. 원본은 보존되어 있으며 복구 전 계산을 중단합니다.');
    $('cg-record').textContent=[data.taxpayerName || '납세자 미선택', state.id == null ? '새 상담' : `접수번호 ${state.id}`, state.dirty ? '미저장 변경 포함' : state.id == null ? '입력 대기' : '저장된 상담 기준'].join(' · ');
    $('cg-save').disabled=state.saving || locked;
    $('cg-joint').hidden=data.ownership !== '공동 소유';
    $('cg-whole-price').hidden=options.amountBasis !== 'personal' || options.treatment !== 'oneHome';
    const facts=$('cg-facts-list'); facts.replaceChildren();
    const factsRows=[['납세자',data.taxpayerName],['양도 자산',data.address ? `${data.address}${data.ownership ? ` (${data.ownership})` : ''}` : data.ownership ? `주소 미확인 (${data.ownership})` : ''],['취득가액',won(capitalGains.money(data.acquisitionPrice))],['양도가액',won(capitalGains.money(data.transferPrice))],['필요경비',data.expensePresence === '없음' ? '0원 · 비용 없음' : won(capitalGains.money(data.expenses))],['계산상 취득일',r.start],['계산상 양도일',r.end],['보유기간',r.holdingYears == null ? '' : `만 ${r.holdingYears}년`],['보유 중 거주기간',r.residenceYears == null ? '확인 필요' : `만 ${r.residenceYears}년`],['세대원 다른 주택 / 권리',`${data.otherHomes || '미확인'} / ${data.otherRights || '미확인'}`],['같은 해 다른 양도',data.otherTransfers]];
    for (const [label,value] of factsRows) { const row=document.createElement('div'), dt=document.createElement('dt'), dd=document.createElement('dd'); dt.textContent=label; dd.textContent=value || '미확인'; if (['취득가액','양도가액','보유 중 거주기간'].includes(label)) { const key=label === '취득가액' ? 'acquisition' : label === '양도가액' ? 'transfer' : 'resident'; const button=document.createElement('button'); button.type='button'; button.className='cg-contract-link'; button.textContent=key === 'resident' ? '초본 보기' : '계약서 보기'; button.setAttribute('aria-label', key === 'resident' ? '주민등록초본 보기' : `${key === 'acquisition' ? '취득' : '양도'}계약서 보기`); button.disabled=!state.originalDocuments?.[key]; button.title=button.disabled ? '등록된 원본 PDF가 없습니다.' : '등록된 PDF 원본 보기'; button.addEventListener('click',() => openContract(key)); dd.append(button); } row.append(dt,dd); facts.append(row); }
    const acquisitionRow=facts.children[5], acquisitionTitle=acquisitionRow.children[0], acquisitionValue=acquisitionRow.children[1];
    const history=form.regulatedHistory || {state:'unknown',rows:[]};
    const historyButton=document.createElement('button'); historyButton.type='button'; historyButton.className='cg-contract-link cg-history-link'; historyButton.textContent='지정이력 보기'; historyButton.disabled=history.state !== 'found';
    historyButton.title=historyButton.disabled ? '조회 가능한 지정 이력이 없습니다.' : '조정대상지역 지정 이력과 원본 보기';
    historyButton.addEventListener('click',() => document.querySelector('#property-regulated-open').click());
    acquisitionTitle.append(historyButton);
    const historyBlock=document.createElement('div'); historyBlock.className='cg-history';
    const historyHeading=document.createElement('strong');
    historyHeading.textContent=history.state === 'no_history' ? '조정대상지역 (미대상)' : history.state === 'found' ? '조정대상지역' : '조정대상지역 (확인 필요)';
    historyBlock.append(historyHeading);
    if (history.state === 'found') {
      const list=document.createElement('ul');
      for (const item of history.rows) { const li=document.createElement('li'); li.textContent=`${item.region} · 지정 ${item.start_date} · 해제 ${item.end_date || 'DB에 기록 없음'}${item.review_required || item.needs_geometry || item.exclusions?.length ? ' · 제외지역 확인 필요' : ''}`; list.append(li); }
      historyBlock.append(list);
    }
    acquisitionValue.append(historyBlock);
    const ready=!r.errors.length;
    $('cg-total').textContent=ready ? won(r.netTax) : '계산 대기';
    $('cg-badge').textContent=ready ? '검토용 예상세액' : '자료 확인 필요';
    $('cg-total').closest('.cg-total').classList.toggle('is-pending',!ready);
    $('cg-calculation-status').textContent=ready ? `${r.rateYear}년 이후 기본세율표 · ${r.deductionMode === 'oneHome' ? '1세대 1주택' : r.deductionMode === 'none' ? '공제 배제' : '일반'} 장기보유특별공제 ${r.deductionRate}%${r.gain<0 ? ' · 양도차손 발생 (다른 양도와 통산 별도)' : ''}` : `계산 대기: ${r.errors.join(' ')}`;
    const body=$('cg-rows'); body.replaceChildren();
    if (!ready) return;
    const rows=[
      ['양도가액','사실확인서 · 신고자 지분 기준',r.transfer],['취득가액','사실확인서 · 신고자 지분 기준',r.acquisition],['필요경비','사실확인서 · 신고자 지분 기준',r.expenses],
      ['양도차익',`${won(r.transfer)} − ${won(r.acquisition)} − ${won(r.expenses)}`,r.gain],
      ['과세대상 양도차익',options.treatment === 'oneHome' ? `양도차익 × max(전체 양도가액 − ${won(r.threshold)}, 0) ÷ 전체 양도가액` : '양도차익 (차손이면 이 건 과세소득 0)',r.taxableGain],
      ['장기보유특별공제',options.treatment === 'oneHome' ? `전체 차익 × ${r.deductionRate}% × 고가주택 과세비율` : `과세대상 양도차익 × ${r.deductionRate}%`,r.deduction],
      ['양도소득금액','과세대상 양도차익 − 장기보유특별공제',r.income],['감면대상소득금액','세무사 검토 입력',r.incomeRelief],['양도소득 기본공제','연간 잔액 범위 · 소득금액 한도',r.basic],
      ['과세표준','양도소득금액 − 감면대상소득 − 기본공제 (최소 0)',r.base],
      ['산출세액',`${won(r.base)} × ${r.appliedRate}% − 누진공제 ${won(r.offset)}${r.shortRate && r.surcharge ? ` · 단기세액 ${won(r.shortTax)} / 중과세액 ${won(r.progressiveTax)} 비교` : ''}`,r.assessed],
      ['세액공제','세무사 검토 입력',r.credit],['감면세액','세무사 검토 입력',r.taxRelief],['예상 양도소득세','산출세액 − 세액공제 − 감면세액',r.netTax]
    ];
    for (const [label,reason,amount] of rows) { const tr=document.createElement('tr'), th=document.createElement('th'), td=document.createElement('td'), value=document.createElement('td'); th.scope='row'; th.textContent=label; td.textContent=reason; value.textContent=won(amount); tr.append(th,td,value); body.append(tr); }
  }
  function schedule() { if (scheduled) return; scheduled=true; queueMicrotask(() => { scheduled=false; refresh(); }); }
  for (const control of controls) control.addEventListener('input', () => {
    if (locked) return;
    options[control.dataset.cg]=control.value;
    store.value=JSON.stringify(options);
    store.dispatchEvent(new Event('input',{bubbles:true}));
    $('cg-save-status').textContent='검토내용이 변경되었습니다. 상담·검토내용 저장을 눌러 주세요.';
    schedule();
  });
  for (const event of ['input','change','taxflow:holding-updated','taxflow:residence-updated','taxflow:regulated-updated']) form.addEventListener(event,schedule);
  form.addEventListener('reset',() => {
    // Hidden inputs update their default value when assigned. Clear synchronously
    // so a new/legacy consultation cannot inherit the previous review; a record
    // load can then populate its own value before the queued hydration runs.
    store.value='';
    queueMicrotask(() => { $('cg-save-status').textContent=''; hydrate(); });
  });
  form.addEventListener('taxflow:form-loaded',() => queueMicrotask(() => { $('cg-save-status').textContent=''; hydrate(); }));
  $('cg-facts').addEventListener('click',showFacts);
  $('cg-save').addEventListener('click',async () => {
    if (!form.elements.taxpayerName.value.trim()) { $('cg-save-status').textContent='사실확인서에서 신고자 성명을 먼저 입력하세요.'; return; }
    $('cg-save').disabled=true;
    await save();
    const state=getState();
    $('cg-save-status').textContent=state.dirty ? state.message || '변경내용을 저장하지 못했습니다. 사실확인서를 확인하세요.' : '상담과 세무 검토내용을 저장했습니다.';
    refresh();
  });
  hydrate();
  return {refresh:schedule};
}
