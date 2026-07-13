# sOmeri 광역주 마이그레이션 (서브프로젝트 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Civ5-style 8-civilization pick (Rome, Mongolia, Mamluks, America, Germany, England, Cuba, Canada) with a 4-faction pick rooted in the sOmeri lore (소메르 강 유역 / 변경자치주 / 서부 변경주 / 해안 자치주), renaming the underlying `civilization` concept to `province` end-to-end (server config, `Player`, `City`, socket events, lobby UI).

**Architecture:** The existing data-driven civ system (a YAML config loaded once by `LobbyState`, referenced by `Player`/`City`/UI via a generic `Record<string, any>` blob) is kept as-is structurally — only the config content, field/method names, and socket event names change from "civ" to "province" vocabulary. No new subsystems, no schema changes.

**Tech Stack:** TypeScript, `ws` (server sockets), `yaml` parser, Jest + `ts-jest` (server tests only — client has no unit-test runner, verified via `tsc --noEmit` and the existing e2e `CitySettlement` scenario).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-13-someri-migration-foundation-design.md`
- Faction names must be exactly: `소메르 강 유역`, `변경자치주`, `서부 변경주`, `해안 자치주` (verbatim terms from the sOmeri chronicle — do not alter spelling/spacing).
- No new gameplay mechanics (government, ideology track, golden/dark ages, SOL currency) — out of scope for this plan.
- No "capital city" concept, no manual player name/color picker — not requested, do not add.
- Reuse existing sprite icon slots (`ROME_ICON`, `MONGOLIA_ICON`, `ENGLAND_ICON`, `MAMLUKS_ICON`) as placeholders for the 4 new provinces — no new art assets exist yet. This is a deliberate placeholder; real sOmeri province icons are a follow-up art task, not part of this engineering plan.

---

### Task 1: Province config data (`provinces.yml`)

**Files:**
- Create: `server/config/provinces.yml`
- Delete: `server/config/civilizations.yml`
- Test: `server/tests/unit/ProvincesConfig.test.ts`

**Interfaces:**
- Produces: a YAML file with top-level key `provinces`, an array of 4 objects each shaped `{ name: string, icon_name: string, inside_border_color: string, outside_border_color: string, start_bias: string, start_bias_desc: string, unique_unit_descs: string[], unique_building_descs?: string[], ability_descs: string[], cities: string[] }`. Task 3 (`LobbyState.ts`) reads this file at `./config/provinces.yml` and parses `parsed.provinces`.

- [ ] **Step 1: Write the failing test**

```typescript
// server/tests/unit/ProvincesConfig.test.ts
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

describe('provinces.yml', () => {
  let provinces: Record<string, any>[];

  beforeAll(() => {
    const filePath = path.join(__dirname, '../../config/provinces.yml');
    const parsed = YAML.parse(fs.readFileSync(filePath, 'utf-8'));
    provinces = parsed.provinces;
  });

  it('defines exactly the 4 sOmeri factions', () => {
    const names = provinces.map((p) => p.name);
    expect(names).toEqual(['소메르 강 유역', '변경자치주', '서부 변경주', '해안 자치주']);
  });

  it('gives every province the required fields', () => {
    for (const province of provinces) {
      expect(typeof province.name).toBe('string');
      expect(typeof province.icon_name).toBe('string');
      expect(typeof province.inside_border_color).toBe('string');
      expect(typeof province.outside_border_color).toBe('string');
      expect(typeof province.start_bias).toBe('string');
      expect(typeof province.start_bias_desc).toBe('string');
      expect(Array.isArray(province.unique_unit_descs)).toBe(true);
      expect(province.unique_unit_descs.length).toBeGreaterThan(0);
      expect(Array.isArray(province.ability_descs)).toBe(true);
      expect(province.ability_descs.length).toBeGreaterThan(0);
      expect(Array.isArray(province.cities)).toBe(true);
      expect(province.cities.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate city names across provinces', () => {
    const allCities = provinces.flatMap((p) => p.cities as string[]);
    expect(new Set(allCities).size).toBe(allCities.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest tests/unit/ProvincesConfig.test.ts`
Expected: FAIL — `ENOENT: no such file or directory, open '.../server/config/provinces.yml'`

- [ ] **Step 3: Create `server/config/provinces.yml`, delete `server/config/civilizations.yml`**

```yaml
provinces:
  - name: 소메르 강 유역
    icon_name: ROME_ICON
    inside_border_color: rgba(46,125,50,0.20)
    outside_border_color: rgb(200,168,68)
    start_bias: floodplains
    start_bias_desc: "시작 위치 편향: 범람원(강 유역)"
    unique_unit_descs:
      - 구품관제 서기관 (개척민 대체, 도시 설립 시 즉시 인구 +1)
    unique_building_descs:
      - 구휼 창고 (곳간 건물, 흉년 시 식량 손실 50% 경감)
    ability_descs:
      - 시조왕의 건국지: 모든 도시 생산력 +10%.
      - 관개농법 원조: 범람원·담수 타일 식량 +1.
    cities:
      - 소메르
      - 상류성
      - 하류성
      - 개토
      - 회맹
      - 구휼
      - 왕도
      - 구품
      - 신의
      - 통합

  - name: 변경자치주
    icon_name: MONGOLIA_ICON
    inside_border_color: rgba(121,85,72,0.20)
    outside_border_color: rgb(160,82,45)
    start_bias: grass_hill
    start_bias_desc: "시작 위치 편향: 구릉·산악"
    unique_unit_descs:
      - 변경 기병 (기사 대체, 이동력 +1)
    ability_descs:
      - 유목 연합의 후예: 기병 계열 유닛 전투력 +15%.
      - 자치의 전통: 자국 영토 내 유닛 유지비 -20%.
    cities:
      - 변경성
      - 산악진
      - 화친
      - 대치
      - 자치
      - 복속
      - 편입
      - 수비
      - 관문
      - 봉수

  - name: 서부 변경주
    icon_name: ENGLAND_ICON
    inside_border_color: rgba(96,125,139,0.20)
    outside_border_color: rgb(69,90,100)
    start_bias: none
    start_bias_desc: "시작 위치 편향: 없음"
    unique_unit_descs:
      - 수비대 (창병 대체, 방어력 +20%)
    ability_descs:
      - 침공과 수복의 땅: 자국 도시 방어력 +25%.
      - 위기의 결속: 외침을 받는 동안 인접 광역주 유닛과 합류 시 이동력 패널티 없음.
    cities:
      - 서부성
      - 관문진
      - 수복
      - 결집
      - 변경로
      - 위태
      - 재통합
      - 서변
      - 방벽
      - 귀환

  - name: 해안 자치주
    icon_name: MAMLUKS_ICON
    inside_border_color: rgba(2,119,189,0.20)
    outside_border_color: rgb(1,87,155)
    start_bias: shallow_ocean
    start_bias_desc: "시작 위치 편향: 얕은 바다(해안)"
    unique_unit_descs:
      - 상단 갤리 (갤리선 대체, 교역로 추가 +1)
    unique_building_descs:
      - 공설 시장 (시장 대체, 해안 인접 도시 골드 +15%)
    ability_descs:
      - 다섯 성읍의 자치: 해안 타일 인접 도시 골드 +20%.
      - 무혈 편입의 전통: 도시국가와의 우호도 상승 속도 +25%.
    cities:
      - 항구성
      - 교역
      - 자치항
      - 공설
      - 오항
      - 편입항
      - 해상로
      - 무역성
      - 등대
      - 시장
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest tests/unit/ProvincesConfig.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add server/config/provinces.yml server/tests/unit/ProvincesConfig.test.ts
git rm server/config/civilizations.yml
git commit -m "Config: Replace civilizations.yml with 4 sOmeri provinces"
```

---

### Task 2: Server `Player` — rename civ → province

**Files:**
- Modify: `server/src/Player.ts:21-22,111-113,158-168,173-187`
- Test: `server/tests/unit/Player.test.ts` (new)

**Interfaces:**
- Consumes: nothing from Task 1 directly (works against any `Record<string, any>` shaped like a province — the test constructs its own fixture).
- Produces: `Player.setProvinceData(data: Record<string, any>): void`, `Player.getProvinceData(): Record<string, any>`, `Player.toJSON(): { name: string, provinceData: Record<string, any>, requestedNextTurn: boolean }`, `Player.getNextAvailableCityName(): string` (reads `this.provinceData["cities"]`). Task 3 and Task 4 call these exact method names.

- [ ] **Step 1: Write the failing test**

```typescript
// server/tests/unit/Player.test.ts
import { WebSocket } from 'ws';
import { Player } from '../../src/Player';

jest.mock('../../src/Events');
jest.mock('../../src/Game', () => ({
  Game: { getInstance: () => ({ getPlayers: () => new Map() }) }
}));

function fakeWebSocket(): jest.Mocked<WebSocket> {
  return { on: jest.fn(), send: jest.fn() } as unknown as jest.Mocked<WebSocket>;
}

const fakeProvince = {
  name: '해안 자치주',
  icon_name: 'MAMLUKS_ICON',
  cities: ['항구성', '교역', '자치항']
};

describe('Player', () => {
  it('stores and returns province data', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.setProvinceData(fakeProvince);
    expect(player.getProvinceData()).toBe(fakeProvince);
  });

  it('serializes provinceData under the "provinceData" key in toJSON', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.setProvinceData(fakeProvince);
    const json = player.toJSON();
    expect(json).toEqual({
      name: 'Player1',
      provinceData: fakeProvince,
      requestedNextTurn: false
    });
  });

  it('returns the first unused city name from the province pool', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.setProvinceData(fakeProvince);
    expect(player.getNextAvailableCityName()).toBe('항구성');
  });

  it('skips city names already taken by this player\'s existing cities', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.setProvinceData(fakeProvince);
    (player as any).cities = [{ getName: () => '항구성' }, { getName: () => '교역' }];
    expect(player.getNextAvailableCityName()).toBe('자치항');
  });

  it('returns MAX_CITIES_REACHED once every pool name is used', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.setProvinceData(fakeProvince);
    (player as any).cities = fakeProvince.cities.map((name) => ({ getName: () => name }));
    expect(player.getNextAvailableCityName()).toBe('MAX_CITIES_REACHED');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest tests/unit/Player.test.ts`
Expected: FAIL — `player.setProvinceData is not a function`

- [ ] **Step 3: Rename the fields/methods in `server/src/Player.ts`**

Replace line 22:
```typescript
  private civilizationData: Record<string, any>;
```
with:
```typescript
  private provinceData: Record<string, any>;
```

Replace lines 111-113:
```typescript
  public setCivilizationData(civilizationData: Record<string, any>) {
    this.civilizationData = civilizationData;
  }
```
with:
```typescript
  public setProvinceData(provinceData: Record<string, any>) {
    this.provinceData = provinceData;
  }
```

Replace lines 158-168:
```typescript
  public toJSON() {
    return {
      name: this.name,
      civData: this.civilizationData,
      requestedNextTurn: this.requestedNextTurn
    };
  }

  public getCivilizationData() {
    return this.civilizationData;
  }
```
with:
```typescript
  public toJSON() {
    return {
      name: this.name,
      provinceData: this.provinceData,
      requestedNextTurn: this.requestedNextTurn
    };
  }

  public getProvinceData() {
    return this.provinceData;
  }
```

Replace lines 173-187:
```typescript
  public getNextAvailableCityName(): string {
    const eixtingNames = [];
    const allCityNames = this.civilizationData["cities"];
    for (const city of this.cities) {
      eixtingNames.push(city.getName());
    }

    for (const name of allCityNames) {
      if (!eixtingNames.includes(name)) {
        return name;
      }
    }

    return "MAX_CITIES_REACHED";
  }
```
with:
```typescript
  public getNextAvailableCityName(): string {
    const eixtingNames = [];
    const allCityNames = this.provinceData["cities"];
    for (const city of this.cities) {
      eixtingNames.push(city.getName());
    }

    for (const name of allCityNames) {
      if (!eixtingNames.includes(name)) {
        return name;
      }
    }

    return "MAX_CITIES_REACHED";
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest tests/unit/Player.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/Player.ts server/tests/unit/Player.test.ts
git commit -m "Server: Rename Player civilizationData to provinceData"
```

---

### Task 3: Server `LobbyState` — rename civ → province, load `provinces.yml`

**Files:**
- Modify: `server/src/state/type/LobbyState.ts` (entire file — every method touches the civ→province rename)
- Test: `server/tests/unit/LobbyState.test.ts` (new)

**Interfaces:**
- Consumes: `server/config/provinces.yml` (Task 1, path `./config/provinces.yml`, top-level key `provinces`); `Player.setProvinceData`/`getProvinceData` (Task 2).
- Produces: socket events `availableProvinces` (payload `{ event: "availableProvinces", provinces: [{name, icon_name}, ...] }`), `provinceInfo` (payload `{ event: "provinceInfo", name, icon_name, start_bias_desc, unique_unit_descs, unique_building_descs, ability_descs }`), `selectProvince` (broadcast payload `{ event: "selectProvince", name, playerName, provinceData }`). Method `getProvinceByName(name: string)`. Task 6 (client) listens for these exact event/key names.

- [ ] **Step 1: Write the failing test**

```typescript
// server/tests/unit/LobbyState.test.ts
import { LobbyState } from '../../src/state/type/LobbyState';

jest.mock('../../src/Events');
jest.mock('../../src/Game');

describe('LobbyState', () => {
  let lobbyState: LobbyState;
  const provinceA = { name: '소메르 강 유역', icon_name: 'ROME_ICON' };
  const provinceB = { name: '해안 자치주', icon_name: 'MAMLUKS_ICON' };

  beforeEach(() => {
    lobbyState = Object.create(LobbyState.prototype);
    (lobbyState as any).playableProvinces = [provinceA, provinceB];
  });

  it('getProvinceByName finds a province by exact name', () => {
    expect(lobbyState.getProvinceByName('해안 자치주')).toBe(provinceB);
  });

  it('getProvinceByName returns undefined for an unknown name', () => {
    expect(lobbyState.getProvinceByName('없는 광역주')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest tests/unit/LobbyState.test.ts`
Expected: FAIL — `lobbyState.getProvinceByName is not a function`

- [ ] **Step 3: Rewrite `server/src/state/type/LobbyState.ts`**

```typescript
import { Game } from "../../Game";
import { ServerEvents } from "../../Events";
import { Player } from "../../Player";
import { State } from "../State";
import fs from "fs";
import random from "random";
import YAML from "yaml";

let playerIndex = 1;

export class LobbyState extends State {
  private playableProvinces: Record<string, any>[];

  public onInitialize() {
    console.log("Lobby state initialized");
    playerIndex = 1;

    // Load available provinces from config file
    const provinceYAMLData = YAML.parse(fs.readFileSync("./config/provinces.yml", "utf-8"));
    //Convert provinceData from YAML to JSON:
    this.playableProvinces = JSON.parse(JSON.stringify(provinceYAMLData.provinces));

    ServerEvents.on({
      eventName: "connection",
      parentObject: this,
      callback: (data, websocket) => {
        // Initialize player name
        const playerName = "Player" + playerIndex;
        playerIndex++;

        console.log(playerName + " has joined the lobby");

        const newPlayer = new Player(playerName, websocket);
        Game.getInstance().getPlayers().set(playerName, newPlayer);

        // Send playerJoin data to other connected players
        for (const player of Array.from(Game.getInstance().getPlayers().values())) {
          player.sendNetworkEvent({
            event: "playerJoin",
            playerName: playerName
          });
        }

        newPlayer.sendNetworkEvent({ event: "setScene", scene: "lobby" });
      }
    });

    ServerEvents.on({
      eventName: "availableProvinces",
      parentObject: this,
      callback: (_, websocket) => {
        const player = Game.getInstance().getPlayerFromWebsocket(websocket);
        const playableProvinces = [];

        //Extract name and icon_name from playableProvinces:
        for (const province of this.playableProvinces) {
          playableProvinces.push({ name: province.name, icon_name: province.icon_name });
        }

        player.sendNetworkEvent({
          event: "availableProvinces",
          provinces: playableProvinces
        });
      }
    });

    ServerEvents.on({
      eventName: "provinceInfo",
      parentObject: this,
      callback: (data, websocket) => {
        const player = Game.getInstance().getPlayerFromWebsocket(websocket);

        // Get province from this.playableProvinces JSON list:
        const province = this.getProvinceByName(data["name"]);

        if (province) {
          player.sendNetworkEvent({
            event: "provinceInfo",
            name: province.name,
            icon_name: province.icon_name,
            start_bias_desc: province.start_bias_desc,
            unique_unit_descs: province.unique_unit_descs,
            unique_building_descs: province.unique_building_descs,
            ability_descs: province.ability_descs
          });
        }
      }
    });

    ServerEvents.on({
      eventName: "selectProvince",
      parentObject: this,
      callback: (data, websocket) => {
        const player = Game.getInstance().getPlayerFromWebsocket(websocket);
        //TODO: Check if this province is already selected.

        const province = this.getProvinceByName(data["name"]);
        player.setProvinceData(province);

        Game.getInstance()
          .getPlayers()
          .forEach((gamePlayer) => {
            gamePlayer.sendNetworkEvent({
              event: "selectProvince",
              name: province.name,
              playerName: player.getName(),
              provinceData: province
            });
          });
      }
    });
  }

  public getProvinceByName(name: string) {
    let province = undefined;
    for (const p of this.playableProvinces) {
      if (p.name === name) {
        province = p;
      }
    }

    return province;
  }

  public onDestroyed() {
    //Assign players w/o a province a non-assigned random province:
    Game.getInstance()
      .getPlayers()
      .forEach((player) => {
        if (!player.getProvinceData()) {
          player.setProvinceData(this.getRandomNonAssignedProvince());
        }
      });

    return super.onDestroyed();
  }

  private getRandomNonAssignedProvince(): Record<string, any> {
    const assignedProvinces = [];
    Game.getInstance()
      .getPlayers()
      .forEach((player) => {
        if (player.getProvinceData()) {
          assignedProvinces.push(player.getProvinceData());
        }
      });
    const nonAssignedProvinces = this.playableProvinces.filter((province) => {
      return !assignedProvinces.includes(province);
    });

    //Pick random non-assigned province:
    const randomIndex = random.int(0, nonAssignedProvinces.length - 1);
    return nonAssignedProvinces[randomIndex];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest tests/unit/LobbyState.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/state/type/LobbyState.ts server/tests/unit/LobbyState.test.ts
git commit -m "Server: Rename LobbyState civ events/methods to province"
```

---

### Task 4: Client `AbstractPlayer` — rename civ → province

**Files:**
- Modify: `client/src/player/AbstractPlayer.ts:8,11,34-36`

**Interfaces:**
- Consumes: `Player.toJSON()` shape `{ name, provinceData, requestedNextTurn }` (Task 2 — the server sends this as `playerJSON`).
- Produces: `AbstractPlayer.getProvinceData(): JSON`. Task 5 calls this exact method name.

There is no client unit-test runner (verified: only `server/` has a Jest config). Verification for this task and Tasks 5-6 is a TypeScript build check.

- [ ] **Step 1: Rename in `client/src/player/AbstractPlayer.ts`**

Replace line 8:
```typescript
  private civData: JSON;
```
with:
```typescript
  private provinceData: JSON;
```

Replace line 11:
```typescript
    this.civData = playerJSON["civData"];
```
with:
```typescript
    this.provinceData = playerJSON["provinceData"];
```

Replace lines 34-36:
```typescript
  public getCivilizationData() {
    return this.civData;
  }
```
with:
```typescript
  public getProvinceData() {
    return this.provinceData;
  }
```

- [ ] **Step 2: Verify the client still type-checks**

Run: `cd client && npx tsc --noEmit`
Expected: Errors referencing `getCivilizationData` in `client/src/city/City.ts` (not yet fixed — expected until Task 5 lands). Confirm the error is specifically `Property 'getCivilizationData' does not exist on type 'AbstractPlayer'` and nothing else new.

- [ ] **Step 3: Commit**

```bash
git add client/src/player/AbstractPlayer.ts
git commit -m "Client: Rename AbstractPlayer civData to provinceData"
```

---

### Task 5: Client `City` — update to `getProvinceData()`

**Files:**
- Modify: `client/src/city/City.ts:51-52,89`

**Interfaces:**
- Consumes: `AbstractPlayer.getProvinceData()` (Task 4).
- Produces: no new interface — internal call-site fix only.

- [ ] **Step 1: Update call sites in `client/src/city/City.ts`**

Replace lines 51-52:
```typescript
    this.innerBorderColor = this.player.getCivilizationData()["inside_border_color"];
    this.outsideBorderColor = this.player.getCivilizationData()["outside_border_color"];
```
with:
```typescript
    this.innerBorderColor = this.player.getProvinceData()["inside_border_color"];
    this.outsideBorderColor = this.player.getProvinceData()["outside_border_color"];
```

Replace line 89:
```typescript
        spriteRegion: SpriteRegion[this.player.getCivilizationData()["icon_name"]],
```
with:
```typescript
        spriteRegion: SpriteRegion[this.player.getProvinceData()["icon_name"]],
```

- [ ] **Step 2: Verify the client type-checks clean**

Run: `cd client && npx tsc --noEmit`
Expected: No errors mentioning `City.ts` or `AbstractPlayer.ts`. (Errors from `SelectCivilizationGroup.ts`/`LobbyScene.ts` are still expected until Task 6.)

- [ ] **Step 3: Commit**

```bash
git add client/src/city/City.ts
git commit -m "Client: Update City to use Player.getProvinceData()"
```

---

### Task 6: Client lobby UI — `SelectProvinceGroup` + `LobbyScene`

**Files:**
- Create: `client/src/ui/SelectProvinceGroup.ts`
- Delete: `client/src/ui/SelectCivilizationGroup.ts`
- Modify: `client/src/scene/type/LobbyScene.ts`

**Interfaces:**
- Consumes: socket events `availableProvinces`, `provinceInfo`, `selectProvince` with the exact payload shapes produced in Task 3; `provinceData` key on player rows (from `Player.toJSON()`, Task 2).
- Produces: nothing consumed by later tasks — this is the last task in the plan.

- [ ] **Step 1: Create `client/src/ui/SelectProvinceGroup.ts`**

```typescript
import { GameImage, SpriteRegion } from "../Assets";
import { Game } from "../Game";
import { NetworkEvents, WebsocketClient } from "../network/Client";
import { Actor } from "../scene/Actor";
import { ActorGroup } from "../scene/ActorGroup";
import { Button } from "./Button";
import { Label } from "./Label";

export class SelectProvinceGroup extends ActorGroup {
  private titleLabel: Label;
  private selectProvinceActors: Actor[];
  private provinceInformationActors: Actor[];

  constructor(x: number, y: number, width: number, height: number) {
    super({
      x: x,
      y: y,
      width: width,
      height: height
    });

    this.selectProvinceActors = [];
    this.provinceInformationActors = [];

    this.addActor(
      new Actor({
        image: Game.getInstance().getImage(GameImage.POPUP_BOX),
        x: this.x,
        y: this.y,
        width: this.width,
        height: this.height,
        nineSlice: true,
        cornerSize: 20
      })
    );

    this.listAvailableProvinces();

    NetworkEvents.on({
      eventName: "availableProvinces",
      parentObject: this,
      callback: (data) => {
        let xOffsset = 0;
        let yOffset = 1;

        // For each province JSON object
        for (const provinceJSON of data["provinces"]) {
          // Calculate the X and Y coordinates of the icon and add it
          let iconX = this.x + 68 * xOffsset + 14;

          if (iconX + 64 > this.x + this.width) {
            iconX = this.x + 68 * (xOffsset = 0) + 14;
            yOffset++;
          }

          let iconY = this.y + 68 * yOffset;

          const selectProvinceButton = new Button({
            icon: SpriteRegion[provinceJSON["icon_name"]],
            iconOnly: true,
            x: iconX,
            y: iconY,
            width: 64,
            height: 64,
            onClicked: () => {
              WebsocketClient.sendMessage({
                event: "provinceInfo",
                name: provinceJSON["name"]
              });
            },
            onMouseEnter: () => {}
          });

          this.selectProvinceActors.push(selectProvinceButton);
          this.addActor(selectProvinceButton);
          xOffsset++;
        }
      }
    });

    NetworkEvents.on({
      eventName: "provinceInfo",
      parentObject: this,
      callback: (data) => {
        this.displayProvinceInformation(data);
      }
    });

    NetworkEvents.on({
      eventName: "selectProvince",
      parentObject: this,
      callback: () => {
        Game.getInstance().getCurrentScene().removeActor(this);
      }
    });
  }

  public listAvailableProvinces() {
    // Remove province-information actors
    for (const actor of this.provinceInformationActors) {
      this.removeActor(actor);
    }

    const titleText = "광역주 선택";
    if (!this.titleLabel) {
      this.titleLabel = new Label({
        text: titleText,
        font: "20px serif",
        fontColor: "white"
      });
      this.addActor(this.titleLabel);
    } else {
      this.titleLabel.setText(titleText);
    }

    this.titleLabel.conformSize().then(() => {
      this.titleLabel.setPosition(this.x + this.width / 2 - this.titleLabel.getWidth() / 2, this.y + 12);
    });

    const closeButton = new Button({
      text: "Close",
      x: this.x + this.width / 2 - 150 / 2,
      y: this.y + this.height - 60,
      width: 150,
      height: 50,
      fontColor: "white",
      onClicked: () => {
        Game.getInstance().getCurrentScene().removeActor(this);
      }
    });

    this.selectProvinceActors.push(closeButton);
    this.addActor(closeButton);

    WebsocketClient.sendMessage({ event: "availableProvinces" });
  }

  public async displayProvinceInformation(data: JSON) {
    // Rename title label:
    this.titleLabel.setText(data["name"]);
    this.titleLabel.conformSize().then(() => {
      this.titleLabel.setPosition(this.x + this.width / 2 - this.titleLabel.getWidth() / 2, this.y + 12);
    });

    // Remove select province actors:
    for (const actor of this.selectProvinceActors) {
      this.removeActor(actor);
    }

    // Display province information:
    const provinceIcon = new Actor({
      image: Game.getInstance().getImage(GameImage.SPRITESHEET),
      spriteRegion: SpriteRegion[data["icon_name"]],
      x: this.x + this.width / 2 - 32 / 2,
      y: this.y + 40,
      width: 32,
      height: 32
    });
    this.addActor(provinceIcon);
    this.provinceInformationActors.push(provinceIcon);

    const informationLabels = [];

    //Start-bias label:
    const startBiasLabel = new Label({
      text: data["start_bias_desc"],
      font: "20px serif",
      fontColor: "white",
      x: this.x + 12,
      y: this.y + 80
    });

    await startBiasLabel.conformSize();

    this.provinceInformationActors.push(startBiasLabel);
    informationLabels.push(startBiasLabel);
    this.addActor(startBiasLabel);

    const uniqueUnitDescLabel = new Label({
      text: "Unique Units:",
      font: "bold 20px serif",
      fontColor: "white",
      x: this.x + 12,
      y: startBiasLabel.getY() + startBiasLabel.getHeight() + 30,
      maxWidth: this.width - 12
    });

    await uniqueUnitDescLabel.conformSize();

    this.provinceInformationActors.push(uniqueUnitDescLabel);
    this.addActor(uniqueUnitDescLabel);

    for (const uniqueUnitDesc of data["unique_unit_descs"]) {
      const lastLabel = this.provinceInformationActors[this.provinceInformationActors.length - 1];

      const unitLabel = new Label({
        text: "* " + uniqueUnitDesc,
        font: "20px serif",
        fontColor: "white",
        x: this.x + 12,
        y: lastLabel.getY() + lastLabel.getHeight() + 5,
        maxWidth: this.width - 12
      });

      await unitLabel.conformSize();

      this.provinceInformationActors.push(unitLabel);
      this.addActor(unitLabel);
    }

    if ("unique_building_descs" in data) {
      const lastLabel = this.provinceInformationActors[this.provinceInformationActors.length - 1];

      const uniqueBuildingsDescLabel = new Label({
        text: "Unique Buildings:",
        font: "bold 20px serif",
        fontColor: "white",
        x: this.x + 12,
        y: lastLabel.getY() + lastLabel.getHeight() + 30,
        maxWidth: this.width - 12
      });

      await uniqueBuildingsDescLabel.conformSize();

      this.provinceInformationActors.push(uniqueBuildingsDescLabel);
      this.addActor(uniqueBuildingsDescLabel);

      for (const buildingDesc of data["unique_building_descs"] as []) {
        const lastLabel = this.provinceInformationActors[this.provinceInformationActors.length - 1];

        const abilityLabel = new Label({
          text: "* " + buildingDesc,
          font: "20px serif",
          fontColor: "white",
          x: this.x + 12,
          y: lastLabel.getY() + lastLabel.getHeight() + 5,
          maxWidth: this.width - 12
        });

        await abilityLabel.conformSize();

        this.provinceInformationActors.push(abilityLabel);
        this.addActor(abilityLabel);
      }
    }

    const lastLabel = this.provinceInformationActors[this.provinceInformationActors.length - 1];

    const uniqueAbilityDescLabel = new Label({
      text: "Special Abilities:",
      font: "bold 20px serif",
      fontColor: "white",
      x: this.x + 12,
      y: lastLabel.getY() + lastLabel.getHeight() + 30,
      maxWidth: this.width - 12
    });

    await uniqueAbilityDescLabel.conformSize();

    this.provinceInformationActors.push(uniqueAbilityDescLabel);
    this.addActor(uniqueAbilityDescLabel);

    for (const abilityDesc of data["ability_descs"]) {
      const lastLabel = this.provinceInformationActors[this.provinceInformationActors.length - 1];

      const abilityLabel = new Label({
        text: "* " + abilityDesc,
        font: "20px serif",
        fontColor: "white",
        x: this.x + 12,
        y: lastLabel.getY() + lastLabel.getHeight() + 5,
        maxWidth: this.width - 12
      });

      await abilityLabel.conformSize();

      this.provinceInformationActors.push(abilityLabel);
      this.addActor(abilityLabel);
    }

    // Add select button:
    const selectButton = new Button({
      text: "Select",
      fontColor: "white",
      x: this.x + this.width / 2 - 100 - 150 / 2,
      y: this.y + this.height - 60,
      width: 150,
      height: 50,
      onClicked: () => {
        WebsocketClient.sendMessage({ event: "selectProvince", name: data["name"] });
      }
    });

    this.provinceInformationActors.push(selectButton);
    this.addActor(selectButton);

    // Add back button:
    const backButton = new Button({
      text: "Back",
      fontColor: "white",
      x: this.x + this.width / 2 + 100 - 150 / 2,
      y: this.y + this.height - 60,
      width: 150,
      height: 50,
      onClicked: () => {
        // Clear current province information actors, restore select province buttons:
        this.listAvailableProvinces();
      }
    });

    this.provinceInformationActors.push(backButton);
    this.addActor(backButton);
  }

  public onDestroyed(): void {
    super.onDestroyed();
    NetworkEvents.removeCallbacksByParentObject(this);
  }
}
```

- [ ] **Step 2: Delete the old file**

```bash
git rm client/src/ui/SelectCivilizationGroup.ts
```

- [ ] **Step 3: Update `client/src/scene/type/LobbyScene.ts`**

Replace line 6:
```typescript
import { SelectCivilizationGroup } from "../../ui/SelectCivilizationGroup";
```
with:
```typescript
import { SelectProvinceGroup } from "../../ui/SelectProvinceGroup";
```

Replace line 12:
```typescript
  private selectCivGroup: SelectCivilizationGroup;
```
with:
```typescript
  private selectProvinceGroup: SelectProvinceGroup;
```

Replace lines 30-62 (the "Select Civilization" button block):
```typescript
    this.addActor(
      new Button({
        text: "Select Civilization",
        x: Game.getInstance().getWidth() / 2 - 282 / 2,
        y: playerList.getY() + playerList.getHeight() + 10,
        width: 282,
        height: 62,
        fontColor: "white",
        onClicked: () => {
          if (this.hasActor(this.selectCivGroup)) {
            return;
          }

          console.log("Choose civilization");

          if (!this.selectCivGroup || !this.hasActor(this.selectCivGroup)) {
            this.selectCivGroup = new SelectCivilizationGroup(
              playerList.getX() + playerList.getWidth() / 2 - 432 / 2,
              Game.getInstance().getHeight() / 2 - 440 / 2,
              432,
              440
            );
            this.addActor(this.selectCivGroup);
          } else {
            this.removeActor(this.selectCivGroup);
          }
        },

        disableHoverWhen: () => {
          return this.hasActor(this.selectCivGroup);
        }
      })
    );
```
with:
```typescript
    this.addActor(
      new Button({
        text: "광역주 선택",
        x: Game.getInstance().getWidth() / 2 - 282 / 2,
        y: playerList.getY() + playerList.getHeight() + 10,
        width: 282,
        height: 62,
        fontColor: "white",
        onClicked: () => {
          if (this.hasActor(this.selectProvinceGroup)) {
            return;
          }

          console.log("Choose province");

          if (!this.selectProvinceGroup || !this.hasActor(this.selectProvinceGroup)) {
            this.selectProvinceGroup = new SelectProvinceGroup(
              playerList.getX() + playerList.getWidth() / 2 - 432 / 2,
              Game.getInstance().getHeight() / 2 - 440 / 2,
              432,
              440
            );
            this.addActor(this.selectProvinceGroup);
          } else {
            this.removeActor(this.selectProvinceGroup);
          }
        },

        disableHoverWhen: () => {
          return this.hasActor(this.selectProvinceGroup);
        }
      })
    );
```

Replace the three remaining `this.selectCivGroup` references (the "Ready Up" and "Back" button `disableHoverWhen`/`hasActor` checks, lines 73 and 95):
```typescript
          if (this.hasActor(this.selectCivGroup)) {
```
with (both occurrences):
```typescript
          if (this.hasActor(this.selectProvinceGroup)) {
```
and:
```typescript
        disableHoverWhen: () => {
          return this.hasActor(this.selectCivGroup);
        }
```
(the "Ready Up" button's `disableHoverWhen`, and the "Back" button's `disableHoverWhen`) with:
```typescript
        disableHoverWhen: () => {
          return this.hasActor(this.selectProvinceGroup);
        }
```

Replace lines 137-139 (in the `connectedPlayers` handler):
```typescript
          let civIcon = SpriteRegion.UNKNOWN_ICON;
          if ("civData" in players[i]) {
            civIcon = SpriteRegion[players[i]["civData"]["icon_name"]];
          }
```
with:
```typescript
          let provinceIcon = SpriteRegion.UNKNOWN_ICON;
          if ("provinceData" in players[i]) {
            provinceIcon = SpriteRegion[players[i]["provinceData"]["icon_name"]];
          }
```

Replace the `civIcon` variable use two lines below it (in the same handler, the `Actor` constructor's `spriteRegion: civIcon`):
```typescript
              spriteRegion: civIcon,
```
with:
```typescript
              spriteRegion: provinceIcon,
```

Replace lines 181-199 (the `selectCiv` network handler):
```typescript
    NetworkEvents.on({
      eventName: "selectCiv",
      parentObject: this,
      callback: (data) => {
        for (const row of playerList.getRows()) {
          if (row.getLabel().getText() !== data["playerName"]) {
            continue;
          }

          for (const rowActor of row.getActors()) {
            if (rowActor.getSpriteRegion() === SpriteRegion.STAR) {
              continue;
            }

            rowActor.setSpriteRegion(SpriteRegion[data["civData"]["icon_name"]]);
          }
        }
      }
    });
```
with:
```typescript
    NetworkEvents.on({
      eventName: "selectProvince",
      parentObject: this,
      callback: (data) => {
        for (const row of playerList.getRows()) {
          if (row.getLabel().getText() !== data["playerName"]) {
            continue;
          }

          for (const rowActor of row.getActors()) {
            if (rowActor.getSpriteRegion() === SpriteRegion.STAR) {
              continue;
            }

            rowActor.setSpriteRegion(SpriteRegion[data["provinceData"]["icon_name"]]);
          }
        }
      }
    });
```

- [ ] **Step 4: Verify the client type-checks clean**

Run: `cd client && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/ui/SelectProvinceGroup.ts client/src/scene/type/LobbyScene.ts
git commit -m "Client: Replace civilization picker with province picker"
```

---

### Task 7: Full regression check

**Files:** none (verification only)

**Interfaces:** none — this task confirms Tasks 1-6 integrate correctly end-to-end.

- [ ] **Step 1: Run the full server test suite**

Run: `cd server && npm run test`
Expected: All suites pass, including the new `ProvincesConfig.test.ts`, `Player.test.ts`, `LobbyState.test.ts`, and the pre-existing `Unit.test.ts` / `GameMap.test.ts`.

- [ ] **Step 2: Run the client type check**

Run: `cd client && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Run the existing e2e scenario**

Run: `npm run test:e2e` (from repo root)
Expected: The `CitySettlement` scenario passes — this exercises `Player`/`City` end-to-end (login, join lobby, settle a city) and would catch any remaining `civData`/`civilizationData` reference that Tasks 1-6 missed.

- [ ] **Step 4: Commit (only if Steps 1-3 required fixes)**

```bash
git add -A
git commit -m "Fix: Resolve regressions found in full sOmeri province migration check"
```
If no fixes were needed, skip this step — there is nothing to commit.
