import { GameImage } from "../Assets";
import { Game } from "../Game";
import { AbstractPlayer } from "../player/AbstractPlayer";
import { NetworkEvents, WebsocketClient } from "../network/Client";
import { Actor } from "../scene/Actor";
import { ActorGroup } from "../scene/ActorGroup";
import { Button } from "./Button";
import { Label } from "./Label";
import { ListBox } from "./Listbox";

export class ResearchDisplayInfo extends ActorGroup {
  private player: AbstractPlayer;
  private currentResearchLabel: Label;
  private techCatalog: Record<string, any>[];

  constructor(player: AbstractPlayer, x: number, y: number, width: number, height: number) {
    super({ x: x, y: y, z: 6, width: width, height: height, cameraApplies: false });

    this.player = player;
    this.techCatalog = [];

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

    listbox.addCategory("연구");

    const currentResearch = this.player.getCurrentResearch();
    const currentRow = listbox.addRow({
      category: "연구",
      text: currentResearch ? `${currentResearch} (${this.player.getResearchProgress()})` : "연구 중인 기술 없음",
      textX: listbox.getNextRowPosition().x + 8,
      centerTextY: true,
      rowHeight: 30
    });
    this.currentResearchLabel = currentRow.getLabel();

    NetworkEvents.on({
      eventName: "availableTechnologies",
      parentObject: this,
      callback: (data: any) => {
        this.techCatalog = data["technologies"];
        this.renderResearchableList(listbox);
      }
    });

    NetworkEvents.on({
      eventName: "updateResearchQueue",
      parentObject: this,
      callback: (data: any) => {
        const tech = data["currentResearch"];
        this.currentResearchLabel.setText(tech ? `${tech} (${data["progress"]})` : "연구 중인 기술 없음");
      }
    });

    WebsocketClient.sendMessage({ event: "availableTechnologies" });

    this.addActor(listbox);
  }

  private renderResearchableList(listbox: ListBox) {
    const researched = new Set(this.player.getResearchedTechs());

    for (const tech of this.techCatalog) {
      if (researched.has(tech["id"])) continue;

      const prereqsMet = (tech["prerequisites"] as string[]).every((id) => researched.has(id));
      if (!prereqsMet) continue;

      const researchButton = new Button({
        text: "연구",
        x: listbox.getNextRowPosition().x + listbox.getWidth() - 70,
        y: listbox.getNextRowPosition().y + 4,
        width: 60,
        height: 30,
        fontColor: "white",
        onClicked: () => {
          WebsocketClient.sendMessage({ event: "queueResearch", techId: tech["id"] });
        }
      });

      listbox.addRow({
        category: "연구",
        text: `${tech["name"]} (${tech["research_cost"]})`,
        textX: listbox.getNextRowPosition().x + 8,
        centerTextY: true,
        rowHeight: 38,
        actorIcons: [researchButton]
      });
    }
  }

  public onDestroyed(): void {
    super.onDestroyed();
    NetworkEvents.removeCallbacksByParentObject(this);
  }
}
