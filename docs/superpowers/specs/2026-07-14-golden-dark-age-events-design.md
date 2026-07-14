# 황금/암흑시대 이벤트 (서브프로젝트 5) 설계

**Date:** 2026-07-14
**Status:** Approved (design), pending implementation plan

## Background

서브프로젝트 4(5대이념 트랙)까지 완료·머지됨 — 플레이어가 다섯 이념(통합·지식·발전·질서·개척) 점수를 누적한다. 이번이 원래 계획의 마지막 서브프로젝트: 그 누적치를 실제로 "소비"해서 실록의 황금시대(제4권)·암흑시대(제5권)를 게임 메커니즘으로 만든다. 이걸로 서브프로젝트 1~5 전체(소메리 문명 게임 마이그레이션 마스터플랜)가 완결된다.

## 결정된 방향

- **주기적 시대 판정 (Civ6의 "시대 점수" 방식 축약형).** 20턴마다 한 번씩, **그 20턴 동안 새로 쌓인** 다섯 이념 점수의 합(스냅샷 이후 델타, 누적 총합이 아님)을 계산해서 문턱값과 비교한다.
  - 델타 합 ≥ 80 → **황금시대** 진입 (다음 20턴 동안 유지)
  - 델타 합 ≤ 20 → **암흑시대** 진입 (다음 20턴 동안 유지)
  - 그 사이 → **평시**(보너스도 페널티도 없음)
- **효과**: 황금시대 = 모든 도시의 모든 스탯 +10%. 암흑시대 = 모든 도시의 모든 스탯 -10%. (서브프로젝트 3의 정부 분과 보너스처럼 특정 스탯 하나가 아니라 전체 — 실록에서도 황금/암흑시대는 국가 전체의 흥망을 뜻하므로.) 이미 있는 정부 분과 보너스(2c)와는 독립적으로 곱해짐(둘 다 적용 가능, 곱 연산 순서는 정부 보너스 먼저 → 시대 보너스 나중).
- **알림**: 시대가 바뀔 때(평시→황금/암흑, 또는 황금/암흑→평시로 복귀) 브로드캐스트 이벤트 하나 보내서 클라이언트가 짧은 알림을 띄운다("황금시대 시작!" 등).
- **UI**: `StatusBar`에 현재 시대 상태를 보여주는 작은 텍스트(예: "시대: 황금" / "시대: 평시" / "시대: 암흑") 하나 추가 — 클릭 상호작용 없음, 순수 표시.

## 데이터 모델

`Player`에 신규 필드:
- `eraStatus: 'golden' | 'dark' | 'normal'` (기본 `'normal'`)
- `eraCheckpointSnapshot: Record<string, number>` — 마지막 판정 시점의 `idealPoints` 스냅샷(델타 계산용)
- `turnsSinceLastCheckpoint: number` (기본 0, 매 턴 +1, 20에 도달하면 판정 후 0으로 리셋)

## 트리거 로직

`Player`의 기존 `nextTurn` 리스너에 로직 추가:
1. `turnsSinceLastCheckpoint += 1`
2. `turnsSinceLastCheckpoint`가 20 미만이면 종료.
3. 20 이상이면: 다섯 이념 각각 `idealPoints[ideal] - eraCheckpointSnapshot[ideal]`의 합을 구함.
4. 합이 80 이상이면 `eraStatus = 'golden'`, 20 이하면 `eraStatus = 'dark'`, 그 사이면 `eraStatus = 'normal'`.
5. `eraCheckpointSnapshot`을 현재 `idealPoints`의 복사본으로 갱신, `turnsSinceLastCheckpoint = 0`.
6. 이전 `eraStatus`와 다르면(전환이 발생했으면) 알림 브로드캐스트.

## 효과 적용

`City.getStatline()`에 이미 있는 `getGovernmentBonus()` 다음에, 플레이어의 `eraStatus`를 읽어 golden이면 모든 스탯 `*= 1.1`, dark면 `*= 0.9`, normal이면 변화 없음. 정부 분과 보너스가 특정 스탯 하나에 먼저 곱해진 뒤, 그 결과에 시대 보너스가 전체 스탯에 곱해짐(적용 순서: 정부 보너스 → 시대 보너스).

## 통신 프로토콜

- `sendEraStatusUpdate()` (서브프로젝트 2c/3의 `sendResearchQueueUpdate`/`sendGovernmentBranchUpdate`와 동일 패턴): `{ event: "updateEraStatus", eraStatus }`, 매 판정 시(20턴마다) 브로드캐스트.
- 전환 시 별도 알림: `{ event: "eraTransition", eraStatus, previousEraStatus }` — 클라이언트가 이걸 받으면 짧은 팝업/토스트를 띄운다(새 UI 컴포넌트 하나, 몇 초 후 자동 제거).

## UI

- `AbstractPlayer`(client)에 `eraStatus` 미러링 + `updateEraStatus` 리스너 + getter.
- `StatusBar`에 "시대: {상태}" 정적 텍스트 라벨 추가(클릭 없음), `updateEraStatus` 수신 시 텍스트 갱신.
- 신규 `EraTransitionToast.ts`: `eraTransition` 이벤트 수신 시 화면 중앙 상단에 몇 초간 표시되는 배너 액터를 만들고 자동으로 제거(예: 4초 후 `Game.getInstance().getCurrentScene().removeActor(toast)`).

## 범위 밖

- 시대별 고유 효과(예: 황금시대 한정 특수 건물/유닛, 암흑시대 한정 반란 이벤트) — 실록엔 있지만(내전, 유배 등) 이번 범위에서는 스탯 배율만 구현. 서사적 이벤트(내전 발생 등)는 후속 확장.
- 시대 지속 기간 조정 UI, 난이도 설정 — 고정값(20턴, 80/20 문턱값)만 사용.

## 리스크 / 열린 사항

- 문턱값(80/20)과 주기(20턴)는 대략값 — 실제 이념 점수 획득 속도(서브프로젝트 4의 +10/+15/+10/+2/+5)를 기준으로 대충 맞춘 것이라 플레이테스트로 조정 필요.
- 정부 보너스 → 시대 보너스 순서로 두 배율이 연속 곱해지는 것 — 수학적으로 순서를 바꿔도 최종 값은 동일(곱셈 교환법칙)하므로 실제로는 순서가 중요하지 않다. 문서화 목적으로만 순서를 명시.
