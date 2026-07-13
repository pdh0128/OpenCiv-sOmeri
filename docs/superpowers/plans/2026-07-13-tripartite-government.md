# 삼원체제 정부 (서브프로젝트 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each player pick one of three government branches (원로원/국민의회/기술위원회), instantly switchable, each granting a flat percent bonus to one city stat (culture/production/science respectively) across all their cities — with a minimal UI to pick it.

**Architecture:** A new config catalog (`server/config/government_branches.yml`) loaded by `InGameState` exactly like `buildings.yml`/`technologies.yml`. `Player` gets a single `selectedGovernmentBranch` field (no queue, no progress — an instant switch, unlike the production/research queues) with a `globalEvent: true` constructor listener (same reason as the research queue: `Player` is born in `LobbyState`, before `ServerEvents.clear()` runs on the Lobby→InGame transition). `City.getStatline()` reads its owning player's selected branch and multiplies the matching stat by `1 + bonus_percent/100`, in both of its existing return branches. Client-side, `AbstractPlayer` mirrors the selection and a new `GovernmentDisplayInfo` panel (opened from the "Culture:" status-bar label) lists the three branches with a select button each — `RadioButton` was considered but rejected because it has no selection-callback hook (it's a self-contained visual toggle only, confirmed by reading `client/src/ui/RadioButton.ts` — it would need extending for this to actually notify anything, which is out of scope for an unrelated file); a plain `Button` per row (the same pattern used for the production/research queues) is simpler and already proven.

**Tech Stack:** TypeScript, Jest + `ts-jest` (server tests only — client verified via `tsc --noEmit` and a live browser check).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-13-tripartite-government-design.md`
- Exactly 3 government branches, ids `senate`/`assembly`/`tech_committee`, each with a distinct `stat` (`culture`/`production`/`science` respectively) and `bonus_percent: 20`.
- Single selection, switchable anytime, no anarchy penalty, no tech-gating — all three are available from turn one.
- **Same critical wiring detail as sub-project 2c:** `Player`'s new `selectGovernmentBranch` constructor listener MUST set `globalEvent: true`, or it will silently never fire once the game leaves the lobby (`ServerEvents.clear()` on every state transition strips non-global listeners; `Player` instances exist before the Lobby→InGame transition, `City` instances do not — do not copy `City`'s non-global listener pattern here).
- No new abstraction beyond what's needed — the bonus is a flat multiplier applied inside `City.getStatline()`, not a new stats pipeline.

---

### Task 1: Government branch config

**Files:**
- Create: `server/config/government_branches.yml`
- Test: `server/tests/unit/GovernmentBranchesConfig.test.ts`

**Interfaces:**
- Produces: `government_branches.yml` with top-level key `government_branches`, an array of 3 objects `{ id: string, name: string, stat: string, bonus_percent: number }`. Task 4 (`InGameState`) reads this file at `./config/government_branches.yml`.

- [ ] **Step 1: Write the failing test**

```typescript
// server/tests/unit/GovernmentBranchesConfig.test.ts
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

describe('government_branches.yml', () => {
  let branches: Record<string, any>[];

  beforeAll(() => {
    const filePath = path.join(__dirname, '../../config/government_branches.yml');
    branches = YAML.parse(fs.readFileSync(filePath, 'utf-8')).government_branches;
  });

  it('defines exactly 3 government branches', () => {
    expect(branches.length).toBe(3);
  });

  it('gives every branch a unique id and a positive bonus_percent', () => {
    const ids = branches.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const branch of branches) {
      expect(typeof branch.name).toBe('string');
      expect(typeof branch.stat).toBe('string');
      expect(branch.bonus_percent).toBeGreaterThan(0);
    }
  });

  it('covers three distinct stats: culture, production, science', () => {
    const stats = new Set(branches.map((b) => b.stat));
    expect(stats).toEqual(new Set(['culture', 'production', 'science']));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest tests/unit/GovernmentBranchesConfig.test.ts`
Expected: FAIL — `ENOENT: no such file or directory, open '.../server/config/government_branches.yml'`

- [ ] **Step 3: Create `server/config/government_branches.yml`**

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

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest tests/unit/GovernmentBranchesConfig.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add server/config/government_branches.yml server/tests/unit/GovernmentBranchesConfig.test.ts
git commit -m "Config: Add tripartite government branch data"
```

---

### Task 2: Server `Player` — government branch selection

**Files:**
- Modify: `server/src/Player.ts`
- Modify: `server/tests/unit/Player.test.ts`

**Interfaces:**
- Consumes: `server/config/government_branches.yml` (Task 1), via a new `Game.getInstance().getCurrentStateAs<InGameState>().getGovernmentBranchById(id)` call (added in Task 4 — but this task can be implemented and tested independently by mocking that call, exactly like Task 2 of the prior plan did for `getTechnologyById` before Task 4 of that plan existed).
- Produces: `Player.selectGovernmentBranch(branchId: string): void`, `Player.getSelectedGovernmentBranch(): string | undefined`, `Player.sendGovernmentBranchUpdate(): void` (broadcasts `{ event: "updateGovernmentBranch", selectedBranch }`). Also registers a new constructor listener (`selectGovernmentBranch`, `globalEvent: true`). Task 3 (`City`) calls `getSelectedGovernmentBranch()`; Task 5 (client) consumes the `updateGovernmentBranch` event shape.

- [ ] **Step 1: Write the failing test**

Add this new `describe` block at the end of `server/tests/unit/Player.test.ts` (after the closing `});` of `describe('Player research queue', ...)`; the file already imports `Game` from Task 2 of the prior plan):

```typescript
describe('Player government branch', () => {
  const senateData = { id: 'senate', name: '원로원', stat: 'culture', bonus_percent: 20 };
  const assemblyData = { id: 'assembly', name: '국민의회', stat: 'production', bonus_percent: 20 };

  let getGovernmentBranchById: jest.Mock;

  beforeEach(() => {
    getGovernmentBranchById = jest.fn().mockImplementation((id: string) => {
      if (id === 'senate') return senateData;
      if (id === 'assembly') return assemblyData;
      return undefined;
    });

    jest.spyOn(Game, 'getInstance').mockReturnValue({
      getCurrentStateAs: jest.fn().mockReturnValue({ getGovernmentBranchById })
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('selectGovernmentBranch sets the branch for a valid id', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.selectGovernmentBranch('senate');
    expect(player.getSelectedGovernmentBranch()).toBe('senate');
  });

  it('selectGovernmentBranch ignores an unknown branch id', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.selectGovernmentBranch('nonexistent');
    expect(player.getSelectedGovernmentBranch()).toBeUndefined();
  });

  it('selectGovernmentBranch allows switching directly between branches, no queue', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.selectGovernmentBranch('senate');
    player.selectGovernmentBranch('assembly');
    expect(player.getSelectedGovernmentBranch()).toBe('assembly');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest tests/unit/Player.test.ts`
Expected: FAIL — `player.selectGovernmentBranch is not a function`

- [ ] **Step 3: Add the field**

Replace:
```typescript
  private currentResearch: string | undefined;
  private researchProgress: number;
  private researchedTechs: Set<string>;
```
with:
```typescript
  private currentResearch: string | undefined;
  private researchProgress: number;
  private researchedTechs: Set<string>;
  private selectedGovernmentBranch: string | undefined;
```

- [ ] **Step 4: Initialize it in the constructor**

Replace:
```typescript
    this.currentResearch = undefined;
    this.researchProgress = 0;
    this.researchedTechs = new Set<string>();
```
with:
```typescript
    this.currentResearch = undefined;
    this.researchProgress = 0;
    this.researchedTechs = new Set<string>();
    this.selectedGovernmentBranch = undefined;
```

- [ ] **Step 5: Add the constructor listener**

Replace the `nextTurn` listener block and its closing constructor brace:
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
  }
```
with:
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

    ServerEvents.on({
      eventName: "selectGovernmentBranch",
      parentObject: this,
      callback: (data, websocket) => {
        if (this.wsConnection != websocket) return;

        this.selectGovernmentBranch(data["branchId"]);
        this.sendGovernmentBranchUpdate();
      },
      globalEvent: true
    });
  }
```

- [ ] **Step 6: Add the methods**

Insert immediately after `getResearchedTechs()` (the last method in the class, just before the final closing `}`):

```typescript

  public selectGovernmentBranch(branchId: string) {
    const branchData = Game.getInstance().getCurrentStateAs<InGameState>().getGovernmentBranchById(branchId);
    if (!branchData) {
      return;
    }

    this.selectedGovernmentBranch = branchId;
  }

  public getSelectedGovernmentBranch(): string | undefined {
    return this.selectedGovernmentBranch;
  }

  public sendGovernmentBranchUpdate() {
    this.sendNetworkEvent({
      event: "updateGovernmentBranch",
      selectedBranch: this.selectedGovernmentBranch
    });
  }
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd server && npx jest tests/unit/Player.test.ts`
Expected: PASS (15 tests — the original 12 plus 3 new)

- [ ] **Step 8: Commit**

```bash
git add server/src/Player.ts server/tests/unit/Player.test.ts
git commit -m "Server: Add government branch selection to Player"
```

---

### Task 3: Server `City` — apply the government stat bonus

**Files:**
- Modify: `server/src/city/City.ts`
- Modify: `server/tests/unit/City.test.ts`

**Interfaces:**
- Consumes: `Player.getSelectedGovernmentBranch()` (Task 2); a new `getGovernmentBranchById(id)` call on `Game.getInstance().getCurrentStateAs<InGameState>()` (Task 4 adds this method server-side, but as with the plan's Task 2/Task 4 split pattern, this task mocks it directly and works independently).
- Produces: no new public method beyond a private `getGovernmentBonus()` helper — `getStatline()`'s existing return shape (array or dict) is unchanged, just with the relevant stat's value multiplied when a branch is selected.

- [ ] **Step 1: Write the failing test**

Replace the `mockPlayer` construction in `beforeEach`:
```typescript
    mockPlayer = {
      getName: jest.fn().mockReturnValue('TestPlayer'),
      getNextAvailableCityName: jest.fn().mockReturnValue('TestCity'),
      sendNetworkEvent: jest.fn(),
      hasResearchedTech: jest.fn().mockReturnValue(true)
    } as unknown as jest.Mocked<Player>;
```
with:
```typescript
    mockPlayer = {
      getName: jest.fn().mockReturnValue('TestPlayer'),
      getNextAvailableCityName: jest.fn().mockReturnValue('TestCity'),
      sendNetworkEvent: jest.fn(),
      hasResearchedTech: jest.fn().mockReturnValue(true),
      getSelectedGovernmentBranch: jest.fn().mockReturnValue(undefined)
    } as unknown as jest.Mocked<Player>;
```

Replace the `getBuildingDataByName`/`jest.spyOn(Game, 'getInstance')` block in `beforeEach`:
```typescript
    getBuildingDataByName = jest.fn().mockImplementation((name: string) => {
      if (name.toLowerCase() === 'granary') return granaryData;
      if (name.toLowerCase() === 'palace') return palaceData;
      return undefined;
    });

    jest.spyOn(Game, 'getInstance').mockReturnValue({
      getCurrentStateAs: jest.fn().mockReturnValue({ getBuildingDataByName })
    } as any);
```
with:
```typescript
    getBuildingDataByName = jest.fn().mockImplementation((name: string) => {
      if (name.toLowerCase() === 'granary') return granaryData;
      if (name.toLowerCase() === 'palace') return palaceData;
      return undefined;
    });

    getGovernmentBranchById = jest.fn().mockReturnValue(undefined);

    jest.spyOn(Game, 'getInstance').mockReturnValue({
      getCurrentStateAs: jest.fn().mockReturnValue({ getBuildingDataByName, getGovernmentBranchById })
    } as any);
```

Add `let getGovernmentBranchById: jest.Mock;` alongside the existing `let getBuildingDataByName: jest.Mock;` declaration near the top of the `describe` block.

Add these two new tests, anywhere inside the `describe('City production queue', ...)` block after the existing `it('queueBuilding rejects a building locked behind unresearched technology', ...)` test:

```typescript
  it('applies the government branch bonus percentage to its associated stat', () => {
    (mockPlayer.getSelectedGovernmentBranch as jest.Mock).mockReturnValue('senate');
    getGovernmentBranchById.mockReturnValue({ id: 'senate', name: '원로원', stat: 'culture', bonus_percent: 20 });

    city.addBuilding('Palace'); // grants culture: 1

    const stats = city.getStatline({ asArray: false });

    expect(stats.culture).toBeCloseTo(1.2);
  });

  it('leaves stats unchanged when no government branch is selected', () => {
    city.addBuilding('Palace'); // grants culture: 1

    const stats = city.getStatline({ asArray: false });

    expect(stats.culture).toBe(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest tests/unit/City.test.ts`
Expected: FAIL — `stats.culture` is `1`, not `1.2`, for the first new test (no bonus applied yet).

- [ ] **Step 3: Add the private helper and apply it in both `getStatline` branches**

Insert immediately after the closing brace of `getProductionProgress()` (or anywhere sensible near the other small private/public helpers — exact placement doesn't matter as long as it's a method of the `City` class):

```typescript

  private getGovernmentBonus() {
    const branchId = this.player.getSelectedGovernmentBranch();
    if (!branchId) {
      return undefined;
    }

    return Game.getInstance().getCurrentStateAs<InGameState>().getGovernmentBranchById(branchId);
  }
```

Replace the end of the `asArray: true` branch of `getStatline`:
```typescript
      return cityStats;
    }

    // If we're not returning an array, return a dictionary
```
with:
```typescript
      const governmentBonus = this.getGovernmentBonus();
      if (governmentBonus) {
        for (const cityStat of cityStats) {
          if (Object.keys(cityStat)[0] === governmentBonus.stat) {
            cityStat[governmentBonus.stat] *= 1 + governmentBonus.bonus_percent / 100;
          }
        }
      }

      return cityStats;
    }

    // If we're not returning an array, return a dictionary
```

Replace the end of the `getStatline` method (the final `return cityStats;` and its closing brace):
```typescript
    return cityStats;
  }

  public getTile(): Tile {
```
with:
```typescript
    const governmentBonus = this.getGovernmentBonus();
    if (governmentBonus && cityStats.hasOwnProperty(governmentBonus.stat)) {
      cityStats[governmentBonus.stat] *= 1 + governmentBonus.bonus_percent / 100;
    }

    return cityStats;
  }

  public getTile(): Tile {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest tests/unit/City.test.ts`
Expected: PASS (10 tests — the original 8 plus 2 new)

- [ ] **Step 5: Commit**

```bash
git add server/src/city/City.ts server/tests/unit/City.test.ts
git commit -m "Server: Apply government branch stat bonus in City.getStatline"
```

---

### Task 4: Server `InGameState` — load and serve government branches

**Files:**
- Modify: `server/src/state/type/InGameState.ts`

**Interfaces:**
- Consumes: `server/config/government_branches.yml` (Task 1).
- Produces: `InGameState.getGovernmentBranchById(id: string): Record<string, any> | undefined` (consumed by Task 2 and Task 3's mocked-then-real dependency); socket event `availableGovernmentBranches` (payload `{ event: "availableGovernmentBranches", branches: Record<string, any>[] }`, consumed by Task 6's UI).

No new test file — mirrors the existing untested `getBuildingDataByName`/`availableBuildings` precedent.

- [ ] **Step 1: Add the field**

Replace:
```typescript
  private eras: Record<string, any>[];
  private technologies: Record<string, any>[];
```
with:
```typescript
  private eras: Record<string, any>[];
  private technologies: Record<string, any>[];
  private governmentBranches: Record<string, any>[];
```

- [ ] **Step 2: Load the config file**

Replace:
```typescript
    const technologiesYMLData = YAML.parse(fs.readFileSync("./config/technologies.yml", "utf-8"));
    this.technologies = JSON.parse(JSON.stringify(technologiesYMLData.technologies));
```
with:
```typescript
    const technologiesYMLData = YAML.parse(fs.readFileSync("./config/technologies.yml", "utf-8"));
    this.technologies = JSON.parse(JSON.stringify(technologiesYMLData.technologies));

    const governmentBranchesYMLData = YAML.parse(fs.readFileSync("./config/government_branches.yml", "utf-8"));
    this.governmentBranches = JSON.parse(JSON.stringify(governmentBranchesYMLData.government_branches));
```

- [ ] **Step 3: Add the request/response handler**

Replace the `availableTechnologies` handler block:
```typescript
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
with:
```typescript
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

    ServerEvents.on({
      eventName: "availableGovernmentBranches",
      parentObject: this,
      callback: (_, websocket) => {
        const player = Game.getInstance().getPlayerFromWebsocket(websocket);
        player.sendNetworkEvent({
          event: "availableGovernmentBranches",
          branches: this.governmentBranches
        });
      }
    });
```

- [ ] **Step 4: Add the query method**

Replace:
```typescript
  public getTechnologyById(id: string) {
    for (const technology of this.technologies) {
      if (technology.id === id) {
        return technology;
      }
    }

    return undefined;
  }
```
with:
```typescript
  public getTechnologyById(id: string) {
    for (const technology of this.technologies) {
      if (technology.id === id) {
        return technology;
      }
    }

    return undefined;
  }

  public getGovernmentBranchById(id: string) {
    for (const branch of this.governmentBranches) {
      if (branch.id === id) {
        return branch;
      }
    }

    return undefined;
  }
```

- [ ] **Step 5: Verify the server still type-checks and the existing suite still passes**

Run: `cd server && npm run test`
Expected: Same pass/fail counts as before this task plus Task 1's new suite — no new failures beyond the pre-existing, unrelated `Unit.test.ts` failures.

- [ ] **Step 6: Commit**

```bash
git add server/src/state/type/InGameState.ts
git commit -m "Server: Load and serve government branches in InGameState"
```

---

### Task 5: Client `AbstractPlayer` — mirror the government branch selection

**Files:**
- Modify: `client/src/player/AbstractPlayer.ts`

**Interfaces:**
- Consumes: server event `updateGovernmentBranch` (Task 2), payload `{ selectedBranch }`.
- Produces: `AbstractPlayer.getSelectedGovernmentBranch(): string | undefined`. Task 6 (UI) calls this.

There is no client unit-test runner. Verification is a TypeScript build check.

- [ ] **Step 1: Add the field and listener**

Replace:
```typescript
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
with:
```typescript
  private currentResearch: string | undefined;
  private researchProgress: number;
  private researchedTechs: string[];
  private selectedGovernmentBranch: string | undefined;

  constructor(playerJSON: JSON) {
    this.provinceData = playerJSON["provinceData"];
    this.name = playerJSON["name"];
    this.currentResearch = undefined;
    this.researchProgress = 0;
    this.researchedTechs = [];
    this.selectedGovernmentBranch = undefined;

    NetworkEvents.on({
      eventName: "updateResearchQueue",
      parentObject: this,
      callback: (data: any) => {
        this.currentResearch = data["currentResearch"];
        this.researchProgress = data["progress"];
        this.researchedTechs = data["researchedTechs"];
      }
    });

    NetworkEvents.on({
      eventName: "updateGovernmentBranch",
      parentObject: this,
      callback: (data: any) => {
        this.selectedGovernmentBranch = data["selectedBranch"];
      }
    });
  }
```

- [ ] **Step 2: Add the getter**

Replace:
```typescript
  public getResearchedTechs(): string[] {
    return this.researchedTechs;
  }
```
with:
```typescript
  public getResearchedTechs(): string[] {
    return this.researchedTechs;
  }

  public getSelectedGovernmentBranch(): string | undefined {
    return this.selectedGovernmentBranch;
  }
```

- [ ] **Step 3: Verify the client type-checks**

Run: `cd client && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/player/AbstractPlayer.ts
git commit -m "Client: Mirror server government branch selection on AbstractPlayer"
```

---

### Task 6: Client UI — government panel opened from `StatusBar`

**Files:**
- Create: `client/src/ui/GovernmentDisplayInfo.ts`
- Modify: `client/src/ui/StatusBar.ts`

**Interfaces:**
- Consumes: socket events `availableGovernmentBranches` (Task 4, payload `{ branches: [{id, name, stat, bonus_percent}, ...] }`) and `updateGovernmentBranch` (Task 2, payload `{ selectedBranch }`); `AbstractPlayer.getSelectedGovernmentBranch()` (Task 5).
- Produces: sends `selectGovernmentBranch` command, payload `{ event: "selectGovernmentBranch", branchId: string }` (consumed by Task 2's server listener).

There is no client unit-test runner. Verification is a TypeScript build check plus the live browser check in Task 7.

- [ ] **Step 1: Create `client/src/ui/GovernmentDisplayInfo.ts`**

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

export class GovernmentDisplayInfo extends ActorGroup {
  private player: AbstractPlayer;
  private currentBranchLabel: Label;
  private branchCatalog: Record<string, any>[];

  constructor(player: AbstractPlayer, x: number, y: number, width: number, height: number) {
    super({ x: x, y: y, z: 6, width: width, height: height, cameraApplies: false });

    this.player = player;
    this.branchCatalog = [];

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

    listbox.addCategory("정부");

    const currentRow = listbox.addRow({
      category: "정부",
      text: this.describeCurrentBranch(),
      textX: listbox.getNextRowPosition().x + 8,
      centerTextY: true,
      rowHeight: 30
    });
    this.currentBranchLabel = currentRow.getLabel();

    NetworkEvents.on({
      eventName: "availableGovernmentBranches",
      parentObject: this,
      callback: (data: any) => {
        this.branchCatalog = data["branches"];
        this.renderBranchList(listbox);
      }
    });

    NetworkEvents.on({
      eventName: "updateGovernmentBranch",
      parentObject: this,
      callback: () => {
        this.currentBranchLabel.setText(this.describeCurrentBranch());
      }
    });

    WebsocketClient.sendMessage({ event: "availableGovernmentBranches" });

    this.addActor(listbox);
  }

  private describeCurrentBranch(): string {
    const selected = this.player.getSelectedGovernmentBranch();
    if (!selected) {
      return "선택된 분과 없음";
    }

    const branch = this.branchCatalog.find((b) => b["id"] === selected);
    return branch ? `현재: ${branch["name"]}` : `현재: ${selected}`;
  }

  private renderBranchList(listbox: ListBox) {
    const selected = this.player.getSelectedGovernmentBranch();

    for (const branch of this.branchCatalog) {
      const marker = branch["id"] === selected ? "✓ " : "";

      const selectButton = new Button({
        text: "선택",
        x: listbox.getNextRowPosition().x + listbox.getWidth() - 70,
        y: listbox.getNextRowPosition().y + 4,
        width: 60,
        height: 30,
        fontColor: "white",
        onClicked: () => {
          WebsocketClient.sendMessage({ event: "selectGovernmentBranch", branchId: branch["id"] });
        }
      });

      listbox.addRow({
        category: "정부",
        text: `${marker}${branch["name"]} (+${branch["bonus_percent"]}% ${branch["stat"]})`,
        textX: listbox.getNextRowPosition().x + 8,
        centerTextY: true,
        rowHeight: 38,
        actorIcons: [selectButton]
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

Replace the imports:
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
with:
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

Replace the field declaration added in the previous plan:
```typescript
  private statusBarActor: Actor;
  private researchDisplayInfo: ResearchDisplayInfo;
```
with:
```typescript
  private statusBarActor: Actor;
  private researchDisplayInfo: ResearchDisplayInfo;
  private governmentDisplayInfo: GovernmentDisplayInfo;
```

Replace the `cultureDescLabel` construction block:
```typescript
    // Culture information
    this.cultureDescLabel = new Label({
      text: "Culture:",
      font: "16px serif",
      fontColor: "white"
    });
    await this.cultureDescLabel.conformSize();
    this.cultureDescLabel.setPosition(this.scienceLabel.getX() + this.scienceLabel.getWidth() + 10, 3);
    this.addActor(this.cultureDescLabel);
```
with:
```typescript
    // Culture information
    this.cultureDescLabel = new Label({
      text: "Culture:",
      font: "16px serif",
      fontColor: "white",
      onClick: () => {
        const scene = Game.getInstance().getCurrentSceneAs<InGameScene>();

        if (this.governmentDisplayInfo) {
          scene.removeActor(this.governmentDisplayInfo);
          this.governmentDisplayInfo = undefined;
          return;
        }

        this.governmentDisplayInfo = new GovernmentDisplayInfo(
          scene.getClientPlayer(),
          Game.getInstance().getWidth() / 2 - 216,
          Game.getInstance().getHeight() / 2 - 220,
          432,
          440
        );
        scene.addActor(this.governmentDisplayInfo);
      }
    });
    await this.cultureDescLabel.conformSize();
    this.cultureDescLabel.setPosition(this.scienceLabel.getX() + this.scienceLabel.getWidth() + 10, 3);
    this.addActor(this.cultureDescLabel);
```

- [ ] **Step 3: Verify the client type-checks**

Run: `cd client && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/ui/GovernmentDisplayInfo.ts client/src/ui/StatusBar.ts
git commit -m "Client: Add government panel opened from the Culture status label"
```

---

### Task 7: Full regression check

**Files:** none (verification only)

**Interfaces:** none — confirms Tasks 1-6 integrate correctly end-to-end.

- [ ] **Step 1: Run the full server test suite**

Run: `cd server && npm run test`
Expected: All suites pass, including `GovernmentBranchesConfig.test.ts` (new) and the extended `Player.test.ts`/`City.test.ts`, plus every previously-passing suite. Only the pre-existing, unrelated `Unit.test.ts` failures should appear.

- [ ] **Step 2: Run the client type check**

Run: `cd client && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Live browser check** (keep this tight — aim for well under 30 tool calls)

Start the stack in the background (`npx ts-node scripts/run_tests.ts` from the repo root), wait a fixed ~15s, then use chrome-devtools MCP tools (one `ToolSearch` call up front) to:
1. Navigate to `http://localhost:1234?test=true&scenario=CitySettlement` — confirm the scenario still passes via console messages (this is the main regression signal).
2. Best-effort: try clicking the "Culture:" status-bar label (via coordinate-based `evaluate_script` dispatch if a direct click doesn't register, same technique already proven in earlier sub-projects) to see if the government panel opens showing "선택된 분과 없음" and three branch rows. If this doesn't work within 2-3 attempts, report it as inconclusive rather than continuing to hunt — this is a known, accepted canvas-automation tooling limitation already hit twice before in this project, not a reason to keep spending tool calls. The underlying logic is already covered by unit tests and code review.
3. Always run cleanup regardless of outcome: `npx kill-port 2000 1234`, verify with `lsof -nP -iTCP:2000 -iTCP:1234 -sTCP:LISTEN` that nothing remains, and confirm `git status --short` shows no stray files.

- [ ] **Step 4: Commit (only if Steps 1-3 required fixes)**

```bash
git add -A
git commit -m "Fix: Resolve regressions found in tripartite government check"
```
If no fixes were needed, skip this step — there is nothing to commit.
