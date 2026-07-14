import { GameImage, SpriteRegion } from "../Assets";
import { Game } from "../Game";
import { NetworkEvents } from "../network/Client";
import { InGameScene } from "../scene/type/InGameScene";
import { Actor } from "../scene/Actor";
import { ActorGroup } from "../scene/ActorGroup";
import { EraTransitionToast } from "./EraTransitionToast";
import { GovernmentDisplayInfo } from "./GovernmentDisplayInfo";
import { IdealsDisplayInfo } from "./IdealsDisplayInfo";
import { Label } from "./Label";
import { ResearchDisplayInfo } from "./ResearchDisplayInfo";

const ERA_STATUS_LABELS: Record<string, string> = {
  golden: "황금",
  dark: "암흑",
  normal: "평시"
};

export class StatusBar extends ActorGroup {
  private statusBarActor: Actor;
  private researchDisplayInfo: ResearchDisplayInfo;
  private governmentDisplayInfo: GovernmentDisplayInfo;
  private idealsDisplayInfo: IdealsDisplayInfo;
  private idealsButtonLabel: Label;
  private eraStatusLabel: Label;

  private currentTurnText: string; //when currentTurnLabel may not be initalized yet
  private currentTurnLabel: Label;

  private scienceDescLabel: Label;
  private scienceIcon: Actor;
  private scienceLabel: Label;

  private cultureDescLabel: Label;
  private cultureIcon: Actor;
  private cultureLabel: Label;

  private goldDescLabel: Label;
  private goldIcon: Actor;
  private goldLabel: Label;

  private faithDescLabel: Label;
  private faithIcon: Actor;
  private faithLabel: Label;

  private tradeDescLabel: Label;
  private tradeIcon: Actor;
  private tradeLabel: Label;

  constructor() {
    super({
      x: 0,
      y: 0,
      z: 5,
      width: Game.getInstance().getWidth(),
      height: 21,
      cameraApplies: false
    });

    this.generateActors();
    // Wait until this async method is done

    NetworkEvents.on({
      eventName: "newTurn",
      parentObject: this,
      callback: (data) => {
        this.updateCurrentTurnLabel(data);
      }
    });

    NetworkEvents.on({
      eventName: "turnTimeDecrement",
      parentObject: this,
      callback: (data) => {
        this.updateCurrentTurnLabel(data);
      }
    });

    NetworkEvents.on({
      eventName: "updateEraStatus",
      parentObject: this,
      callback: (data: any) => {
        if (this.eraStatusLabel) {
          this.eraStatusLabel.setText(`시대: ${ERA_STATUS_LABELS[data["eraStatus"]] ?? data["eraStatus"]}`);
        }
      }
    });

    NetworkEvents.on({
      eventName: "eraTransition",
      parentObject: this,
      callback: (data: any) => {
        Game.getInstance().getCurrentScene().addActor(new EraTransitionToast(data["eraStatus"], 300));
      }
    });
  }

  private updateCurrentTurnLabel(data: JSON) {
    const text = `Turns: ${data["turn"]} (${data["turnTime"]}s)`;

    if (!this.currentTurnLabel) {
      this.currentTurnText = text;
    } else {
      this.currentTurnLabel.setText(text);
      this.currentTurnLabel.conformSize().then(() => {
        this.currentTurnLabel.setPosition(Game.getInstance().getWidth() - this.currentTurnLabel.getWidth() - 1, 3);
      });
    }
  }

  private async generateActors() {
    this.statusBarActor = new Actor({
      image: Game.getInstance().getImage(GameImage.SPRITESHEET),
      spriteRegion: SpriteRegion.UI_STATUSBAR,
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height
    });
    this.addActor(this.statusBarActor);

    //Science Information
    this.scienceDescLabel = new Label({
      text: "Science:",
      font: "16px serif",
      fontColor: "white",
      onClick: () => {
        const scene = Game.getInstance().getCurrentSceneAs<InGameScene>();

        if (this.researchDisplayInfo) {
          scene.removeActor(this.researchDisplayInfo);
          this.researchDisplayInfo = undefined;
          return;
        }

        this.researchDisplayInfo = new ResearchDisplayInfo(
          scene.getClientPlayer(),
          Game.getInstance().getWidth() / 2 - 216,
          Game.getInstance().getHeight() / 2 - 220,
          432,
          440
        );
        scene.addActor(this.researchDisplayInfo);
      }
    });
    await this.scienceDescLabel.conformSize();
    this.scienceDescLabel.setPosition(this.x + 1, 3);
    this.addActor(this.scienceDescLabel);

    this.scienceIcon = new Actor({
      image: Game.getInstance().getImage(GameImage.SPRITESHEET),
      spriteRegion: SpriteRegion.SCIENCE_ICON,
      x: this.scienceDescLabel.getX() + this.scienceDescLabel.getWidth(),
      y: -6,
      width: 32,
      height: 32
    });

    this.addActor(this.scienceIcon);

    this.scienceLabel = new Label({
      text: "+0",
      font: "16px serif",
      fontColor: "white"
    });
    await this.scienceLabel.conformSize();
    this.scienceLabel.setPosition(this.scienceIcon.getX() + this.scienceIcon.getWidth() - 6, 3);
    this.addActor(this.scienceLabel);

    // Culture information
    this.cultureDescLabel = new Label({
      text: "Culture:",
      font: "16px serif",
      fontColor: "white",
      onClick: () => {
        const scene = Game.getInstance().getCurrentSceneAs<InGameScene>();

        if (this.governmentDisplayInfo) {
          scene.removeActor(this.governmentDisplayInfo);
          this.governmentDisplayInfo = undefined;
          return;
        }

        this.governmentDisplayInfo = new GovernmentDisplayInfo(
          scene.getClientPlayer(),
          Game.getInstance().getWidth() / 2 - 216,
          Game.getInstance().getHeight() / 2 - 220,
          432,
          440
        );
        scene.addActor(this.governmentDisplayInfo);
      }
    });
    await this.cultureDescLabel.conformSize();
    this.cultureDescLabel.setPosition(this.scienceLabel.getX() + this.scienceLabel.getWidth() + 10, 3);
    this.addActor(this.cultureDescLabel);

    this.cultureIcon = new Actor({
      image: Game.getInstance().getImage(GameImage.SPRITESHEET),
      spriteRegion: SpriteRegion.CULTURE_ICON,
      x: this.cultureDescLabel.getX() + this.cultureDescLabel.getWidth(),
      y: -6,
      width: 32,
      height: 32
    });

    this.addActor(this.cultureIcon);

    this.cultureLabel = new Label({
      text: "+0",
      font: "16px serif",
      fontColor: "white"
    });
    await this.cultureLabel.conformSize();
    this.cultureLabel.setPosition(this.cultureIcon.getX() + this.cultureIcon.getWidth() - 6, 3);
    this.addActor(this.cultureLabel);

    //Gold information
    this.goldDescLabel = new Label({
      text: "Gold:",
      font: "16px serif",
      fontColor: "white"
    });
    await this.goldDescLabel.conformSize();
    this.goldDescLabel.setPosition(this.cultureLabel.getX() + this.cultureLabel.getWidth() + 10, 3);
    this.addActor(this.goldDescLabel);

    this.goldIcon = new Actor({
      image: Game.getInstance().getImage(GameImage.SPRITESHEET),
      spriteRegion: SpriteRegion.GOLD_ICON,
      x: this.goldDescLabel.getX() + this.goldDescLabel.getWidth(),
      y: -6,
      width: 32,
      height: 32
    });

    this.addActor(this.goldIcon);

    this.goldLabel = new Label({
      text: "+0",
      font: "16px serif",
      fontColor: "white"
    });
    await this.goldLabel.conformSize();
    this.goldLabel.setPosition(this.goldIcon.getX() + this.goldIcon.getWidth() - 6, 3);
    this.addActor(this.goldLabel);

    //Faith information

    this.faithDescLabel = new Label({
      text: "Faith:",
      font: "16px serif",
      fontColor: "white"
    });
    await this.faithDescLabel.conformSize();
    this.faithDescLabel.setPosition(this.goldLabel.getX() + this.goldLabel.getWidth() + 10, 3);
    this.addActor(this.faithDescLabel);

    this.faithIcon = new Actor({
      image: Game.getInstance().getImage(GameImage.SPRITESHEET),
      spriteRegion: SpriteRegion.FAITH_ICON,
      x: this.faithDescLabel.getX() + this.faithDescLabel.getWidth(),
      y: -6,
      width: 32,
      height: 32
    });

    this.addActor(this.faithIcon);

    this.faithLabel = new Label({
      text: "+0",
      font: "16px serif",
      fontColor: "white"
    });
    await this.faithLabel.conformSize();
    this.faithLabel.setPosition(this.faithIcon.getX() + this.faithIcon.getWidth() - 6, 3);
    this.addActor(this.faithLabel);

    //Trade information
    this.tradeDescLabel = new Label({
      text: "Trade:",
      font: "16px serif",
      fontColor: "white"
    });
    await this.tradeDescLabel.conformSize();
    this.tradeDescLabel.setPosition(this.faithLabel.getX() + this.faithLabel.getWidth() + 10, 3);
    this.addActor(this.tradeDescLabel);

    this.tradeIcon = new Actor({
      image: Game.getInstance().getImage(GameImage.SPRITESHEET),
      spriteRegion: SpriteRegion.TRADE_ICON,
      x: this.tradeDescLabel.getX() + this.tradeDescLabel.getWidth() + 10,
      y: 2,
      width: 16,
      height: 16
    });

    this.addActor(this.tradeIcon);

    this.tradeLabel = new Label({
      text: "0/0",
      font: "16px serif",
      fontColor: "white"
    });
    await this.tradeLabel.conformSize();
    this.tradeLabel.setPosition(this.tradeIcon.getX() + this.tradeIcon.getWidth() + 4, 3);
    this.addActor(this.tradeLabel);

    // Five ideals information
    this.idealsButtonLabel = new Label({
      text: "오지(五志):",
      font: "16px serif",
      fontColor: "white",
      onClick: () => {
        const scene = Game.getInstance().getCurrentSceneAs<InGameScene>();

        if (this.idealsDisplayInfo) {
          scene.removeActor(this.idealsDisplayInfo);
          this.idealsDisplayInfo = undefined;
          return;
        }

        this.idealsDisplayInfo = new IdealsDisplayInfo(
          scene.getClientPlayer(),
          Game.getInstance().getWidth() / 2 - 216,
          Game.getInstance().getHeight() / 2 - 220,
          432,
          440
        );
        scene.addActor(this.idealsDisplayInfo);
      }
    });
    await this.idealsButtonLabel.conformSize();
    this.idealsButtonLabel.setPosition(this.tradeLabel.getX() + this.tradeLabel.getWidth() + 10, 3);
    this.addActor(this.idealsButtonLabel);

    // Era status information (read-only)
    this.eraStatusLabel = new Label({
      text: "시대: 평시",
      font: "16px serif",
      fontColor: "white"
    });
    await this.eraStatusLabel.conformSize();
    this.eraStatusLabel.setPosition(this.idealsButtonLabel.getX() + this.idealsButtonLabel.getWidth() + 10, 3);
    this.addActor(this.eraStatusLabel);

    // Current turn information
    this.currentTurnLabel = new Label({
      text: this.currentTurnText,
      font: "16px serif",
      fontColor: "white"
    });
    await this.currentTurnLabel.conformSize();
    this.currentTurnLabel.setPosition(Game.getInstance().getWidth() - this.currentTurnLabel.getWidth() - 1, 3);
    this.addActor(this.currentTurnLabel);
  }
}
