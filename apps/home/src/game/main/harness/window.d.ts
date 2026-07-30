// The interaction harness's only test-specific surface (docs/adr/0001) —
// set by interaction-harness.astro, read by interaction/*.spec.ts. Every
// method returns plain data (never a GameTileHex/Unit class instance) so it
// survives Playwright's evaluate() serialization boundary intact.
declare global {
  interface Window {
    __test?: {
      getTileScreenPositionBySection: (
        sectionName: string
      ) => { x: number; y: number } | null;
      getUnitSectionByOwner: (ownerId: string) => string | null;
      isSectionOccupied: (sectionName: string) => boolean;
      destroyWorld: () => void;
    };
  }
}

export {};
