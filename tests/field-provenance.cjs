'use strict';
const assert = require('node:assert/strict');
const {createFieldProvenance} = require('../frontend/public/chapters/ch01_consultation/consultation/field-provenance.js');
class Badge { constructor(){this.className='';this.textContent='';} setAttribute(){} remove(){this.label.badge=null;} }
const labels = {}, listeners = {}, fields = {};
for (const name of ['address','birthDate']) {
  const label = labels[name] = {badge:null,firstElementChild:{},querySelector(){return this.badge;},insertBefore(badge){this.badge=badge;badge.label=this;}};
  fields[name] = {name,value:'',closest(){return label;}};
}
const form = {elements:{namedItem(name){return fields[name] || null;}},append(element){fields[element.name]=element;},querySelectorAll(){return Object.values(labels).map(x=>x.badge).filter(Boolean);},addEventListener(name,fn){listeners[name]=fn;}};
global.document = {createElement(type){return type === 'input' ? {type:'',name:'',value:''} : new Badge();}};
const norm=(name,v)=>String(v||'').replace(/[\s.-]/g,'');
const p=createFieldProvenance(form,norm);
fields.address.value='서울 마포구'; p.set('address','매수',fields.address.value);
assert.equal(labels.address.badge.textContent,'(매수)');
const saved=p.serialize();
fields.address.value='서울 강남구'; listeners.input({target:fields.address});
assert.equal(labels.address.badge,null); assert.deepEqual(JSON.parse(p.serialize()),{});
fields.address.value='서울 마포구'; p.load(saved); assert.equal(labels.address.badge.textContent,'(매수)');
fields.address.value='서울 강남구'; p.load(saved); assert.equal(labels.address.badge,null); assert.deepEqual(JSON.parse(p.serialize()),{});
fields.address.value='서울 마포구'; p.compare('address','매수','서울마포구');
assert.equal(labels.address.badge.textContent,'(매수)'); assert.deepEqual(JSON.parse(p.serialize()),{});
p.compare('address','양도','서울 마포구'); assert.equal(labels.address.badge.textContent,'(매수·양도)');
p.compare('address','초본','서울 마포구'); p.clearComparisons('초본'); assert.equal(labels.address.badge.textContent,'(매수·양도)');
listeners.input({target:fields.address}); assert.equal(labels.address.badge,null);
p.compare('address','양도','서울 강남구'); assert.equal(labels.address.badge,null);
fields.birthDate.value='2020.01.02.'; p.set('birthDate','초본',fields.birthDate.value); assert.equal(labels.birthDate.badge.textContent,'(초본)');
listeners.reset(); assert.equal(labels.birthDate.badge,null); assert.deepEqual(JSON.parse(p.serialize()),{});
console.log('출처 표시, 수정·복원 및 불일치 제거 확인 통과');
