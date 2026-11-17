'use strict';
function residentComparison(pages, form) {
  const norm=s=>String(s||'').replace(/\s|[.,()]/g,'').replace(/번지/g,'');
  const names=[...new Set(pages.map(p=>norm(p.name)).filter(Boolean))];
  const taxpayer=norm(form.taxpayerName), address=norm((form.address||'')+(form.addressDetail||''));
  const warnings=[];
  if(!address) warnings.push('상담의 주택 주소를 입력한 뒤 초본 주소를 비교해 주세요.');
  const rows=pages.flatMap(p=>p.history||[]).map(r=>({...r,parsed:paymentUtils.formatDate(r.date)}));
  const matched=rows.filter(r=>norm(r.address) && address && norm(r.address)===address);
  if(matched.length>1) warnings.push('일치하는 주소 이력이 여러 건입니다. 전입·전출 이력을 직접 확인해 주세요.');
  const valid=rows.every(r=>r.parsed) && new Set(rows.map(r=>r.parsed)).size===rows.length;
  const selected=names.length===1 && taxpayer===names[0] && matched.length===1 && matched[0].parsed && /전입/.test(matched[0].reason) ? matched[0] : null;
  const lines=[];
  let next=null;
  if(selected){
    lines.push(`주민등록상 전입·변동일: ${selected.parsed}`);
    if(valid){const sorted=[...rows].sort((a,b)=>a.parsed.localeCompare(b.parsed));next=sorted[sorted.indexOf(selected)+1]||null;if(next)lines.push(`다음 주소 변동일: ${next.parsed}`);}
    else if(rows.length>1) warnings.push('날짜가 불명확하거나 중복되어 거주 기간은 확인이 필요합니다.');
    for(const [label,raw] of [['취득',form.acquisitionContractDate],['양도',form.transferContractDate]]){
      const year=String(raw||'').match(/^(\d{4})/);
      if(!year)continue;
      if(!valid){lines.push(`${label}연도(${year[1]}년): 주소 이력 확인 필요`);continue;}
      const y=year[1], start=selected.parsed.slice(0,4), end=next?.parsed.slice(0,4);
      if (!next && y >= start) { lines.push(`${label}연도(${y}년): 이후 주소 이력이 없어 확인 필요`); continue; }
      lines.push(`${label}연도(${y}년): ${start<=y&&(!end||end>=y)?'해당 주소의 주민등록 이력과 겹침':'해당 주소 이력과 겹치지 않음'} · 실제 거주 확인 필요`);
    }
  }
  return {moveInDate:selected?.parsed||'', moveOutDate:next?.parsed||'', details:[...lines,...warnings].join('\n')};
}
if(typeof module!=='undefined')module.exports={residentComparison};
