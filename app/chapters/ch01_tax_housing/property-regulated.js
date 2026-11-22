(() => {
  const form = document.querySelector('#consultation-form');
  const status = document.querySelector('#property-regulated-status');
  const periods = document.querySelector('#property-regulated-periods');
  const open = document.querySelector('#property-regulated-open');
  const address = form.elements.address;
  let items = null, lookup = '', loadFailed = false;
  function publish(state, rows = [], message = '') { form.regulatedHistory = {state, rows, message}; form.dispatchEvent(new Event('taxflow:regulated-updated')); }
  function clear(message, state = 'unknown') { periods.replaceChildren(); status.textContent = message; open.hidden = true; lookup = ''; publish(state, [], message); }
  function update() {
    const value = address.value.trim();
    if (!value) { clear('주택 주소를 입력해 주세요.'); return; }
    if (!items) { clear(loadFailed ? '지역 자료를 불러오지 못했습니다. 서버를 확인한 후 새로고침하세요.' : '지역 자료를 불러오는 중입니다.'); return; }
    const match = matchRegulatedAddress(value, items);
    if (match.error) { clear(match.error, match.province && match.city && !match.rows.length ? 'no_history' : 'unknown'); return; }
    const rows = match.rows;
    lookup = match.lookup;
    periods.replaceChildren();
    status.textContent = '';
    for (const row of rows) {
      const li = document.createElement('li');
      li.textContent = `${row.region} · 지정 ${row.start_date} · 해제 ${row.end_date || 'DB에 기록 없음'}${row.review_required || row.needs_geometry || row.exclusions.length ? ' · 제외지역 확인 필요' : ''}`;
      periods.append(li);
    }
    open.hidden = false;
    publish('found', rows);
  }
  form.addEventListener('reset', () => clear('주택 주소를 입력해 주세요.'));
  address.addEventListener('input', update);
  address.addEventListener('taxflow:address-updated', update);
  open.addEventListener('click', () => {
    if (!lookup) return;
    const panel = document.querySelector('#regulated-panel');
    const dialog = document.querySelector('#regulated-dialog');
    document.querySelector('#regulated-query').value = lookup;
    document.querySelector('#regulated-dialog-content').append(panel);
    panel.hidden = false;
    panel.removeAttribute('role');
    panel.removeAttribute('aria-labelledby');
    dialog.showModal();
    document.querySelector('#regulated-search').requestSubmit();
  });
  const dialog = document.querySelector('#regulated-dialog');
  document.querySelector('#regulated-dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    const panel = document.querySelector('#regulated-panel');
    panel.hidden = true;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', 'tab-regulated');
    document.querySelector('.workspace').insertBefore(panel, document.querySelector('.summary-panel'));
    open.focus();
  });
  fetch('/api/regulated-areas').then(response => {
    if (!response.ok) throw new Error();
    return response.json();
  }).then(data => { items = data.items; update(); })
    .catch(() => { items = null; loadFailed = true; clear('지역 자료를 불러오지 못했습니다. 서버를 확인한 후 새로고침하세요.'); });
})();
