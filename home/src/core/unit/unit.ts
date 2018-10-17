export class Unit {
  static id = 1
  public id: number

  constructor() {
    this.id = Unit.id++
  }

  replenish() {}
}
