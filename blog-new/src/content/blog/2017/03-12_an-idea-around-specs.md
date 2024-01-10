---
title: 1. An idea around specs
permalink: an-idea-around-specs/
updated: '2017-06-05 19:20:12'
date: 2017-03-12 11:47:17
tags: 
  - bdd-course 
  - javascript
  - testing
featured_image: /content/2017/confusion.jpg
---


My intention is to create a practical guide to writing specs. More important than knowing how is knowing why to write specs.
<!-- more -->

There are several benefits of covering your code with specs. For me, the most important one is that it allows you to follow a Red-Green-Refactor development cycle. 

## 1. Red-Green-Refactor
First of all, you need to write the specifications - a set of preconditions and expectations from the code. The implementation should satisfy all of the expectations and only them. As the specs are ready and the code is not, running specs will first result in a failure. That's the Red phase.
 
Then our ultimate goal is for all checks to pass. During this stage, we can forget about all the good habits and clean code rules. We can hard code some parts of the implementation, use shortcuts and tricks just to cover all specified use cases. 
Once this is done, we are in the Green phase. We know exactly what needs to be done and what changes are required to achieve our goal. This approach prevents us from spending lots of time on improving code that in the end will not work. 
It's also a good moment to commit your changes if you are using any version control system. If something goes wrong you can always go back to the working version and rethink the strategy.

During the last phase, you can clean up all the hacky shortcuts. We want to keep all checks green, but this time with the final, high-quality code version. It's the Refactor phase.

Let's say you need a function which returns HTML code for an action button. We need to be able to apply a CSS class for the rendered element. Try to implement that function in a way that covers all the requirements. At this stage, you don't need to care about code quality, so feel free to hack your way through to the green specs!

{% tommy_example render-action-button %}

For the purpose of the refactor phase, I've prepared a utility function for rendering an HTML string. Feel free to copy it and rework your solution to make use of it. 

{% tommy_example render-html-element %}

When you read this you most likely have completed the green and refactor phases. Good job!

## 2. Documentation
Along the way, you might have noticed a bonus role of specs: they can serve as a documentation. To find out how a part of you application works you can read specs to see common usages. It's living because with a little effort the specs will always reflect the current state of the code.

This point is extremely important if look at an open source project. You may find many poorly documented libraries around and they can be still useful as long as you can walk through `spec/` folder and see many examples of how to use the code. I even found myself in the situation when writing a spec to 3rd party library was the best way to check if my code does not work because of the bug in the library or I use it incorrectly.

## 3. A safe change
Making safe changes might be considered a part of Red-Green-Refactor approach, but sometimes it's hard to follow that convention. It may happen that the code you need to change is already written and has no specs because of tight schedule or lack of determination from the author. By a safe change I mean introducing a new feature or a bugfix without breaking code in other place. Even in a small project, it's hard to manually test everything each time. Before I touch a single line of untested code I'm about to modify, I cover it with specs to be sure that it works exactly the same way with and without my changes.

## That's it?
Once again, what I see as a major value it gives: 

- improved development process with red, green and refactor phases, 
- is a living documentation,
- is an automated bug catcher

and it definitely is not an unpleasant duty. That list may be different / expanded for you of course. You may improve your coding skills by writing the code easy to test (it usually means that is well separated). You may notice your increased productivity and that you spend fewer hours on fixing regressions.
