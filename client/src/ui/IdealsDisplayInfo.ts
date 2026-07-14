import { GameImage } from "../Assets";
import { Game } from "../Game";
import { AbstractPlayer } from "../player/AbstractPlayer";
import { NetworkEvents } from "../network/Client";
import { Actor } from "../scene/Actor";
import { ActorGroup } from "../scene/ActorGroup";
import { Label } from "./Label";
import { ListBox } from "./Listbox";

const IDEAL_LABELS: Record<string, string> = {
  unity: "통합",
  knowledge: "지식",
  development: "발전",
  order: "질서",
  pioneering: "개척"
};

export class IdealsDisplayInfo extends ActorGroup {
  private player: AbstractPlayer;
  private idealLabels: Map<string, Label>;

  constructor(player: AbstractPlayer, x: number, y: number, width: number, height: number) {
    super({ x: x, y: y, z: 6, width: width, height: height, cameraApplies: false });

    this.player = player;
    this.idealLabels = new Map<string, Label>();

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
      rowHeight: 30,
      textFont: "16px serif",
      fontColor: "white"
    });

    listbox.addCategory("오지(五志)");

    const points = this.player.getIdealPoints();
    for (const ideal of Object.keys(IDEAL_LABELS)) {
      const row = listbox.addRow({
        category: "오지(五志)",
        text: `${IDEAL_LABELS[ideal]}: ${points[ideal] ?? 0}`,
        textX: listbox.getNextRowPosition().x + 8,
        centerTextY: true,
        rowHeight: 30
      });
      this.idealLabels.set(ideal, row.getLabel());
    }

    NetworkEvents.on({
      eventName: "updateIdealPoints",
      parentObject: this,
      callback: (data: any) => {
        const updatedPoints = data["idealPoints"];
        for (const ideal of Object.keys(IDEAL_LABELS)) {
          const label = this.idealLabels.get(ideal);
          if (label) {
            label.setText(`${IDEAL_LABELS[ideal]}: ${updatedPoints[ideal] ?? 0}`);
          }
        }
      }
    });

    this.addActor(listbox);
  }

  public onDestroyed(): void {
    super.onDestroyed();
    NetworkEvents.removeCallbacksByParentObject(this);
  }
}
