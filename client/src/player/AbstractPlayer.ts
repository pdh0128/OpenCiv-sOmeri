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

  public static getPlayerByName(name: string) {
    const players = Game.getInstance().getCurrentSceneAs<InGameScene>().getPlayers();
    for (const player of players) {
      if (player.getName() === name) {
        return player;
      }
    }

    return undefined;
  }

  public getName(): string {
    return this.name;
  }

  public setName(name: string) {
    this.name = name;
  }

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

  protected units: Unit[] = [];

  public addUnit(unit: Unit) {
    this.units.push(unit);
  }

  public removeUnit(unit: Unit) {
    this.units = this.units.filter((u) => u !== unit);
  }

  public getUnits() {
    return this.units;
  }

  protected cities: City[] = [];

  public addCity(city: City) {
    this.cities.push(city);
  }

  public removeCity(city: City) {
    this.cities = this.cities.filter((c) => c !== city);
  }

  public getCities() {
    return this.cities;
  }
}
