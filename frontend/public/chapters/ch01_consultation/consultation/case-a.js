'use strict';

// 교육용 증빙묶음 A-E01~E10에서 확인한 사실. 원본 PDF를 등록한 것은 아니다.
const caseA = Object.freeze({
  taxpayerName:'김가람 (가상)', birthDate:'1985-03-15', resident:'예',
  ownership:'단독 소유', address:'서울특별시 마포구 상암동 101동 1001호',
  propertyType:'아파트', buildingUse:'주거용', landCategory:'대', landArea:'40㎡', buildingArea:'84.90㎡',
  acquisitionMethod:'매매', acquisitionContractDate:'2021-05-10', acquisitionBalanceDate:'2021-06-15',
  acquisitionRegistrationDate:'2021-06-15', acquisitionPrice:'650000000',
  transferStatus:'양도 완료', transferContractDate:'2026-01-10', transferBalanceDate:'2026-02-16',
  transferRegistrationDate:'2026-02-16', transferPrice:'1300000000',
  livedThere:'예', moveInDate:'2021-07-01', moveOutDate:'2022-07-01', registrationMatch:'예',
  household:'배우자 이나래, 자녀 김새봄 (모두 가상)', otherHomes:'없음', otherRights:'없음',
  currentHousing:'임차', propertyAfterMove:'공실', expensePresence:'없음', expenses:'0', otherTransfers:'없음',
  acquisitionDocument:'확인 필요', transferDocument:'확인 필요', residentDocument:'확인 필요',
  householdDetails:'E06: 세대 전체의 보유 현황은 교육조건이자 납세자 진술입니다.',
  notes:'교육용 사례 A. 실제 제출 금지. 출처: A_사실관계_증빙묶음.pdf E01~E10. 취득 E02·E04·E07, 양도 E03·E04·E07, 거주 E05, 세대 E06, 경비 E09. 필요경비 0원은 교육용 가정입니다. E10: 취득 당시 조정대상지역 및 거주요건은 공식 자료로 별도 검토 필요. 지번·단지명 미기재. 원본 PDF는 별도 등록이 필요합니다.'
});
if (typeof module !== 'undefined') module.exports = caseA;
