import { WebSocket } from "ws";
import { ServerEvents } from "./Events";
import { Game } from "./Game";
import { City } from "./city/City";
import { Unit } from "./unit/Unit";
import { InGameState } from "./state/type/InGameState";

/**
 * Represents a player in the game.
 */
export class Player {
  /** The name of the player. */
  private name: string;
  /** The WebSocket connection of the player. */
  private wsConnection: WebSocket;
  /** Whether the player has loaded into the game. */
  private loadedIn: boolean;
  /** The callback to execute when the player has loaded into the game. */
  private loadedInCallback: () => void;
  /** The callback to execute when the player resizes their window. */
  private resizeWindowCallback: () => void;
  private requestedNextTurn: boolean;
  private provinceData: Record<string, any>;
  private cities: City[];
  private units: Unit[];
  private currentResearch: string | undefined;
  private researchProgress: number;
  private researchedTechs: Set<string>;
  private selectedGovernmentBranch: string | undefined;

  /**
   * Creates a new player object.
   * @param name The name of the player.
   * @param wsConnection The WebSocket connection of the player.
   */
  constructor(name: string, wsConnection: WebSocket) {
    this.name = name;
    this.wsConnection = wsConnection;
    this.loadedIn = false;
    this.requestedNextTurn = false;
    this.cities = [];
    this.units = [];
    this.currentResearch = undefined;
    this.researchProgress = 0;
    this.researchedTechs = new Set<string>();
    this.selectedGovernmentBranch = undefined;

    // Add event listener for when the player disconnects
    this.wsConnection.on("close", (data) => {
      console.log(name + " quit");
      ServerEvents.call("playerQuit", {}, this.wsConnection);
      Game.getInstance().getPlayers().delete(this.name);

      // Send playerQuit data to other connected players
      for (const player of Array.from(Game.getInstance().getPlayers().values())) {
        if (player === this) {
          continue;
        }
        player.sendNetworkEvent({ event: "playerQuit", playerName: this.name });
      }
    });

    // Add event listener for when the player has loaded into the game
    ServerEvents.on({
      eventName: "loadedIn",
      parentObject: this,
      callback: (data, websocket) => {
        if (this.wsConnection != websocket) return;

        this.loadedIn = true;
        this.loadedInCallback.call(undefined);
      },
      globalEvent: true
    });

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

  /**
   * Instruct all players to zoom onto a specified location.
   * @param x The x coordinate of the location.
   * @param y The y coordinate of the location.
   * @param zoomAmount The zoom amount to apply.
   */
  public static allZoomOnto(x: number, y: number, zoomAmount: number) {
    for (let player of Game.getInstance().getPlayers().values()) {
      player.zoomToLocation(x, y, zoomAmount);
    }
  }

  /**
   * Registers a callback to execute when the player has loaded into the game.
   * @param callback The callback function to execute.
   */
  public onLoadedIn(callback: () => void) {
    this.loadedInCallback = callback;
  }

  public onResizeWindow(callback: () => void) {
    this.resizeWindowCallback = callback;
  }

  public setRequestedNextTurn(value: boolean) {
    this.requestedNextTurn = value;
  }

  public hasRequestedNextTurn() {
    return this.requestedNextTurn;
  }

  public setProvinceData(provinceData: Record<string, any>) {
    this.provinceData = provinceData;
  }

  /**
   * Send a network packet to instruct the client to zoom onto a specified location.
   * @param x The x coordinate of the location.
   * @param y The y coordinate of the location.
   * @param zoomAmount The zoom amount to apply.
   */
  public zoomToLocation(x: number, y: number, zoomAmount: number) {
    this.sendNetworkEvent({
      event: "zoomToLocation",
      x: x,
      y: y,
      zoomAmount: zoomAmount
    });
  }

  /**
   * Sends a network event to the player.
   * @param event The network event to send.
   */
  public sendNetworkEvent(event: Record<string, any>) {
    this.wsConnection.send(JSON.stringify(event));
  }

  /**
   * Returns the name of the player.
   * @returns The name of the player.
   */
  public getName(): string {
    return this.name;
  }

  /**
   * Returns the WebSocket connection of the player.
   * @returns The WebSocket connection of the player.
   */
  public getWebsocket() {
    return this.wsConnection;
  }

  public isLoadedIn() {
    return this.loadedIn;
  }

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

  /**
   * Checks for exsting city names, and returns the next available city name.
   */
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

  public getCities() {
    return this.cities;
  }

  public getUnits() {
    return this.units;
  }

  public addUnit(unit: Unit) {
    this.units.push(unit);
  }

  public removeUnit(unit: Unit) {
    this.units = this.units.filter((u) => u !== unit);
  }

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

  public selectGovernmentBranch(branchId: string) {
    // ponytail: getGovernmentBranchById lands on InGameState in Task 4; cast bridges the gap until then, drop it once that method exists.
    const branchData = (Game.getInstance().getCurrentStateAs<InGameState>() as any).getGovernmentBranchById(
      branchId
    );
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
}
