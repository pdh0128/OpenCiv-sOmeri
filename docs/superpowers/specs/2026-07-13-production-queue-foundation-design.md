# 생산큐 기반 (서브프로젝트 2a) 설계

**Date:** 2026-07-13
**Status:** Approved (design), pending implementation plan

## Background

sOmeri 세계관 마이그레이션(서브프로젝트 1, 완료·머지됨)에 이어, 서브프로젝트 2는 원래 "시대·테크트리 리매핑"으로 계획되었다. 그러나 코드베이스 조사 결과 테크트리/에이지 시스템 자체가 존재하지 않았고, 그 이전에 더 근본적인 문제를 발견했다: **도시 생산큐(build queue) 시스템 자체가 없다.**

현재 `City.addBuilding(name)`(`server/src/city/City.ts:87-105`)은 비용도, 턴 수도, 대기열도 없이 즉시 건물을 완공시킨다. 유일한 호출부는 `server/src/unit/UnitActions.ts:34`의 정착 시 궁전(Palace) 자동 지급뿐이며, 플레이어가 직접 무언가를 짓기로 선택하는 UI/로직은 전무하다. `production` 스탯(`City.getStatline()`)은 계산은 되지만 어디에도 소비되지 않는 순수 표시값이다.

테크트리가 건물/유닛의 "잠금"을 걸려면 애초에 잠글 대상인 생산큐가 먼저 있어야 한다. 따라서 서브프로젝트 2를 다음과 같이 재분해한다:

1. **생산큐 기반** (본 문서) — 선행 필수.
2. 테크트리 데이터 모델 + 시대 매핑 (건국력 연표를 참고해 노드/선행조건/실록 시대 설계, 아직 연결 안 함)
3. 잠금 연동 (2의 완료 상태를 1의 생산큐에 연결)
4. UI (연구 선택 화면 + 도시 생산 메뉴 — 단, 생산 메뉴 자체는 본 문서에서 최소 형태로 이미 구현됨. 4는 연구 화면 위주)

2~4는 본 문서 범위 밖이며 각각 별도로 브레인스토밍한다.

## 결정된 방향

- **범위**: 건물만 다룬다. 유닛은 현재 config조차 없이 코드로 직접 생성되는 구조라, 유닛을 큐에 포함시키려면 유닛 데이터화라는 별도 선행 작업이 필요하다 — 이번 범위 밖.
- **UI 포함**: 큐만 만들고 누를 버튼이 없으면 브라우저로 검증 불가능하므로, `CityDisplayInfo.ts`의 빈 "Buildings" 카테고리를 채우는 최소 UI까지 이번에 포함한다.
- **큐 모델**: 단일 "현재 건설 중" 슬롯. 여러 개를 순서대로 쌓는 진짜 다중 큐(취소/재정렬 UI 필요)는 과설계라 채택하지 않는다 — 유닛까지 큐에 들어가게 될 때 다시 검토한다.

## 현재 코드 상태 (조사 결과)

- `server/src/city/City.ts:87-105` `addBuilding(name)`: 비용/턴 체크 없이 즉시 `buildingData`를 `this.buildings`에 push, `addBuilding` 네트워크 이벤트 전송.
- `getStatline()`(`:124-216`)에서 `production`은 항상 `0`에서 시작해 건물/타일 보너스만 합산되는 여느 스탯과 동일하게 취급됨 — 소비처 없음.
- `server/config/buildings.yml`: `Palace` 한 엔트리뿐, `name`/`asset_name`/`stats`만 존재. `cost`/`production_cost`/`turns` 필드 없음.
- 턴 진행: 서버 `server/src/state/type/InGameState.ts:207-222` `incrementTurn()`에서 전 플레이어에 `newTurn` 이벤트 전송 + 내부적으로 `ServerEvents.call("nextTurn", ...)` 발생(`:221`). 현재 이 내부 `nextTurn`을 구독하는 곳은 `server/src/unit/Unit.ts:101`(유닛 이동력 리셋)뿐 — `City.ts`는 아직 구독하지 않는다.
- `client/src/ui/CityDisplayInfo.ts:113` "Buildings" 카테고리는 헤더만 추가되고 행이 채워지지 않은 채 방치되어 있다(주석만 있고 구현 없음).
- `client/src/city/City.ts:118-125` `addBuilding` 핸들러는 수신한 건물을 로컬 배열에 append할 뿐, 큐/진행률 개념이 없다.

## 새 데이터 모델

`server/config/buildings.yml` 각 엔트리에 `production_cost: number` 필드 추가. 예시(Palace는 자동 지급 대상이라 큐 선택 목록에서 제외하되, 필드 자체는 넣어 스키마 일관성 유지):

```yaml
buildings:
  - name: Palace
    asset_name: BUILDING_PALACE
    production_cost: 0
    stats:
      - science: 3
      - production: 3
      - gold: 2
      - defense: 2
      - culture: 1
```

`City`(server) 신규 필드:
- `currentlyBuilding: string | undefined`
- `productionProgress: number` (기본 0)

신규/변경 메서드:
- `queueBuilding(buildingName: string): void` — 이미 지어졌거나 이름이 유효하지 않으면 무시. 유효하면 `currentlyBuilding`을 교체(진행 중이던 progress는 유지 — 대상을 바꿔도 쌓인 생산력은 이어짐).
- `processProductionTurn(): void` — `nextTurn` 서버 이벤트에 새로 연결. 현재 `production` 스탯만큼 `productionProgress`에 누적 → `production_cost` 이상이면 완성 처리(기존 `addBuilding`의 "건물 생성+저장+네트워크 전송" 로직을 재사용하도록 내부적으로 공유 — 정착 시 Palace 자동 지급과 큐 완성 양쪽에서 같은 완성 로직을 쓴다) → 초과분은 다음 턴으로 이월, `currentlyBuilding`을 `undefined`로 비움. 큐가 비어 있으면(`currentlyBuilding`이 `undefined`) 해당 턴의 생산력은 소모된다(표준 Civ 동작 — 저축 안 됨).

## 통신 프로토콜

- `availableBuildings` (client → server 요청, server → client 응답): 응답 payload `{ event: "availableBuildings", buildings: [{name, production_cost, stats}, ...] }` — `provinces`와 동일한 카탈로그 요청/응답 패턴.
- `queueBuilding` (client → server): payload `{ event: "queueBuilding", cityName: string, buildingName: string }`. 서버는 요청한 플레이어가 해당 도시의 소유주인지 검증한 뒤 `City.queueBuilding()` 호출.
- `updateProductionQueue` (server → client, 소유 플레이어에게): payload `{ event: "updateProductionQueue", cityName: string, currentlyBuilding: string | undefined, progress: number }`. 큐 변경/매 턴 진행/완성 시마다 전송.

## UI

`CityDisplayInfo.ts`의 "Buildings" 카테고리를 채운다:
- 맨 위: 현재 건설 중인 건물명 + 진행률 텍스트(예: "구휼 창고 (3/10)"), 없으면 "건설 중인 건물 없음".
- 그 아래: 아직 안 지어진 건물 목록(각 행에 이름 + `production_cost` + "건설" 버튼). 버튼 클릭 시 `queueBuilding` 전송.
- 도시 패널이 열릴 때 `availableBuildings` 요청을 보내 카탈로그를 채운다.

## 범위 밖

- 유닛 생산 큐 — 유닛 데이터화가 선행되어야 함, 별도 서브프로젝트.
- 다중 큐(순서 변경/취소 UI) — 단일 슬롯으로 충분, 유닛 포함 시 재검토.
- 테크트리 연동(잠금) — 서브프로젝트 2의 2~3단계에서 다룸.

## 리스크 / 열린 사항

- `production_cost` 구체적 수치(밸런스)는 실행 계획 단계에서 대략적인 값으로 채우고, 추후 플레이테스트로 조정 필요 — 지금은 "동작하는 시스템"이 목표지 밸런스가 목표가 아니다.
- 정착 시 Palace 자동 지급 로직(`UnitActions.ts:34`)이 새 "완성 로직 공유" 리팩터와 충돌 없이 동작하는지 실행 단계에서 확인 필요.
