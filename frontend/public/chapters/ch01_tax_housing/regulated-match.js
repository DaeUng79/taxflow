'use strict';
function matchRegulatedAddress(address, items) {
  const aliases = {'서울':'서울특별시','부산':'부산광역시','대구':'대구광역시','인천':'인천광역시','광주':'광주광역시','대전':'대전광역시','울산':'울산광역시','세종':'세종특별자치시','경기':'경기도','강원':'강원도','충북':'충청북도','충남':'충청남도','전북':'전라북도','전남':'전라남도','경북':'경상북도','경남':'경상남도','제주':'제주특별자치도'};
  const value = String(address || '').trim();
  if (!value) return {error:'주택 주소를 입력해 주세요.', rows:[]};
  const parts = value.normalize('NFC').split(/\s+/), province = aliases[parts[0]] || parts[0], city = parts[1];
  if (!province || !city || !/(시|군|구)$/.test(city)) return {error:'시·도와 시·군·구가 포함된 주택 주소를 확인해 주세요.', rows:[]};
  const addressParts = parts.slice(1), districtMissing = city.endsWith('시') && !/(구)$/.test(addressParts[1] || '');
  const rows = items.filter(row => {
    if (row.province !== province || row.scope !== 'administrative') return false;
    const regionParts = row.region.split(/\s+/);
    return regionParts.every((part,index) => addressParts[index] === part) || (districtMissing && regionParts[0] === city && regionParts.length === 2 && regionParts[1].endsWith('구'));
  });
  const district = city.endsWith('시') && addressParts[1]?.endsWith('구') ? ` ${addressParts[1]}` : '';
  return {province, city, rows, lookup:`${province} ${city}`, error:rows.length ? '' : `${province} ${city}${district}는 제공된 조정대상지역 이력에 포함되지 않았습니다.`};
}
if (typeof module !== 'undefined') module.exports = {matchRegulatedAddress};
