# 실무 도구 파일 안내

이 폴더는 메인 화면의 6개 실무 도구가 공유하는 상담 작업 공간입니다. 한 상담의 사실관계·문서·계산·신고서 초안을 함께 사용하므로 기능을 변경할 때 관련 파일을 함께 확인하세요.

| 메인 화면 도구 | 주요 화면·처리 파일 | 서버·데이터 |
| --- | --- | --- |
| 신고서류 등록·분석 | `index.html`, `acquisition.html/js/css`, `resident.html/js/css`, `contract-autofill.js`, `resident-match.js`, `field-provenance.js` | `backend/app/chapters/ch01_tax_housing/acquisition.py`, `intake.py`, `resident.py`, `backend/app/chapters/ch02_pdf_Parsing/api.py`, `documents.py` |
| 상담·사실확인서 | `index.html`, `app.js`, `report.html/js/css`, `expense-transfers.js`, `residence-period.js`, `case-a.js`, `case-b.js` | `backend/app/main.py`, `backend/app/db/schema.sql`의 상담·문서 테이블 |
| 매매대금 정산·수수 확인 | `index.html`, `settlement.js`, `settlement-report.html/js/css`, `/assets/js/payment-utils.js` | `backend/app/main.py`의 settlement API, `settlement_confirmations` |
| 조정대상지역 조회 | `regulated-areas.js/css`, `regulated-match.js`, `property-regulated.js` | `backend/app/chapters/ch01_tax_housing/regulated_areas.py`, `data/reference/regulated_area_history.sqlite3`, `frontend/public/chapters/ch01_tax_housing/Adjustment_Areas/regulated-areas/` |
| 양도소득세 검토 | `capital-gains.js`, `capital-gains-panel.js`, `capital-gains.css`, `exemption-review.js` | 상담 기록의 `capitalGainsReviewJson` |
| 신고서 작성·출력 | `filing.js/css`, `filing-model.js`, `filing-render.js`, `filing-report.html/js/css` | 상담 기록의 `filingDraftJson`, 출력 서식 이미지 |

`index.html`과 `app.js`는 탭 선택, 상담 입력·저장 및 화면 간 공통 연결을 담당합니다. `styles.css`와 `consultation-layout.css`는 공통 디자인을 담당합니다. 문서 분석 창·출력 화면도 이 폴더의 HTML에서 실행됩니다.

메인의 바로가기 식별자는 `frontend/public/assets/js/missions.js`의 `practice[].id`와 `app.js`의 `practiceUrl()`을 사용합니다. 이 폴더 `app.js`의 `entryViews`는 식별자를 실제 탭으로 연결합니다.

상담 데이터, 원본 PDF, 분석 결과와 모델 파일은 소스코드가 아닙니다. 폴더 정리나 테스트를 위해 삭제하거나 옮기지 마세요.

조정대상지역 원본 이미지와 PDF 텍스트 추출 DB를 재생성하는 스크립트는 `backend/app/chapters/ch01_tax_housing/Adjustment_Areas/`에 있습니다. 서버 실행 시 자동으로 수행하지 않습니다.
신고서 서식 이미지 생성 스크립트는 `backend/app/chapters/ch01_tax_housing/filing/build_filing_templates.py`에 있으며 생성 이미지는 이 폴더의 `filing/`에 저장됩니다.
