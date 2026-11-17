'use strict';

function householdReview(homes, rights) {
  if (homes === '있음' || rights === '있음') return '세대원의 다른 주택 또는 권리 있음 · 특례 검토 필요';
  if (homes === '없음' && rights === '없음') return '세대원의 다른 주택·권리 없음으로 입력됨';
  return '세대원의 주택·권리 보유 여부 확인 필요';
}

if (typeof module !== 'undefined') module.exports = {householdReview};
if (typeof document !== 'undefined' && document.querySelector('#consultation-form')) {
  const form = document.querySelector('#consultation-form');
  const output = document.querySelector('#exemption-review-items');
  const update = () => { output.textContent = householdReview(form.elements.otherHomes.value, form.elements.otherRights.value); };
  form.addEventListener('input', event => { if (['otherHomes','otherRights'].includes(event.target.name)) update(); });
  form.addEventListener('change', event => { if (['otherHomes','otherRights'].includes(event.target.name)) update(); });
  form.addEventListener('taxflow:form-loaded', update);
  form.addEventListener('reset', () => queueMicrotask(update));
  update();
}
