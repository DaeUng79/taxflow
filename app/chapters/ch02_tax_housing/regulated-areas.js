(() => {
  const form = document.querySelector('#regulated-search');
  const results = document.querySelector('#regulated-results');
  const status = document.querySelector('#regulated-status');
  const pagination = document.querySelector('#regulated-pagination');
  const query = document.querySelector('#regulated-query');
  const sourceSelect = document.querySelector('#regulated-document-select');
  const sourceImage = document.querySelector('#regulated-document-image');
  const previousPage = document.querySelector('#regulated-page-prev');
  const nextPage = document.querySelector('#regulated-page-next');
  const pageCount = document.querySelector('#regulated-page-count');
  const sourcePages = {'regions.pdf': 10, 'history.pdf': 47};
  let currentSource = 'regions.pdf', currentPage = 1;
  const sourceExternal = document.querySelector('#regulated-document-external');
  const sourceStatus = document.querySelector('#regulated-document-status');
  function showSource(filename, sourcePage) {
    if (!sourcePages[filename] || !Number.isInteger(sourcePage) || sourcePage < 1 || sourcePage > sourcePages[filename]) return;
    const url = `/chapters/ch02_tax_housing/Adjustment_Areas/regulated-areas/${filename}#page=${sourcePage}`;
    sourceSelect.value = filename;
    currentSource = filename; currentPage = sourcePage;
    const name = filename.replace('.pdf', '');
    sourceImage.src = `/chapters/ch02_tax_housing/Adjustment_Areas/regulated-areas/pages/${name}-${String(sourcePage).padStart(2, '0')}.jpg`;
    sourceImage.parentElement.scrollTop = 0;
    sourceImage.alt = `${filename === 'regions.pdf' ? '지역별' : '연혁별'} 조정대상지역 원본 ${sourcePage}쪽`;
    pageCount.textContent = `${sourcePage} / ${sourcePages[filename]}쪽`;
    previousPage.disabled = sourcePage === 1; nextPage.disabled = sourcePage === sourcePages[filename];
    sourceExternal.href = url;
    sourceStatus.textContent = `${filename === 'regions.pdf' ? '지역별 자료' : '연혁별 자료'} · ${sourcePage}쪽`;
  }
  sourceSelect.addEventListener('change', () => showSource(sourceSelect.value, 1));
  previousPage.addEventListener('click', () => showSource(currentSource, currentPage - 1));
  nextPage.addEventListener('click', () => showSource(currentSource, currentPage + 1));
  showSource(currentSource, currentPage);
  const size = 20;
  let requestId = 0, items = [], page = 1;
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  function draw() {
    results.replaceChildren(); pagination.replaceChildren();
    if (!items.length) return;
    const wrap = el('div', null, 'regulated-table-wrap');
    const table = el('table', null, 'regulated-table');
    const caption = el('caption', '조정대상지역 지정·해제 이력');
    const head = document.createElement('thead');
    const headings = document.createElement('tr');
    ['시·도', '지역', '지정일', '해제일', '범위·근거'].forEach(label => { const th = el('th', label); th.scope = 'col'; headings.append(th); });
    head.append(headings);
    const body = document.createElement('tbody');
    for (const item of items.slice((page - 1) * size, page * size)) {
      const row = document.createElement('tr');
      row.append(el('td', item.province), el('td', item.region, 'regulated-region'), el('td', item.start_date, 'regulated-date'), el('td', item.end_date || '기록 없음', 'regulated-date'));
      const cell = document.createElement('td');
      const details = document.createElement('details');
      const summary = el('summary', item.review_required ? '제외지역 확인 필요' : '상세 보기', item.review_required ? 'regulated-review' : '');
      details.append(summary);
      const scope = item.scope === 'development_zone' ? '개발지구 등 특정 범위' : item.scope === 'administrative' ? '행정구역 기준' : item.scope;
      details.append(el('p', `적용 범위: ${scope}`));
      if (item.exclusions.length) details.append(el('p', `제외 지역: ${item.exclusions.join(', ')}`));
      if (item.notes) details.append(el('p', `비고: ${item.notes}`));
      if (item.needs_geometry) details.append(el('p', '지구 경계 확인 필요', 'regulated-warning'));
      if (item.source_file && item.source_page) {
        const link = el('a', `${item.source_title} ${item.source_page}쪽 왼쪽에 보기`);
        link.href = `/chapters/ch02_tax_housing/Adjustment_Areas/regulated-areas/${item.source_file}#page=${item.source_page}`;
        link.target = '_blank'; link.rel = 'noopener';
        link.addEventListener('click', event => { event.preventDefault(); showSource(item.source_file, item.source_page); });
        details.append(link);
      } else details.append(el('p', '원본 출처 확인 필요', 'regulated-warning'));
      cell.append(details); row.append(cell); body.append(row);
    }
    table.append(caption, head, body); wrap.append(table); results.append(wrap);
    const pages = Math.ceil(items.length / size);
    const prev = el('button', '이전'); prev.type = 'button'; prev.disabled = page === 1;
    const next = el('button', '다음'); next.type = 'button'; next.disabled = page === pages;
    prev.addEventListener('click', () => { page--; draw(); });
    next.addEventListener('click', () => { page++; draw(); });
    pagination.append(prev, el('span', `${page} / ${pages} 페이지`), next);
  }
  async function load() {
    const id = ++requestId;
    status.textContent = '이력을 불러오는 중입니다…';
    results.replaceChildren(); pagination.replaceChildren();
    try {
      const params = new URLSearchParams({q: query.value.trim()});
      const response = await fetch(`/api/regulated-areas?${params}`);
      if (!response.ok) throw new Error('자료를 불러오지 못했습니다. 서버를 재시작한 뒤 다시 시도해 주세요.');
      const data = await response.json();
      if (id !== requestId) return;
      items = data.items; page = 1;
      status.textContent = items.length ? `총 ${items.length.toLocaleString()}건 · 지정 기간별 이력` : '일치하는 이력이 없습니다. 미지정이라는 뜻은 아닙니다. 지역명을 짧게 입력하거나 원본을 확인해 주세요.';
      draw();
    } catch (error) { if (id === requestId) status.textContent = error.message; }
  }
  form.addEventListener('submit', event => { event.preventDefault(); load(); });
  document.querySelector('#regulated-reset').addEventListener('click', () => { query.value = ''; load(); });
  load();
})();
