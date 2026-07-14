import { Game } from "../Game";
import { ActorGroup } from "../scene/ActorGroup";
import { Actor } from "../scene/Actor";
import { Label } from "./Label";

const ERA_LABELS: Record<string, string> = {
  golden: "황금시대",
  dark: "암흑시대",
  normal: "평시"
};

export class EraTransitionToast extends ActorGroup {
  constructor(eraStatus: string, width: number) {
    super({
      x: Game.getInstance().getWidth() / 2 - width / 2,
      y: 40,
      z: 7,
      width: width,
      height: 50,
      cameraApplies: false
    });

    this.addActor(
      new Actor({
        x: this.x,
        y: this.y,
        width: this.width,
        height: this.height,
        color: "rgba(0,0,0,0.75)"
      })
    );

    const label = new Label({
      text: `${ERA_LABELS[eraStatus] ?? eraStatus} 시작!`,
      font: "20px serif",
      fontColor: "white"
    });

    label.conformSize().then(() => {
      label.setPosition(this.x + this.width / 2 - label.getWidth() / 2, this.y + this.height / 2 - label.getHeight() / 2);
      this.addActor(label);
    });

    setTimeout(() => {
      Game.getInstance().getCurrentScene().removeActor(this);
    }, 4000);
  }
}
