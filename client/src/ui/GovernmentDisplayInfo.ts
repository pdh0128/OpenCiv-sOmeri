import { GameImage } from "../Assets";
import { Game } from "../Game";
import { AbstractPlayer } from "../player/AbstractPlayer";
import { NetworkEvents, WebsocketClient } from "../network/Client";
import { Actor } from "../scene/Actor";
import { ActorGroup } from "../scene/ActorGroup";
import { Button } from "./Button";
import { Label } from "./Label";
import { ListBox } from "./Listbox";

export class GovernmentDisplayInfo extends ActorGroup {
  private player: AbstractPlayer;
  private currentBranchLabel: Label;
  private branchCatalog: Record<string, any>[];

  constructor(player: AbstractPlayer, x: number, y: number, width: number, height: number) {
    super({ x: x, y: y, z: 6, width: width, height: height, cameraApplies: false });

    this.player = player;
    this.branchCatalog = [];

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

    listbox.addCategory("정부");

    const currentRow = listbox.addRow({
      category: "정부",
      text: this.describeCurrentBranch(),
      textX: listbox.getNextRowPosition().x + 8,
      centerTextY: true,
      rowHeight: 30
    });
    this.currentBranchLabel = currentRow.getLabel();

    NetworkEvents.on({
      eventName: "availableGovernmentBranches",
      parentObject: this,
      callback: (data: any) => {
        this.branchCatalog = data["branches"];
        this.renderBranchList(listbox);
      }
    });

    NetworkEvents.on({
      eventName: "updateGovernmentBranch",
      parentObject: this,
      callback: () => {
        this.currentBranchLabel.setText(this.describeCurrentBranch());
      }
    });

    WebsocketClient.sendMessage({ event: "availableGovernmentBranches" });

    this.addActor(listbox);
  }

  private describeCurrentBranch(): string {
    const selected = this.player.getSelectedGovernmentBranch();
    if (!selected) {
      return "선택된 분과 없음";
    }

    const branch = this.branchCatalog.find((b) => b["id"] === selected);
    return branch ? `현재: ${branch["name"]}` : `현재: ${selected}`;
  }

  private renderBranchList(listbox: ListBox) {
    const selected = this.player.getSelectedGovernmentBranch();

    for (const branch of this.branchCatalog) {
      const marker = branch["id"] === selected ? "✓ " : "";

      const selectButton = new Button({
        text: "선택",
        x: listbox.getNextRowPosition().x + listbox.getWidth() - 70,
        y: listbox.getNextRowPosition().y + 4,
        width: 60,
        height: 30,
        fontColor: "white",
        onClicked: () => {
          WebsocketClient.sendMessage({ event: "selectGovernmentBranch", branchId: branch["id"] });
        }
      });

      listbox.addRow({
        category: "정부",
        text: `${marker}${branch["name"]} (+${branch["bonus_percent"]}% ${branch["stat"]})`,
        textX: listbox.getNextRowPosition().x + 8,
        centerTextY: true,
        rowHeight: 38,
        actorIcons: [selectButton]
      });
    }
  }

  public onDestroyed(): void {
    super.onDestroyed();
    NetworkEvents.removeCallbacksByParentObject(this);
  }
}
