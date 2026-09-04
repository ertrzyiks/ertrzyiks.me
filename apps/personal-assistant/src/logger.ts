// Split out of poller.ts so todoistSyncer.ts can use the same Logger/noopLogger without a
// circular import (poller.ts's runPollCycle calls into todoistSyncer.ts).

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
