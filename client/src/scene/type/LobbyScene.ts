import { GameImage, SpriteRegion } from "../../Assets";
import { Game } from "../../Game";
import { NetworkEvents, WebsocketClient } from "../../network/Client";
import { Button } from "../../ui/Button";
import { ListBox } from "../../ui/Listbox";
import { SelectProvinceGroup } from "../../ui/SelectProvinceGroup";
import { Actor } from "../Actor";
import { Scene } from "../Scene";
import { SceneBackground } from "../SceneBackground";

export class LobbyScene extends Scene {
  private selectProvinceGroup: SelectProvinceGroup;

  public onInitialize(): void {
    super.onInitialize();
    this.addActor(SceneBackground.generateRandomGrassland());

    const playerList = new ListBox({
      x: Game.getInstance().getWidth() / 2 - 600 / 2,
      y: 35,
      width: 600,
      height: Game.getInstance().getHeight() - 275,
      rowHeight: 50,
      textFont: "20px serif",
      fontColor: "white"
    });

    this.addActor(playerList);

    this.addActor(
      new Button({
        text: "광역주 선택",
        x: Game.getInstance().getWidth() / 2 - 282 / 2,
        y: playerList.getY() + playerList.getHeight() + 10,
        width: 282,
        height: 62,
        fontColor: "white",
        onClicked: () => {
          if (this.hasActor(this.selectProvinceGroup)) {
            return;
          }

          console.log("Choose province");

          if (!this.selectProvinceGroup || !this.hasActor(this.selectProvinceGroup)) {
            this.selectProvinceGroup = new SelectProvinceGroup(
              playerList.getX() + playerList.getWidth() / 2 - 432 / 2,
              Game.getInstance().getHeight() / 2 - 440 / 2,
              432,
              440
            );
            this.addActor(this.selectProvinceGroup);
          } else {
            this.removeActor(this.selectProvinceGroup);
          }
        },

        disableHoverWhen: () => {
          return this.hasActor(this.selectProvinceGroup);
        }
      })
    );

    this.addActor(
      new Button({
        text: "Ready Up",
        x: Game.getInstance().getWidth() / 2 - 282 / 2,
        y: playerList.getY() + playerList.getHeight() + 75,
        width: 282,
        height: 62,
        fontColor: "white",
        onClicked: () => {
          if (this.hasActor(this.selectProvinceGroup)) {
            return;
          }
          // TODO: Change text of this button & prevent repeated clicks.
          WebsocketClient.sendMessage({ event: "setState", state: "in_game" });
        },

        disableHoverWhen: () => {
          return this.hasActor(this.selectProvinceGroup);
        }
      })
    );

    this.addActor(
      new Button({
        text: "Back",
        x: Game.getInstance().getWidth() / 2 - 282 / 2,
        y: playerList.getY() + playerList.getHeight() + 140,
        width: 282,
        height: 62,
        fontColor: "white",
        onClicked: () => {
          if (this.hasActor(this.selectProvinceGroup)) {
            return;
          }

          Game.getInstance().setScene("join_game");
          //TODO: Disconnect player
        },

        disableHoverWhen: () => {
          return this.hasActor(this.selectProvinceGroup);
        }
      })
    );

    this.updatePlayerList();

    NetworkEvents.on({
      eventName: "playerJoin",
      parentObject: this,
      callback: this.updatePlayerList
    });
    NetworkEvents.on({
      eventName: "playerQuit",
      parentObject: this,
      callback: this.updatePlayerList
    });
    NetworkEvents.on({
      eventName: "playerLeave",
      parentObject: this,
      callback: this.updatePlayerList
    });

    NetworkEvents.on({
      eventName: "connectedPlayers",
      parentObject: this,
      callback: (data) => {
        const players = data["players"];
        const requestingName = data["requestingName"];
        playerList.clearRows();

        for (let i = 0; i < players.length; i++) {
          const playerName = players[i]["name"];
          let provinceIcon = SpriteRegion.UNKNOWN_ICON;
          if ("provinceData" in players[i]) {
            provinceIcon = SpriteRegion[players[i]["provinceData"]["icon_name"]];
          }

          const currentRow = playerList.addRow({
            text: playerName
          });

          currentRow.addActor(
            new Actor({
              image: Game.getInstance().getImage(GameImage.SPRITESHEET),
              spriteRegion: provinceIcon,
              x: currentRow.getX() + 8,
              y: currentRow.getY() - 32 / 2 + currentRow.getHeight() / 2,
              width: 32,
              height: 32
            })
          );

          if (playerName === requestingName) {
            // TODO: Indicate this row is the users player
            currentRow.addActor(
              new Actor({
                image: Game.getInstance().getImage(GameImage.SPRITESHEET),
                spriteRegion: SpriteRegion.STAR,
                x: currentRow.getX() + currentRow.getWidth() - 32 - 8,
                y: currentRow.getY() - 32 / 2 + currentRow.getHeight() / 2,
                width: 32,
                height: 32
              })
            );
          }

          currentRow.conformLabelSize().then(() => {
            currentRow.setLabelPosition(
              currentRow.getX() + 48,
              currentRow.getY() + currentRow.getHeight() / 2 - currentRow.getLabel().getHeight() / 2
            );
          });
        }
      }
    });

    NetworkEvents.on({
      eventName: "selectProvince",
      parentObject: this,
      callback: (data) => {
        for (const row of playerList.getRows()) {
          if (row.getLabel().getText() !== data["playerName"]) {
            continue;
          }

          for (const rowActor of row.getActors()) {
            if (rowActor.getSpriteRegion() === SpriteRegion.STAR) {
              continue;
            }

            rowActor.setSpriteRegion(SpriteRegion[data["provinceData"]["icon_name"]]);
          }
        }
      }
    });
  }

  public onDestroyed(newScene: Scene) {
    const exitReceipt = super.onDestroyed(newScene);
    // Disconnect from the server if we go back, unless were going into the loading scene or reloading this scene.
    if (newScene.getName() !== "loading_scene" && newScene.getName() !== "lobby") {
      WebsocketClient.disconnect();
    }

    return exitReceipt;
  }

  private updatePlayerList() {
    WebsocketClient.sendMessage({ event: "connectedPlayers" });
  }
}
