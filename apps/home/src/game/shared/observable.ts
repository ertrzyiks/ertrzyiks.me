export type ObservableSubscriptionDone = () => void;
export type ObservableSubscription<T> = (
  item: T,
  done: ObservableSubscriptionDone
) => void;
export type DrainCallback = () => void;

export class Observable<T> {
  protected items: Array<T> = [];
  protected subscriptions: ObservableSubscription<T>[] = [];
  protected isWaiting = false;
  protected nextDrainCallback: DrainCallback | null = null;

  push(item: T) {
    this.items.push(item);
    this.publishNext();
  }

  subscribe(fn: ObservableSubscription<T>) {
    this.subscriptions.push(fn);
    this.publishNext();
  }

  onNextDrain(fn: DrainCallback) {
    if (this.items.length === 0) {
      fn();
    } else {
      this.nextDrainCallback = fn;
    }
  }

  protected publishNext() {
    if (this.items.length === 0) {
      if (this.nextDrainCallback) {
        const callback = this.nextDrainCallback;
        this.nextDrainCallback = null;
        callback();
      }
      return;
    }

    if (this.subscriptions.length === 0) return;
    if (this.isWaiting) return;

    this.isWaiting = true;

    const item = this.items.shift();

    if (!item) return;

    const allSubscriptions = this.subscriptions.map((subscription) => {
      return new Promise<void>((resolve) => subscription(item, resolve));
    });

    Promise.all(allSubscriptions).then(() => {
      this.isWaiting = false;
      this.publishNext();
    });
  }
}
