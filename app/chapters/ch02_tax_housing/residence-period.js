'use strict';

// Calendar elapsed time, using the last day of the month for short months.
function residencePeriod(start, end, formatDate, labels = {start:'입주일', end:'퇴거일', period:'거주기간'}) {
  if (!start || !end) return {message:`${labels.start}과 ${labels.end}을 입력하면 ${labels.period}이 표시됩니다.`};
  const from = formatDate(start), to = formatDate(end);
  if (!from || !to) return {message:`올바른 ${labels.start}과 ${labels.end}을 입력해 주세요.`};
  const parts = value => value.split('.').slice(0, 3).map(Number);
  const [sy, sm, sd] = parts(from), [ey, em, ed] = parts(to);
  const date = (year, month, day) => new Date(Date.UTC(year, month - 1, day));
  const first = date(sy, sm, sd), last = date(ey, em, ed);
  if (last < first) return {message:`${labels.end}은 ${labels.start}보다 빠를 수 없습니다.`};
  const anniversary = (years, months) => {
    const monthIndex = sy * 12 + sm - 1 + years * 12 + months;
    const year = Math.floor(monthIndex / 12), month = monthIndex % 12 + 1;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return date(year, month, Math.min(sd, lastDay));
  };
  let years = ey - sy;
  if (anniversary(years, 0) > last) years--;
  let months = 0;
  while (months < 11 && anniversary(years, months + 1) <= last) months++;
  const days = Math.round((last - anniversary(years, months)) / 86400000);
  const elapsed = [years && `${years}년`, months && `${months}개월`, days && `${days}일`].filter(Boolean).join(' ') || '0일';
  return {message:`${from} ~ ${to} · ${elapsed}`};
}

if (typeof module !== 'undefined') module.exports = {residencePeriod};
if (typeof document !== 'undefined' && document.querySelector('#consultation-form')) {
  const form = document.querySelector('#consultation-form');
  const status = document.querySelector('#residence-period-status');
  const holdingStatus = document.querySelector('#holding-period-status');
  const update = () => { status.textContent = residencePeriod(form.elements.moveInDate.value, form.elements.moveOutDate.value, paymentUtils.formatDate).message; };
  const updateHolding = () => { holdingStatus.textContent = residencePeriod(form.elements.acquisitionBalanceDate.value, form.elements.transferBalanceDate.value, paymentUtils.formatDate, {start:'취득 잔금일', end:'양도 잔금일', period:'보유기간'}).message; };
  const updateAll = () => { update(); updateHolding(); };
  form.addEventListener('input', event => { if (['moveInDate','moveOutDate'].includes(event.target.name)) update(); if (['acquisitionBalanceDate','transferBalanceDate'].includes(event.target.name)) updateHolding(); });
  form.addEventListener('taxflow:form-loaded', updateAll);
  form.addEventListener('taxflow:residence-updated', update);
  form.addEventListener('taxflow:holding-updated', updateHolding);
  form.addEventListener('reset', () => queueMicrotask(updateAll));
  updateAll();
}
