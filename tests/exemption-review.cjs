'use strict';
const assert = require('node:assert/strict');
const {householdReview} = require('../app/chapters/ch01_tax_housing/exemption-review.js');
assert.match(householdReview('없음','없음'), /세대원의 다른 주택·권리 없음/);
assert.match(householdReview('있음','없음'), /특례 검토 필요/);
assert.match(householdReview('없음','있음'), /특례 검토 필요/);
assert.match(householdReview('없음','확인 필요'), /확인 필요/);
console.log('세대원의 다른 주택·권리 보유 여부 표시 확인 통과');
