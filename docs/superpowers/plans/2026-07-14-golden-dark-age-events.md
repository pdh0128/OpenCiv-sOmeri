# 황금/암흑시대 이벤트 (서브프로젝트 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every 20 turns, judge a player's era (golden/dark/normal) from how many ideal points they earned since the last checkpoint, apply a city-wide +10%/-10% yield multiplier accordingly, and notify the client on transition — the final sub-project of the sOmeri migration master plan.

**Architecture:** `Player` gets a checkpoint counter and a snapshot of `idealPoints` taken at the last judgment; a new `processEraCheckpoint()` method (called from the existing `nextTurn` listener) computes the delta since that snapshot, sets `eraStatus`, and fires a transition notification only when the status actually changes. `City.getStatline()` reads `this.player.getEraStatus()` and multiplies the five yield stats (science/gold/production/faith/culture — NOT population/food, which are headcounts/consumption, not "yields," so a golden-age multiplier there would misleadingly inflate population or worsen food deficit) by 1.1/0.9/1. Client-side, `AbstractPlayer` mirrors `eraStatus`, `StatusBar` shows it as a static label, and a new `EraTransitionToast` component shows a short auto-dismissing banner on the `eraTransition` event.

**Tech Stack:** TypeScript, Jest + `ts-jest` (server tests), client verified via `tsc --noEmit` and a live browser check.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-14-golden-dark-age-events-design.md`
- Checkpoint every 20 turns. Delta (this checkpoint period's ideal-point gain, summed across all five ideals) ≥ 80 → `golden`; ≤ 20 → `dark`; otherwise → `normal`.
- The era multiplier (1.1 / 0.9 / 1) applies ONLY to `science`, `gold`, `production`, `faith`, `culture` in `City.getStatline()` — not `population`, `food`, `morale`, or `foodSurplus`.
- A transition notification (`eraTransition` event) fires ONLY when the computed status differs from the previous one — a checkpoint that reconfirms the same status sends the routine `updateEraStatus` broadcast but not a transition event.
- No new consumption/unlock effects beyond the flat stat multiplier — no unique golden-age buildings, no dark-age rebellion events (explicitly out of scope, noted in the spec as future narrative expansion).

---

### Task 1: Server `Player` — era status core and checkpoint logic

**Files:**
- Modify: `server/src/Player.ts`
- Modify: `server/tests/unit/Player.test.ts`

**Interfaces:**
- Consumes: `Player.idealPoints` (already exists from the prior sub-project).
- Produces: `Player.processEraCheckpoint(): void` (public specifically so it can be unit-tested directly, without needing the `ServerEvents.call`/`.on` plumbing the order-points logic required), `Player.getEraStatus(): string`, `Player.sendEraStatusUpdate(): void` (broadcasts `{ event: "updateEraStatus", eraStatus }`). On a status change, also broadcasts `{ event: "eraTransition", eraStatus, previousEraStatus }`. Task 2 (City) calls `getEraStatus()`; Task 3 (client) consumes `updateEraStatus`/`eraTransition`.

- [ ] **Step 1: Write the failing test**

Add this new `describe` block at the end of `server/tests/unit/Player.test.ts` (after the closing `});` of `describe('Player order points from government stability', ...)`):

```typescript
describe('Player era status', () => {
  it('stays normal before the 20-turn checkpoint', () => {
    const player = new Player('Player1', fakeWebSocket());
    for (let i = 0; i < 19; i++) {
      player.processEraCheckpoint();
    }
    expect(player.getEraStatus()).toBe('normal');
  });

  it('enters golden age when the ideal-point delta reaches 80 or more by the checkpoint', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.awardIdealPoints('unity', 90);
    for (let i = 0; i < 20; i++) {
      player.processEraCheckpoint();
    }
    expect(player.getEraStatus()).toBe('golden');
  });

  it('enters dark age when the ideal-point delta is 20 or less by the checkpoint', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.awardIdealPoints('unity', 10);
    for (let i = 0; i < 20; i++) {
      player.processEraCheckpoint();
    }
    expect(player.getEraStatus()).toBe('dark');
  });

  it('stays normal when the delta is strictly between the two thresholds', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.awardIdealPoints('unity', 50);
    for (let i = 0; i < 20; i++) {
      player.processEraCheckpoint();
    }
    expect(player.getEraStatus()).toBe('normal');
  });

  it('only broadcasts an eraTransition event when the status actually changes', () => {
    const player = new Player('Player1', fakeWebSocket());
    const sendSpy = jest.spyOn(player, 'sendNetworkEvent');

    player.awardIdealPoints('unity', 90);
    for (let i = 0; i < 20; i++) {
      player.processEraCheckpoint();
    }

    const transitionCalls = sendSpy.mock.calls.filter((call) => call[0].event === 'eraTransition');
    expect(transitionCalls.length).toBe(1);
    expect(transitionCalls[0][0]).toEqual({
      event: 'eraTransition',
      eraStatus: 'golden',
      previousEraStatus: 'normal'
    });
  });

  it('measures delta since the last checkpoint, not the running total', () => {
    const player = new Player('Player1', fakeWebSocket());
    player.awardIdealPoints('unity', 90);
    for (let i = 0; i < 20; i++) {
      player.processEraCheckpoint();
    }
    expect(player.getEraStatus()).toBe('golden');

    // No new points earned in the next 20-turn window -> delta is 0 -> falls to dark
    for (let i = 0; i < 20; i++) {
      player.processEraCheckpoint();
    }
    expect(player.getEraStatus()).toBe('dark');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/comodoflow/Desktop/project/civ-so/civ-so/server && npx jest tests/unit/Player.test.ts`
Expected: FAIL — `player.processEraCheckpoint is not a function`

- [ ] **Step 3: Add the new fields**

Replace:
```typescript
  private idealPoints: Record<string, number>;
  private lastTurnGovernmentBranch: string | undefined;
```
with:
```typescript
  private idealPoints: Record<string, number>;
  private lastTurnGovernmentBranch: string | undefined;
  private eraStatus: string;
  private eraCheckpointSnapshot: Record<string, number>;
  private turnsSinceLastCheckpoint: number;
```

- [ ] **Step 4: Initialize them in the constructor**

Replace:
```typescript
    this.idealPoints = { unity: 0, knowledge: 0, development: 0, order: 0, pioneering: 0 };
    this.lastTurnGovernmentBranch = undefined;
```
with:
```typescript
    this.idealPoints = { unity: 0, knowledge: 0, development: 0, order: 0, pioneering: 0 };
    this.lastTurnGovernmentBranch = undefined;
    this.eraStatus = "normal";
    this.eraCheckpointSnapshot = { unity: 0, knowledge: 0, development: 0, order: 0, pioneering: 0 };
    this.turnsSinceLastCheckpoint = 0;
```

- [ ] **Step 5: Wire the checkpoint into the `nextTurn` listener**

Replace:
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

        this.processEraCheckpoint();
      },
      globalEvent: true
    });
```

- [ ] **Step 6: Add the era-status methods**

Insert immediately after `sendIdealPointsUpdate()` (or anywhere sensible near the other small methods, before the final closing `}` of the class):

```typescript

  public processEraCheckpoint() {
    this.turnsSinceLastCheckpoint += 1;
    if (this.turnsSinceLastCheckpoint < 20) {
      return;
    }

    let delta = 0;
    for (const ideal of Object.keys(this.idealPoints)) {
      delta += this.idealPoints[ideal] - this.eraCheckpointSnapshot[ideal];
    }

    const previousEraStatus = this.eraStatus;

    if (delta >= 80) {
      this.eraStatus = "golden";
    } else if (delta <= 20) {
      this.eraStatus = "dark";
    } else {
      this.eraStatus = "normal";
    }

    this.eraCheckpointSnapshot = { ...this.idealPoints };
    this.turnsSinceLastCheckpoint = 0;

    this.sendEraStatusUpdate();

    if (this.eraStatus !== previousEraStatus) {
      this.sendNetworkEvent({
        event: "eraTransition",
        eraStatus: this.eraStatus,
        previousEraStatus: previousEraStatus
      });
    }
  }

  public sendEraStatusUpdate() {
    this.sendNetworkEvent({
      event: "updateEraStatus",
      eraStatus: this.eraStatus
    });
  }

  public getEraStatus(): string {
    return this.eraStatus;
  }
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd /Users/comodoflow/Desktop/project/civ-so/civ-so/server && npx jest tests/unit/Player.test.ts`
Expected: PASS (29 tests — the original 23 plus 6 new)

- [ ] **Step 8: Commit**

```bash
git add server/src/Player.ts server/tests/unit/Player.test.ts
git commit -m "Server: Add era status checkpoint logic to Player"
```

---

### Task 2: Server `City` — apply the era stat multiplier

**Files:**
- Modify: `server/src/city/City.ts`
- Modify: `server/tests/unit/City.test.ts`

**Interfaces:**
- Consumes: `Player.getEraStatus()` (Task 1).
- Produces: no new public interface — `getStatline()`'s existing return shape is unchanged, just with `science`/`gold`/`production`/`faith`/`culture` multiplied by 1.1 (golden), 0.9 (dark), or left alone (normal), in BOTH return branches, applied after the existing government-branch bonus.

- [ ] **Step 1: Write the failing test**

Replace the `mockPlayer` construction in `beforeEach`:
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
with:
```typescript
    mockPlayer = {
      getName: jest.fn().mockReturnValue('TestPlayer'),
      getNextAvailableCityName: jest.fn().mockReturnValue('TestCity'),
      sendNetworkEvent: jest.fn(),
      hasResearchedTech: jest.fn().mockReturnValue(true),
      getSelectedGovernmentBranch: jest.fn().mockReturnValue(undefined),
      awardIdealPoints: jest.fn(),
      getEraStatus: jest.fn().mockReturnValue('normal')
    } as unknown as jest.Mocked<Player>;
```

Add these three new tests, anywhere inside the `describe('City production queue', ...)` block after the existing government-bonus tests:

```typescript
  it('applies a +10% multiplier to yield stats during a golden age', () => {
    (mockPlayer.getEraStatus as jest.Mock).mockReturnValue('golden');
    city.addBuilding('Palace'); // production: 3

    const stats = city.getStatline({ asArray: false });

    expect(stats['production']).toBeCloseTo(3.3);
  });

  it('applies a -10% multiplier to yield stats during a dark age', () => {
    (mockPlayer.getEraStatus as jest.Mock).mockReturnValue('dark');
    city.addBuilding('Palace'); // production: 3

    const stats = city.getStatline({ asArray: false });

    expect(stats['production']).toBeCloseTo(2.7);
  });

  it('leaves stats unchanged during a normal era', () => {
    city.addBuilding('Palace'); // production: 3

    const stats = city.getStatline({ asArray: false });

    expect(stats['production']).toBe(3);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/comodoflow/Desktop/project/civ-so/civ-so/server && npx jest tests/unit/City.test.ts`
Expected: FAIL — the golden/dark tests fail because `production` is still `3`, not `3.3`/`2.7`.

- [ ] **Step 3: Add the private helper and apply it in both `getStatline` branches**

Insert immediately after the closing brace of `getGovernmentBonus()`:

```typescript

  private getEraMultiplier(): number {
    const eraStatus = this.player.getEraStatus();
    if (eraStatus === "golden") {
      return 1.1;
    }
    if (eraStatus === "dark") {
      return 0.9;
    }
    return 1;
  }
```

Replace the array-branch's government-bonus block (keep it, add right after it, still before `return cityStats;`):
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

      const eraMultiplier = this.getEraMultiplier();
      if (eraMultiplier !== 1) {
        for (const cityStat of cityStats) {
          const statType = Object.keys(cityStat)[0];
          if (["science", "gold", "production", "faith", "culture"].includes(statType)) {
            cityStat[statType] *= eraMultiplier;
          }
        }
      }

      return cityStats;
    }
```

Replace the dict-branch's government-bonus block:
```typescript
    const governmentBonus = this.getGovernmentBonus();
    if (governmentBonus && cityStats.hasOwnProperty(governmentBonus.stat)) {
      cityStats[governmentBonus.stat] *= 1 + governmentBonus.bonus_percent / 100;
    }

    return cityStats;
  }
```
with:
```typescript
    const governmentBonus = this.getGovernmentBonus();
    if (governmentBonus && cityStats.hasOwnProperty(governmentBonus.stat)) {
      cityStats[governmentBonus.stat] *= 1 + governmentBonus.bonus_percent / 100;
    }

    const eraMultiplier = this.getEraMultiplier();
    if (eraMultiplier !== 1) {
      for (const statType of ["science", "gold", "production", "faith", "culture"]) {
        if (cityStats.hasOwnProperty(statType)) {
          cityStats[statType] *= eraMultiplier;
        }
      }
    }

    return cityStats;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/comodoflow/Desktop/project/civ-so/civ-so/server && npx jest tests/unit/City.test.ts`
Expected: PASS (15 tests — the original 12 plus 3 new)

- [ ] **Step 5: Commit**

```bash
git add server/src/city/City.ts server/tests/unit/City.test.ts
git commit -m "Server: Apply era stat multiplier in City.getStatline"
```

---

### Task 3: Client `AbstractPlayer` — mirror era status

**Files:**
- Modify: `client/src/player/AbstractPlayer.ts`

**Interfaces:**
- Consumes: server events `updateEraStatus` (Task 1, payload `{ eraStatus }`) and `eraTransition` (Task 1, payload `{ eraStatus, previousEraStatus }` — this task only mirrors the routine status, Task 4's toast component listens for the transition event separately).
- Produces: `AbstractPlayer.getEraStatus(): string`. Task 4 (UI) calls this.

There is no client unit-test runner. Verification is a TypeScript build check.

- [ ] **Step 1: Add the field, initializer, and listener**

Replace:
```typescript
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
with:
```typescript
  private idealPoints: Record<string, number>;
  private eraStatus: string;

  constructor(playerJSON: JSON) {
    this.provinceData = playerJSON["provinceData"];
    this.name = playerJSON["name"];
    this.currentResearch = undefined;
    this.researchProgress = 0;
    this.researchedTechs = [];
    this.selectedGovernmentBranch = undefined;
    this.idealPoints = playerJSON["idealPoints"] ?? { unity: 0, knowledge: 0, development: 0, order: 0, pioneering: 0 };
    this.eraStatus = "normal";
```

Add this new listener registration alongside the existing `updateIdealPoints` one, inside the constructor:
```typescript

    NetworkEvents.on({
      eventName: "updateEraStatus",
      parentObject: this,
      callback: (data: any) => {
        this.eraStatus = data["eraStatus"];
      }
    });
```

- [ ] **Step 2: Add the getter**

Replace:
```typescript
  public getIdealPoints(): Record<string, number> {
    return this.idealPoints;
  }
```
with:
```typescript
  public getIdealPoints(): Record<string, number> {
    return this.idealPoints;
  }

  public getEraStatus(): string {
    return this.eraStatus;
  }
```

- [ ] **Step 3: Verify the client type-checks**

Run: `cd /Users/comodoflow/Desktop/project/civ-so/civ-so/client && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/player/AbstractPlayer.ts
git commit -m "Client: Mirror server era status on AbstractPlayer"
```

---

### Task 4: Client UI — era status label and transition toast

**Files:**
- Create: `client/src/ui/EraTransitionToast.ts`
- Modify: `client/src/ui/StatusBar.ts`

**Interfaces:**
- Consumes: `AbstractPlayer.getEraStatus()` (Task 3) for the initial label text; server event `updateEraStatus` (Task 1) to keep the label current; server event `eraTransition` (Task 1, payload `{ eraStatus, previousEraStatus }`) to trigger the toast.
- Produces: nothing consumed by other tasks — this is the last content task.

There is no client unit-test runner. Verification is a TypeScript build check plus the live browser check in Task 5.

- [ ] **Step 1: Create `client/src/ui/EraTransitionToast.ts`**

```typescript
import { Game } from "../Game";
import { ActorGroup } from "../scene/ActorGroup";
import { Actor } from "../scene/Actor";
import { Label } from "./Label";

const ERA_LABELS: Record<string, string> = {
  golden: "황금시대",
  dark: "암흑시대",
  normal: "평시"
};

export class EraTransitionToast extends ActorGroup {
  constructor(eraStatus: string, width: number) {
    super({
      x: Game.getInstance().getWidth() / 2 - width / 2,
      y: 40,
      z: 7,
      width: width,
      height: 50,
      cameraApplies: false
    });

    this.addActor(
      new Actor({
        x: this.x,
        y: this.y,
        width: this.width,
        height: this.height,
        color: "rgba(0,0,0,0.75)"
      })
    );

    const label = new Label({
      text: `${ERA_LABELS[eraStatus] ?? eraStatus} 시작!`,
      font: "20px serif",
      fontColor: "white"
    });

    label.conformSize().then(() => {
      label.setPosition(this.x + this.width / 2 - label.getWidth() / 2, this.y + this.height / 2 - label.getHeight() / 2);
      this.addActor(label);
    });

    setTimeout(() => {
      Game.getInstance().getCurrentScene().removeActor(this);
    }, 4000);
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
import { IdealsDisplayInfo } from "./IdealsDisplayInfo";
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
import { EraTransitionToast } from "./EraTransitionToast";
import { GovernmentDisplayInfo } from "./GovernmentDisplayInfo";
import { IdealsDisplayInfo } from "./IdealsDisplayInfo";
import { Label } from "./Label";
import { ResearchDisplayInfo } from "./ResearchDisplayInfo";

const ERA_STATUS_LABELS: Record<string, string> = {
  golden: "황금",
  dark: "암흑",
  normal: "평시"
};
```

Replace the field declaration:
```typescript
  private statusBarActor: Actor;
  private researchDisplayInfo: ResearchDisplayInfo;
  private governmentDisplayInfo: GovernmentDisplayInfo;
  private idealsDisplayInfo: IdealsDisplayInfo;
  private idealsButtonLabel: Label;
```
with:
```typescript
  private statusBarActor: Actor;
  private researchDisplayInfo: ResearchDisplayInfo;
  private governmentDisplayInfo: GovernmentDisplayInfo;
  private idealsDisplayInfo: IdealsDisplayInfo;
  private idealsButtonLabel: Label;
  private eraStatusLabel: Label;
```

Replace the constructor's `NetworkEvents.on` registrations (the existing `newTurn`/`turnTimeDecrement` block) so a third listener is added right after them:
```typescript
    NetworkEvents.on({
      eventName: "newTurn",
      parentObject: this,
      callback: (data) => {
        this.updateCurrentTurnLabel(data);
      }
    });

    NetworkEvents.on({
      eventName: "turnTimeDecrement",
      parentObject: this,
      callback: (data) => {
        this.updateCurrentTurnLabel(data);
      }
    });
  }
```
with:
```typescript
    NetworkEvents.on({
      eventName: "newTurn",
      parentObject: this,
      callback: (data) => {
        this.updateCurrentTurnLabel(data);
      }
    });

    NetworkEvents.on({
      eventName: "turnTimeDecrement",
      parentObject: this,
      callback: (data) => {
        this.updateCurrentTurnLabel(data);
      }
    });

    NetworkEvents.on({
      eventName: "updateEraStatus",
      parentObject: this,
      callback: (data: any) => {
        if (this.eraStatusLabel) {
          this.eraStatusLabel.setText(`시대: ${ERA_STATUS_LABELS[data["eraStatus"]] ?? data["eraStatus"]}`);
        }
      }
    });

    NetworkEvents.on({
      eventName: "eraTransition",
      parentObject: this,
      callback: (data: any) => {
        Game.getInstance().getCurrentScene().addActor(new EraTransitionToast(data["eraStatus"], 300));
      }
    });
  }
```

Replace the `idealsButtonLabel` construction block's tail (add the new era label right after it):
```typescript
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
with:
```typescript
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

    // Era status information (read-only)
    this.eraStatusLabel = new Label({
      text: "시대: 평시",
      font: "16px serif",
      fontColor: "white"
    });
    await this.eraStatusLabel.conformSize();
    this.eraStatusLabel.setPosition(this.idealsButtonLabel.getX() + this.idealsButtonLabel.getWidth() + 10, 3);
    this.addActor(this.eraStatusLabel);

    // Current turn information
```

- [ ] **Step 3: Verify the client type-checks**

Run: `cd /Users/comodoflow/Desktop/project/civ-so/civ-so/client && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/ui/EraTransitionToast.ts client/src/ui/StatusBar.ts
git commit -m "Client: Show era status and transition toast in the status bar"
```

---

### Task 5: Full regression check

**Files:** none (verification only)

**Interfaces:** none — confirms Tasks 1-4 integrate correctly end-to-end, and this being the last sub-project in the entire migration master plan, that the whole feature set (provinces, production queue, tech tree, research, government, ideals, and now eras) still coheres.

- [ ] **Step 1: Run the full server test suite**

Run: `cd /Users/comodoflow/Desktop/project/civ-so/civ-so/server && npm run test`
Expected: All suites pass, including the extended `Player.test.ts`/`City.test.ts`, plus every previously-passing suite. The only failures should be the pre-existing, unrelated `Unit.test.ts` failures.

- [ ] **Step 2: Run the client type check**

Run: `cd /Users/comodoflow/Desktop/project/civ-so/civ-so/client && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Live browser check** (budget ~20-25 tool calls)

Start the stack in the background (`npx ts-node scripts/run_tests.ts` from `/Users/comodoflow/Desktop/project/civ-so/civ-so`), wait a fixed ~15s, one `ToolSearch` call for the chrome-devtools tools needed, then:
1. Navigate to `http://localhost:1234?test=true&scenario=CitySettlement`. Confirm via console messages the scenario still passes — this is the main regression signal, and since this is the final sub-project, a clean pass here is meaningful evidence the entire multi-sub-project migration still holds together.
2. Check console messages for any error mentioning `eraStatus`, `processEraCheckpoint`, `EraTransitionToast`, or `getEraMultiplier` — none should appear.
3. Best-effort: take a screenshot and check whether the status bar shows a "시대: 평시" label somewhere near the other stat labels. If a coordinate-based click is needed for anything and doesn't register within 2-3 attempts, report inconclusive per the same accepted tooling limitation as prior sub-projects — do not keep hunting. (Reaching an actual golden/dark age transition requires 20 real turns, which is impractical to drive through this UI within a reasonable tool-call budget — the checkpoint math itself is already unit-tested in Task 1, so this browser check's job is just to confirm nothing crashes and the label renders, not to trigger a real transition.)
4. Always run cleanup: `npx kill-port 2000 1234`, verify via `lsof -nP -iTCP:2000 -iTCP:1234 -sTCP:LISTEN` that nothing remains, confirm `git status --short` is clean.

- [ ] **Step 4: Commit (only if Steps 1-3 required fixes)**

```bash
git add -A
git commit -m "Fix: Resolve regressions found in golden/dark age events check"
```
If no fixes were needed, skip this step — there is nothing to commit.
