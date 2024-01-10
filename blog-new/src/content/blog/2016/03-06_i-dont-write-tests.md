---
title: I do not write tests
permalink: i-do-not-write-tests/
updated: '2017-06-05 19:22:18'
date: 2016-03-06 17:40:09
tags: 
  - javascript
  - testing
featured_image: /content/2016/should-swim.jpg
---

and i'm proud of it.

I've spent plenty years on coding, invested a lot of time in developing products, wrote thousands of lines of code and all that without writing a single unit test. I felt skilful, productive and effective at my job. Of course I made many mistakes, but as long as they were easy to fix I treated them as a side effect of my work.
<!-- more -->

Later on, I got interested in nodejs, started writing my own (never published) packages. In the pursuit of perfection I read code of the open sourced projects. I was copying setups and adapting them to my own modules. That's how I wrote my first unit test.

I totally understood why it's useful to cover a package with tests. Some people trust you enough to npm-install your module and it would be nice to keep that trust even after the next release. Still, it felt so redundant when I was asked to write tests for my feature in frontend project. That was backbone app, tested with Jasmine.

I spent like two hours on implementing my feature and four more on writing tests for it. Hey, I've finished my task long time ago! Now I'm wasting time on something totally unnecessary. Today I can name a few problems I had to tackle on my way to take advantage of unit testing and I see others dealing with them as well.

## 1. I don't need tests
No, you don't. What you need is specification (spec in short). Test written after code checks that it works like it was implemented. Spec describes how code should behave, before it lands in a text editor.

There are a few benefits of such approach:

* your code is tested against actual requirements, 
* once specs are green, you can safely refactor code (red-green-refactor approach)
* you implemented enough to fulfil requirements, didn't waste time on code which may be never used

I remember this great feeling when I added new feature to my webapp using specs and at the end of the day for the first time opened web browser. It just worked. I clicked the button, got ajax request and then nice feedback message.

## 2. What should I spec?

That was my other problem. What if I use new framework. I don't know how to do my task with it yet, how am I supposed to write specs for my feature?

Initially I thought that a good idea is to omit specs for such cases and start writing them starting from second encounter with given framework / library. Later on I found an answer a way better, which works for me: I try not to depend on framework internals in specs at all. The application in the end communicates with an external, well known resource. I mean, it usually reads or writes to the hard drive, connects with database, uses http protocol or manipulates DOM. You can ignore the fact that your framework uses model, service, store, event bus as long as effect of some action is requesting given URL with given parameters. 

My answer contains *try* because it's not always possible to completely cut dependencies on a framework. For example, if you work with Backbone view, you will need to find out that it uses `el` property to operate on DOM. In such cases I would create util helper to wrap framework specific code and exclude it visually from spec code.

Recently I've worked on API in nodejs using `hapi` framework. I considered going back to `express`, because of lack of support for library I needed. After quick review I realised that we could replace our http framework without changing specs at all. Our expectations could stay untouched, because we specified interaction between http request and our internal datasources instead of relying on `hapi` mechanisms.

## 3. What tool should I use?

Another barrier was lack of knowledge of testing frameworks. Let's go back to my first impression about the extra work added to an already accomplished goal. I think I spent so many hours on writing test, because I had no idea how to use my testing framework. Even when I got familiar with available methods it was difficult to find out which method I should use for given case. 

What I could recommend right now is first to choose one framework and get familiar with its api. I think [Jasmine](http://jasmine.github.io/) is good for start, as it's easily configurable and complete. My personal choice is [Mocha](https://mochajs.org/) with [Chai](http://chaijs.com/) and [Sinon](http://sinonjs.org/), but this testing stack requires a little more code. 
I would avoid webdriver at the beginning and rather use [jsdom](https://github.com/tmpvar/jsdom) if you need browser support.

The second thing is to read specs included in some open source projects, like for the [nunjucks parser](https://github.com/mozilla/nunjucks/blob/master/tests/parser.js). It will give you a better picture on how to write expectations. 

## Summary

Once I found my favourite testing stack and learned how to use it's components, practiced enough to be able to start writing specs before actual implementation of feature and failed on writing tests which were deeply linked to framework internals. I can take advantage of a Test-driven Development. My mistakes are now improperly specified features, writing tests is part of coding time and when I see my test suite green I am confident about quality.

BTW this writing has specs as well, see:
![](/content/2016/specs-run.png)
