# 5대이념 트랙 (서브프로젝트 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Passively track five ideal-point counters per player (통합/unity, 지식/knowledge, 발전/development, 질서/order, 개척/pioneering), each incremented by an existing game action, with a read-only display panel — no consumption effect yet (that's sub-project 5).

**Architecture:** A single `Record<string, number>` on `Player` (`idealPoints`) with a generic `awardIdealPoints(ideal, amount)` method that any owning code can call and that broadcasts an update. Five small hooks call it from existing code paths: `UnitActions.settleCity()` (unity), `Player.processResearchTurn()` (knowledge, already in `Player.ts`), `City.processProductionTurn()` (development, via `this.player.awardIdealPoints(...)`), `Player`'s `nextTurn` listener (order, tracking whether the government branch changed since last turn), and `Unit.moveToTile()` via a new `Tile.visited` flag (pioneering). Client-side, `AbstractPlayer` mirrors the record and a new read-only `IdealsDisplayInfo` panel lists the five current values.

**Tech Stack:** TypeScript, Jest + `ts-jest` (server tests where practical — see the note on `Unit.ts`/`UnitActions.ts` below).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-14-five-ideals-track-design.md`
- Five fixed ideal keys: `unity`, `knowledge`, `development`, `order`, `pioneering`. Never negative, never reset (except `order`'s per-turn increment simply doesn't fire on a switch-turn — the accumulated total is untouched).
- Point values are approximate/placeholder (unity +10, knowledge +15, development +10, order +2/turn, pioneering +5) — exact balance is out of scope, to be tuned later.
- No consumption/effect from these points in this plan — pure tracking + read-only display. Sub-project 5 reads them.
- **Testing note on `UnitActions.ts` and `Unit.ts`:** neither has ever had dedicated unit tests in this codebase (`UnitActions.ts` has no test file at all; `server/tests/unit/Unit.test.ts` exists but its 5 tests already fail for a pre-existing, unrelated reason — `mockPlayer.addUnit is not a function` — meaning its test fixture can't even construct a `Unit` today). Do not attempt to add new tests to either file in this plan; that pre-existing breakage is out of scope to fix here. Verify those two hooks (unity, pioneering) via `tsc`/the full test suite (no new failures) and the live browser check in the final task instead.

---

### Task 1: Server `Player` — ideal points core, plus the knowledge and order hooks

**Files:**
- Modify: `server/src/Player.ts`
- Modify: `server/tests/unit/Player.test.ts`

**Interfaces:**
- Produces: `Player.awardIdealPoints(ideal: string, amount: number): void`, `Player.getIdealPoints(): Record<string, number>`, `Player.sendIdealPointsUpdate(): void` (broadcasts `{ event: "updateIdealPoints", idealPoints: Record<string, number> }`). `Player.toJSON()` gains an `idealPoints` key. `processResearchTurn()` now awards `knowledge` (+15) on tech completion. The `nextTurn` listener now awards `order` (+2) when the government branch is selected and unchanged since the previous turn. Task 3 (City) calls `awardIdealPoints('development', 10)`; Task 4 (Unit/Tile) calls `awardIdealPoints('pioneering', 5)`; Task 2 (UnitActions) calls `awardIdealPoints('unity', 10)`. Task 5 (client) consumes the `updateIdealPoints` event shape and the `idealPoints` key in the player JSON.

- [ ] **Step 1: Write the failing test**

First, add a top-level import the file doesn't have yet — replace:
```typescript
import { WebSocket } from 'ws';
import { Player } from '../../src/Player';
import { Game } from '../../src/Game';
```
with:
```typescript
import { WebSocket } from 'ws';
import { Player } from '../../src/Player';
import { Game } from '../../src/Game';
import { ServerEvents } from '../../src/Events';
```

Then add this new `describe` block at the end of `server/tests/unit/Player.test.ts` (after the closing `});` of `describe('Player government branch', ...)`):

```typescript
describe('Player ideal points', () => {
  it('starts every ideal at 0', () => {
    const player = new Player('Player1', fakeWebSocket());
    expect(player.getIdealPoints()).toEqual({
      unity: 0,
      knowledge: 0,
      development: 0,
      order: 0,
      pioneering: 0
    });
  });

  it('awardIdealPoints adds to the named ideal without touching others', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.awardIdealPoints('unity', 10);
    player.awardIdealPoints('unity', 5);

    expect(player.getIdealPoints().unity).toBe(15);
    expect(player.getIdealPoints().knowledge).toBe(0);
  });

  it('toJSON includes the current idealPoints', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.awardIdealPoints('pioneering', 5);

    expect(player.toJSON().idealPoints).toEqual({
      unity: 0,
      knowledge: 0,
      development: 0,
      order: 0,
      pioneering: 5
    });
  });

  it('processResearchTurn awards knowledge points when a technology completes', () => {
    const player = new Player('Player1', fakeWebSocket());
    jest.spyOn(Game, 'getInstance').mockReturnValue({
      getCurrentStateAs: jest.fn().mockReturnValue({
        getTechnologyById: jest.fn().mockReturnValue({ id: 'irrigation', research_cost: 5 })
      })
    } as any);
    player.queueResearch('irrigation');
    (player as any).cities = [{ getStatline: () => ({ science: 5 }) }];

    player.processResearchTurn();

    expect(player.getIdealPoints().knowledge).toBe(15);

    jest.restoreAllMocks();
  });

  it('processResearchTurn does not award knowledge points when nothing completes', () => {
    const player = new Player('Player1', fakeWebSocket());
    jest.spyOn(Game, 'getInstance').mockReturnValue({
      getCurrentStateAs: jest.fn().mockReturnValue({
        getTechnologyById: jest.fn().mockReturnValue({ id: 'irrigation', research_cost: 100 })
      })
    } as any);
    player.queueResearch('irrigation');
    (player as any).cities = [{ getStatline: () => ({ science: 1 }) }];

    player.processResearchTurn();

    expect(player.getIdealPoints().knowledge).toBe(0);

    jest.restoreAllMocks();
  });
});

describe('Player order points from government stability', () => {
  const senateData = { id: 'senate', name: '원로원', stat: 'culture', bonus_percent: 20 };

  beforeEach(() => {
    jest.spyOn(Game, 'getInstance').mockReturnValue({
      getCurrentStateAs: jest.fn().mockReturnValue({
        getGovernmentBranchById: jest.fn().mockReturnValue(senateData)
      })
    } as any);
    jest.spyOn(ServerEvents, 'call');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('awards no order points on the first turn a branch is selected', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.selectGovernmentBranch('senate');

    ServerEvents.call('nextTurn', {});

    expect(player.getIdealPoints().order).toBe(0);
  });

  it('awards order points on a second consecutive turn with the same branch', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.selectGovernmentBranch('senate');

    ServerEvents.call('nextTurn', {});
    ServerEvents.call('nextTurn', {});

    expect(player.getIdealPoints().order).toBe(2);
  });

  it('awards no order points when no branch is selected', () => {
    const player = new Player('Player1', fakeWebSocket());

    ServerEvents.call('nextTurn', {});
    ServerEvents.call('nextTurn', {});

    expect(player.getIdealPoints().order).toBe(0);
  });
});
```

Note: `ServerEvents.call` is not currently mocked away in this file's top-level setup (only `ServerEvents` the module is auto-mocked via `jest.mock('../../src/Events')`, which replaces `call` with an auto-mock `jest.fn()` that does nothing by default) — the new `describe` block above explicitly spies on `ServerEvents.call` with `jest.spyOn(...)` but does NOT provide a custom implementation, which means Jest's auto-mock default (a no-op stub) would apply and the registered `nextTurn` listener would never actually fire. This test needs `ServerEvents.call` to genuinely invoke the registered callbacks. Add this to the test file's setup instead of a bare `jest.spyOn(ServerEvents, 'call')`:

Replace the `beforeEach` in the new `describe('Player order points from government stability', ...)` block shown above with:

```typescript
  const storedCallbacks: Record<string, Function[]> = {};

  beforeEach(() => {
    storedCallbacks['nextTurn'] = [];

    jest.spyOn(Game, 'getInstance').mockReturnValue({
      getCurrentStateAs: jest.fn().mockReturnValue({
        getGovernmentBranchById: jest.fn().mockReturnValue(senateData)
      })
    } as any);

    jest.spyOn(ServerEvents, 'on').mockImplementation((options: any) => {
      if (!storedCallbacks[options.eventName]) {
        storedCallbacks[options.eventName] = [];
      }
      storedCallbacks[options.eventName].push(options.callback);
    });

    jest.spyOn(ServerEvents, 'call').mockImplementation((eventName: string, data: any) => {
      for (const callback of storedCallbacks[eventName] ?? []) {
        callback(data);
      }
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/comodoflow/Desktop/project/civ-so/civ-so/server && npx jest tests/unit/Player.test.ts`
Expected: FAIL — `player.awardIdealPoints is not a function`

- [ ] **Step 3: Add the `idealPoints` field**

Replace:
```typescript
  private selectedGovernmentBranch: string | undefined;
```
with:
```typescript
  private selectedGovernmentBranch: string | undefined;
  private idealPoints: Record<string, number>;
  private lastTurnGovernmentBranch: string | undefined;
```

- [ ] **Step 4: Initialize it in the constructor**

Replace:
```typescript
    this.selectedGovernmentBranch = undefined;
```
with:
```typescript
    this.selectedGovernmentBranch = undefined;
    this.idealPoints = { unity: 0, knowledge: 0, development: 0, order: 0, pioneering: 0 };
    this.lastTurnGovernmentBranch = undefined;
```

- [ ] **Step 5: Add the order-points logic to the `nextTurn` listener**

Replace:
```typescript
    ServerEvents.on({
      eventName: "nextTurn",
      parentObject: this,
      callback: () => {
        this.processResearchTurn();
        this.sendResearchQueueUpdate();
      },
      globalEvent: true
    });
```
with:
```typescript
    ServerEvents.on({
      eventName: "nextTurn",
      parentObject: this,
      callback: () => {
        this.processResearchTurn();
        this.sendResearchQueueUpdate();

        if (this.selectedGovernmentBranch && this.selectedGovernmentBranch === this.lastTurnGovernmentBranch) {
          this.awardIdealPoints("order", 2);
        }
        this.lastTurnGovernmentBranch = this.selectedGovernmentBranch;
      },
      globalEvent: true
    });
```

- [ ] **Step 6: Add the knowledge-points award to `processResearchTurn`**

Replace:
```typescript
    if (this.researchProgress >= cost) {
      const completedId = this.currentResearch;
      this.researchProgress -= cost;
      this.currentResearch = undefined;
      this.researchedTechs.add(completedId);
    }
  }
```
with:
```typescript
    if (this.researchProgress >= cost) {
      const completedId = this.currentResearch;
      this.researchProgress -= cost;
      this.currentResearch = undefined;
      this.researchedTechs.add(completedId);
      this.awardIdealPoints("knowledge", 15);
    }
  }
```

- [ ] **Step 7: Add `idealPoints` to `toJSON`**

Replace:
```typescript
  public toJSON() {
    return {
      name: this.name,
      provinceData: this.provinceData,
      requestedNextTurn: this.requestedNextTurn
    };
  }
```
with:
```typescript
  public toJSON() {
    return {
      name: this.name,
      provinceData: this.provinceData,
      requestedNextTurn: this.requestedNextTurn,
      idealPoints: this.idealPoints
    };
  }
```

- [ ] **Step 8: Add the ideal-points methods**

Insert immediately after `hasResearchedTech()` (or anywhere sensible near the other small methods, before the final closing `}` of the class):

```typescript

  public awardIdealPoints(ideal: string, amount: number) {
    this.idealPoints[ideal] += amount;
    this.sendIdealPointsUpdate();
  }

  public getIdealPoints(): Record<string, number> {
    return this.idealPoints;
  }

  public sendIdealPointsUpdate() {
    this.sendNetworkEvent({
      event: "updateIdealPoints",
      idealPoints: this.idealPoints
    });
  }
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd /Users/comodoflow/Desktop/project/civ-so/civ-so/server && npx jest tests/unit/Player.test.ts`
Expected: PASS (23 tests — the original 15 plus 8 new)

- [ ] **Step 10: Commit**

```bash
git add server/src/Player.ts server/tests/unit/Player.test.ts
git commit -m "Server: Add ideal points tracking to Player, plus knowledge and order hooks"
```

---

### Task 2: Server `UnitActions` — unity points on settling

**Files:**
- Modify: `server/src/unit/UnitActions.ts`

**Interfaces:**
- Consumes: `Player.awardIdealPoints('unity', 10)` (Task 1).
- Produces: no new interface — a founded city now awards the founding player 10 unity points.

No test file exists for `UnitActions.ts` today (see Global Constraints) — verification is the full test suite (no new failures) plus the live browser check in the final task, which exercises this exact code path (the `CitySettlement` scenario settles a city).

- [ ] **Step 1: Add the award call**

Replace:
```typescript
        const city = new City({ player: player, tile: tile });
        tile.setCity(city);
        player.getCities().push(city);
```
with:
```typescript
        const city = new City({ player: player, tile: tile });
        tile.setCity(city);
        player.getCities().push(city);
        player.awardIdealPoints("unity", 10);
```

- [ ] **Step 2: Verify the server still type-checks and the existing suite still passes**

Run: `cd /Users/comodoflow/Desktop/project/civ-so/civ-so/server && npm run test`
Expected: Same pass/fail counts as before this task — no new failures beyond the pre-existing, unrelated `Unit.test.ts` failures.

- [ ] **Step 3: Commit**

```bash
git add server/src/unit/UnitActions.ts
git commit -m "Server: Award unity ideal points when a city is founded"
```

---

### Task 3: Server `City` — development points on building completion

**Files:**
- Modify: `server/src/city/City.ts`
- Modify: `server/tests/unit/City.test.ts`

**Interfaces:**
- Consumes: `Player.awardIdealPoints('development', 10)` (Task 1) — `City` already holds a reference to its owning `player`.
- Produces: no new public interface — a completed building now awards its owning player 10 development points.

- [ ] **Step 1: Write the failing test**

Replace the `mockPlayer` construction in `beforeEach`:
```typescript
    mockPlayer = {
      getName: jest.fn().mockReturnValue('TestPlayer'),
      getNextAvailableCityName: jest.fn().mockReturnValue('TestCity'),
      sendNetworkEvent: jest.fn(),
      hasResearchedTech: jest.fn().mockReturnValue(true),
      getSelectedGovernmentBranch: jest.fn().mockReturnValue(undefined)
    } as unknown as jest.Mocked<Player>;
```
with:
```typescript
    mockPlayer = {
      getName: jest.fn().mockReturnValue('TestPlayer'),
      getNextAvailableCityName: jest.fn().mockReturnValue('TestCity'),
      sendNetworkEvent: jest.fn(),
      hasResearchedTech: jest.fn().mockReturnValue(true),
      getSelectedGovernmentBranch: jest.fn().mockReturnValue(undefined),
      awardIdealPoints: jest.fn()
    } as unknown as jest.Mocked<Player>;
```

Add this new test, anywhere inside the `describe('City production queue', ...)` block after the existing overflow test:

```typescript
  it('awards development ideal points to the owning player when a building completes', () => {
    city.queueBuilding('Granary'); // cost 12
    jest.spyOn(city, 'getStatline').mockReturnValue({ production: 12 } as any);

    city.processProductionTurn();

    expect(mockPlayer.awardIdealPoints).toHaveBeenCalledWith('development', 10);
  });

  it('does not award development ideal points when a building does not complete this turn', () => {
    city.queueBuilding('Granary'); // cost 12
    jest.spyOn(city, 'getStatline').mockReturnValue({ production: 3 } as any);

    city.processProductionTurn();

    expect(mockPlayer.awardIdealPoints).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/comodoflow/Desktop/project/civ-so/civ-so/server && npx jest tests/unit/City.test.ts`
Expected: FAIL — `mockPlayer.awardIdealPoints` was never called.

- [ ] **Step 3: Add the award call to `processProductionTurn`**

Replace:
```typescript
    if (this.productionProgress >= cost) {
      const completedName = this.currentlyBuilding;
      this.productionProgress -= cost;
      this.currentlyBuilding = undefined;
      this.addBuilding(completedName);
    }
  }
```
with:
```typescript
    if (this.productionProgress >= cost) {
      const completedName = this.currentlyBuilding;
      this.productionProgress -= cost;
      this.currentlyBuilding = undefined;
      this.addBuilding(completedName);
      this.player.awardIdealPoints("development", 10);
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/comodoflow/Desktop/project/civ-so/civ-so/server && npx jest tests/unit/City.test.ts`
Expected: PASS (12 tests — the original 10 plus 2 new)

- [ ] **Step 5: Commit**

```bash
git add server/src/city/City.ts server/tests/unit/City.test.ts
git commit -m "Server: Award development ideal points when a building completes"
```

---

### Task 4: Server `Tile` + `Unit` — pioneering points on first visit

**Files:**
- Modify: `server/src/map/Tile.ts`
- Modify: `server/src/unit/Unit.ts`
- Test: `server/tests/unit/Tile.test.ts` (new — covers only the new `Tile` methods, not `Unit.moveToTile`; see Global Constraints for why `Unit.ts`/`UnitActions.ts` get no new tests in this plan)

**Interfaces:**
- Produces: `Tile.isVisited(): boolean`, `Tile.markVisited(): void`. `Unit.moveToTile()` now calls `targetTile.markVisited()` and, if it wasn't already visited, `this.getPlayer().awardIdealPoints('pioneering', 5)`.

- [ ] **Step 1: Write the failing test**

```typescript
// server/tests/unit/Tile.test.ts
import { Tile } from '../../src/map/Tile';

describe('Tile visited tracking', () => {
  it('starts unvisited', () => {
    const tile = new Tile('grass', 0, 0);
    expect(tile.isVisited()).toBe(false);
  });

  it('becomes visited after markVisited', () => {
    const tile = new Tile('grass', 0, 0);
    tile.markVisited();
    expect(tile.isVisited()).toBe(true);
  });

  it('stays visited if markVisited is called again', () => {
    const tile = new Tile('grass', 0, 0);
    tile.markVisited();
    tile.markVisited();
    expect(tile.isVisited()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/comodoflow/Desktop/project/civ-so/civ-so/server && npx jest tests/unit/Tile.test.ts`
Expected: FAIL — `tile.isVisited is not a function`

- [ ] **Step 3: Add the field and methods to `server/src/map/Tile.ts`**

Replace:
```typescript
  private city: City;
```
with:
```typescript
  private city: City;
  private visited: boolean;
```

Find the constructor's initialization lines (near `this.generationHeight = 0;`/`this.generationTemp = 0;`) and add, right after them:
```typescript
    this.visited = false;
```

Add these two methods anywhere sensible in the class (e.g. near `setCity`/other simple accessors):
```typescript

  public isVisited(): boolean {
    return this.visited;
  }

  public markVisited() {
    this.visited = true;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/comodoflow/Desktop/project/civ-so/civ-so/server && npx jest tests/unit/Tile.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Add the pioneering-points hook to `Unit.moveToTile`**

Read the current `server/src/unit/Unit.ts` to find `moveToTile`'s body (it starts by destructuring `options`, then does `this.tile.removeUnit(this); targetTile.addUnit(this); this.tile = targetTile; ...`). Insert this logic right after `this.tile = targetTile;`:
```typescript
    if (!targetTile.isVisited()) {
      targetTile.markVisited();
      this.getPlayer().awardIdealPoints("pioneering", 5);
    }
```

So the edited section reads:
```typescript
    this.tile.removeUnit(this);
    targetTile.addUnit(this);
    this.tile = targetTile;

    if (!targetTile.isVisited()) {
      targetTile.markVisited();
      this.getPlayer().awardIdealPoints("pioneering", 5);
    }

    this.queuedMovementTiles = remainingTiles;
    this.availableMovement = remainingMovement;
```

- [ ] **Step 6: Verify the server still type-checks and the existing suite still passes**

Run: `cd /Users/comodoflow/Desktop/project/civ-so/civ-so/server && npm run test`
Expected: `Tile.test.ts` (new, 3 tests) passes. Same pre-existing `Unit.test.ts` failure count as before (this task does not fix or worsen it — `moveToTile` is called by existing, already-failing test setups, and adding a call to `this.getPlayer().awardIdealPoints(...)` inside it does not change whether those tests were passing or failing, since they fail earlier, at construction time, before `moveToTile` would ever run).

- [ ] **Step 7: Commit**

```bash
git add server/src/map/Tile.ts server/src/unit/Unit.ts server/tests/unit/Tile.test.ts
git commit -m "Server: Award pioneering ideal points on first tile visit"
```

---

### Task 5: Client `AbstractPlayer` — mirror ideal points

**Files:**
- Modify: `client/src/player/AbstractPlayer.ts`

**Interfaces:**
- Consumes: server event `updateIdealPoints` (Task 1), payload `{ idealPoints: Record<string, number> }`.
- Produces: `AbstractPlayer.getIdealPoints(): Record<string, number>`. Task 6 (UI) calls this.

There is no client unit-test runner. Verification is a TypeScript build check.

- [ ] **Step 1: Add the field, initializer, and listener**

Replace:
```typescript
  private selectedGovernmentBranch: string | undefined;

  constructor(playerJSON: JSON) {
    this.provinceData = playerJSON["provinceData"];
    this.name = playerJSON["name"];
    this.currentResearch = undefined;
    this.researchProgress = 0;
    this.researchedTechs = [];
    this.selectedGovernmentBranch = undefined;
```
with:
```typescript
  private selectedGovernmentBranch: string | undefined;
  private idealPoints: Record<string, number>;

  constructor(playerJSON: JSON) {
    this.provinceData = playerJSON["provinceData"];
    this.name = playerJSON["name"];
    this.currentResearch = undefined;
    this.researchProgress = 0;
    this.researchedTechs = [];
    this.selectedGovernmentBranch = undefined;
    this.idealPoints = playerJSON["idealPoints"] ?? { unity: 0, knowledge: 0, development: 0, order: 0, pioneering: 0 };
```

Add this new listener registration alongside the existing `updateGovernmentBranch` one, inside the constructor:
```typescript

    NetworkEvents.on({
      eventName: "updateIdealPoints",
      parentObject: this,
      callback: (data: any) => {
        this.idealPoints = data["idealPoints"];
      }
    });
```

- [ ] **Step 2: Add the getter**

Replace:
```typescript
  public getSelectedGovernmentBranch(): string | undefined {
    return this.selectedGovernmentBranch;
  }
```
with:
```typescript
  public getSelectedGovernmentBranch(): string | undefined {
    return this.selectedGovernmentBranch;
  }

  public getIdealPoints(): Record<string, number> {
    return this.idealPoints;
  }
```

- [ ] **Step 3: Verify the client type-checks**

Run: `cd /Users/comodoflow/Desktop/project/civ-so/civ-so/client && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/player/AbstractPlayer.ts
git commit -m "Client: Mirror server ideal points on AbstractPlayer"
```

---

### Task 6: Client UI — read-only ideals panel

**Files:**
- Create: `client/src/ui/IdealsDisplayInfo.ts`
- Modify: `client/src/ui/StatusBar.ts`

**Interfaces:**
- Consumes: `AbstractPlayer.getIdealPoints()` (Task 5); listens for `updateIdealPoints` directly (no server catalog request needed — unlike buildings/technologies/government branches, there is no separate "ideals catalog," the five keys are fixed and known client-side).
- Produces: nothing new for other tasks — this is the last content task.

There is no client unit-test runner. Verification is a TypeScript build check plus the live browser check in Task 7.

**This panel is read-only** — no buttons, no commands sent to the server, just five labeled values that update live.

- [ ] **Step 1: Create `client/src/ui/IdealsDisplayInfo.ts`**

```typescript
import { GameImage } from "../Assets";
import { Game } from "../Game";
import { AbstractPlayer } from "../player/AbstractPlayer";
import { NetworkEvents } from "../network/Client";
import { Actor } from "../scene/Actor";
import { ActorGroup } from "../scene/ActorGroup";
import { Label } from "./Label";
import { ListBox } from "./Listbox";

const IDEAL_LABELS: Record<string, string> = {
  unity: "통합",
  knowledge: "지식",
  development: "발전",
  order: "질서",
  pioneering: "개척"
};

export class IdealsDisplayInfo extends ActorGroup {
  private player: AbstractPlayer;
  private idealLabels: Map<string, Label>;

  constructor(player: AbstractPlayer, x: number, y: number, width: number, height: number) {
    super({ x: x, y: y, z: 6, width: width, height: height, cameraApplies: false });

    this.player = player;
    this.idealLabels = new Map<string, Label>();

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
      rowHeight: 30,
      textFont: "16px serif",
      fontColor: "white"
    });

    listbox.addCategory("오지(五志)");

    const points = this.player.getIdealPoints();
    for (const ideal of Object.keys(IDEAL_LABELS)) {
      const row = listbox.addRow({
        category: "오지(五志)",
        text: `${IDEAL_LABELS[ideal]}: ${points[ideal] ?? 0}`,
        textX: listbox.getNextRowPosition().x + 8,
        centerTextY: true,
        rowHeight: 30
      });
      this.idealLabels.set(ideal, row.getLabel());
    }

    NetworkEvents.on({
      eventName: "updateIdealPoints",
      parentObject: this,
      callback: (data: any) => {
        const updatedPoints = data["idealPoints"];
        for (const ideal of Object.keys(IDEAL_LABELS)) {
          const label = this.idealLabels.get(ideal);
          if (label) {
            label.setText(`${IDEAL_LABELS[ideal]}: ${updatedPoints[ideal] ?? 0}`);
          }
        }
      }
    });

    this.addActor(listbox);
  }

  public onDestroyed(): void {
    super.onDestroyed();
    NetworkEvents.removeCallbacksByParentObject(this);
  }
}
```

- [ ] **Step 2: Wire it up from `client/src/ui/StatusBar.ts`**

Replace the imports:
```typescript
import { GameImage, SpriteRegion } from "../Assets";
import { Game } from "../Game";
import { NetworkEvents } from "../network/Client";
import { InGameScene } from "../scene/type/InGameScene";
import { Actor } from "../scene/Actor";
import { ActorGroup } from "../scene/ActorGroup";
import { GovernmentDisplayInfo } from "./GovernmentDisplayInfo";
import { Label } from "./Label";
import { ResearchDisplayInfo } from "./ResearchDisplayInfo";
```
with:
```typescript
import { GameImage, SpriteRegion } from "../Assets";
import { Game } from "../Game";
import { NetworkEvents } from "../network/Client";
import { InGameScene } from "../scene/type/InGameScene";
import { Actor } from "../scene/Actor";
import { ActorGroup } from "../scene/ActorGroup";
import { GovernmentDisplayInfo } from "./GovernmentDisplayInfo";
import { IdealsDisplayInfo } from "./IdealsDisplayInfo";
import { Label } from "./Label";
import { ResearchDisplayInfo } from "./ResearchDisplayInfo";
```

Replace the field declaration:
```typescript
  private statusBarActor: Actor;
  private researchDisplayInfo: ResearchDisplayInfo;
  private governmentDisplayInfo: GovernmentDisplayInfo;
```
with:
```typescript
  private statusBarActor: Actor;
  private researchDisplayInfo: ResearchDisplayInfo;
  private governmentDisplayInfo: GovernmentDisplayInfo;
  private idealsDisplayInfo: IdealsDisplayInfo;
  private idealsButtonLabel: Label;
```

Replace the "Trade information" block's tail (the part that adds `tradeLabel`) so a new clickable label follows it, right before the "Current turn information" block:
```typescript
    this.tradeLabel = new Label({
      text: "0/0",
      font: "16px serif",
      fontColor: "white"
    });
    await this.tradeLabel.conformSize();
    this.tradeLabel.setPosition(this.tradeIcon.getX() + this.tradeIcon.getWidth() + 4, 3);
    this.addActor(this.tradeLabel);

    // Current turn information
```
with:
```typescript
    this.tradeLabel = new Label({
      text: "0/0",
      font: "16px serif",
      fontColor: "white"
    });
    await this.tradeLabel.conformSize();
    this.tradeLabel.setPosition(this.tradeIcon.getX() + this.tradeIcon.getWidth() + 4, 3);
    this.addActor(this.tradeLabel);

    // Five ideals information
    this.idealsButtonLabel = new Label({
      text: "오지(五志):",
      font: "16px serif",
      fontColor: "white",
      onClick: () => {
        const scene = Game.getInstance().getCurrentSceneAs<InGameScene>();

        if (this.idealsDisplayInfo) {
          scene.removeActor(this.idealsDisplayInfo);
          this.idealsDisplayInfo = undefined;
          return;
        }

        this.idealsDisplayInfo = new IdealsDisplayInfo(
          scene.getClientPlayer(),
          Game.getInstance().getWidth() / 2 - 216,
          Game.getInstance().getHeight() / 2 - 220,
          432,
          440
        );
        scene.addActor(this.idealsDisplayInfo);
      }
    });
    await this.idealsButtonLabel.conformSize();
    this.idealsButtonLabel.setPosition(this.tradeLabel.getX() + this.tradeLabel.getWidth() + 10, 3);
    this.addActor(this.idealsButtonLabel);

    // Current turn information
```

- [ ] **Step 3: Verify the client type-checks**

Run: `cd /Users/comodoflow/Desktop/project/civ-so/civ-so/client && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/ui/IdealsDisplayInfo.ts client/src/ui/StatusBar.ts
git commit -m "Client: Add read-only five-ideals panel to the status bar"
```

---

### Task 7: Full regression check

**Files:** none (verification only)

**Interfaces:** none — confirms Tasks 1-6 integrate correctly end-to-end.

- [ ] **Step 1: Run the full server test suite**

Run: `cd /Users/comodoflow/Desktop/project/civ-so/civ-so/server && npm run test`
Expected: All suites pass, including the extended `Player.test.ts`/`City.test.ts` and the new `Tile.test.ts`, plus every previously-passing suite. Only the pre-existing, unrelated `Unit.test.ts` failures should appear.

- [ ] **Step 2: Run the client type check**

Run: `cd /Users/comodoflow/Desktop/project/civ-so/civ-so/client && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Live browser check** (budget ~20-25 tool calls; this one matters more than usual since Tasks 2 and 4's hooks — unity and pioneering — have NO unit test coverage at all, per this plan's stated constraint, so this is their only verification)

Start the stack in the background (`npx ts-node scripts/run_tests.ts` from `/Users/comodoflow/Desktop/project/civ-so/civ-so`), wait a fixed ~15s, one `ToolSearch` call for the chrome-devtools tools needed, then:
1. Navigate to `http://localhost:1234?test=true&scenario=CitySettlement`. Confirm via console messages that the scenario still passes (login, join, pick province, settle city) — settling a city is exactly the unity-points code path (Task 2), so a clean pass here is meaningful evidence, not just a generic regression check.
2. Check console messages (or a screenshot) for any new error mentioning `idealPoints`, `awardIdealPoints`, `Tile`, or `moveToTile` — none should appear.
3. Best-effort: click a stat label in the status bar (e.g. the new "오지(五志):" label, coordinate-based via `evaluate_script` if a direct click doesn't register) to see if the ideals panel opens showing five rows with at least "통합: 10" (from the settle action). If this doesn't work within 2-3 attempts, report inconclusive per the same accepted tooling limitation as prior sub-projects — do not keep hunting.
4. Always run cleanup: `npx kill-port 2000 1234`, verify via `lsof -nP -iTCP:2000 -iTCP:1234 -sTCP:LISTEN` that nothing remains, confirm `git status --short` is clean.

- [ ] **Step 4: Commit (only if Steps 1-3 required fixes)**

```bash
git add -A
git commit -m "Fix: Resolve regressions found in five ideals track check"
```
If no fixes were needed, skip this step — there is nothing to commit.
