/* Keep ambiguous identities and existing consultation values for human review. */
function contractAutofill(pages, type, selectedName = '') {
  const fields = {}, warnings = [], labels = {taxpayerName:'신고자 성명', taxpayerAddress:'납세자 주소', birthDate:'생년월일', phoneNumber:'연락처', address:'주택 주소', landCategory:'토지 지목', landArea:'토지 면적', buildingUse:'건물 용도', buildingArea:'건물 면적'};
  const clean = v => typeof v === 'string' && !/판독\s*불가|확인\s*필요|불명/.test(v) ? v.trim() : '';
  const unique = values => { const list = [...new Set(values.map(clean).filter(Boolean))]; return list.length === 1 ? list[0] : ''; };
  const rows = pages.flatMap(p => Array.isArray(p?.property) ? p.property : []).filter(r => r && typeof r.label === 'string' && typeof r.value === 'string');
  for (const [label, field] of [['토지 지목','landCategory'],['토지 면적','landArea'],['건물 용도','buildingUse'],['건물 면적','buildingArea']]) {
    const values = rows.filter(r => r.label.replace(/\s/g,'') === label.replace(/\s/g,'')).map(r => r.value);
    fields[field] = unique(values);
    if (new Set(values.map(clean).filter(Boolean)).size > 1) warnings.push(`${label}에 여러 값이 있습니다. 원본에서 확인해 입력하세요.`);
  }
  const common = rows.filter(r => /^(소재지|부동산 소재지|주택 주소)$/.test(r.label.trim()));
  fields.address = unique((common.length ? common : rows.filter(r => /^(토지|건물)\s*(소재지|주소)$/.test(r.label.trim()))).map(r=>r.value));
  if (type === 'acquisition_contract' || type === 'transfer_contract') {
    const prefix = type === 'acquisition_contract' ? 'acquisition' : 'transfer';
    const title = prefix === 'acquisition' ? '취득' : '양도';
    Object.assign(labels, {[prefix+'ContractDate']:`${title} 계약일`, [prefix+'BalanceDate']:`${title} 잔금일`, [prefix+'Price']:`${title}가액`});
    const normalizeDate = v => paymentUtils.formatDate(clean(v)) || '';
    const payments = pages.flatMap(page => Array.isArray(page?.payments) ? page.payments : []).filter(row => row && typeof row.label === 'string');
    const dateValues = rows.filter(row => row.source !== 'model_unverified' && /^(?:계약\s*체결일|계약일|계약일자)$/.test(row.label.trim())).map(row => normalizeDate(row.value)).filter(Boolean);
    const balanceValues = payments.filter(row => /잔금/.test(row.label) && !/날짜|지급일|입금일|기일|일자/.test(row.label)).map(row => normalizeDate(row.payment_date)).filter(Boolean);
    const amounts = payments.filter(row => paymentUtils.isTotal(row.label)).map(row => {
      const match = clean(row.value).match(/^(?:금\s*)?(?:[₩￦W]\s*)?(\d{1,3}(?:,\d{3})+|\d+)\s*(?:원(?:정)?)?$/i);
      return match ? BigInt(match[1].replaceAll(',', '')).toString() : '';
    }).filter(Boolean);
    for (const [name, values] of [[prefix+'ContractDate',dateValues],[prefix+'BalanceDate',balanceValues],[prefix+'Price',amounts]]) {
      const candidates = [...new Set(values)];
      if (candidates.length === 1) fields[name] = candidates[0];
      else if (candidates.length > 1) warnings.push(`${labels[name]}에 여러 값이 있습니다. 원본을 확인하세요.`);
    }
  }
  {
    const side = type === 'acquisition_contract' ? 'buyer' : 'seller';
    let people = pages.flatMap(p => Array.isArray(p?.[side]) ? p[side] : []).filter(p => p && clean(p.name));
    if (selectedName) people = people.filter(p => clean(p.name) === selectedName.trim());
    const name = unique(people.map(p => p.name));
    const identifiers = [...new Set(people.map(p => clean(p.resident_registration_number)).filter(Boolean))];
    if (people.length && (!name || identifiers.length > 1)) warnings.push('계약 당사자가 여러 명이거나 식별 정보가 다릅니다. 신고자를 확인해 납세자 정보를 직접 입력하세요.');
    else if (name) {
      fields.taxpayerName = name;
      for (const [source,target] of [['address','taxpayerAddress'],['phone','phoneNumber']]) {
        const values=people.map(p=>clean(p[source])).filter(Boolean); fields[target]=unique(values);
        if (new Set(values).size>1) warnings.push(`${labels[target]}에 여러 값이 있습니다. 원본을 확인하세요.`);
      }
      const rrn = unique(people.map(p=>p.resident_registration_number)).replace(/[\s-]/g,'');
      const match = rrn.match(/^(\d{2})(\d{2})(\d{2})([1-8])[\d*]*$/);
      if (match) {
        const century = '1256'.includes(match[4]) ? '19' : '20';
        const date = paymentUtils.formatDate(`${century}${match[1]}.${match[2]}.${match[3]}.`);
        if (date) fields.birthDate = date;
      }
    }
  }
  if (type === 'transfer_contract') {
    Object.assign(labels, {buyerName:'양수인 성명', buyerId:'양수인 주민등록번호'});
    const buyerRows = pages.flatMap(p => Array.isArray(p?.buyer) ? p.buyer : []).filter(p => p && typeof p === 'object');
    const buyers = buyerRows.filter(p => clean(p.name));
    const unnamed = buyerRows.some(p => !clean(p.name) && [p.resident_registration_number, p.address, p.ownership_share].some(clean));
    const names = [...new Set(buyers.map(p => clean(p.name).normalize('NFKC').replace(/\s+/g,'')))];
    const identifiers = [...new Set(buyers.map(p => clean(p.resident_registration_number).replace(/[\s-]/g,'')).filter(Boolean))];
    if (unnamed || names.length > 1 || identifiers.length > 1) warnings.push('양수인이 여러 명이거나 식별 정보가 다릅니다. 양도계약서 원본을 확인해 직접 입력하세요.');
    else if (names.length === 1) {
      fields.buyerName = clean(buyers[0].name);
      if (identifiers.length === 1) fields.buyerId = buyers.map(p => clean(p.resident_registration_number)).find(Boolean);
    }
  }
  return {fields, warnings, labels};
}

/* Compare only an identifiable seller; never infer a match between different people. */
function contractSellerComparison(pages, taxpayer) {
  const clean = value => typeof value === 'string' && !/판독\s*불가|확인\s*필요|불명/.test(value) ? value.trim() : '';
  const names = value => clean(value).replace(/\s+/g,'');
  const people = pages.flatMap(page => Array.isArray(page?.seller) ? page.seller : []).filter(person => person && clean(person.name));
  if (!people.length) return {fields:{}, ambiguous:false};
  const distinct = [...new Set(people.map(person => names(person.name)))];
  const target = names(taxpayer.taxpayerName);
  const selected = target && distinct.includes(target) ? people.filter(person => names(person.name) === target) : (distinct.length === 1 ? people : []);
  if (!selected.length) return {fields:{}, ambiguous:true};
  const identifiers = [...new Set(selected.map(person => clean(person.resident_registration_number).replace(/[\s-]/g,'')).filter(Boolean))];
  if (identifiers.length > 1) return {fields:{}, ambiguous:true};
  const values = {};
  for (const [key, field] of [['name','taxpayerName'], ['address','taxpayerAddress'], ['phone','phoneNumber']]) {
    const list = [...new Set(selected.map(person=>clean(person[key])).filter(Boolean))];
    if (list.length === 1) values[field] = list[0];
  }
  const rrn = identifiers[0] || '';
  const match = rrn.match(/^(\d{2})(\d{2})(\d{2})([1-8])[\d*]*$/);
  if (match) {
    const century = '1256'.includes(match[4]) ? '19' : '20';
    values.birthDate = paymentUtils.formatDate(`${century}${match[1]}.${match[2]}.${match[3]}.`) || '';
  }
  return {fields:values, ambiguous:false};
}

/* Preserve distinct measurements and never choose between conflicting source values. */
function contractPropertyComparison(pages) {
  const clean = value => typeof value === 'string' && !/판독\s*불가|확인\s*필요|불명/.test(value) ? value.trim() : '';
  const normalize = value => clean(value).normalize('NFKC').replace(/\s+/g,'').toLowerCase();
  const rows = pages.flatMap(page => Array.isArray(page?.property) ? page.property : [])
    .filter(row => row && typeof row.label === 'string' && typeof row.value === 'string');
  const common = rows.filter(row => /^(소재지|부동산\s*소재지|주택\s*주소)$/.test(row.label.trim()));
  const locations = common.length ? common : rows.filter(row => /^(토지|건물)\s*(소재지|주소)$/.test(row.label.trim()));
  const candidates = {
    address:locations,
    landCategory:rows.filter(row => /^토지\s*지목$/.test(row.label.trim())),
    landArea:rows.filter(row => /^토지\s*면적$/.test(row.label.trim())),
    buildingUse:rows.filter(row => /^건물\s*용도$/.test(row.label.trim())),
    buildingArea:rows.filter(row => /^건물\s*면적$/.test(row.label.trim()))
  };
  const fields = {}, ambiguous = [];
  for (const [name, items] of Object.entries(candidates)) {
    const values = items.map(row => clean(row.value)).filter(Boolean);
    if (!values.length) continue;
    if (new Set(values.map(normalize)).size === 1) fields[name] = values[0];
    else ambiguous.push(name);
  }
  return {fields, ambiguous};
}

/* Reanalysis of the same document must not silently replace a reviewed contract date. */
function retainConfirmedContractDates(page, previousPage) {
  const isDate = row => row && typeof row.label === 'string' && /^(?:계약\s*체결일|계약일|계약일자)$/.test(row.label.trim());
  const confirmed = (Array.isArray(previousPage?.property) ? previousPage.property : [])
    .filter(row => isDate(row) && ['user_confirmed_deposit_date','user_confirmed'].includes(row.source) && paymentUtils.formatDate(row.value));
  if (!confirmed.length) return false;
  page.property = page.property.filter(row => !isDate(row));
  page.property.push(...confirmed.map(row=>({...row})));
  return true;
}

/* Mirror a single valid contract date to the deposit row, including across pages. */
function alignDepositDates(pages) {
  const rows = pages.flatMap(page => Array.isArray(page?.property) ? page.property : [])
    .filter(row => row && typeof row.label === 'string' && /^(?:계약\s*체결일|계약일|계약일자)$/.test(row.label.trim()) && String(row.value || '').trim());
  const parsed = rows.map(row => paymentUtils.formatDate(row.value));
  const unique = [...new Set(parsed.filter(Boolean))];
  const date = parsed.length && parsed.every(Boolean) && unique.length === 1 ? unique[0] : '';
  let changed = false;
  for (const page of pages) for (const item of (Array.isArray(page?.payments) ? page.payments : [])) {
    if (!item || typeof item.label !== 'string' || !/계약금/.test(item.label) || /날짜|지급일|입금일|기일|일자/.test(item.label)) continue;
    const current = typeof item.payment_date === 'string' ? item.payment_date : '';
    if (date) {
      if (paymentUtils.formatDate(current) !== date) {
        if (item.payment_date_source !== 'contract_date') item.payment_date_original = current;
        item.payment_date = date; item.payment_date_source = 'contract_date'; changed = true;
      }
    } else if (item.payment_date_source === 'contract_date') {
      item.payment_date = typeof item.payment_date_original === 'string' ? item.payment_date_original : '';
      delete item.payment_date_source; delete item.payment_date_original; changed = true;
    }
  }
  return {date, changed};
}
