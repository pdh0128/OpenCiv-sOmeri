import { Game } from "../../Game";
import { ServerEvents } from "../../Events";
import { Player } from "../../Player";
import { State } from "../State";
import fs from "fs";
import random from "random";
import YAML from "yaml";

let playerIndex = 1;

export class LobbyState extends State {
  private playableProvinces: Record<string, any>[];

  public onInitialize() {
    console.log("Lobby state initialized");
    playerIndex = 1;

    // Load available provinces from config file
    const provinceYAMLData = YAML.parse(fs.readFileSync("./config/provinces.yml", "utf-8"));
    //Convert provinceData from YAML to JSON:
    this.playableProvinces = JSON.parse(JSON.stringify(provinceYAMLData.provinces));

    ServerEvents.on({
      eventName: "connection",
      parentObject: this,
      callback: (data, websocket) => {
        // Initialize player name
        const playerName = "Player" + playerIndex;
        playerIndex++;

        console.log(playerName + " has joined the lobby");

        const newPlayer = new Player(playerName, websocket);
        Game.getInstance().getPlayers().set(playerName, newPlayer);

        // Send playerJoin data to other connected players
        for (const player of Array.from(Game.getInstance().getPlayers().values())) {
          player.sendNetworkEvent({
            event: "playerJoin",
            playerName: playerName
          });
        }

        newPlayer.sendNetworkEvent({ event: "setScene", scene: "lobby" });
      }
    });

    ServerEvents.on({
      eventName: "availableProvinces",
      parentObject: this,
      callback: (_, websocket) => {
        const player = Game.getInstance().getPlayerFromWebsocket(websocket);
        const playableProvinces = [];

        //Extract name and icon_name from playableProvinces:
        for (const province of this.playableProvinces) {
          playableProvinces.push({ name: province.name, icon_name: province.icon_name });
        }

        player.sendNetworkEvent({
          event: "availableProvinces",
          provinces: playableProvinces
        });
      }
    });

    ServerEvents.on({
      eventName: "provinceInfo",
      parentObject: this,
      callback: (data, websocket) => {
        const player = Game.getInstance().getPlayerFromWebsocket(websocket);

        // Get province from this.playableProvinces JSON list:
        const province = this.getProvinceByName(data["name"]);

        if (province) {
          player.sendNetworkEvent({
            event: "provinceInfo",
            name: province.name,
            icon_name: province.icon_name,
            start_bias_desc: province.start_bias_desc,
            unique_unit_descs: province.unique_unit_descs,
            unique_building_descs: province.unique_building_descs,
            ability_descs: province.ability_descs
          });
        }
      }
    });

    ServerEvents.on({
      eventName: "selectProvince",
      parentObject: this,
      callback: (data, websocket) => {
        const player = Game.getInstance().getPlayerFromWebsocket(websocket);
        //TODO: Check if this province is already selected.

        const province = this.getProvinceByName(data["name"]);
        player.setProvinceData(province);

        Game.getInstance()
          .getPlayers()
          .forEach((gamePlayer) => {
            gamePlayer.sendNetworkEvent({
              event: "selectProvince",
              name: province.name,
              playerName: player.getName(),
              provinceData: province
            });
          });
      }
    });
  }

  public getProvinceByName(name: string) {
    let province = undefined;
    for (const p of this.playableProvinces) {
      if (p.name === name) {
        province = p;
      }
    }

    return province;
  }

  public onDestroyed() {
    //Assign players w/o a province a non-assigned random province:
    Game.getInstance()
      .getPlayers()
      .forEach((player) => {
        if (!player.getProvinceData()) {
          player.setProvinceData(this.getRandomNonAssignedProvince());
        }
      });

    return super.onDestroyed();
  }

  private getRandomNonAssignedProvince(): Record<string, any> {
    const assignedProvinces = [];
    Game.getInstance()
      .getPlayers()
      .forEach((player) => {
        if (player.getProvinceData()) {
          assignedProvinces.push(player.getProvinceData());
        }
      });
    const nonAssignedProvinces = this.playableProvinces.filter((province) => {
      return !assignedProvinces.includes(province);
    });

    //Pick random non-assigned province:
    const randomIndex = random.int(0, nonAssignedProvinces.length - 1);
    return nonAssignedProvinces[randomIndex];
  }
}
