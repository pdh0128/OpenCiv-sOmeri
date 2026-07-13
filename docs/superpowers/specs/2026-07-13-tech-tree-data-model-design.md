# 테크트리 데이터 모델 + 시대 매핑 (서브프로젝트 2b) 설계

**Date:** 2026-07-13
**Status:** Approved (design), pending implementation plan

## Background

서브프로젝트 2a(생산큐 기반, 완료·머지됨)로 도시가 건물 하나씩 큐잉해서 짓는 기반이 생겼다. 다음은 원래 계획대로 "시대·테크트리 리매핑" — 소메리 실록의 시대구분을 실제 기술 진행 시스템으로 만드는 작업이다.

이번 서브프로젝트는 **순수 데이터 모델**만 다룬다. 기술이 실제로 건물/유닛을 잠그는 것(2c), 플레이어가 무엇을 연구할지 고르는 것(2c/2d), UI(2d)는 전부 범위 밖이다. 이는 2a의 Task 1(buildings.yml에 production_cost 필드만 추가, 큐 로직은 별도 태스크)과 같은 패턴 — 콘텐츠 카탈로그부터 확정하고, 그 위에 메커니즘을 쌓는다.

## 결정된 방향

- **시대(에이지) 10개**: 실록 전10권 + 8권 통사(장구한 세월)의 결정적 전환점만 골라 10단계로 정리한다. 8권의 1~3기(재건/해양패권, 제2암흑기, 제2황금기)는 "장구한 세월" 하나로 압축하지 않고 아예 생략한다 — 게임 페이싱상 별도 시대로 두기엔 서사적 비중이 약하고, 4기(계몽시대·과학혁명)만 독립 시대로 승격할 가치가 있다(실제 과학혁명이라는 게임적으로 의미있는 전환점이기 때문).

  | 순서 | id | 이름 | 실록 근거 |
  |---|---|---|---|
  | 1 | chaos | 혼돈시대 | 제1권 1부 |
  | 2 | founding | 건국시대 | 제1권 2부 |
  | 3 | unification | 통일시대 | 제2권 |
  | 4 | great_empire | 대제국시대 | 제3권·제7권 (상/하 통합) |
  | 5 | golden_age | 황금시대 | 제4권 |
  | 6 | dark_age | 암흑시대 | 제5권 |
  | 7 | restoration | 중흥시대 | 제6권 |
  | 8 | enlightenment | 계몽시대 | 제8권 4기 |
  | 9 | industrial | 산업혁명시대 | 제9권 |
  | 10 | modern | 현대·우주시대 | 제10권 |

- **암흑시대는 의도적으로 기술이 없다.** 폭군왕의 18년은 실록에서 퇴보·정체의 시대로 그려진다 — 새 기술 없이 다음 시대로 넘어가는 것 자체가 서사를 반영한 설계다. 실행 단계에서 "빈 시대"를 버그로 오인하지 않도록 명시한다.
- **기술 13개**, 시대당 0~2개, 단순 DAG(선행조건 배열). 완전한 Civ급 트리(수십 개)는 지금 게임에 잠글 대상(건물 2개, 유닛 0개)이 거의 없어 과설계다 — 나중에 건물/유닛이 늘어나면 트리도 함께 늘린다.
- **위치**: 새 설정 파일 `server/config/eras.yml`, `server/config/technologies.yml`. 기존 `provinces.yml`/`buildings.yml`과 동일한 로딩 관례(YAML → JSON, `LobbyState`/`InGameState`가 부팅 시 1회 파싱)를 따른다.
- **서버 런타임 로직 없음.** 이번 서브프로젝트는 파일을 로드해서 조회 가능하게 만드는 것까지만 — "누가 무엇을 연구했는가", "연구에 드는 과학력" 같은 진행 상태 추적은 2c의 몫이다.

## 데이터 스키마

`server/config/eras.yml`:
```yaml
eras:
  - id: chaos
    name: 혼돈시대
    order: 1
  - id: founding
    name: 건국시대
    order: 2
  # ... (10개, order 1~10)
```

`server/config/technologies.yml`:
```yaml
technologies:
  - id: irrigation
    name: 관개농법
    era: chaos
    prerequisites: []
  - id: writing
    name: sOmeri 문자
    era: founding
    prerequisites: [irrigation]
  # ...
```

### 확정 기술 목록 (13개)

| id | 이름 | 시대 | 선행조건 | 실록 근거 |
|---|---|---|---|---|
| irrigation | 관개농법 | chaos | (없음) | 제1권 1부, 강 유역 관개 확산 |
| writing | sOmeri 문자 | founding | irrigation | 시조왕 15년, 초기 문자 채택 |
| currency | 표준 화폐 | founding | irrigation | 시조왕 41년, 표준 금속 화폐 |
| administration | 호적·도량형 | unification | writing | 통일왕 20년, 호적 조사·SOL 통일 |
| seafaring | 원양 항해 | unification | currency | 개척왕 원년, 원양 선단 |
| philosophy | 문명신앙 | great_empire | administration | 성현왕 원년, 학당·문명신앙 |
| masonry | 왕도 건설 | great_empire | seafaring | 개척왕 21년, 왕도 |
| banking | 신용 거래 | golden_age | philosophy, masonry | 황금왕 17년, 통상조약·상단 |
| education | 의무교육 | restoration | banking | 중흥왕 15년, 평민 학당 의무화 |
| scientific_method | 과학혁명 | enlightenment | education | 8권 4기, 역학·정밀관측 |
| industrialization | 산업화 | industrial | scientific_method | 제9권, 공업왕 |
| electricity | 전신·통신 | industrial | industrialization | 제9권, 통신왕 |
| computing | 정보공학 | modern | electricity | 제10권, 영세왕 AI 행정 |

(dark_age 시대에는 위 목록에 항목 없음 — 의도적.)

## 서버 코드

`server/config/`에 두 파일을 추가하는 것 외에, 기존 `InGameState.onInitialize()`가 `buildings.yml`을 읽는 것과 같은 방식으로 두 파일을 읽어 `this.eras`/`this.technologies`에 보관하고, `getEraByName(id)`/`getTechnologyById(id)` 조회 메서드를 추가한다. 소켓 이벤트나 클라이언트 연동은 없다 — 순수 서버 내부 조회 API만, 2c가 쓸 수 있게 준비해 둔다.

## 범위 밖

- 플레이어별 연구 진행 상태, 과학력 축적, 실제 잠금 — 서브프로젝트 2c.
- 테크트리 UI(연구 선택 화면) — 서브프로젝트 2d.
- 건물/유닛에 `unlocked_by` 필드 추가 — 2c에서 buildings.yml을 다시 건드릴 때 함께.

## 리스크 / 열린 사항

- 기술 13개·시대 10개는 초안 수치다. 건물/유닛 콘텐츠가 늘어나면 트리도 재조정 필요 — 지금은 "동작하는 골격"이 목표.
