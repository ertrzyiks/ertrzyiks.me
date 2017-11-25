---
title: Introduction to the BDD c(o)urse
permalink: introduction-to-the-bdd-c-o-urse
updated: '2017-06-05 19:23:13'
date: 2017-02-27 20:51:44
tags: 
  - bdd-course 
  - javascript
  - testing
featured_image: /content/2017/terminal.jpg
---

As I wrote in the [I do not write tests] article, my favourite testing stack is [Mocha] with [Sinon] and [Chai]. 
Why? 
Each of the libraries is focused on a specific problem, they are highly customizable and their big community provides many add-ons and integrations. This makes them a truly universal stack.
<!-- more -->

## Mocha

is a testing framework. It is responsible for the structure of test suites and lets you execute them. You can select from various interfaces to define suites. 
My favourite is the `bdd` interface, which allows wrapping test cases in blocks using `describe`, `context` and `it` functions. 
You may prefer to structure your test suite with a plain object and there is the `exports` interface for you. 

All interfaces provide lifecycle hooks `before` and `after`, which are helpful in setting up and cleaning up your tests. It is possible to present test results using one of the built-in reporters or you can write your own. You can easily get a pretty human-readable output, but if you need to feed some robots instead you can change it to a JSON report.

As I said I'm a fan of the BDD interface, so my spec files usually look like this:

```javascript
describe('Util', function () {
  describe('#getFour', function () {
    it('returns a number 4', function () {
      .....
    }) 
  })
})
```

Mocha has many useful features and [some of them are documented](http://mochajs.org/#table-of-contents). 
The most important thing to know is that a test is considered failed if it throws an exception, while it passes otherwise. Also, an exception thrown in the hook body will mark a whole related section as failed. 

## Chai
is an assertion library. It means it will throw an exception unless our expectations are met.
As it was the case with Mocha, there are a few usage patterns here as well. 

You can a choose straightforward `assert` approach, where each expectation is a single function call: 

```javascript
assert.equal(obj.id, 5)
```

Personally, I prefer the sentence-like syntax provided by the `should`/`expect` style. Chaining keywords can lead to a very descriptive code:

```javascript
expect(obj).to.have.property('id').equal(5)
```

Additionally, the more context you pass to the expression, the better error message you will get.

There is a bunch of add-ons to `chai`, which add new matchers or integrations with other libraries, e.g. [chai-jquery] for making assertions with jquery, so it's always a good idea to look for one for any frameworks you are using.

## Sinon
is responsible for verifying function calls and isolating tested components from external dependencies. 

You can use a `Spy` to gather information about function calls: e.g. what the arguments passed in were or what value was returned. 

```javascript
function MyClass(){}

MyClass.prototype.doAction = function (name) { 
  // some code here
}

var myObject = new MyClass()
sinon.spy(myObject, 'doAction')

myObject.doAction('delete')

console.log(myObject.doAction.called) // true
console.log(myObject.doAction.calledWith('delete')) // true
console.log(myObject.doAction.calledWith('edit')) // false
```


A `Stub` isolates a function or method and gives us control over its alternative behavior. For example, you can stub a method which talks to the browser API like `window.localStorage`, which allows you to run unit tests even without firing up an actual browser.

An example of a stub:
```javascript
function MyClass(){}

MyClass.prototype.getMyValue = function () { 
  window.localStorage.getItem('myKey')
}

var myObject = new MyClass()

// Stub an instance method
sinon.stub(myObject, 'getMyValue')
myObject.getMyValue.returns('foo!')

// and use the stubbed class responding with given data
var myValue = myObject.getMyValue()
console.log(myValue) // 'foo!'
```

Integrating Chai with Sinon allows us to write easily readable specs even for complex code.

```javascript
spy = sinon.spy()
object.on('my-event', spy)
object.fire('my-event', {foo: 'bar'})

expect(spy).to.have.been.calledWith(foo: 'bar'})
```

## Altogether

To demonstrate all of them talking to one another I invited Tommy The Runner (yup, that thing with a guitar logo below) to help. 
It will show you some snippets of code with specs in more readable format and allow you to execute test suites immediately in your browser. First load an exercise and then hit the Run button to see it clicking.

<!--TOMMY mocha-chai-sinon YMMOT-->

Tommy promised to be with us during the whole course.

[I do not write tests]: http://blog.ertrzyiks.me/i-do-not-write-tests/
[Mocha]: https://mochajs.org/
[Sinon]: http://sinonjs.org/
[Chai]: http://chaijs.com/
[chai-jquery]: (https://github.com/chaijs/chai-jquery)
