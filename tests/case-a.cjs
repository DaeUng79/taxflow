const {test} = require('node:test');
const assert = require('node:assert/strict');
const facts = require('../app/chapters/ch01_tax_housing/case-a.js');
const tax = require('../app/chapters/ch01_tax_housing/capital-gains.js');

test('교육용 사례 A의 증빙 입력과 검토 전 계산', () => {
  const result = tax.calculate(facts);
  assert.deepEqual(result.errors, []);
  assert.equal(result.gain, 650000000);
  assert.equal(result.expenses, 0);
  assert.equal(result.holdingYears, 4);
  assert.equal(result.residenceYears, 1);
  assert.equal(result.options.treatment, 'pending');
  assert.ok(result.warnings.some(w => w.includes('비과세 판단 전')));
  assert.match(facts.notes, /교육용 가정/);
});
