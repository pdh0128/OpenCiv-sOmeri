# 연구 진행 + 잠금 연동 (서브프로젝트 2c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give players a working single-slot research queue (mirroring the city production queue) that accumulates science across all their cities each turn, and gate the `Granary` building behind researching `irrigation` — with a minimal UI so the mechanic is playable and testable in a real browser.

**Architecture:** Extend `Player` (server) with `currentResearch`/`researchProgress`/`researchedTechs` state and `queueResearch()`/`processResearchTurn()`/`hasResearchedTech()` methods — the exact same single-slot-queue shape `City` already has for buildings (2a), just owned by `Player` instead and summing science across `this.cities` instead of reading one city's own stat. One new field (`unlocked_by`) on `buildings.yml` entries, checked inside `City.queueBuilding()`. Two new socket events (`availableTechnologies`, `queueResearch`) mirror the existing `availableBuildings`/`queueBuilding` pair. Client-side, `AbstractPlayer` mirrors the state and a new `ResearchDisplayInfo` panel (opened by clicking the "Science:" label in `StatusBar`) lets a player pick and track research.

**Tech Stack:** TypeScript, Jest + `ts-jest` (server tests only — client has no unit-test runner, verified via `tsc --noEmit` and a live browser check).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-13-research-and-tech-gating-design.md`
- Research is tracked per-`Player`, not per-city — one shared queue fed by the sum of all the player's cities' `science` stat.
- Single "currently researching" slot — no multi-item queue.
- A technology is queueable only if every id in its `prerequisites` array is already in the player's `researchedTechs`.
- If the research slot is empty when a turn is tallied, that turn's science is discarded (not banked) — same rule as the production queue.
- **Critical wiring detail:** `Player` instances are created during `LobbyState` (before the game transitions to `InGameState`), and `ServerEvents.clear()` (called on every state transition, `server/src/state/type/State.ts:10`) strips every listener that wasn't registered with `globalEvent: true`. `Player`'s existing `loadedIn`/`resizeWindow` listeners already use `globalEvent: true` for exactly this reason. The two new listeners this plan adds to `Player`'s constructor (`queueResearch`, `nextTurn`) **must** also set `globalEvent: true`, or they will silently never fire once the game leaves the lobby. `City`'s own `nextTurn`/`queueBuilding` listeners (2a) did NOT need this flag because `City` instances are only ever created inside `InGameState`, after the one relevant `clear()` has already happened — do not copy that detail by mistake.
- No unit gating (units aren't data-driven yet) — buildings only.
- No tech-tree visualization UI (graph/lines) — a flat researchable-list is enough, mirroring the production queue's building list.

---

### Task 1: Tech and building catalogs gain cost/unlock fields

**Files:**
- Modify: `server/config/technologies.yml`
- Modify: `server/config/buildings.yml`
- Modify: `server/tests/unit/TechTreeConfig.test.ts`
- Modify: `server/tests/unit/BuildingsConfig.test.ts`

**Interfaces:**
- Produces: every entry in `technologies.yml` gains `research_cost: number`. `buildings.yml`'s `Granary` entry gains `unlocked_by: irrigation`. Task 2 reads `research_cost` off `getTechnologyById()`'s return value; Task 3 reads `unlocked_by` off `getBuildingDataByName()`'s return value.

- [ ] **Step 1: Write the failing tests**

Append to `server/tests/unit/TechTreeConfig.test.ts` (inside the existing `describe('eras.yml and technologies.yml', ...)` block, after the last `it(...)`):

```typescript
  it('gives every technology a positive numeric research_cost', () => {
    for (const tech of technologies) {
      expect(typeof tech.research_cost).toBe('number');
      expect(tech.research_cost).toBeGreaterThan(0);
    }
  });
```

Append to `server/tests/unit/BuildingsConfig.test.ts` (inside the existing `describe('buildings.yml', ...)` block, after the last `it(...)`):

```typescript
  it('gates Granary behind researching irrigation', () => {
    const granary = buildings.find((b) => b.name === 'Granary');
    expect(granary!.unlocked_by).toBe('irrigation');
  });

  it('leaves Palace with no unlock requirement (auto-granted)', () => {
    const palace = buildings.find((b) => b.name === 'Palace');
    expect(palace!.unlocked_by).toBeUndefined();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest tests/unit/TechTreeConfig.test.ts tests/unit/BuildingsConfig.test.ts`
Expected: FAIL — `expected typeof undefined to be 'number'` / `expected undefined to be 'irrigation'`

- [ ] **Step 3: Update `server/config/technologies.yml`**

Replace the entire file content with:

```yaml
technologies:
  - id: irrigation
    name: 관개농법
    era: chaos
    prerequisites: []
    research_cost: 5
  - id: writing
    name: sOmeri 문자
    era: founding
    prerequisites: [irrigation]
    research_cost: 8
  - id: currency
    name: 표준 화폐
    era: founding
    prerequisites: [irrigation]
    research_cost: 8
  - id: administration
    name: 호적·도량형
    era: unification
    prerequisites: [writing]
    research_cost: 12
  - id: seafaring
    name: 원양 항해
    era: unification
    prerequisites: [currency]
    research_cost: 12
  - id: philosophy
    name: 문명신앙
    era: great_empire
    prerequisites: [administration]
    research_cost: 18
  - id: masonry
    name: 왕도 건설
    era: great_empire
    prerequisites: [seafaring]
    research_cost: 18
  - id: banking
    name: 신용 거래
    era: golden_age
    prerequisites: [philosophy, masonry]
    research_cost: 25
  - id: education
    name: 의무교육
    era: restoration
    prerequisites: [banking]
    research_cost: 30
  - id: scientific_method
    name: 과학혁명
    era: enlightenment
    prerequisites: [education]
    research_cost: 40
  - id: industrialization
    name: 산업화
    era: industrial
    prerequisites: [scientific_method]
    research_cost: 50
  - id: electricity
    name: 전신·통신
    era: industrial
    prerequisites: [industrialization]
    research_cost: 60
  - id: computing
    name: 정보공학
    era: modern
    prerequisites: [electricity]
    research_cost: 75
```

- [ ] **Step 4: Update `server/config/buildings.yml`**

Replace the entire file content with:

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
  - name: Granary
    asset_name: BUILDING_PALACE
    production_cost: 10
    unlocked_by: irrigation
    stats:
      - food: 2
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npx jest tests/unit/TechTreeConfig.test.ts tests/unit/BuildingsConfig.test.ts`
Expected: PASS (8 tests in `TechTreeConfig.test.ts`, 5 tests in `BuildingsConfig.test.ts`)

- [ ] **Step 6: Commit**

```bash
git add server/config/technologies.yml server/config/buildings.yml server/tests/unit/TechTreeConfig.test.ts server/tests/unit/BuildingsConfig.test.ts
git commit -m "Config: Add research costs and gate Granary behind irrigation"
```

---

### Task 2: Server `Player` — research queue logic

**Files:**
- Modify: `server/src/Player.ts`
- Modify: `server/tests/unit/Player.test.ts`

**Interfaces:**
- Consumes: `server/config/technologies.yml`'s `research_cost` and `prerequisites` fields (Task 1), via a new `Game.getInstance().getCurrentStateAs<InGameState>().getTechnologyById(id)` call (mirrors the existing `getBuildingDataByName` call already used in `City.ts`).
- Produces: `Player.queueResearch(techId: string): void`, `Player.processResearchTurn(): void`, `Player.hasResearchedTech(techId: string): boolean`, `Player.getCurrentResearch(): string | undefined`, `Player.getResearchProgress(): number`, `Player.getResearchedTechs(): string[]`. Also registers two new constructor listeners (`queueResearch`, `nextTurn`, both `globalEvent: true` — see Global Constraints) and a `sendResearchQueueUpdate()` method broadcasting `{ event: "updateResearchQueue", currentResearch, progress, researchedTechs: string[] }`. Task 3 calls `hasResearchedTech`; Task 5 (client) consumes the `updateResearchQueue` event shape.

- [ ] **Step 1: Write the failing test**

Append to `server/tests/unit/Player.test.ts` (add the import and a new top-level `describe` block after the existing one — do not modify the existing `describe('Player', ...)` block or its tests):

Add this import at the top of the file, alongside the existing imports:
```typescript
import { Game } from '../../src/Game';
```

Add this new `describe` block at the end of the file, after the closing `});` of the existing `describe('Player', ...)` block:

```typescript
describe('Player research queue', () => {
  const irrigationData = { id: 'irrigation', name: '관개농법', era: 'chaos', prerequisites: [], research_cost: 5 };
  const writingData = { id: 'writing', name: 'sOmeri 문자', era: 'founding', prerequisites: ['irrigation'], research_cost: 8 };

  let getTechnologyById: jest.Mock;

  beforeEach(() => {
    getTechnologyById = jest.fn().mockImplementation((id: string) => {
      if (id === 'irrigation') return irrigationData;
      if (id === 'writing') return writingData;
      return undefined;
    });

    jest.spyOn(Game, 'getInstance').mockReturnValue({
      getCurrentStateAs: jest.fn().mockReturnValue({ getTechnologyById })
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('queueResearch sets currentResearch for a valid tech with satisfied prerequisites', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.queueResearch('irrigation');
    expect(player.getCurrentResearch()).toBe('irrigation');
  });

  it('queueResearch ignores an unknown technology id', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.queueResearch('nonexistent');
    expect(player.getCurrentResearch()).toBeUndefined();
  });

  it('queueResearch ignores a technology whose prerequisites are not yet researched', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.queueResearch('writing'); // requires irrigation, not yet researched
    expect(player.getCurrentResearch()).toBeUndefined();
  });

  it('queueResearch ignores an already-researched technology', () => {
    const player = new Player('Player1', fakeWebSocket());
    (player as any).researchedTechs.add('irrigation');
    player.queueResearch('irrigation');
    expect(player.getCurrentResearch()).toBeUndefined();
  });

  it('processResearchTurn accumulates progress from all cities without completing below cost', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.queueResearch('irrigation'); // cost 5
    (player as any).cities = [
      { getStatline: () => ({ science: 2 }) },
      { getStatline: () => ({ science: 1 }) }
    ];

    player.processResearchTurn();

    expect(player.getResearchProgress()).toBe(3);
    expect(player.getCurrentResearch()).toBe('irrigation');
    expect(player.hasResearchedTech('irrigation')).toBe(false);
  });

  it('processResearchTurn completes the technology once cost is reached, carrying overflow', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.queueResearch('irrigation'); // cost 5
    (player as any).cities = [{ getStatline: () => ({ science: 4 }) }];

    player.processResearchTurn(); // progress 4, below cost
    player.processResearchTurn(); // progress 8 >= 5 -> completes, overflow 3

    expect(player.hasResearchedTech('irrigation')).toBe(true);
    expect(player.getCurrentResearch()).toBeUndefined();
    expect(player.getResearchProgress()).toBe(3);
  });

  it('processResearchTurn does nothing when nothing is queued', () => {
    const player = new Player('Player1', fakeWebSocket());
    (player as any).cities = [{ getStatline: () => ({ science: 10 }) }];

    player.processResearchTurn();

    expect(player.getResearchProgress()).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest tests/unit/Player.test.ts`
Expected: FAIL — `player.queueResearch is not a function`

- [ ] **Step 3: Add the `InGameState` import to `server/src/Player.ts`**

Replace line 5:
```typescript
import { Unit } from "./unit/Unit";
```
with:
```typescript
import { Unit } from "./unit/Unit";
import { InGameState } from "./state/type/InGameState";
```

(This mirrors the identical circular-import pattern already used successfully between `City.ts` and `InGameState.ts` — `InGameState` imports `City`, and `City` imports `InGameState` back, purely for the `getCurrentStateAs<InGameState>()` type parameter, used only inside method bodies at runtime, never at module-evaluation time. `Player.ts` doing the same with `InGameState` is safe for the identical reason.)

- [ ] **Step 4: Add the new fields**

Replace lines 23-24:
```typescript
  private cities: City[];
  private units: Unit[];
```
with:
```typescript
  private cities: City[];
  private units: Unit[];
  private currentResearch: string | undefined;
  private researchProgress: number;
  private researchedTechs: Set<string>;
```

- [ ] **Step 5: Initialize the new fields in the constructor**

Replace lines 36-37:
```typescript
    this.cities = [];
    this.units = [];
```
with:
```typescript
    this.cities = [];
    this.units = [];
    this.currentResearch = undefined;
    this.researchProgress = 0;
    this.researchedTechs = new Set<string>();
```

- [ ] **Step 6: Add the two new constructor listeners**

Replace lines 67-76 (the `resizeWindow` listener block and its closing):
```typescript
    ServerEvents.on({
      eventName: "resizeWindow",
      parentObject: this,
      callback: (data, websocket) => {
        if (this.wsConnection != websocket) return;

        this.resizeWindowCallback.call(undefined);
      },
      globalEvent: true
    });
  }
```
with:
```typescript
    ServerEvents.on({
      eventName: "resizeWindow",
      parentObject: this,
      callback: (data, websocket) => {
        if (this.wsConnection != websocket) return;

        this.resizeWindowCallback.call(undefined);
      },
      globalEvent: true
    });

    ServerEvents.on({
      eventName: "queueResearch",
      parentObject: this,
      callback: (data, websocket) => {
        if (this.wsConnection != websocket) return;

        this.queueResearch(data["techId"]);
        this.sendResearchQueueUpdate();
      },
      globalEvent: true
    });

    ServerEvents.on({
      eventName: "nextTurn",
      parentObject: this,
      callback: () => {
        this.processResearchTurn();
        this.sendResearchQueueUpdate();
      },
      globalEvent: true
    });
  }
```

- [ ] **Step 7: Add the research queue methods**

Insert immediately after the closing brace of `removeUnit()` (the last method in the class, just before the final closing `}` of the `Player` class):

```typescript

  public queueResearch(techId: string) {
    const techData = Game.getInstance().getCurrentStateAs<InGameState>().getTechnologyById(techId);
    if (!techData) {
      return;
    }

    if (this.researchedTechs.has(techId)) {
      return;
    }

    const prereqsMet = (techData.prerequisites as string[]).every((id) => this.researchedTechs.has(id));
    if (!prereqsMet) {
      return;
    }

    this.currentResearch = techId;
  }

  public processResearchTurn() {
    if (!this.currentResearch) {
      return;
    }

    const totalScience = this.cities.reduce(
      (sum, city) => sum + city.getStatline({ asArray: false })["science"],
      0
    );
    this.researchProgress += totalScience;

    const techData = Game.getInstance().getCurrentStateAs<InGameState>().getTechnologyById(this.currentResearch);
    const cost = techData["research_cost"];

    if (this.researchProgress >= cost) {
      const completedId = this.currentResearch;
      this.researchProgress -= cost;
      this.currentResearch = undefined;
      this.researchedTechs.add(completedId);
    }
  }

  public sendResearchQueueUpdate() {
    this.sendNetworkEvent({
      event: "updateResearchQueue",
      currentResearch: this.currentResearch,
      progress: this.researchProgress,
      researchedTechs: Array.from(this.researchedTechs)
    });
  }

  public hasResearchedTech(techId: string): boolean {
    return this.researchedTechs.has(techId);
  }

  public getCurrentResearch(): string | undefined {
    return this.currentResearch;
  }

  public getResearchProgress(): number {
    return this.researchProgress;
  }

  public getResearchedTechs(): string[] {
    return Array.from(this.researchedTechs);
  }
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd server && npx jest tests/unit/Player.test.ts`
Expected: PASS (12 tests — the original 5 plus the 7 new ones)

- [ ] **Step 9: Commit**

```bash
git add server/src/Player.ts server/tests/unit/Player.test.ts
git commit -m "Server: Add single-slot research queue to Player"
```

---

### Task 3: Server `City` — gate `queueBuilding` on research

**Files:**
- Modify: `server/src/city/City.ts:134-154`
- Modify: `server/tests/unit/City.test.ts`

**Interfaces:**
- Consumes: `Player.hasResearchedTech(techId): boolean` (Task 2); `buildingData.unlocked_by` (Task 1, on whatever `getBuildingDataByName()` returns).
- Produces: no new public interface — `queueBuilding()`'s existing signature and behavior for already-covered cases (unknown name, `production_cost <= 0`, already-built) are unchanged; it now also rejects a locked building.

- [ ] **Step 1: Write the failing test**

Replace the `granaryData` fixture near the top of `server/tests/unit/City.test.ts`:
```typescript
  const granaryData = {
    name: 'Granary',
    asset_name: 'BUILDING_PALACE',
    production_cost: 12,
    stats: [{ food: 2 }]
  };
```
with:
```typescript
  const granaryData = {
    name: 'Granary',
    asset_name: 'BUILDING_PALACE',
    production_cost: 12,
    unlocked_by: 'irrigation',
    stats: [{ food: 2 }]
  };
```

Replace the `mockPlayer` construction in `beforeEach`:
```typescript
    mockPlayer = {
      getName: jest.fn().mockReturnValue('TestPlayer'),
      getNextAvailableCityName: jest.fn().mockReturnValue('TestCity'),
      sendNetworkEvent: jest.fn()
    } as unknown as jest.Mocked<Player>;
```
with:
```typescript
    mockPlayer = {
      getName: jest.fn().mockReturnValue('TestPlayer'),
      getNextAvailableCityName: jest.fn().mockReturnValue('TestCity'),
      sendNetworkEvent: jest.fn(),
      hasResearchedTech: jest.fn().mockReturnValue(true)
    } as unknown as jest.Mocked<Player>;
```

(Defaulting `hasResearchedTech` to `true` keeps every existing test — which all queue `Granary` expecting success — passing unchanged. The new test below explicitly overrides it to `false` to exercise the rejection path.)

Add this new test, anywhere inside the `describe('City production queue', ...)` block after the existing `it('queueBuilding rejects a building with production_cost <= 0, ...)` test:

```typescript
  it('queueBuilding rejects a building locked behind unresearched technology', () => {
    (mockPlayer.hasResearchedTech as jest.Mock).mockReturnValue(false);

    city.queueBuilding('Granary');

    expect(city.getCurrentlyBuilding()).toBeUndefined();
    expect(mockPlayer.hasResearchedTech).toHaveBeenCalledWith('irrigation');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest tests/unit/City.test.ts`
Expected: FAIL — the new test fails because `queueBuilding` doesn't check `unlocked_by` yet, so `getCurrentlyBuilding()` returns `'Granary'` instead of `undefined`.

- [ ] **Step 3: Add the gate to `queueBuilding` in `server/src/city/City.ts`**

Replace:
```typescript
  public queueBuilding(buildingName: string) {
    const buildingData = Game.getInstance().getCurrentStateAs<InGameState>().getBuildingDataByName(buildingName);
    if (!buildingData) {
      return;
    }

    // Buildings with no production cost (e.g. Palace) are auto-granted only
    // (see UnitActions.ts) and must never be queued manually.
    if (buildingData.production_cost <= 0) {
      return;
    }

    const alreadyBuilt = this.buildings.some(
      (building) => (building.name as string).toLocaleLowerCase() === (buildingData.name as string).toLocaleLowerCase()
    );
    if (alreadyBuilt) {
      return;
    }

    this.currentlyBuilding = buildingData.name;
  }
```
with:
```typescript
  public queueBuilding(buildingName: string) {
    const buildingData = Game.getInstance().getCurrentStateAs<InGameState>().getBuildingDataByName(buildingName);
    if (!buildingData) {
      return;
    }

    // Buildings with no production cost (e.g. Palace) are auto-granted only
    // (see UnitActions.ts) and must never be queued manually.
    if (buildingData.production_cost <= 0) {
      return;
    }

    if (buildingData.unlocked_by && !this.player.hasResearchedTech(buildingData.unlocked_by)) {
      return;
    }

    const alreadyBuilt = this.buildings.some(
      (building) => (building.name as string).toLocaleLowerCase() === (buildingData.name as string).toLocaleLowerCase()
    );
    if (alreadyBuilt) {
      return;
    }

    this.currentlyBuilding = buildingData.name;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest tests/unit/City.test.ts`
Expected: PASS (8 tests — the original 7 plus the 1 new one)

- [ ] **Step 5: Commit**

```bash
git add server/src/city/City.ts server/tests/unit/City.test.ts
git commit -m "Server: Gate queueBuilding on required research"
```

---

### Task 4: Server `InGameState` — serve the technology catalog

**Files:**
- Modify: `server/src/state/type/InGameState.ts`

**Interfaces:**
- Consumes: `this.technologies` (already loaded in `onInitialize()` since sub-project 2b, unchanged by this task).
- Produces: socket event `availableTechnologies` (server response to a same-named client request), payload `{ event: "availableTechnologies", technologies: Record<string, any>[] }` — the full catalog including `research_cost` and `prerequisites`. Task 6 (client UI) consumes this exact shape.

No new test file — this mirrors the existing, untested `availableBuildings` handler precedent (sub-project 2a, Task 3).

- [ ] **Step 1: Add the new handler in `server/src/state/type/InGameState.ts`**

Replace the `availableBuildings` handler block:
```typescript
    ServerEvents.on({
      eventName: "availableBuildings",
      parentObject: this,
      callback: (_, websocket) => {
        const player = Game.getInstance().getPlayerFromWebsocket(websocket);
        player.sendNetworkEvent({
          event: "availableBuildings",
          buildings: this.cityBuildings
        });
      }
    });
```
with:
```typescript
    ServerEvents.on({
      eventName: "availableBuildings",
      parentObject: this,
      callback: (_, websocket) => {
        const player = Game.getInstance().getPlayerFromWebsocket(websocket);
        player.sendNetworkEvent({
          event: "availableBuildings",
          buildings: this.cityBuildings
        });
      }
    });

    ServerEvents.on({
      eventName: "availableTechnologies",
      parentObject: this,
      callback: (_, websocket) => {
        const player = Game.getInstance().getPlayerFromWebsocket(websocket);
        player.sendNetworkEvent({
          event: "availableTechnologies",
          technologies: this.technologies
        });
      }
    });
```

- [ ] **Step 2: Verify the server still type-checks and the existing suite still passes**

Run: `cd server && npm run test`
Expected: Same pass/fail counts as before this task — no new failures beyond the pre-existing, unrelated `Unit.test.ts` failures.

- [ ] **Step 3: Commit**

```bash
git add server/src/state/type/InGameState.ts
git commit -m "Server: Serve the tech tree catalog via availableTechnologies"
```

---

### Task 5: Client `AbstractPlayer` — mirror the research queue state

**Files:**
- Modify: `client/src/player/AbstractPlayer.ts`

**Interfaces:**
- Consumes: server event `updateResearchQueue` (Task 2), payload `{ currentResearch, progress, researchedTechs: string[] }`.
- Produces: `AbstractPlayer.getCurrentResearch(): string | undefined`, `AbstractPlayer.getResearchProgress(): number`, `AbstractPlayer.getResearchedTechs(): string[]`. Task 6 (UI) calls these.

There is no client unit-test runner. Verification is a TypeScript build check.

- [ ] **Step 1: Add the import and fields to `client/src/player/AbstractPlayer.ts`**

Replace lines 1-13:
```typescript
import { Game } from "../Game";
import { InGameScene } from "../scene/type/InGameScene";
import { Unit } from "../Unit";
import { City } from "../city/City";

export class AbstractPlayer {
  private name: string;
  private provinceData: JSON;

  constructor(playerJSON: JSON) {
    this.provinceData = playerJSON["provinceData"];
    this.name = playerJSON["name"];
  }
```
with:
```typescript
import { Game } from "../Game";
import { NetworkEvents } from "../network/Client";
import { InGameScene } from "../scene/type/InGameScene";
import { Unit } from "../Unit";
import { City } from "../city/City";

export class AbstractPlayer {
  private name: string;
  private provinceData: JSON;
  private currentResearch: string | undefined;
  private researchProgress: number;
  private researchedTechs: string[];

  constructor(playerJSON: JSON) {
    this.provinceData = playerJSON["provinceData"];
    this.name = playerJSON["name"];
    this.currentResearch = undefined;
    this.researchProgress = 0;
    this.researchedTechs = [];

    NetworkEvents.on({
      eventName: "updateResearchQueue",
      parentObject: this,
      callback: (data: any) => {
        this.currentResearch = data["currentResearch"];
        this.researchProgress = data["progress"];
        this.researchedTechs = data["researchedTechs"];
      }
    });
  }
```

- [ ] **Step 2: Add the three getters**

Insert immediately after `getProvinceData()`:
```typescript
  public getProvinceData() {
    return this.provinceData;
  }
```
becomes:
```typescript
  public getProvinceData() {
    return this.provinceData;
  }

  public getCurrentResearch(): string | undefined {
    return this.currentResearch;
  }

  public getResearchProgress(): number {
    return this.researchProgress;
  }

  public getResearchedTechs(): string[] {
    return this.researchedTechs;
  }
```

- [ ] **Step 3: Verify the client type-checks**

Run: `cd client && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/player/AbstractPlayer.ts
git commit -m "Client: Mirror server research queue state on AbstractPlayer"
```

---

### Task 6: Client UI — research panel opened from `StatusBar`

**Files:**
- Create: `client/src/ui/ResearchDisplayInfo.ts`
- Modify: `client/src/ui/StatusBar.ts`

**Interfaces:**
- Consumes: socket events `availableTechnologies` (Task 4, payload `{ technologies: [{id, name, era, prerequisites, research_cost}, ...] }`) and `updateResearchQueue` (Task 2, payload `{ currentResearch, progress, researchedTechs }`); `AbstractPlayer.getCurrentResearch()`/`getResearchProgress()`/`getResearchedTechs()` (Task 5).
- Produces: sends `queueResearch` command, payload `{ event: "queueResearch", techId: string }` (consumed by Task 2's server listener).

There is no client unit-test runner. Verification is a TypeScript build check plus the live browser check in Task 7.

**Known, accepted limitation (same shape as the production queue's UI in sub-project 2a):** the researchable-list is populated once when the panel opens and does not remove a completed technology's row live if the panel stays open through a completion — only the "currently researching" progress label updates live. Re-opening the panel refreshes the list.

- [ ] **Step 1: Create `client/src/ui/ResearchDisplayInfo.ts`**

```typescript
import { GameImage } from "../Assets";
import { Game } from "../Game";
import { AbstractPlayer } from "../player/AbstractPlayer";
import { NetworkEvents, WebsocketClient } from "../network/Client";
import { Actor } from "../scene/Actor";
import { ActorGroup } from "../scene/ActorGroup";
import { Button } from "./Button";
import { Label } from "./Label";
import { ListBox } from "./Listbox";

export class ResearchDisplayInfo extends ActorGroup {
  private player: AbstractPlayer;
  private currentResearchLabel: Label;
  private techCatalog: Record<string, any>[];

  constructor(player: AbstractPlayer, x: number, y: number, width: number, height: number) {
    super({ x: x, y: y, z: 6, width: width, height: height, cameraApplies: false });

    this.player = player;
    this.techCatalog = [];

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

    const listbox = new ListBox({
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      rowHeight: 38,
      textFont: "16px serif",
      fontColor: "white"
    });

    listbox.addCategory("연구");

    const currentResearch = this.player.getCurrentResearch();
    const currentRow = listbox.addRow({
      category: "연구",
      text: currentResearch ? `${currentResearch} (${this.player.getResearchProgress()})` : "연구 중인 기술 없음",
      textX: listbox.getNextRowPosition().x + 8,
      centerTextY: true,
      rowHeight: 30
    });
    this.currentResearchLabel = currentRow.getLabel();

    NetworkEvents.on({
      eventName: "availableTechnologies",
      parentObject: this,
      callback: (data: any) => {
        this.techCatalog = data["technologies"];
        this.renderResearchableList(listbox);
      }
    });

    NetworkEvents.on({
      eventName: "updateResearchQueue",
      parentObject: this,
      callback: (data: any) => {
        const tech = data["currentResearch"];
        this.currentResearchLabel.setText(tech ? `${tech} (${data["progress"]})` : "연구 중인 기술 없음");
      }
    });

    WebsocketClient.sendMessage({ event: "availableTechnologies" });

    this.addActor(listbox);
  }

  private renderResearchableList(listbox: ListBox) {
    const researched = new Set(this.player.getResearchedTechs());

    for (const tech of this.techCatalog) {
      if (researched.has(tech["id"])) continue;

      const prereqsMet = (tech["prerequisites"] as string[]).every((id) => researched.has(id));
      if (!prereqsMet) continue;

      const researchButton = new Button({
        text: "연구",
        x: listbox.getNextRowPosition().x + listbox.getWidth() - 70,
        y: listbox.getNextRowPosition().y + 4,
        width: 60,
        height: 30,
        fontColor: "white",
        onClicked: () => {
          WebsocketClient.sendMessage({ event: "queueResearch", techId: tech["id"] });
        }
      });

      listbox.addRow({
        category: "연구",
        text: `${tech["name"]} (${tech["research_cost"]})`,
        textX: listbox.getNextRowPosition().x + 8,
        centerTextY: true,
        rowHeight: 38,
        actorIcons: [researchButton]
      });
    }
  }

  public onDestroyed(): void {
    super.onDestroyed();
    NetworkEvents.removeCallbacksByParentObject(this);
  }
}
```

- [ ] **Step 2: Wire it up from `client/src/ui/StatusBar.ts`**

Replace lines 1-6 (imports):
```typescript
import { GameImage, SpriteRegion } from "../Assets";
import { Game } from "../Game";
import { NetworkEvents } from "../network/Client";
import { Actor } from "../scene/Actor";
import { ActorGroup } from "../scene/ActorGroup";
import { Label } from "./Label";
```
with:
```typescript
import { GameImage, SpriteRegion } from "../Assets";
import { Game } from "../Game";
import { NetworkEvents } from "../network/Client";
import { InGameScene } from "../scene/type/InGameScene";
import { Actor } from "../scene/Actor";
import { ActorGroup } from "../scene/ActorGroup";
import { Label } from "./Label";
import { ResearchDisplayInfo } from "./ResearchDisplayInfo";
```

Replace line 9 (the class's first field declaration):
```typescript
  private statusBarActor: Actor;
```
with:
```typescript
  private statusBarActor: Actor;
  private researchDisplayInfo: ResearchDisplayInfo;
```

Replace the `scienceDescLabel` construction block:
```typescript
    //Science Information
    this.scienceDescLabel = new Label({
      text: "Science:",
      font: "16px serif",
      fontColor: "white"
    });
    await this.scienceDescLabel.conformSize();
    this.scienceDescLabel.setPosition(this.x + 1, 3);
    this.addActor(this.scienceDescLabel);
```
with:
```typescript
    //Science Information
    this.scienceDescLabel = new Label({
      text: "Science:",
      font: "16px serif",
      fontColor: "white",
      onClick: () => {
        const scene = Game.getInstance().getCurrentSceneAs<InGameScene>();

        if (this.researchDisplayInfo) {
          scene.removeActor(this.researchDisplayInfo);
          this.researchDisplayInfo = undefined;
          return;
        }

        this.researchDisplayInfo = new ResearchDisplayInfo(
          scene.getClientPlayer(),
          Game.getInstance().getWidth() / 2 - 216,
          Game.getInstance().getHeight() / 2 - 220,
          432,
          440
        );
        scene.addActor(this.researchDisplayInfo);
      }
    });
    await this.scienceDescLabel.conformSize();
    this.scienceDescLabel.setPosition(this.x + 1, 3);
    this.addActor(this.scienceDescLabel);
```

- [ ] **Step 3: Verify the client type-checks**

Run: `cd client && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/ui/ResearchDisplayInfo.ts client/src/ui/StatusBar.ts
git commit -m "Client: Add research panel opened from the Science status label"
```

---

### Task 7: Full regression check

**Files:** none (verification only)

**Interfaces:** none — confirms Tasks 1-6 integrate correctly end-to-end.

- [ ] **Step 1: Run the full server test suite**

Run: `cd server && npm run test`
Expected: All suites pass, including the extended `TechTreeConfig.test.ts`, `BuildingsConfig.test.ts`, `Player.test.ts`, and `City.test.ts`, plus every previously-passing suite. The only failures should be the pre-existing, unrelated `Unit.test.ts` failures.

- [ ] **Step 2: Run the client type check**

Run: `cd client && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Live browser check**

Start the stack in the background (`npx ts-node scripts/run_tests.ts` from the repo root), wait ~15 seconds, then use the chrome-devtools MCP tools (`ToolSearch` for `mcp__chrome-devtools__*` first) to:
1. Navigate to `http://localhost:1234?test=true&scenario=CitySettlement` — confirm the existing scenario still passes exactly as before (login, join, pick a province, settle a city).
2. Click the "Science:" label in the status bar (top of screen). Confirm a panel opens showing "연구 중인 기술 없음" and a researchable list containing at least `관개농법 (5)` (the only tech with no prerequisites) — and confirm no other technology appears yet, since none of their prerequisites are met.
3. Click "연구" next to 관개농법. Confirm (via console messages or a follow-up snapshot) the status line updates to reflect progress.
4. Open the settled city's info panel and confirm `Granary` does NOT yet appear in the buildable list (it's locked behind `irrigation`, not yet researched).
5. Advance turns (5-6 should be enough at Palace's default science yield) until 관개농법 completes — confirm the research label reverts to "연구 중인 기술 없음" and a new tech (`sOmeri 문자` or `표준 화폐`, both unlocked by irrigation) now appears in the researchable list.
6. Re-open the city info panel and confirm `Granary` now appears in the buildable list.

When done, kill the background server/client processes (`npx kill-port 2000 1234`) and verify with `lsof -nP -iTCP:2000 -iTCP:1234 -sTCP:LISTEN` that nothing remains. Clean up any stray screenshot files from the repo root.

- [ ] **Step 4: Commit (only if Steps 1-3 required fixes)**

```bash
git add -A
git commit -m "Fix: Resolve regressions found in research and tech gating check"
```
If no fixes were needed, skip this step — there is nothing to commit.
