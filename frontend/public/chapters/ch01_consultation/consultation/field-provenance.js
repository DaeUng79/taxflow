/* Track only fields explicitly populated from reviewed documents. */
function createFieldProvenance(form, normalize) {
  const store = document.createElement('input'); store.type = 'hidden'; store.name = '_fieldSources'; form.append(store);
  const allowed = new Set(['매수','양도','초본']);
  let sources = {}, matches = {};
  function write() { store.value = JSON.stringify(sources); }
  function paint(name) {
    const field = form.elements.namedItem(name);
    if (!field || !field.closest) return;
    const label = field.closest('label'); if (!label) return;
    let badge = label.querySelector('.field-source-badge');
    const entry = sources[name];
    const visible = entry && allowed.has(entry.source) && normalize(name, field.value) === entry.value && String(field.value).trim();
    const matching = [...(matches[name] || [])];
    if (!visible && !matching.length) { if (badge) badge.remove(); return; }
    if (!badge) { badge = document.createElement('span'); badge.className = 'field-source-badge'; label.insertBefore(badge,label.firstElementChild); }
    badge.textContent = visible ? `(${entry.source})` : `(${matching.join('·')})`;
    badge.setAttribute('aria-label', visible ? `분석값 출처: ${entry.source}` : `저장된 분석 결과와 일치: ${matching.join(', ')}`);
  }
  function set(name, source, value) {
    if (!allowed.has(source) || !form.elements.namedItem(name) || !String(value || '').trim()) return;
    sources[name] = {source, value:normalize(name,value)}; write(); paint(name);
  }
  function clearField(name) {
    if (!sources[name] && !matches[name]) return;
    delete sources[name]; delete matches[name]; write(); paint(name);
  }
  function compare(name, source, value) {
    const field = form.elements.namedItem(name);
    if (!field || !allowed.has(source) || !String(value || '').trim() || normalize(name,field.value) !== normalize(name,value)) return;
    if (!matches[name]) matches[name] = new Set();
    matches[name].add(source); paint(name);
  }
  function clearComparisons(source) {
    for (const name of Object.keys(matches)) {
      matches[name].delete(source);
      if (!matches[name].size) delete matches[name];
      paint(name);
    }
  }
  function load(raw) {
    sources = {}; matches = {};
    try {
      const parsed = JSON.parse(raw || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) for (const [name,entry] of Object.entries(parsed)) {
        if (entry && allowed.has(entry.source) && typeof entry.value === 'string' && form.elements.namedItem(name)) sources[name] = {source:entry.source,value:entry.value};
      }
    } catch (_) { /* Old records have no source metadata. */ }
    form.querySelectorAll('.field-source-badge').forEach(badge => badge.remove());
    for (const name of Object.keys(sources)) {
      const field = form.elements.namedItem(name);
      if (normalize(name,field.value) !== sources[name].value) delete sources[name];
      else paint(name);
    }
    write();
  }
  form.addEventListener('input', event => { if (event.target?.name && event.target !== store) clearField(event.target.name); });
  form.addEventListener('change', event => { if (event.target?.name && event.target !== store) clearField(event.target.name); });
  form.addEventListener('reset', () => { sources = {}; matches = {}; store.value = ''; form.querySelectorAll('.field-source-badge').forEach(badge => badge.remove()); });
  write();
  return {set, compare, clearComparisons, load, serialize: () => JSON.stringify(sources)};
}
if (typeof module !== 'undefined') module.exports = {createFieldProvenance};
