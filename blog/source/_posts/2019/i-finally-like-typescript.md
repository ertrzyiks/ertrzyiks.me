---
title: I finally like Typescript
permalink: i-finally-like-typescript
updated: '2019-11-23 20:01:14'
date: 2019-11-23 20:01:14
featured_image: /content/2019/typescript.jpeg
---

When I started using Typescript instead of plain Javascript I felt
like it slows me down and kills the joy from programming.
I'm not talking about the learning curve, it's about the kind of code
I was writing.

<!-- more -->

## First steps

My previous experience with static typing was languages like C++ or Java.
Object-oriented programming was the main type programming I used with them.
When I've started with Typescript I also had urge to pack all my
code in classes. I was under impression that all the power of types
comes from carefully prepared classes and communication between objects.
An interface was to me something that provides bridge between different
implementations.

Classes, however useful in many cases, became first-class citizens in my
implementations. I felt obliged to come up with a perfect OOP structure
for my code. Not a single piece of code was allowed in my mind to be just
a function - when needed I put them as static methods of some class, obviously.
That wasn't really my style when I was working with Javascript.
I used to create classes only when I needed to couple some state with methods
and I somehow thought I'm not supposed to keep my coding style with Typescript.

## The game

My first project in Typescript was a game I wanted to put as a easter egg
on my personal website. The progress so far is miserable and with the current
pace it won't be released until 2030, that's for sure. Anyway, I wanted
to make different type of units controlled to be part of the game world.
Some of them would be stationary, some of them could move. Some of them could
cause damage, some of them would be peaceful as a poodle (as long as they are very peaceful).
Composition for the winning, I said to myself. That lead to some research
and I found a very promising approach. The code looked like this:

```ts
export interface IMovable extends Unit {
  canMove(): boolean
  step(cost: number): void
}

export function Movable<TBase extends Constructor<Unit>>(Base: TBase, baseMovementPoints: number) {
  return class extends Base implements IMovable {
    protected movementPoints: number = 0

    canMove() {
      return this.movementPoints > 0
    }

    step(cost: number) {
        // ...
    }
  }
}
```

What happens there:
 - introduce an interface `IMovable` which has properties and methods
 - function Movable takes a base class and some extra options as parameters
 - function Movable returns a new, dynamically created class that implements `IMovable` interface

The idea was that all behaviors would be implemented in a similar manner, so if
a unit is able to both move and attack,

```ts
const Warrior = Attacking(Movable(Unit, 100))

const myWarrior = new Warrior()
```

Putting this all together turned out to be a massive pain though. I spent
a lot of time thinking about the proper way to merge behaviors, find tricky ways
to deal with dynamically created classes and what was the biggest motivation
killer I didn't like to work on that code at all.

## Alternative

After a few weeks of attempts to make it enjoyable again I gave up on
object-oriented programming. It's not my cup of tea, especially not for
front-end code. What I really wanted to have is a regular object like:

```ts
const myWarrior = {
  armor: 20,
  health: 100,
  attack: 10,
  move: 5,
}
```

and then have some functions that updates it. Surprisingly to me,
it's a totally legit approach in Typescript and I can still benefit from
static types. What I found extremely helpful is using interfaces for plain
objects.


Wanna see if the unit still can move?

```ts
function canMove(unit: {move: number}) {
  return unit.move > 0
}
```

Wanna see if the unit is still alive?

```ts
function isAlive(unit: {health: number}) {
  return unit.health > 0
}
```

How about taking the damage?

```ts
function takeDamage<T extends { health: number }>(unit: T, value: number ): T {
    return {
      ...unit,
      health: unit.health - value
    }
}
```


All those 3 functions above can be called on my warrior object. This approach
allowed me to finally enjoy writing Typescript. I get benefits of static typing
and I can keep my prefered coding style.

I also started to like interfaces, but when used for objects instead of classes:
```ts
interface IMovable {
  move: number
}

function canMove(unit: IMovable) {
  return unit.move > 0
}
```
