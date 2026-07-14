# 오토모드 (Autoplay Demo Mode) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `?autoplay=true` URL flag makes the client connect, join, settle its starting settler immediately, keep a queued building/research going with simple priority rules, pick one government branch and never change it, and loop turn-advancement indefinitely — so the game can run unattended for a screen recording.

**Architecture:** One new client class, `AutoPlayController`, reuses the existing `TestUtils` connection/lookup helpers and mirrors the exact socket-message patterns already used by the `CitySettlement` e2e scenario and the UI panels (`CityDisplayInfo`/`ResearchDisplayInfo`/`GovernmentDisplayInfo`) — no new server code. `Index.ts` gets one new URL-param branch alongside the existing `?test=true` branch.

**Tech Stack:** TypeScript (client only). No client unit-test runner exists in this codebase — verification is `tsc --noEmit` plus a live browser check (this feature's own correctness is best demonstrated by actually watching it run).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-14-autoplay-mode-design.md`
- No new server code — the controller only sends socket events that already exist (`unitAction`, `queueBuilding`, `queueResearch`, `selectGovernmentBranch`, `nextTurnRequest`) and requests catalogs that already exist (`availableBuildings`, `availableTechnologies`, `availableGovernmentBranches`).
- Settle immediately on finding a settler. Building priority: a food-granting building if the city's `food` stat is negative, else cheapest `production_cost`. Research priority: cheapest `research_cost` among techs whose prerequisites are already researched. Government: pick the first available branch once, never switch after.
- Single-player local demo only — no multi-bot coordination.
- This is a genuinely infinite loop (by design) — do not add a termination condition.

---

### Task 1: `AutoPlayController` — connection, catalogs, and the decision loop

**Files:**
- Create: `client/src/AutoPlayController.ts`

**Interfaces:**
- Consumes: `TestUtils` (`ensureInGame()`, `getClientPlayer()`, `delay()`), `AbstractPlayer` (`getUnits()`, `getCities()`, `getCurrentResearch()`, `getResearchedTechs()`, `getSelectedGovernmentBranch()`), `City` (`getStat(name)`, `getBuildings()`, `getName()`, `getCurrentlyBuilding()`), `Unit` (`getActions()`, `getTile()`, `getID()`), `Tile` (`getGridX()`, `getGridY()`). All of these already exist from prior sub-projects.
- Produces: `AutoPlayController.run(): Promise<void>` — called once from `Index.ts` (Task 2) and never returns (infinite loop by design).

- [ ] **Step 1: Create `client/src/AutoPlayController.ts`**

```typescript
import { Game } from "./Game";
import { NetworkEvents, WebsocketClient } from "./network/Client";
import { TestUtils } from "./testing/TestUtils";

export class AutoPlayController {
  private game: Game;
  private utils: TestUtils;
  private buildingCatalog: Record<string, any>[] = [];
  private technologyCatalog: Record<string, any>[] = [];
  private governmentCatalog: Record<string, any>[] = [];

  constructor(game: Game) {
    this.game = game;
    this.utils = new TestUtils(game);
  }

  public async run() {
    await this.utils.ensureInGame();
    await this.loadCatalogs();

    while (true) {
      await this.settleIfPossible();
      await this.queueBuildingsIfIdle();
      await this.queueResearchIfIdle();
      await this.selectGovernmentIfUnset();

      WebsocketClient.sendMessage({ event: "nextTurnRequest", value: true });

      await this.utils.delay(3000);
    }
  }

  private async loadCatalogs() {
    const buildingsPromise = new Promise<void>((resolve) => {
      NetworkEvents.on({
        eventName: "availableBuildings",
        parentObject: this,
        callback: (data: any) => {
          this.buildingCatalog = data["buildings"];
          resolve();
        }
      });
    });
    WebsocketClient.sendMessage({ event: "availableBuildings" });

    const technologiesPromise = new Promise<void>((resolve) => {
      NetworkEvents.on({
        eventName: "availableTechnologies",
        parentObject: this,
        callback: (data: any) => {
          this.technologyCatalog = data["technologies"];
          resolve();
        }
      });
    });
    WebsocketClient.sendMessage({ event: "availableTechnologies" });

    const governmentPromise = new Promise<void>((resolve) => {
      NetworkEvents.on({
        eventName: "availableGovernmentBranches",
        parentObject: this,
        callback: (data: any) => {
          this.governmentCatalog = data["branches"];
          resolve();
        }
      });
    });
    WebsocketClient.sendMessage({ event: "availableGovernmentBranches" });

    await Promise.all([buildingsPromise, technologiesPromise, governmentPromise]);
  }

  private async settleIfPossible() {
    const player = this.utils.getClientPlayer();
    if (!player) return;

    for (const unit of player.getUnits()) {
      const settleAction = unit.getActions().find((a) => a.getName().toLowerCase().includes("settle"));
      if (!settleAction) continue;

      WebsocketClient.sendMessage({
        event: "unitAction",
        unitX: unit.getTile().getGridX(),
        unitY: unit.getTile().getGridY(),
        id: unit.getID(),
        actionName: settleAction.getName()
      });

      await this.utils.delay(500);
      return;
    }
  }

  private queueBuildingsIfIdle() {
    const player = this.utils.getClientPlayer();
    if (!player) return;

    for (const city of player.getCities()) {
      if (city.getCurrentlyBuilding()) continue;

      const builtNames = city.getBuildings().map((b) => b.getName().toLocaleLowerCase());
      const buildable = this.buildingCatalog.filter(
        (b) => b["production_cost"] > 0 && !builtNames.includes((b["name"] as string).toLocaleLowerCase())
      );
      if (buildable.length === 0) continue;

      const cityFood = city.getStat("food");
      const foodBuilding = buildable.find((b) =>
        (b["stats"] as Record<string, any>[]).some((stat) => Object.keys(stat)[0] === "food")
      );

      const chosen =
        cityFood < 0 && foodBuilding
          ? foodBuilding
          : buildable.reduce((cheapest, b) => (b["production_cost"] < cheapest["production_cost"] ? b : cheapest));

      WebsocketClient.sendMessage({
        event: "queueBuilding",
        cityName: city.getName(),
        buildingName: chosen["name"]
      });
    }
  }

  private queueResearchIfIdle() {
    const player = this.utils.getClientPlayer();
    if (!player || player.getCurrentResearch()) return;

    const researched = new Set(player.getResearchedTechs());
    const researchable = this.technologyCatalog.filter((tech) => {
      if (researched.has(tech["id"])) return false;
      return (tech["prerequisites"] as string[]).every((id) => researched.has(id));
    });
    if (researchable.length === 0) return;

    const cheapest = researchable.reduce((min, tech) =>
      tech["research_cost"] < min["research_cost"] ? tech : min
    );

    WebsocketClient.sendMessage({ event: "queueResearch", techId: cheapest["id"] });
  }

  private selectGovernmentIfUnset() {
    const player = this.utils.getClientPlayer();
    if (!player || player.getSelectedGovernmentBranch()) return;
    if (this.governmentCatalog.length === 0) return;

    WebsocketClient.sendMessage({
      event: "selectGovernmentBranch",
      branchId: this.governmentCatalog[0]["id"]
    });
  }
}
```

- [ ] **Step 2: Verify the client type-checks**

Run: `cd /Users/comodoflow/Desktop/project/civ-so/civ-so/client && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/AutoPlayController.ts
git commit -m "Client: Add AutoPlayController for unattended demo play"
```

---

### Task 2: Wire `?autoplay=true` into `Index.ts`

**Files:**
- Modify: `client/src/Index.ts`

**Interfaces:**
- Consumes: `AutoPlayController` (Task 1).
- Produces: nothing new — this is the entry point, nothing else depends on it.

- [ ] **Step 1: Add the URL-param branch**

Replace:
```typescript
import { assetList } from "./Assets";
import { ScenarioRegistry } from "./testing/ScenarioRegistry";
import { Game } from "./Game";
import { InGameScene } from "./scene/type/InGameScene";
import { JoinGameScene } from "./scene/type/JoinGameScene";
import { LoadingScene } from "./scene/type/LoadingScene";
import { LobbyScene } from "./scene/type/LobbyScene";
import { MainMenuScene } from "./scene/type/MainMenuScene";

Game.createInstance({ assetList: assetList, canvasColor: "gray" }, () => {
  Game.getInstance().addScene("main_menu", new MainMenuScene());
  Game.getInstance().addScene("join_game", new JoinGameScene());
  Game.getInstance().addScene("lobby", new LobbyScene());
  Game.getInstance().addScene("in_game", new InGameScene());
  Game.getInstance().addScene("loading_scene", new LoadingScene());
  Game.getInstance().setScene("main_menu");

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("test") === "true") {
    const scenarioName = urlParams.get("scenario") || "CitySettlement";
    const loader = ScenarioRegistry.get(scenarioName);

    if (loader) {
      loader().then(setup => {
        setTimeout(() => {
          const runner = setup(Game.getInstance());
          runner.run();
        }, 1000);
      });
    } else {
      console.error(`Scenario '${scenarioName}' not found. Available: ${ScenarioRegistry.getAvailableScenarios().join(", ")}`);
    }
  }
});
```
with:
```typescript
import { assetList } from "./Assets";
import { AutoPlayController } from "./AutoPlayController";
import { ScenarioRegistry } from "./testing/ScenarioRegistry";
import { Game } from "./Game";
import { InGameScene } from "./scene/type/InGameScene";
import { JoinGameScene } from "./scene/type/JoinGameScene";
import { LoadingScene } from "./scene/type/LoadingScene";
import { LobbyScene } from "./scene/type/LobbyScene";
import { MainMenuScene } from "./scene/type/MainMenuScene";

Game.createInstance({ assetList: assetList, canvasColor: "gray" }, () => {
  Game.getInstance().addScene("main_menu", new MainMenuScene());
  Game.getInstance().addScene("join_game", new JoinGameScene());
  Game.getInstance().addScene("lobby", new LobbyScene());
  Game.getInstance().addScene("in_game", new InGameScene());
  Game.getInstance().addScene("loading_scene", new LoadingScene());
  Game.getInstance().setScene("main_menu");

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("test") === "true") {
    const scenarioName = urlParams.get("scenario") || "CitySettlement";
    const loader = ScenarioRegistry.get(scenarioName);

    if (loader) {
      loader().then(setup => {
        setTimeout(() => {
          const runner = setup(Game.getInstance());
          runner.run();
        }, 1000);
      });
    } else {
      console.error(`Scenario '${scenarioName}' not found. Available: ${ScenarioRegistry.getAvailableScenarios().join(", ")}`);
    }
  }

  if (urlParams.get("autoplay") === "true") {
    setTimeout(() => {
      new AutoPlayController(Game.getInstance()).run();
    }, 1000);
  }
});
```

- [ ] **Step 2: Verify the client type-checks**

Run: `cd /Users/comodoflow/Desktop/project/civ-so/civ-so/client && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/Index.ts
git commit -m "Client: Trigger AutoPlayController from ?autoplay=true"
```

---

### Task 3: Live verification

**Files:** none (verification only)

**Interfaces:** none — confirms Tasks 1-2 actually produce working unattended play.

- [ ] **Step 1: Run the client type check one more time**

Run: `cd /Users/comodoflow/Desktop/project/civ-so/civ-so/client && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 2: Watch it actually play**

Start the stack in the background (`npx ts-node scripts/run_tests.ts` from `/Users/comodoflow/Desktop/project/civ-so/civ-so`), wait ~15s, one `ToolSearch` call for the needed chrome-devtools tools, then:
1. Navigate to `http://localhost:1234?autoplay=true`.
2. Wait ~20-30s (long enough for connect, settle, first building/research/government picks, and at least 2-3 turn advances), then check console messages for evidence of `unitAction`/`queueBuilding`/`queueResearch`/`selectGovernmentBranch`/`nextTurnRequest` sends and no thrown errors.
3. Take a screenshot to confirm a settled city and a status bar with turn count advancing are visible.
4. Wait another ~15-20s, take a second screenshot, and confirm the turn counter has advanced further than the first screenshot (proving the loop genuinely keeps running, not just executing once).
5. Always run cleanup: `npx kill-port 2000 1234`, verify via `lsof -nP -iTCP:2000 -iTCP:1234 -sTCP:LISTEN` that nothing remains, confirm `git status --short` is clean.

- [ ] **Step 3: Commit (only if Steps 1-2 required fixes)**

```bash
git add -A
git commit -m "Fix: Resolve issues found in autoplay mode verification"
```
If no fixes were needed, skip this step.
