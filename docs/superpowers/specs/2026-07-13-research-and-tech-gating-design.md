# 연구 진행 + 잠금 연동 (서브프로젝트 2c) 설계

**Date:** 2026-07-13
**Status:** Approved (design), pending implementation plan

## Background

2a(생산큐, 완료)와 2b(테크트리 데이터, 완료)가 각각 "도시가 건물을 큐잉해서 짓는 것"과 "기술 카탈로그가 존재하는 것"을 만들었다. 이번 서브프로젝트는 그 둘을 실제로 연결한다 — 원래 계획의 2c(잠금 연동)와 2d(연구 UI)를 하나로 합친다. 이유는 2a에서 이미 겪은 것과 같다: 플레이어가 무엇을 연구할지 고를 방법이 없으면 브라우저로 검증 불가능한 죽은 기능이 된다.

## 결정된 방향

- **연구는 도시 단위가 아니라 플레이어 단위.** Civ류 게임의 표준 모델과 동일 — 한 플레이어의 모든 도시가 낸 과학력을 합쳐 하나의 연구를 진행시킨다. 도시별 생산큐(2a)와 대칭이지만 소유자가 `Player`라는 점만 다르다.
- **단일 슬롯.** 2a와 동일하게 "현재 연구 중인 기술" 하나만 — 다중 큐 없음.
- **연구 가능 조건**: 해당 기술의 모든 `prerequisites`가 이미 연구 완료 상태여야 함. (건국력 순서를 게임적으로 강제하는 것 — 실록의 시대 순서와 일치.)
- **건물 잠금**: `buildings.yml`에 선택적 `unlocked_by: <tech_id>` 필드를 추가한다. 현재 건물 2개 중 `Granary`에 `unlocked_by: irrigation`을 건다(관개농법과 식량 저장이 테마상 자연스럽게 연결됨). `Palace`는 그대로 자동 지급이라 잠금 없음.
- **UI**: 기존 `StatusBar`의 과학 아이콘을 클릭하면 여는 새 연구 패널 — 현재 연구 중인 기술+진행률, 그리고 선행조건이 충족된(연구 가능한) 기술 목록과 "연구" 버튼. `CityDisplayInfo`의 건물 목록과 같은 패턴.

## 데이터 모델 변경

`server/config/technologies.yml`의 기존 13개 항목 각각에 `research_cost: number`를 추가한다(2a가 `buildings.yml`에 `production_cost`를 추가했던 것과 동일한 후속 확장):

| id | research_cost |
|---|---|
| irrigation | 5 |
| writing | 8 |
| currency | 8 |
| administration | 12 |
| seafaring | 12 |
| philosophy | 18 |
| masonry | 18 |
| banking | 25 |
| education | 30 |
| scientific_method | 40 |
| industrialization | 50 |
| electricity | 60 |
| computing | 75 |

`server/config/buildings.yml`의 `Granary`에 `unlocked_by: irrigation`을 추가.

## 서버 로직

`Player`(server)에 2a의 `City` 큐 패턴을 그대로 옮긴다:
- 신규 필드: `currentResearch: string | undefined`, `researchProgress: number`, `researchedTechs: Set<string>`.
- `queueResearch(techId: string)`: 존재하지 않는 id, 이미 연구 완료된 id, 선행조건 미충족인 id는 무시.
- `processResearchTurn()`: `this.cities`의 `science` 스탯 합계를 `researchProgress`에 누적 → `research_cost` 이상이면 완료(`researchedTechs.add(techId)`, 초과분 이월, `currentResearch` 비움). 큐가 비어 있으면 그 턴 과학력은 버려짐(2a와 동일 규칙).
- `hasResearchedTech(techId: string): boolean` — `City.queueBuilding()`이 잠긴 건물을 걸러낼 때 호출.
- 생성자에서 `nextTurn`(전역 이벤트) 구독 — 2a의 `City`/기존 `Unit.ts`와 동일한 per-instance 리스너 패턴.

`City.queueBuilding()`에 한 줄 추가: `buildingData.unlocked_by`가 있고 `this.player.hasResearchedTech(unlocked_by)`가 거짓이면 거부.

`InGameState`에 새 소켓 이벤트 2개(2a의 `availableBuildings`/`queueBuilding` 패턴과 동일):
- `availableTechnologies` (요청/응답): 카탈로그 전체(연구 상태 판단은 클라이언트가 함).
- `queueResearch` (커맨드): `{ techId }` → 요청 플레이어의 `queueResearch()` 호출.
- 진행 상태 브로드캐스트: `updateResearchQueue` — `{ currentResearch, progress, researchedTechs: string[] }`.

## 클라이언트/UI

- `AbstractPlayer`(client)에 `currentResearch`/`researchProgress`/`researchedTechs` 미러링 + `updateResearchQueue` 리스너.
- `StatusBar`의 과학 아이콘에 `onClick` 추가 — 클릭 시 새 `ResearchDisplayInfo` 패널 열기(2a의 `CityDisplayInfo` 건물 목록과 대칭 구조): 현재 연구+진행률 표시 줄, 그 아래 연구 가능한(선행조건 충족) 기술 목록 + "연구" 버튼.

## 범위 밖

- 유닛 잠금(유닛 자체가 아직 데이터화 안 됨).
- 정부 시스템(삼원체제), 이념 트랙, 황금/암흑시대 이벤트 — 별도 서브프로젝트.
- 연구 트리를 그래프로 시각화하는 UI(선/화살표 등) — 지금은 목록 형태로 충분.

## 리스크 / 열린 사항

- `research_cost` 수치는 대략값 — 실행 단계 이후 플레이테스트로 조정.
- 2a의 `City`가 이미 알고 있는 `player`(`this.player`)를 통해 `hasResearchedTech`를 호출하므로 순환 의존성 없음 — `Player`가 `City`를 몰라도 되고, `City`만 `Player`를 안다(기존 구조 그대로).
