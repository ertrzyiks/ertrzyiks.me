import { Container, Graphics, Rectangle, Text } from "pixi.js";
import type { DialogLine } from "../core/narrative";

// Why this exists: spec 07 requires a modal dialog that pauses all game input,
// shows one line at a time, advances on a single player input per line, and
// resumes the game only after the final line is dismissed. This is the reusable
// presentation half — the narrative engine (core) decides *what* to show; this
// shows it and reports back when the player has read every line.
//
// It is fully self-contained: a screen-space overlay (not in the game viewport)
// with its own full-screen interactive backdrop that swallows clicks, so the
// board underneath cannot be interacted with while a dialog is open. The owner
// (MainWorld) still gates board input on a flag as a second line of defence.
export class DialogBox extends Container {
  private lineIndex = 0;
  private speakerText: Text;
  private bodyText: Text;
  private hintText: Text;

  private static readonly WIDTH = 640;
  private static readonly HEIGHT = 160;
  private static readonly MARGIN = 32;

  constructor(
    private readonly lines: DialogLine[],
    private readonly onComplete: () => void
  ) {
    super();

    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    // Full-screen backdrop: dims the board and captures every pointer tap so it
    // never reaches the tiles beneath. Advancing the dialog is a tap anywhere.
    const backdrop = new Graphics();
    backdrop.beginFill(0x000000, 0.35);
    backdrop.drawRect(0, 0, screenW, screenH);
    backdrop.endFill();
    backdrop.eventMode = "static";
    backdrop.hitArea = new Rectangle(0, 0, screenW, screenH);
    backdrop.on("pointertap", () => this.advance());
    this.addChild(backdrop);

    const panelX = (screenW - DialogBox.WIDTH) / 2;
    const panelY = screenH - DialogBox.HEIGHT - 48;

    const panel = new Container();
    panel.position.set(panelX, panelY);

    const bg = new Graphics();
    bg.beginFill(0x1a1a2e, 0.95);
    bg.lineStyle(2, 0x4aadd6, 1);
    bg.drawRoundedRect(0, 0, DialogBox.WIDTH, DialogBox.HEIGHT, 12);
    bg.endFill();
    panel.addChild(bg);

    this.speakerText = new Text("", {
      fontSize: 20,
      fontWeight: "bold",
      fill: 0x4aadd6,
      fontFamily: "Arial",
    });
    this.speakerText.position.set(DialogBox.MARGIN, 20);
    panel.addChild(this.speakerText);

    this.bodyText = new Text("", {
      fontSize: 18,
      fill: 0xffffff,
      fontFamily: "Arial",
      wordWrap: true,
      wordWrapWidth: DialogBox.WIDTH - DialogBox.MARGIN * 2,
    });
    this.bodyText.position.set(DialogBox.MARGIN, 52);
    panel.addChild(this.bodyText);

    this.hintText = new Text("click to continue ▶", {
      fontSize: 13,
      fill: 0x8888aa,
      fontFamily: "Arial",
    });
    this.hintText.anchor.set(1, 1);
    this.hintText.position.set(
      DialogBox.WIDTH - 16,
      DialogBox.HEIGHT - 12
    );
    panel.addChild(this.hintText);

    this.addChild(panel);

    this.renderLine();
  }

  private renderLine() {
    const line = this.lines[this.lineIndex];
    this.speakerText.text = line.speaker ?? "";
    this.bodyText.text = line.text;
    // Nudge the body up when there is no speaker so it stays vertically centred.
    this.bodyText.position.y = line.speaker ? 52 : 36;
    // Hide the "continue" hint on the final line so the player knows it closes.
    const isLast = this.lineIndex === this.lines.length - 1;
    this.hintText.text = isLast ? "click to close ▪" : "click to continue ▶";
  }

  // One player input advances exactly one line (spec 07). After the last line is
  // dismissed the dialog signals completion; the owner resumes the game.
  private advance() {
    this.lineIndex += 1;
    if (this.lineIndex >= this.lines.length) {
      this.onComplete();
      return;
    }
    this.renderLine();
  }
}
