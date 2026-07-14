import { ServerEvents } from "../Events";
import { Game } from "../Game";
import { Player } from "../Player";
import { GameMap } from "../map/GameMap";
import { Tile } from "../map/Tile";
import { InGameState } from "../state/type/InGameState";

export interface CityOptions {
  tile: Tile;
  player: Player;
}

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

  /**
   * Creates a new City instance.
   * @param options - The options for initializing the city.
   * @param options.tile - The tile where the city is located.
   * @param options.player - The player who owns the city.
   */
  constructor(options: CityOptions) {
    this.tile = options.tile;
    this.player = options.player;
    this.name = this.player.getNextAvailableCityName();
    this.buildings = [];
    this.population = 1;
    this.foodSurplus = 0;
    this.currentlyBuilding = undefined;
    this.productionProgress = 0;

    this.territory = [this.tile];
    for (const adjTile of this.tile.getAdjacentTiles()) {
      if (!adjTile) continue;

      this.territory.push(adjTile);
    }
    this.sendTerritoryUpdate();

    this.updateWorkedTiles({ sendStatUpdate: true });

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

  public updateWorkedTiles(options?: { sendStatUpdate: boolean }) {
    // Reset worked tiles
    this.workedTiles = [this.tile];

    // For default focus, find all tiles and get the best tile with the highest yield
    // Note, if our food stat from the current worked tiles is negative, find the tiles with the highest food yeild.
    // If our food stat is positive, find the tiles with the highest total yeild.
    for (let i = 0; i < this.population; i++) {
      const statline = this.getStatline({ asArray: false });
      //TODO: Change default with whatever value the player has set for the city.
      const tileFocus = statline["food"] < 0 ? "food" : "default";
      // Get a tile with the highest food yeild
      const tile = GameMap.getInstance().getTileWithHighestYeild({
        stats: [tileFocus],
        tiles: this.territory,
        ignoreTiles: this.workedTiles
      });

      this.workedTiles.push(tile);
    }

    if (options.sendStatUpdate) {
      this.sendStatUpdate(this.player);
    }
  }

  public addBuilding(name: string) {
    // Get the building data from YML
    const buildingData = Game.getInstance().getCurrentStateAs<InGameState>().getBuildingDataByName(name);

    // Apply any effects to the building if any (faith, culture, bonuses, etc.)):
    //...

    this.buildings.push(buildingData);

    //FIXME: Just append building data to stateUpdate
    // Send new-building packet to player
    this.player.sendNetworkEvent({
      event: "addBuilding",
      cityName: this.name,
      building: buildingData
    });

    this.updateWorkedTiles({ sendStatUpdate: true });
  }

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

  public processProductionTurn() {
    // Intentionally does NOT reset productionProgress: any leftover overflow from a
    // just-completed build should carry forward untouched while the queue sits empty,
    // rather than being discarded. Do not "fix" this into a reset.
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
      this.player.awardIdealPoints("development", 10);
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

  private getGovernmentBonus() {
    const branchId = this.player.getSelectedGovernmentBranch();
    if (!branchId) {
      return undefined;
    }

    return Game.getInstance().getCurrentStateAs<InGameState>().getGovernmentBranchById(branchId);
  }

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

  public getBuildings(): Record<string, any>[] {
    return this.buildings;
  }

  public sendTerritoryUpdate() { }

  /*
  Get the city-stat line, and send it to the player
*/
  public sendStatUpdate(player: Player) {
    const cityStats = this.getStatline({ asArray: true });

    //FIXME: Append building data to stateUpdate
    player.sendNetworkEvent({
      event: "updateCityStats",
      cityName: this.name,
      cityStats: cityStats,
      workedTiles: this.workedTiles.map((tile) => ({ x: tile.getX(), y: tile.getY() }))
    });
  }

  public getStatline(options: { asArray: boolean }) {
    if (options.asArray) {
      const cityStats = [
        {
          population: this.population
        },
        { science: 0 },
        { gold: 0 },
        { production: 0 },
        { faith: 0 },
        { culture: 0 },
        { food: -(this.population * 2) },
        { morale: 0 }, //TODO: Implement morale
        { foodSurplus: this.foodSurplus }
      ];

      // Add all buildings to existing stat-line dictionary
      for (const buildingData of this.buildings) {
        for (const stat of buildingData.stats) {
          const statType = Object.keys(stat)[0]; // Get the stat type, e.g., "science", "gold", etc.
          const statValue = stat[statType]; // Get the stat value

          for (const cityStat of cityStats) {
            if (Object.keys(cityStat)[0] === statType) {
              cityStat[statType] += statValue;
            }
          }
        }
      }


      // Add all worked tiles to existing stat-line dictionary
      console.log(`[City ${this.name}] Updating stats (asArray). Worked tiles: ${this.workedTiles.length}`);
      for (const tile of this.workedTiles) {
        console.log(`[City ${this.name}] Working tile at ${tile.getX()},${tile.getY()}`);
        for (const stat of tile.getStats()) {
          const statType = Object.keys(stat)[0]; // Get the stat type, e.g., "science", "gold", etc.
          const statValue = stat[statType]; // Get the stat value

          if (statValue !== 0) {
            console.log(`[City ${this.name}] Tile yields ${statType}: ${statValue}`);
          }

          for (const cityStat of cityStats) {
            if (Object.keys(cityStat)[0] === statType) {
              cityStat[statType] += statValue;
            }
          }
        }
      }

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

    // If we're not returning an array, return a dictionary
    const cityStats = {
      population: this.population,
      science: 0,
      gold: 0,
      production: 0,
      faith: 0,
      culture: 0,
      food: -(this.population * 2),
      morale: 0, //TODO: Implement morale
      foodSurplus: this.foodSurplus
    };

    // Add all buildings to existing stat-line dictionary
    for (const buildingData of this.buildings) {
      for (const stat of buildingData.stats) {
        const statType = Object.keys(stat)[0]; // Get the stat type, e.g., "science", "gold", etc.
        const statValue = stat[statType]; // Get the stat value

        if (cityStats.hasOwnProperty(statType)) {
          cityStats[statType] += statValue;
        }
      }
    }

    // Add all worked tiles to existing stat-line dictionary
    for (const tile of this.workedTiles) {
      for (const stat of tile.getStats()) {
        const statType = Object.keys(stat)[0]; // Get the stat type, e.g., "science", "gold", etc.
        const statValue = stat[statType]; // Get the stat value

        if (cityStats.hasOwnProperty(statType)) {
          cityStats[statType] += statValue;
        }
      }
    }

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

  public getTile(): Tile {
    return this.tile;
  }

  public getPlayer(): Player {
    return this.player;
  }

  public getName() {
    return this.name;
  }

  public getJSON() {
    const territoryCoords = this.territory.map((tile) => ({
      tileX: tile.getX(),
      tileY: tile.getY()
    }));

    return {
      cityName: this.name,
      player: this.player.getName(),
      tileX: this.tile.getX(),
      tileY: this.tile.getY(),
      territory: territoryCoords,
      workedTiles: this.workedTiles.map((tile) => ({ x: tile.getX(), y: tile.getY() }))
    };
  }
}
