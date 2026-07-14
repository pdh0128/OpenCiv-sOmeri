import { Game } from "./Game";
import { NetworkEvents, WebsocketClient } from "./network/Client";
import { TestUtils } from "./testing/TestUtils";

export class AutoPlayController {
  private utils: TestUtils;
  private buildingCatalog: Record<string, any>[] = [];
  private technologyCatalog: Record<string, any>[] = [];
  private governmentCatalog: Record<string, any>[] = [];

  constructor(game: Game) {
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
