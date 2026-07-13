# 생산큐 기반 (서브프로젝트 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give cities a working single-slot production queue for buildings — pick one building to construct, accumulate the city's `production` stat toward its cost each turn, complete it automatically — with a minimal UI to drive it, so the mechanic is playable and testable end-to-end in a real browser.

**Architecture:** Extend the existing `City` class (server) with `currentlyBuilding`/`productionProgress` state and two methods (`queueBuilding`, `processProductionTurn`), reusing the existing `addBuilding()` method as the completion step (no new "completion" abstraction needed — `addBuilding` already does exactly that: grant + broadcast + recompute worked tiles). Wire `processProductionTurn` into the server's existing per-instance `nextTurn` event pattern (the same pattern `Unit.ts` already uses). Add one new request/response socket event (`availableBuildings`, mirroring the existing `availableProvinces`/`requestMap` pattern in `InGameState`) and one new command event (`queueBuilding`, mirroring the existing `requestCityStats` per-instance-listener pattern in `City`). Client-side, extend the client's `City` actor to mirror the new state, and fill in the previously-empty "Buildings" category in `CityDisplayInfo.ts`.

**Tech Stack:** TypeScript, Jest + `ts-jest` (server tests only — client has no unit-test runner, verified via `tsc --noEmit` and a live browser check via chrome-devtools MCP).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-13-production-queue-foundation-design.md`
- Buildings only — no unit production in this plan.
- Single "currently building" slot per city — no multi-item queue, no reorder/cancel UI.
- Reuse the existing `BUILDING_PALACE` sprite as a placeholder icon for the new `Granary` building — no new art assets exist. This is a deliberate placeholder (same pattern as the sOmeri province icons in the prior sub-project); real art is a follow-up, not part of this plan.
- If a city's queue is empty when its turn's production is tallied, that turn's production is discarded (not banked) — standard behavior, not a bug.
- No tech-tree gating in this plan — every building in the catalog is buildable from turn one. Gating is a later sub-project.

---

### Task 1: Building catalog gets a production cost, plus a second building to build

**Files:**
- Modify: `server/config/buildings.yml`
- Test: `server/tests/unit/BuildingsConfig.test.ts` (new)

**Interfaces:**
- Produces: every entry in `server/config/buildings.yml` gains a `production_cost: number` field. A new `Granary` entry is added (`production_cost: 10`, `asset_name: BUILDING_PALACE`, `stats: [{ food: 2 }]`) so there is something to actually queue — today `Palace` (auto-granted on founding, `production_cost: 0`) is the only building and can't be manually queued. Task 2 reads `production_cost` off whatever `getBuildingDataByName()` returns; Task 5 (client) treats any building with `production_cost > 0` as "manually buildable" and filters out `Palace`.

- [ ] **Step 1: Write the failing test**

```typescript
// server/tests/unit/BuildingsConfig.test.ts
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

describe('buildings.yml', () => {
  let buildings: Record<string, any>[];

  beforeAll(() => {
    const filePath = path.join(__dirname, '../../config/buildings.yml');
    const parsed = YAML.parse(fs.readFileSync(filePath, 'utf-8'));
    buildings = parsed.buildings;
  });

  it('gives every building a numeric production_cost', () => {
    for (const building of buildings) {
      expect(typeof building.production_cost).toBe('number');
      expect(building.production_cost).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps Palace at production_cost 0 (auto-granted, not manually queueable)', () => {
    const palace = buildings.find((b) => b.name === 'Palace');
    expect(palace).toBeDefined();
    expect(palace!.production_cost).toBe(0);
  });

  it('defines a Granary that can actually be queued', () => {
    const granary = buildings.find((b) => b.name === 'Granary');
    expect(granary).toBeDefined();
    expect(granary!.production_cost).toBeGreaterThan(0);
    expect(Array.isArray(granary!.stats)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest tests/unit/BuildingsConfig.test.ts`
Expected: FAIL — `Cannot read properties of undefined` (`palace.production_cost` / `granary` is `undefined`)

- [ ] **Step 3: Update `server/config/buildings.yml`**

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
    stats:
      - food: 2
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest tests/unit/BuildingsConfig.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add server/config/buildings.yml server/tests/unit/BuildingsConfig.test.ts
git commit -m "Config: Add production_cost to buildings, add Granary"
```

---

### Task 2: Server `City` — production queue logic

**Files:**
- Modify: `server/src/city/City.ts`
- Test: `server/tests/unit/City.test.ts` (new)

**Interfaces:**
- Consumes: `server/config/buildings.yml`'s `production_cost` field (Task 1), via the existing `Game.getInstance().getCurrentStateAs<InGameState>().getBuildingDataByName(name)` call already used by `addBuilding()`.
- Produces: `City.queueBuilding(buildingName: string): void`, `City.processProductionTurn(): void`, `City.getCurrentlyBuilding(): string | undefined`, `City.getProductionProgress(): number`. Task 2 also registers two new per-instance `ServerEvents.on` listeners in the constructor (`nextTurn`, `queueBuilding`) and a `sendProductionQueueUpdate()` method that broadcasts `{ event: "updateProductionQueue", cityName, currentlyBuilding, progress }` to the owning player — Task 4 (client `City.ts`) and Task 5 (client UI) consume that exact event/payload shape.

- [ ] **Step 1: Write the failing test**

```typescript
// server/tests/unit/City.test.ts
import { City } from '../../src/city/City';
import { GameMap } from '../../src/map/GameMap';
import { Tile } from '../../src/map/Tile';
import { Player } from '../../src/Player';
import { ServerEvents } from '../../src/Events';
import { Game } from '../../src/Game';

jest.mock('../../src/map/GameMap');
jest.mock('../../src/Player');
jest.mock('../../src/Events');
jest.mock('../../src/Game');

describe('City production queue', () => {
  let city: City;
  let mockTile: jest.Mocked<Tile>;
  let mockWorkedTile: jest.Mocked<Tile>;
  let mockPlayer: jest.Mocked<Player>;
  let getBuildingDataByName: jest.Mock;

  const granaryData = {
    name: 'Granary',
    asset_name: 'BUILDING_PALACE',
    production_cost: 12,
    stats: [{ food: 2 }]
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockTile = {
      getX: jest.fn().mockReturnValue(0),
      getY: jest.fn().mockReturnValue(0),
      getAdjacentTiles: jest.fn().mockReturnValue([]),
      getStats: jest.fn().mockReturnValue([])
    } as unknown as jest.Mocked<Tile>;

    mockWorkedTile = {
      getX: jest.fn().mockReturnValue(1),
      getY: jest.fn().mockReturnValue(0),
      getStats: jest.fn().mockReturnValue([])
    } as unknown as jest.Mocked<Tile>;

    mockPlayer = {
      getName: jest.fn().mockReturnValue('TestPlayer'),
      getNextAvailableCityName: jest.fn().mockReturnValue('TestCity'),
      sendNetworkEvent: jest.fn()
    } as unknown as jest.Mocked<Player>;

    jest.spyOn(GameMap, 'getInstance').mockReturnValue({
      getTileWithHighestYeild: jest.fn().mockReturnValue(mockWorkedTile)
    } as any);

    getBuildingDataByName = jest.fn().mockImplementation((name: string) => {
      if (name.toLowerCase() === 'granary') return granaryData;
      return undefined;
    });

    jest.spyOn(Game, 'getInstance').mockReturnValue({
      getCurrentStateAs: jest.fn().mockReturnValue({ getBuildingDataByName })
    } as any);

    jest.spyOn(ServerEvents, 'on').mockImplementation(() => {});

    city = new City({ tile: mockTile, player: mockPlayer });
  });

  it('queueBuilding sets currentlyBuilding for a valid, not-yet-built building', () => {
    city.queueBuilding('Granary');
    expect(city.getCurrentlyBuilding()).toBe('Granary');
  });

  it('queueBuilding ignores an unknown building name', () => {
    city.queueBuilding('Nonexistent');
    expect(city.getCurrentlyBuilding()).toBeUndefined();
  });

  it('queueBuilding ignores a building that is already built', () => {
    city.addBuilding('Granary');
    city.queueBuilding('Granary');
    expect(city.getCurrentlyBuilding()).toBeUndefined();
  });

  it('processProductionTurn accumulates progress without completing below cost', () => {
    city.queueBuilding('Granary');
    jest.spyOn(city, 'getStatline').mockReturnValue({ production: 5 } as any);

    city.processProductionTurn();

    expect(city.getProductionProgress()).toBe(5);
    expect(city.getCurrentlyBuilding()).toBe('Granary');
    expect(city.getBuildings().length).toBe(0);
  });

  it('processProductionTurn completes the building once cost is reached, carrying overflow', () => {
    city.queueBuilding('Granary'); // cost 12
    jest.spyOn(city, 'getStatline').mockReturnValue({ production: 8 } as any);

    city.processProductionTurn(); // progress 8, below cost
    city.processProductionTurn(); // progress 16 >= 12 -> completes, overflow 4

    expect(city.getBuildings().length).toBe(1);
    expect(city.getBuildings()[0].name).toBe('Granary');
    expect(city.getCurrentlyBuilding()).toBeUndefined();
    expect(city.getProductionProgress()).toBe(4);
  });

  it('processProductionTurn does nothing when nothing is queued', () => {
    jest.spyOn(city, 'getStatline').mockReturnValue({ production: 10 } as any);

    city.processProductionTurn();

    expect(city.getProductionProgress()).toBe(0);
    expect(city.getBuildings().length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest tests/unit/City.test.ts`
Expected: FAIL — `city.queueBuilding is not a function`

- [ ] **Step 3: Add the new fields and constructor wiring to `server/src/city/City.ts`**

Replace lines 13-21:
```typescript
export class City {
  private tile: Tile;
  private player: Player;
  private name: string;
  private buildings: Record<string, any>[];
  private population: number;
  private foodSurplus: number;
  private territory: Tile[];
  private workedTiles: Tile[];
```
with:
```typescript
export class City {
  private tile: Tile;
  private player: Player;
  private name: string;
  private buildings: Record<string, any>[];
  private population: number;
  private foodSurplus: number;
  private territory: Tile[];
  private workedTiles: Tile[];
  private currentlyBuilding: string | undefined;
  private productionProgress: number;
```

Replace lines 29-36:
```typescript
  constructor(options: CityOptions) {
    this.tile = options.tile;
    this.player = options.player;
    this.name = this.player.getNextAvailableCityName();
    this.buildings = [];
    this.population = 1;
    this.foodSurplus = 0;

```
with:
```typescript
  constructor(options: CityOptions) {
    this.tile = options.tile;
    this.player = options.player;
    this.name = this.player.getNextAvailableCityName();
    this.buildings = [];
    this.population = 1;
    this.foodSurplus = 0;
    this.currentlyBuilding = undefined;
    this.productionProgress = 0;

```

Replace lines 47-58 (the constructor's `requestCityStats` listener block and its closing brace):
```typescript
    ServerEvents.on({
      eventName: "requestCityStats",
      parentObject: this,
      callback: (data, websocket) => {
        const player = Game.getInstance().getPlayerFromWebsocket(websocket);
        if (this.name != data["cityName"] || this.player != player) {
          return;
        }

        this.sendStatUpdate(player);
      }
    });
  }
```
with:
```typescript
    ServerEvents.on({
      eventName: "requestCityStats",
      parentObject: this,
      callback: (data, websocket) => {
        const player = Game.getInstance().getPlayerFromWebsocket(websocket);
        if (this.name != data["cityName"] || this.player != player) {
          return;
        }

        this.sendStatUpdate(player);
      }
    });

    ServerEvents.on({
      eventName: "queueBuilding",
      parentObject: this,
      callback: (data, websocket) => {
        const player = Game.getInstance().getPlayerFromWebsocket(websocket);
        if (this.name != data["cityName"] || this.player != player) {
          return;
        }

        this.queueBuilding(data["buildingName"]);
        this.sendProductionQueueUpdate();
      }
    });

    ServerEvents.on({
      eventName: "nextTurn",
      parentObject: this,
      callback: () => {
        this.processProductionTurn();
        this.sendProductionQueueUpdate();
      }
    });
  }
```

- [ ] **Step 4: Add the production queue methods to `server/src/city/City.ts`**

Insert immediately after the closing brace of `addBuilding()` (the method ending `this.updateWorkedTiles({ sendStatUpdate: true });\n  }` at what is currently line 105):

```typescript

  public queueBuilding(buildingName: string) {
    const buildingData = Game.getInstance().getCurrentStateAs<InGameState>().getBuildingDataByName(buildingName);
    if (!buildingData) {
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

  public processProductionTurn() {
    if (!this.currentlyBuilding) {
      return;
    }

    const production = this.getStatline({ asArray: false })["production"];
    this.productionProgress += production;

    const buildingData = Game.getInstance().getCurrentStateAs<InGameState>().getBuildingDataByName(this.currentlyBuilding);
    const cost = buildingData["production_cost"];

    if (this.productionProgress >= cost) {
      const completedName = this.currentlyBuilding;
      this.productionProgress -= cost;
      this.currentlyBuilding = undefined;
      this.addBuilding(completedName);
    }
  }

  public sendProductionQueueUpdate() {
    this.player.sendNetworkEvent({
      event: "updateProductionQueue",
      cityName: this.name,
      currentlyBuilding: this.currentlyBuilding,
      progress: this.productionProgress
    });
  }

  public getCurrentlyBuilding(): string | undefined {
    return this.currentlyBuilding;
  }

  public getProductionProgress(): number {
    return this.productionProgress;
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npx jest tests/unit/City.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add server/src/city/City.ts server/tests/unit/City.test.ts
git commit -m "Server: Add single-slot production queue to City"
```

---

### Task 3: Server `InGameState` — serve the building catalog on request

**Files:**
- Modify: `server/src/state/type/InGameState.ts:66-73`

**Interfaces:**
- Consumes: `this.cityBuildings` (already loaded in `onInitialize()` from `buildings.yml`, unchanged by this task).
- Produces: socket event `availableBuildings` (server response to a client request of the same name), payload `{ event: "availableBuildings", buildings: Record<string, any>[] }` — the full catalog including `production_cost`. Task 5 (client) consumes this exact shape.

There is no existing test file for `InGameState.ts` (it's tightly coupled to `node-schedule` timers and the `Game` singleton) and the two existing handlers this task's addition mirrors (`requestMap`, `requestTileYields`) are likewise untested — follow that precedent. Verification for this task is `tsc` plus the full regression check in Task 6.

- [ ] **Step 1: Add the new handler in `server/src/state/type/InGameState.ts`**

Replace lines 66-73:
```typescript
    ServerEvents.on({
      eventName: "requestTileYields",
      parentObject: this,
      callback: (data, websocket) => {
        const player = Game.getInstance().getPlayerFromWebsocket(websocket);
        GameMap.getInstance().sendTileYieldsToPlayer(player);
      }
    });
```
with:
```typescript
    ServerEvents.on({
      eventName: "requestTileYields",
      parentObject: this,
      callback: (data, websocket) => {
        const player = Game.getInstance().getPlayerFromWebsocket(websocket);
        GameMap.getInstance().sendTileYieldsToPlayer(player);
      }
    });

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

- [ ] **Step 2: Verify the server still type-checks and the existing suite still passes**

Run: `cd server && npm run test`
Expected: Same pass/fail counts as before this task (this change adds no new test file) — no new failures beyond the pre-existing, unrelated `Unit.test.ts` failures.

- [ ] **Step 3: Commit**

```bash
git add server/src/state/type/InGameState.ts
git commit -m "Server: Serve the building catalog via availableBuildings"
```

---

### Task 4: Client `City` — mirror the production queue state

**Files:**
- Modify: `client/src/city/City.ts`

**Interfaces:**
- Consumes: server event `updateProductionQueue` (Task 2), payload `{ cityName, currentlyBuilding, progress }`.
- Produces: `City.getCurrentlyBuilding(): string | undefined`, `City.getProductionProgress(): number`. Task 5 (UI) calls these.

There is no client unit-test runner. Verification is a TypeScript build check.

- [ ] **Step 1: Add fields to `client/src/city/City.ts`**

Replace lines 24-37 (the class field declarations):
```typescript
export class City extends ActorGroup {
  private player: AbstractPlayer;
  private tile: Tile;
  private territory: Tile[];
  private territoryOverlays: Actor[];
  private workedTiles: Tile[];
  private name: string;
  private civIcon: Actor;
  private nameLabel: Label;
  private innerBorderColor: string;
  private outsideBorderColor: string;
  private buildings: Buidling[];
  private stats: Map<string, number>;
  private statsPresent: boolean;
```
with:
```typescript
export class City extends ActorGroup {
  private player: AbstractPlayer;
  private tile: Tile;
  private territory: Tile[];
  private territoryOverlays: Actor[];
  private workedTiles: Tile[];
  private name: string;
  private civIcon: Actor;
  private nameLabel: Label;
  private innerBorderColor: string;
  private outsideBorderColor: string;
  private buildings: Buidling[];
  private stats: Map<string, number>;
  private statsPresent: boolean;
  private currentlyBuilding: string | undefined;
  private productionProgress: number;
```

Replace lines 46-49 (in the constructor):
```typescript
    this.name = options.name;
    this.buildings = [];
    this.stats = new Map<string, number>();
    this.statsPresent = false;
```
with:
```typescript
    this.name = options.name;
    this.buildings = [];
    this.stats = new Map<string, number>();
    this.statsPresent = false;
    this.currentlyBuilding = undefined;
    this.productionProgress = 0;
```

Replace lines 127-150 (the `updateCityStats` handler block and its closing, keeping it intact but adding a new handler right after it):
```typescript
    NetworkEvents.on({
      eventName: "updateCityStats",
      parentObject: this,
      callback: (data: any) => {
        const stats = data["cityStats"];
        for (const stat of stats) {
          const statType = Object.keys(stat)[0]; // Get the stat type, e.g., "science", "gold", etc.
          const statValue = stat[statType]; // Get the stat value
          this.stats.set(statType, statValue);
        }

        const workedTilesData = data["workedTiles"];
        if (workedTilesData) {
          const newWorkedTiles: Tile[] = [];
          for (const tileData of workedTilesData) {
            newWorkedTiles.push(GameMap.getInstance().getTiles()[tileData.x][tileData.y]);
          }
          this.workedTiles = newWorkedTiles;
          console.log(`[City ${this.name}] Updated worked tiles: ${this.workedTiles.length}`);
        }

        this.statsPresent = true;
      }
    });
```
with:
```typescript
    NetworkEvents.on({
      eventName: "updateCityStats",
      parentObject: this,
      callback: (data: any) => {
        const stats = data["cityStats"];
        for (const stat of stats) {
          const statType = Object.keys(stat)[0]; // Get the stat type, e.g., "science", "gold", etc.
          const statValue = stat[statType]; // Get the stat value
          this.stats.set(statType, statValue);
        }

        const workedTilesData = data["workedTiles"];
        if (workedTilesData) {
          const newWorkedTiles: Tile[] = [];
          for (const tileData of workedTilesData) {
            newWorkedTiles.push(GameMap.getInstance().getTiles()[tileData.x][tileData.y]);
          }
          this.workedTiles = newWorkedTiles;
          console.log(`[City ${this.name}] Updated worked tiles: ${this.workedTiles.length}`);
        }

        this.statsPresent = true;
      }
    });

    NetworkEvents.on({
      eventName: "updateProductionQueue",
      parentObject: this,
      callback: (data: any) => {
        if (data["cityName"] !== this.name) return;

        this.currentlyBuilding = data["currentlyBuilding"];
        this.productionProgress = data["progress"];
      }
    });
```

Add these two getters immediately after the existing `getWorkedTiles()` method (the last method in the class, just before the final closing `}`):
```typescript

  public getCurrentlyBuilding(): string | undefined {
    return this.currentlyBuilding;
  }

  public getProductionProgress(): number {
    return this.productionProgress;
  }
```

- [ ] **Step 2: Verify the client type-checks**

Run: `cd client && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/city/City.ts
git commit -m "Client: Mirror server production queue state on City"
```

---

### Task 5: Client `CityDisplayInfo` — build UI

**Files:**
- Modify: `client/src/ui/CityDisplayInfo.ts`

**Interfaces:**
- Consumes: socket events `availableBuildings` (Task 3, payload `{ buildings: [{name, production_cost, asset_name, stats}, ...] }`) and `updateProductionQueue` (Task 2, payload `{ cityName, currentlyBuilding, progress }`); `City.getCurrentlyBuilding()`/`City.getProductionProgress()`/`City.getBuildings()` (Task 4 and pre-existing).
- Produces: sends `queueBuilding` command, payload `{ event: "queueBuilding", cityName: string, buildingName: string }` (consumed by Task 2's server listener).

There is no client unit-test runner. Verification is a TypeScript build check plus the live browser check in Task 6.

**Known, accepted limitation:** the "buildable" list is populated once when the city panel opens and does not remove a row live if that building completes while the panel stays open (the existing `ListBox` has no per-category partial-clear API — clearing would also wipe the unrelated "Citizen Management" rows above it). Re-opening the panel refreshes the list. This is out of scope to fix here; the currently-building progress label *does* update live, since that's a single label whose text is set in place, not a list rebuild.

- [ ] **Step 1: Add imports and a new field to `client/src/ui/CityDisplayInfo.ts`**

Replace lines 1-9:
```typescript
import { GameImage, SpriteRegion } from "../Assets";
import { Game } from "../Game";
import { City } from "../city/City";
import { Actor } from "../scene/Actor";
import { ActorGroup } from "../scene/ActorGroup";
import { Strings } from "../util/Strings";
import { Label } from "./Label";
import { ListBox } from "./Listbox";
import { RadioButton } from "./RadioButton";

export class CityDisplayInfo extends ActorGroup {
  private city: City;

  private citizenMgmtRadioButtons: RadioButton[];
  private statLabels: Map<string, Label>;
```
with:
```typescript
import { GameImage, SpriteRegion } from "../Assets";
import { Game } from "../Game";
import { City } from "../city/City";
import { NetworkEvents, WebsocketClient } from "../network/Client";
import { Actor } from "../scene/Actor";
import { ActorGroup } from "../scene/ActorGroup";
import { Strings } from "../util/Strings";
import { Button } from "./Button";
import { Label } from "./Label";
import { ListBox } from "./Listbox";
import { RadioButton } from "./RadioButton";

export class CityDisplayInfo extends ActorGroup {
  private city: City;

  private citizenMgmtRadioButtons: RadioButton[];
  private statLabels: Map<string, Label>;
  private currentlyBuildingLabel: Label;
  private buildingCatalog: Record<string, any>[];
```

Replace lines 27-32 (in the constructor, before `this.initializeStatsWindow()`):
```typescript
    this.city = city;
    this.citizenMgmtRadioButtons = [];
    this.statLabels = new Map<string, Label>();

    this.initializeStatsWindow();
    this.initializeBuildingsWindow();
```
with:
```typescript
    this.city = city;
    this.citizenMgmtRadioButtons = [];
    this.statLabels = new Map<string, Label>();
    this.buildingCatalog = [];

    this.initializeStatsWindow();
    this.initializeBuildingsWindow();
```

- [ ] **Step 2: Replace the empty "Buildings" category with the real UI**

Replace lines 108-116 (the end of `initializeBuildingsWindow()`):
```typescript
    // If progress towards great people, add category & relevant rows:

    // Add wonders category if any wonders are built in city:

    // Add buildings category for existing city buildings:
    listbox.addCategory("Buildings");

    this.addActor(listbox);
  }
```
with:
```typescript
    // If progress towards great people, add category & relevant rows:

    // Add wonders category if any wonders are built in city:

    // Add buildings category for existing city buildings:
    listbox.addCategory("Buildings");

    const currentlyBuilding = this.city.getCurrentlyBuilding();
    const currentBuildingRow = listbox.addRow({
      category: "Buildings",
      text: currentlyBuilding ? `${currentlyBuilding} (${this.city.getProductionProgress()})` : "건설 중인 건물 없음",
      textX: listbox.getNextRowPosition().x + 8,
      centerTextY: true,
      rowHeight: 30
    });
    this.currentlyBuildingLabel = currentBuildingRow.getLabel();

    NetworkEvents.on({
      eventName: "availableBuildings",
      parentObject: this,
      callback: (data: any) => {
        this.buildingCatalog = data["buildings"];
        this.renderBuildableList(listbox);
      }
    });

    NetworkEvents.on({
      eventName: "updateProductionQueue",
      parentObject: this,
      callback: (data: any) => {
        if (data["cityName"] !== this.city.getName()) return;

        const building = data["currentlyBuilding"];
        this.currentlyBuildingLabel.setText(building ? `${building} (${data["progress"]})` : "건설 중인 건물 없음");
      }
    });

    WebsocketClient.sendMessage({ event: "availableBuildings" });

    this.addActor(listbox);
  }

  private renderBuildableList(listbox: ListBox) {
    const builtNames = this.city.getBuildings().map((building) => building.getName().toLocaleLowerCase());

    for (const building of this.buildingCatalog) {
      if (building["production_cost"] <= 0) continue; // e.g. Palace: auto-granted, not manually buildable
      if (builtNames.includes((building["name"] as string).toLocaleLowerCase())) continue;

      const buildButton = new Button({
        text: "건설",
        x: listbox.getNextRowPosition().x + listbox.getWidth() - 70,
        y: listbox.getNextRowPosition().y + 4,
        width: 60,
        height: 30,
        fontColor: "white",
        onClicked: () => {
          WebsocketClient.sendMessage({
            event: "queueBuilding",
            cityName: this.city.getName(),
            buildingName: building["name"]
          });
        }
      });

      listbox.addRow({
        category: "Buildings",
        text: `${building["name"]} (${building["production_cost"]})`,
        textX: listbox.getNextRowPosition().x + 8,
        centerTextY: true,
        rowHeight: 38,
        actorIcons: [buildButton]
      });
    }
  }
```

- [ ] **Step 3: Add cleanup so these new listeners don't leak past this panel's lifetime**

Add this method at the end of the class, right before the final closing `}`:
```typescript

  public onDestroyed(): void {
    super.onDestroyed();
    NetworkEvents.removeCallbacksByParentObject(this);
  }
```

- [ ] **Step 4: Verify the client type-checks**

Run: `cd client && npx tsc --noEmit`
Expected: No errors. `ListBox.getWidth()` is already available — it's inherited from `Actor.getWidth()` (`client/src/scene/Actor.ts:338`), so no new method is needed anywhere.

- [ ] **Step 5: Commit**

```bash
git add client/src/ui/CityDisplayInfo.ts
git commit -m "Client: Build the city production queue UI"
```

---

### Task 6: Full regression check

**Files:** none (verification only)

**Interfaces:** none — confirms Tasks 1-5 integrate correctly end-to-end.

- [ ] **Step 1: Run the full server test suite**

Run: `cd server && npm run test`
Expected: All suites pass, including `BuildingsConfig.test.ts` and `City.test.ts` (new), plus every previously-passing suite (`ProvincesConfig.test.ts`, `Player.test.ts`, `LobbyState.test.ts`, `GameMap.test.ts`). The only failures should be the pre-existing, unrelated `Unit.test.ts` failures (`mockPlayer.addUnit is not a function`) that predate this plan.

- [ ] **Step 2: Run the client type check**

Run: `cd client && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Live browser check**

Start the stack in the background (`npx ts-node scripts/run_tests.ts` from the repo root, or `npm run start:test` in `server/` plus `npm run dev` in `client/` separately), wait ~10-15 seconds for both to boot, then use the chrome-devtools MCP tools (`ToolSearch` for `mcp__chrome-devtools__*` first, since they're deferred) to:
1. Navigate to `http://localhost:1234?test=true&scenario=CitySettlement` — confirm the existing scenario still passes (login, join, pick a province, settle a city) exactly as it did before this plan.
2. Once in-game with a settled city, open the city's info panel and confirm the "Buildings" category shows "건설 중인 건물 없음" and a "Granary (10)" row with a "건설" button.
3. Click "건설". Confirm (via console messages or a follow-up snapshot) that a `queueBuilding` message was sent and an `updateProductionQueue` response updates the label to `Granary (0)` or similar.
4. Advance turns (however the scenario/UI exposes a "next turn" action) until enough production has accumulated (Palace already grants +3 production/turn, so 4 turns should be enough at cost 10), and confirm the Granary eventually completes — the label reverts to "건설 중인 건물 없음" and an `addBuilding` event fires for Granary.

When done, kill the background server/client processes (`npx kill-port 2000` and `npx kill-port 1234`) so nothing is left running.

- [ ] **Step 4: Commit (only if Steps 1-3 required fixes)**

```bash
git add -A
git commit -m "Fix: Resolve regressions found in full production queue check"
```
If no fixes were needed, skip this step — there is nothing to commit.
