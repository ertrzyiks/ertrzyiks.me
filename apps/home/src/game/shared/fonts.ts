import "@fontsource/press-start-2p";

// Self-hosted via @fontsource (no runtime request to Google) so the game's
// PixiJS text renders consistently instead of falling back to whatever
// "Arial"-like font (or lack thereof) the browser/OS happens to have — see
// PR #227's End Turn button investigation, where a missing Arial fallback
// silently rendered blank text.
export const GAME_FONT_FAMILY = '"Press Start 2P", Arial, sans-serif';

// PixiJS's Text draws via canvas fillText(), which silently renders blank if
// the browser hasn't actually fetched the font yet — a bare @font-face
// import doesn't force that. Callers must await this before constructing any
// in-game Text.
export async function loadGameFont(): Promise<void> {
  try {
    await document.fonts.load('16px "Press Start 2P"');
  } catch {
    // GAME_FONT_FAMILY's Arial/sans-serif fallback still renders correctly
    // even if the webfont failed to load.
  }
}
