const assert = require('node:assert/strict');
const {matchRegulatedAddress} = require('../frontend/public/chapters/ch01_consultation/consultation/regulated-match.js');
const rows = [
  {province:'경상남도', region:'창원시 성산구', scope:'administrative'},
  {province:'경상남도', region:'창원시 다른 개발지구', scope:'development_zone'},
  {province:'서울특별시', region:'마포구', scope:'administrative'}
];
assert.equal(matchRegulatedAddress('경남 창원시', rows).rows.length, 1);
assert.equal(matchRegulatedAddress('경남 창원시 의창구', rows).rows.length, 0);
assert.equal(matchRegulatedAddress('서울 마포구 상암동', rows).rows.length, 1);
assert.match(matchRegulatedAddress('서울', rows).error, /주소/);
console.log('주소 기반 조정대상지역 참고 이력 확인 통과');
