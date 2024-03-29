import { Application, DisplayObject, Point } from "pixi.js";
import TWEEN from "@tweenjs/tween.js";
import { create as createIntro } from "./intro";
import { GameViewport } from "./shared/viewport";

const main = () => import("./main");

const app = new Application({
  backgroundAlpha: 0,
  resolution: window.devicePixelRatio,
});
app.ticker.add(() => {
  TWEEN.update();
});

window.addEventListener("resize", resize);

function resize() {
  app.renderer.resize(window.innerWidth, window.innerHeight);
}

function initGame(): Promise<Point> {
  const warriors = document.getElementById("warriors");

  return new Promise((resolve) => {
    function onClick(e: MouseEvent) {
      warriors?.removeEventListener("click", onClick);
      resolve(new Point(e.clientX, e.clientY));
    }
    warriors?.addEventListener("click", onClick);
  });
}

const loadIntro = async (startingPoint: Point) => {
  const viewport = await createIntro(app, startingPoint);
  app.stage.addChild(viewport);
  resize();

  // @ts-ignore
  if (!document.body.contains(app.view)) {
    const el = document.getElementById("game");
    // @ts-ignore
    el.parentNode.replaceChild(app.view, el);
  }

  app.start();
  // @ts-ignore
  app.view.style.display = "";

  viewport.emitter.on("exit", () => {
    close();
  });

  return viewport;
};

const loadMain = async function (app: Application) {
  const mainModule = await main();

  // return mainModule.create(app);
};

function close() {
  app.stop();
  // @ts-ignore
  app.view.style.display = "none";
  // app.loader.reset();

  while (app.stage.children[0]) {
    const child = app.stage.children[0] as GameViewport;
    app.stage.removeChild(child);
    child.destroy({ children: true, texture: true, baseTexture: true });
  }

  reinitialize();
}

function reinitialize() {
  initGame().then((startingPoint) =>
    initialize(startingPoint.x, startingPoint.y)
  );
}

function fadeOut(viewport: DisplayObject) {
  let state = { alpha: 1 };
  return new Promise<void>((resolve) => {
    const tween = new TWEEN.Tween(state)
      .to({ alpha: 0 }, 700)
      .onUpdate(() => {
        viewport.alpha = state.alpha;
      })
      .onComplete(() => resolve());

    tween.start();
  });
}

export async function initialize(x: number, y: number) {
  const viewport = await loadIntro(new Point(x, y));
  const onIntroFinish = new Promise<void>((resolve) => {
    viewport.emitter.on("finish", () => resolve());
  });

  const [newViewport] = await Promise.all([loadMain(app), onIntroFinish]);

  // newViewport.moveCenter(viewport.center)
  app.stage.addChildAt(newViewport, 0);
  await fadeOut(viewport);
  app.stage.removeChild(viewport);
  viewport.destroy();
}
