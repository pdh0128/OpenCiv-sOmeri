# 삼원체제 정부 (서브프로젝트 3) 설계

**Date:** 2026-07-13
**Status:** Approved (design), pending implementation plan

## Background

서브프로젝트 2(생산큐+테크트리+연구잠금) 완료·머지됨. 다음은 원래 계획의 서브프로젝트 3 — 개혁왕이 세운 원로원·국민의회·기술위원회 삼원체제를, 플레이어가 셋 중 하나를 선택해 도시 스탯 보너스를 받는 정부 시스템으로 구현한다.

## 결정된 방향

- **단일 선택, 즉시 전환.** 연구/생산큐처럼 턴에 걸쳐 누적되는 게 아니라, Civ류 "정부 형태" 선택처럼 언제든 바로 바꿀 수 있는 스위치. 무정부 상태(전환 페널티) 같은 부가 메커니즘은 이번엔 넣지 않는다 — 나중에 필요하면 추가.
- **3개 분과, 각각 스탯 하나에 고정 보너스율.** 실록 근거(개혁왕 원년, 삼원 체제 성립): 원로원(권위·상징)→문화, 국민의회(백성의 뜻·생산)→생산력, 기술위원회(치수·축성·도량)→과학. 각 +20%.
- **잠금 없음.** 셋 다 게임 시작부터 선택 가능 — 테크 게이팅(연구 시스템과의 연동)은 이번 범위 밖. 과설계 방지.
- **효과 적용 위치**: `City.getStatline()`에서 소유 플레이어의 선택된 분과를 읽어, 해당 스탯에 `%` 보너스를 곱한다.
- **UI**: 기존 `StatusBar`의 "Culture:" 라벨 클릭 → 새 `GovernmentDisplayInfo` 패널. 3개 분과를 라디오 버튼으로(기존 `CityDisplayInfo`의 '시민 관리' 포커스 선택과 동일한 패턴) 표시, 선택 시 즉시 전환.

## 데이터 모델

`server/config/government_branches.yml`:
```yaml
government_branches:
  - id: senate
    name: 원로원
    stat: culture
    bonus_percent: 20
  - id: assembly
    name: 국민의회
    stat: production
    bonus_percent: 20
  - id: tech_committee
    name: 기술위원회
    stat: science
    bonus_percent: 20
```

## 서버 로직

`Player`:
- 신규 필드 `selectedGovernmentBranch: string | undefined`.
- `selectGovernmentBranch(branchId: string)`: 카탈로그에 존재하는 id인지만 확인(잠금 없으므로 그 외 검증 불필요), 유효하면 즉시 교체.
- `getSelectedGovernmentBranch(): string | undefined`.
- 생성자에 `selectGovernmentBranch` 커맨드 리스너 등록 — **`globalEvent: true` 필수**(Player가 LobbyState에서 생성되고, InGameState 진입 시 `ServerEvents.clear()`가 non-global 리스너를 지우므로 — 2c에서 이미 겪은 것과 동일한 이유).
- `sendGovernmentBranchUpdate()`: `{ event: "updateGovernmentBranch", selectedBranch }` 브로드캐스트.

`City.getStatline()`: 두 분기(asArray true/false) 각각의 return 직전에, `this.player.getSelectedGovernmentBranch()`가 있으면 해당 분과 데이터(`Game.getInstance().getCurrentStateAs<InGameState>().getGovernmentBranchById(id)`)를 조회해 그 `stat` 필드에 `* (1 + bonus_percent/100)`를 적용한다.

`InGameState`: `government_branches.yml` 로드(`this.governmentBranches`), `getGovernmentBranchById(id)` 조회 메서드, `availableGovernmentBranches` 요청/응답 이벤트(기존 `availableBuildings`/`availableTechnologies`와 동일 패턴).

## 클라이언트/UI

- `AbstractPlayer`(client)에 `selectedGovernmentBranch` 미러링 + `updateGovernmentBranch` 리스너 + getter.
- `StatusBar`의 "Culture:" 라벨에 `onClick` 추가 — 클릭 시 새 `GovernmentDisplayInfo` 패널 열기: 3개 분과를 라디오 버튼(기존 `CityDisplayInfo`의 `RadioButton`+`getOtherRadioButtons` 패턴 재사용)으로 표시, 선택 시 `selectGovernmentBranch` 전송.

## 범위 밖

- 무정부 상태/전환 페널티, 정부 형태별 고유 정책 트리(Civ5식 정책 카드) — 훨씬 큰 별도 작업.
- 테크 연동(연구로 분과 잠금 해제) — 이번엔 셋 다 시작부터 사용 가능.
- 5대이념 트랙, 황금/암흑시대 이벤트 — 별도 서브프로젝트.

## 리스크 / 열린 사항

- `bonus_percent` 20%는 대략값 — 플레이테스트로 조정.
- 스탯 보너스를 `getStatline()`의 최종 합계에 곱하는 방식이라, 순서상 인구 소모(food)나 건물/타일 보너스가 먼저 다 더해진 뒤 배율이 적용됨 — 의도된 동작(정부는 "생산성 배율"이지 원천 항목이 아님).
