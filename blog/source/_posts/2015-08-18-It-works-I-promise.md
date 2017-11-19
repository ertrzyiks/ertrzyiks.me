---
title: 'It works, I promise'
date: 2015-08-18 19:26:11
tags: javascript
---

With javascript it's quite common to experience uncommon things. Sometimes it's about wrong parameters, something is undefined or we write totally invalid code using valid syntax. Moreover asynchronous code gives us headache when nesting goes beyond two or three levels.
<!-- more -->

Using **Promises** arranges async code quite well and provides a great error handling opportunity, but there is a catch. Or not even one.


## Server side renderer
We had a great plan to render a pretty error page. The issue was simple: setup the library, call the render method and in case of a problem render an error page. We ended up with something like this:

```js
var q = require('q');

q.all(listOfThingsToDo)
    .then(function () {
        render(null, component);
    })
    .catch(function (err) {
        render(err);
    });
```

An important part is that we used the `q` library to get callback when the library setup is done.

## Another catch
During a struggle with a strange error we noticed a yet unexplored code path, when even the second render call fails and it's impossible to display the page. However, it still should throw an exception to the console with a beautiful message and an ugly stack trace. We had nothing though.

But hey! We are in the Promised Land. One more catch will surely be enough.

```js
.catch(function (err) {
    render(err);
})
.catch(function (err) {
   console.log('Exception', err);
});
```

... Nope. Still nothing. 

I feel like [The Spanish Inquisition](https://res.cloudinary.com/dx4fgzy3q/image/upload/v1439321371/joazv8fj14wvviiflwjx.png) ASCII art thrown to the terminal would be more expected than this.

Aware of the hopelessness of this attempt, we decide to add a good old try catch there.

```js
.catch(function (err) {
    try {
        render(err);
    }
    catch(e) {
        console.log('THIS IS AN EXCEPTION!', e);
    }
})
.catch(function (err) {
   console.log('Exception', err);
});
```

Unreasonable, but exception just found its way out and the message informs about a syntax error somewhere in the main part of the project. It was about time! 

Let's just take it one step further:

```js
.catch(function (err) {
    try {
        render(err);
    }
    catch(e) {
        throw e;
    }
})
.catch(function (err) {
   console.log('Exception', err);
});
```

Success! Catching error just to throw it again as walkaround is not something we want in code. However we got what we need, `catch` method of Promise receive exception object and each execution path is covered.

## The root of evil
After a quick digging into the problem we found out that the library methods which return promises use `es-promise` implementation, not `q`. Replacing the original `q.all` with `Promise.all` does the trick. No more *catch-try-catch-catch* construction!

That reminds me of what an old man I respect used to say: 
*- When you look for trouble, mix up some Promise libraries, boy*
