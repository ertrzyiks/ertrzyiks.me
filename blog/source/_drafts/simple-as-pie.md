---
title: 4. Simple - as pie
permalink: 4-simple-as-pie
updated: '2017-08-21 21:26:57'
date: 2016-12-10 11:50:47
---

Importing SinonJS to your spec code lifts them to a whole new level. Spies and stubs are a crucial part of unit testing and this article will show how to make a spy work for us.

## Plain spy
A spy is a function that tracks history of its calls. Let’s start with a basic spy:

```js
var mySpy = sinon.spy()
```

It’s is an empty function (no operation) and once created, we can say only that it has not been called. 

```js
expect(mySpy.called).to.be.false
```

Let’s call it and know we have more things to say:

```js
mySpy()
expect(mySpy.called).to.be.true
expect(mySpy.calledOnce).to.be.true
```

Add one more call and we have

```js
mySpy(‘Hello’)
expect(mySpy.called).to.be.true
expect(mySpy.calledTwice).to.be.true
expect(mySpy.calledWith(‘Hello’)).to.be.true
```

And one more call with a context modified by `call`

```js
var me = {}
mySpy.call(me, ‘Hello’)
expect(mySpy.called).to.be.true
expect(mySpy.calledThrice).to.be.true
expect(mySpy.calledOn(me)).to.be.true
```

We can also compare an order of execution between two spies:

```js
let anotherSpy = sinon.spy()
anotherSpy()
expect(mySpy.calledBefore(anotherSpy)).to.be.true
expect(anotherSpy.calledAfter(mySpy)).to.be.true
```

Using a spy in this form is useful in specs for any code following publisher-subscriber pattern. This is not a coincidence, in JS world we have a lot of event-based systems.

## Spy with a side effect

You can pass a function as a first argument of `spy`. Such spy will still collect all information about calls plus it will execute passed function every time a spy is called.

It may be useful when there are specific requirements for the function, for example, it is supposed to call a callback to continue a chain of asynchronous operations:

```js
var mySpy = sinon.spy(function (err, next) {
  next()
})
doSomeAsynchrounousMagic(mySpy)
expect(mySpy.called).to.be.true
```

## Spy on an object method

The last option is to wrap an object method with a spy. The target method will be replaced with its spied copy.

```js
var mySpy = sinon.spy($, 'ajax')
$.ajax({ url: '/some-url' }).then(function () {
  expect(mySpy.called).to.be.true
})
```

Note that the original implementation of `$.ajax` function will be used and an HTTP request will be actually issued.

Since we modified a globally accessible variable `$`, which is not recreated before each test we need to clean up after a spy. To do that, call a `restore` method of a spy. An example approach:

```js
beforeEach(function () {
  this.mySpy = sinon.spy($, 'ajax')
})
afterEach(function () {
  this.mySpy.restore()
})
```

As the `$.ajax` has been overridden by a spy you can notice that `this.mySpy` holds the reference to `$.ajax`.  The code above can be simplified:

```js
beforeEach(function () {
  sinon.spy($, 'ajax')
})
afterEach(function () {
  $.ajax.restore()
})
```
