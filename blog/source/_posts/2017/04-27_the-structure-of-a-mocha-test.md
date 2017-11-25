---
title: 2. The structure of a mocha test
permalink: 2-the-structure-of-a-mocha-test
updated: '2017-06-05 19:20:40'
date: 2017-04-27 18:23:23
tags: 
  - bdd-course 
  - javascript
  - testing
featured_image: /content/2017/blocks.jpg
---

As I said in [the introduction](/introduction-to-the-bdd-c-o-urse) you can select one of the various available interfaces. My favourite is BDD and this is the interface I'm going to present here. The main goal of this interface is to help you write specs as grammatically correct sentences.
<!-- more -->

## It block

The `it` block wraps a single test case. The word 'it' refers to the test subject, which is usually a single function or a class. The block function `it` takes two parameters: a string with a description of a scenario and a callback function. 

The usage of the description depends on the reporter you chose. The default `spec` reporter just prints it to the console with an appropriate color: green when it passes, red when it fails. The callback function will be called during the test suite execution. If this call __throws an exception__, the test case will be marked as a failure. It is marked as a success otherwise (well, it's not that simple, but we will get to it later).

See the example:

{% tommy_example the-structure-basic-example %}

There is an alias function `specify`, which may be useful when having the word `it` as a part of the test suite sentence doesn't make sense.

### Assert library

The example above does not present the most convenient way to define test cases. It would be much easier with an assert library. There is a bunch of them around, all of them throw the exception for you. The difference is the programming interface and the quality of error messages. That subject will be covered by a separate article coming soon.

## Describe block

The `describe` block provides a meaningful description of the tested subject and splits test cases into groups. Those blocks can be nested, so you can start with a top level description of the object or class and then increase precision within each block.

We have an alias for the `describe` block as well. It's the `context` function. You can use it to, well, whatever works for you. Semantically, the context presents the same subject, but in different conditions. It may be used to create testing conditions common for all test cases inside.

Here is an example of using the `describe` and the `context` blocks to specify a divide operation:

{% tommy_example the-structure-blocks-example %}

## Hooks

Hooks allow you to inject some code into the test suite lifecycle. All hooks are created in the scope of the current block and are triggered also for all nested blocks. Hook callbacks are called in the test suite object context, so you can assign custom properties to `this` and then read from it in test suites. Note that custom properties are passed only down the tree. You can't pass any value to an upper-level block. 

You can also use variables created with `var` in the block functions' body. This is the only working way if you want to use ES6 arrow functions `() => {}` since they override function call context and you won't be able to access the test suite object through `this`.

Sharing code between test cases can sometimes break their isolation. In particular, it's very important to have the same test environment before and after running a test suite. First of all, recreate all shared data for every test suite. Even if you need a plain JS object with configuration, it's better to have a fresh copy of that object for each test case to prevent potential side effects from messing with the results. In most cases, you would prefer `beforeEach` over `before` event as it reduces chances of one test interfering with another.

The other misuse of hooks is making them fat or (even worse) conditional. Do not force yourself to use hooks. Sometimes to avoid duplication it's better to extract a helper function, put it at the top of a spec file and call it in a few related `it` blocks.

{% tommy_example the-structure-hooks-example %}

## Async

All block functions above are synchronous. They are called and Mocha immediately has feedback about the result. In the javascript world, it's common to wait for asynchronous code to return and it's supported by the testing framework as well. 

To make a block asynchronous, accept at least one parameter in the block callback. In this case, Mocha will pass in a callback function and will postpone the verdict until you call it. It works like that for the `it` block and all `before*`/`after*` hooks. There is no direct way to mark the `describe` and `context` blocks as asynchronous: they become such automatically when they contain asynchronous test cases or hooks.

```js
describe('my function', function () {
   beforeEach(function (done){
      setTimeout(done, 1000) // wait a second
   })

   it('should behave like this', function (done) {
      setTimeout(done, 1000) // and another second
   })
})
```

An asynchronous spec goes red when between execution start and calling `done` callback there is any uncaught error. It is also red when a test suite is explicitly marked as failed by passing an error object as the first parameter of the `done` callback. Finally, a test is red when the completion of asynchronous code takes longer than the configured timeout.

Alternatively, instead of accepting the callback function in the test suite you can return a Promise object. The test will be red if that Promise is rejected.

## Extras

Block functions have two useful additions. One is the possibility of ignoring a selected suite or case by prefixing the function name with the letter `x`. You can use `xit`, `xdescribe` and `xcontext` functions respectively to define pending test blocks or just temporarily disable them in the development process. Alternatively, you can use `it.skip`, `decribe.skip` and `context.skip`. Finally, you can call `this.skip()` function inside a block function body, but at the moment of writing this is [buggy](https://github.com/mochajs/mocha/issues/2546) and I don't recommend using it.

The next useful option is limiting test execution to a single suite or case. This time, you need to add `.only` to the block function like `it.only`, `describe.only` and `context.only`.

Starting from Mocha version 2.4.1 there is also `it.retries`, which can be used to retry failed specs. It's intended only for development, like debugging flakiness of a test.
