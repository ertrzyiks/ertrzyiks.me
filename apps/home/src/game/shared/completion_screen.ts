import { Container, Graphics, Rectangle, Text, type DestroyOptions } from "pixi.js";

// Why this exists: spec 08's "Stage Completed State" — "After the final
// stage, the game displays an end screen and accepts no further gameplay
// input." Unlike DialogBox (spec 07), there is nothing to resume to once
// this is shown: no `onComplete`, no per-line advance, no dismissal. It stays
// up for the rest of the session.
//
// Same full-screen-overlay shape as DialogBox (screen-space, not the game
// viewport, with its own interactive backdrop) so the two read as one visual
// language, but the backdrop here never advances anything on tap — it exists
// purely to swallow clicks so the board underneath can't be interacted with.
// The owner (MainWorld) already stops driving turns before showing this; the
// backdrop is the same "second line of defence" DialogBox's own comment
// describes.
//
// Unlike DialogBox's few-second lifetime, this stays up for the rest of the
// session — long enough that a window resize while it's showing is a real
// scenario, not a theoretical one, so (like GameViewport) it re-lays-out on
// "resize" rather than freezing its screen-space dimensions at construction.
export class CompletionScreen extends Container {
  private static readonly WIDTH = 640;
  private static readonly HEIGHT = 160;
  private static readonly MARGIN = 32;

  private backdrop = new Graphics();
  private panel = new Container();

  constructor(message: string) {
    super();

    this.backdrop.eventMode = "static";
    // No handler: taps are swallowed, not advanced anywhere.
    this.addChild(this.backdrop);

    const bg = new Graphics();
    bg.roundRect(0, 0, CompletionScreen.WIDTH, CompletionScreen.HEIGHT, 12);
    bg.fill({ color: 0x1a1a2e, alpha: 0.95 });
    bg.stroke({ width: 2, color: 0x4ad66a, alpha: 1 });
    this.panel.addChild(bg);

    const bodyText = new Text({
      text: message,
      style: {
        fontSize: 20,
        fill: 0xffffff,
        fontFamily: "Arial",
        align: "center",
        wordWrap: true,
        wordWrapWidth: CompletionScreen.WIDTH - CompletionScreen.MARGIN * 2,
      },
    });
    bodyText.anchor.set(0.5, 0.5);
    bodyText.position.set(CompletionScreen.WIDTH / 2, CompletionScreen.HEIGHT / 2);
    this.panel.addChild(bodyText);

    this.addChild(this.panel);

    this.layout();
    this.onResize = this.onResize.bind(this);
    this.on("added", () => window.addEventListener("resize", this.onResize));
    this.on("removed", () => window.removeEventListener("resize", this.onResize));
  }

  private onResize() {
    this.layout();
  }

  private layout() {
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    this.backdrop.clear();
    this.backdrop.rect(0, 0, screenW, screenH);
    this.backdrop.fill({ color: 0x000000, alpha: 0.6 });
    this.backdrop.hitArea = new Rectangle(0, 0, screenW, screenH);

    this.panel.position.set(
      (screenW - CompletionScreen.WIDTH) / 2,
      (screenH - CompletionScreen.HEIGHT) / 2
    );
  }

  destroy(options?: DestroyOptions | boolean) {
    window.removeEventListener("resize", this.onResize);
    super.destroy(options);
  }
}
