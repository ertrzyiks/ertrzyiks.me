import { Application, Container, Point } from "pixi.js";
// Force-include Text's CanvasTextPipe registration (extensions.add), which
// this project's production bundler (Rolldown) tree-shakes away despite
// pixi.js's package.json marking scene/text/init as side-effectful — see the
// debug investigation on the End Turn button issue. Without this, every
// PixiJS Text in the built app silently renders nothing (no error: the
// pixi.js@8.19.0 patch here defensively skips any renderable whose
// renderPipeId has no matching registered pipe).
import "pixi.js/text";
import TWEEN from "@tweenjs/tween.js";
import { create as createIntro } from "./intro";
import { GameViewport } from "./shared/viewport";

const main = () => import("./main");

// PixiJS v8: the renderer/ticker/stage aren't ready until the async init()
// resolves (the sync constructor-with-options pattern is deprecated and no
// longer actually initializes anything). Memoized so `initialize()` — called
// again each time the intro replays via reinitialize() — only inits once.
const app = new Application();
let appReady: Promise<void> | null = null;

function ensureAppReady(): Promise<void> {
  if (!appReady) {
    appReady = app
      .init({
        backgroundAlpha: 0,
        resolution: window.devicePixelRatio,
      })
      .then(() => {
        app.ticker.add(() => {
          TWEEN.update();
        });
        window.addEventListener("resize", resize);
      });
  }
  return appReady;
}

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

  if (!document.body.contains(app.canvas)) {
    const el = document.getElementById("game");
    // @ts-ignore
    el.parentNode.replaceChild(app.canvas, el);
  }

  app.start();
  app.canvas.style.display = "";

  viewport.emitter.on("exit", () => {
    close();
  });

  return viewport;
};

const loadMain = async function (app: Application) {
  const mainModule = await main();

  return mainModule.create(app);
};

function close() {
  app.stop();
  app.canvas.style.display = "none";
  // app.loader.reset();

  // No `texture`/`textureSource` here: board/units/intro sprites read from
  // the shared, Assets-managed atlases `preload()` loads once per page
  // session (aliased "board1"/"units"/"intro") — destroying a
  // TextureSource that way (rather than via Assets.unload()) leaves
  // Assets' own cache still pointing at the now-destroyed GPU resource, so
  // every future preload() on this page (reinitialize() below always
  // triggers one) resolves to a broken texture instead of reloading it.
  // That's a permanent, session-wide break, not just this viewport's —
  // matches the same reasoning main/stage_manager.ts's teardown already
  // documents for the exact same class of shared atlas.
  while (app.stage.children[0]) {
    const child = app.stage.children[0] as GameViewport;
    app.stage.removeChild(child);
    child.destroy({ children: true });
  }

  reinitialize();
}

function reinitialize() {
  initGame().then((startingPoint) =>
    initialize(startingPoint.x, startingPoint.y)
  );
}

function fadeOut(viewport: Container) {
  let state = { alpha: 1 };
  return new Promise<void>((resolve) => {
    const tween = new TWEEN.Tween(state, true)
      .to({ alpha: 0 }, 700)
      .onUpdate(() => {
        viewport.alpha = state.alpha;
      })
      .onComplete(() => resolve());

    tween.start();
  });
}

export async function initialize(x: number, y: number) {
  await ensureAppReady();
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
