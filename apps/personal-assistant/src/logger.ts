// Split out of poller.ts so googleTasksSyncer.ts can use the same Logger/noopLogger without a
// circular import (poller.ts's runPollCycle calls into googleTasksSyncer.ts).

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};
