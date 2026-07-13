# sOmeri 세계관 마이그레이션 — 서브프로젝트 1: 기반 리스킨 + 파벌 구조

**Date:** 2026-07-13
**Status:** Approved (design), pending implementation plan

## Background

OpenCiv (`civ-so`)는 Civ5풍 턴제 전략 게임으로, 현재는 플레이어마다 서로 다른 문명(Rome, Mongolia, Mamluks, America, Germany, England, Cuba, Canada — `server/config/civilizations.yml`)을 선택해 대결하는 구조다.

이 프로젝트를 `meta/sOmeri_lore`(심볼릭 링크: `/Users/comodoflow/Documents/sosal/소메리왕조실록`)에 정리된 자체 세계관으로 전환한다. 소메리 세계관의 핵심은 "여러 문명의 대결"이 아니라 "단일 제국(소메리) + 건국력 9,776년 전 건국부터 현재 9,810년까지 이어지는 단일 왕조(박소은)의 시대별 존호 변화"다. 따라서 기존 Civ5식 다문명 대결 구조를 그대로 가져올 수 없고, 재해석이 필요하다.

마이그레이션은 범위가 크기 때문에 여러 서브프로젝트로 분해했다:

1. **기반 리스킨 + 파벌 구조** (본 문서) — 선행 필수. 문명 선택 제거, 플레이어=소메리 내 광역주/파벌 모델로 전환.
2. 시대·테크트리 리매핑 (혼돈~우주시대)
3. 삼원체제 정부 시스템 (원로원·국민의회·기술위원회)
4. 5대이념 트랙 (통합·지식·발전·질서·개척)
5. 황금/암흑시대 이벤트 시스템
6. SOL 화폐/경제 (대체로 1번에 흡수되는 리네임 수준)

2~6은 본 문서의 범위 밖이며, 각각 별도 스펙으로 브레인스토밍한다.

## 결정된 방향

- **경쟁 구조**: 각 플레이어는 서로 다른 문명이 아니라, 소메리 제국 내부의 서로 다른 광역주/파벌을 맡는다. (실록 8권 "제2기: 제2암흑기와 지방분권의 위기"에서 다섯 개 광역주가 동시에 중앙 조세 납부를 거부한 사건 등, 지방분권·광역주 간 대립 구도가 이미 실록에 등장한다.)
- **시간 범위**: 기존 Civ5식 테크트리를 그대로 유지(고대→현대→미래 압축 진행). 특정 시대에 고정하지 않는다.
- **파벌 정체성**: 완전히 새로 창작하지 않고, 실록에 실제로 등장한 지명/용어만 사용한다.
- **파벌 개수**: 실록에 고유명이 등장하는 지역은 4개 계열뿐이다 (기존 civilizations.yml의 8개에서 4개로 축소).

## 현재 코드 상태 (조사 결과)

- `server/config/civilizations.yml`: 문명 8개, 각각 `name`, `icon_name`, `inside_border_color`, `outside_border_color`, `start_bias`, `unique_unit_descs`, `unique_building_descs`, `ability_descs`, `cities`(도시 이름 풀) 필드 보유.
- 로딩/전송: `server/src/state/type/LobbyState.ts` — `availableCivs`/`civInfo`/`selectCiv` 소켓 이벤트, 미선택 시 `onDestroyed`에서 랜덤 배정.
- `client/src/player/AbstractPlayer.ts`(및 `ClientPlayer.ts`, `ExternalPlayer.ts`), `server/src/Player.ts`: `civData`/`civilizationData` 필드로 원본 문명 JSON을 보유. `color`/`team` 필드는 없음 — 색상은 문명의 `inside_border_color`/`outside_border_color`에서 파생.
- `client/src/city/City.ts`, `server/src/city/City.ts`: `CityOptions.player`로 소유주 연결. 도시 이름은 `player.getNextAvailableCityName()`(`server/src/Player.ts`)이 문명의 `cities` 풀에서 다음 이름을 가져옴. "수도(capital)" 개념은 코드에 존재하지 않음.
- `client/src/ui/SelectCivilizationGroup.ts`: 완전히 동작하는 문명 선택 UI(목록, 상세정보, 선택 버튼). `client/src/scene/type/LobbyScene.ts`에서 호출.
- `JoinGameScene.ts`: 서버 IP만 입력받음. 플레이어 이름/색상 선택 UI 없음 — 서버가 `"Player" + index`로 자동 부여.

## 새 데이터 모델

`server/config/civilizations.yml` → `server/config/provinces.yml`로 이름 변경. 스키마는 그대로 유지하고 내용만 교체한다.

| 광역주 | 실록 근거 | 보너스 방향 |
|---|---|---|
| 소메르 강 유역 | 건국지, 관개농법·구품관제 원조 (제1권) | 행정/농업 |
| 변경자치주 | 동부 산악 유목연합 → 자치주 편입, 실록에 "변경자치주"라는 표현이 그대로 등장 (제2권) | 기병/방어 |
| 서부 변경주 | 서부 변경 침공·수복 사건 (제8권) | 방어/국경 |
| 해안 자치주 | 남부 해안 성읍 5곳 자치주 편입 (제2권) | 해상 상업 |

각 광역주의 구체적인 `unique_unit_descs`/`unique_building_descs`/`ability_descs` 값과 도시 이름 풀(지명)은 실행 계획(writing-plans) 단계에서 실록 본문을 참조해 구체화한다 — 본 설계 문서는 방향성만 확정한다.

## 코드 변경 범위

- `Player.civilizationData`(및 `civData`) → `provinceData`로 리네임. 대상: `server/src/Player.ts`, `client/src/player/AbstractPlayer.ts`, `ClientPlayer.ts`, `ExternalPlayer.ts`.
- `City.ts`(client/server 양쪽): `player.getCivilizationData()` 참조를 `getProvinceData()`로 리네임. 소유권 구조(플레이어 1명 → 도시 다수) 자체는 변경하지 않음.
- `client/src/ui/SelectCivilizationGroup.ts` → `SelectProvinceGroup.ts` 리네임, UI 문구 "Select Civilization" → "광역주 선택"으로 교체. `LobbyScene.ts`의 호출부 갱신.
- 소켓 이벤트 리네임: `availableCivs`→`availableProvinces`, `civInfo`→`provinceInfo`, `selectCiv`→`selectProvince`. `LobbyState.ts`(server)와 클라이언트 대응 리스너 양쪽 갱신.
- 도시 이름 풀 4세트를 실록 지명 기반으로 교체 (구체적 지명은 실행 계획에서 확정).
- `client/src/testing/scenarios`, `server/tests`에서 기존 문명명(Rome, Mongolia 등)을 참조하는 픽스처를 새 광역주명으로 갱신.

## 범위 밖

- 정부 시스템(삼원체제), 5대이념 트랙, 황금/암흑시대 이벤트, SOL 화폐 리네임 — 모두 후속 서브프로젝트(2~6번)에서 별도로 다룬다.
- "수도(capital)" 개념 신설 — 요청되지 않았고 현재 코드에도 없으므로 이번 범위에 포함하지 않는다.
- 플레이어 이름/색상 수동 선택 UI 신설 — 현재 자동 배정 방식을 그대로 유지한다 (별도 요청 시 후속 작업으로 분리).

## 리스크 / 열린 사항

- 실록에 4개 광역주 각각의 구체적인 도시명이 나오지 않으므로, 도시 이름 풀은 실록의 분위기를 참고해 새로 지어야 한다 (완전한 "실록에 등장한 단어만" 원칙을 도시명 레벨까지는 지키기 어려움 — 실행 계획 단계에서 사용자 확인 필요).
- 4개 광역주로 축소되면서 기존 8인용 로비/매치 가정(있다면)이 있는지 확인 필요 — 조사 결과상 하드코딩된 최대 인원 제한은 발견되지 않았으나 실행 단계에서 재확인.
