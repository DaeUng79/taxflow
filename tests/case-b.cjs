const {test} = require('node:test');
const assert = require('node:assert/strict');
const a = require('../frontend/public/chapters/ch01_tax_housing/case-a.js');
const b = require('../frontend/public/chapters/ch01_tax_housing/case-b.js');
const tax = require('../frontend/public/chapters/ch01_tax_housing/capital-gains.js');

test('사례 B는 구분 이름과 월곶면 주소를 갖는 별도 가상 상담', () => {
  assert.equal(b.taxpayerName, '김가람 B (가상)');
  assert.equal(b.address, '경기도 김포시 월곶면 101동 1001호');
  assert.match(b.notes, /원문 성명은 김가람/);
  assert.match(b.notes, /B_사실관계_증빙묶음/);
  assert.notEqual(a.address, b.address);
  assert.notEqual(a.taxpayerName, b.taxpayerName);
  const result = tax.calculate(b);
  assert.deepEqual(result.errors, []);
  assert.equal(result.gain, 650000000);
  assert.equal(result.expenses, 0);
  assert.equal(result.options.treatment, 'pending');
  assert.ok(result.warnings.some(w => w.includes('비과세 판단 전')));
});
