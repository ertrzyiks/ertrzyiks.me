---
title: A short journey from cutting edge to legacy
permalink: short-journey-from-cutting-edge-to-legacy
updated: '2017-06-05 19:17:58'
date: 2016-05-17 17:47:38
tags: 
  - devops
  - and stuff
featured_image: /content/2016/journey.jpg
---

Working with the latest technology is challenging not only when you touch it, but even more so when you don't.

I had a pleasure to work with a very dynamic team. Not only our cooperation with clients was changing, but our tooling and coding environment as well. It was a great opportunity to make experiments, so we used it regularly. 
<!-- more -->

## Cutting edge

At one point we decided to give docker a try to improve our deliverables. It promised the same environment on local and production machines with ease. It was about to replace our Vagrant + provisioning setup as a lightweight alternative and have portability as a bonus. 

We spent a week or two on preparing our Macbooks to be able to use docker without native support on OSX. Back then we had no `docker-machine`, even no `boot2docker`. We used some glue, a ducktape, and with such scaffolded local environment successfully developed and released an app to production. Ah yeah, we were even using experimental support for docker images on Amazon EC2 instances. 

I remember one Friday when we were trying to find a walkaround some problem and all resources we found were saying what we wanted was impossible to achieve. The state of our environment could confirm that. Then we saw some streaming from a conference where a guy from docker core was introducing a new docker version. You should have seen our happy faces when he mentioned that the released version includes a solution for our problem. A quick update and we were back on track!

## A legacy

The problem of using new technologies in the early stages of development is that things are changing. When your tool evolves, your project needs to follow to be usable. 
Unfortunately, our dynamic team finished drinking victory champagne and was delegated to start working on a new project. With docker on board of course! In the next months, we saw more and more improvements to the local development and introduced them into our workflow. 
At the same time, our former reason for pride became kind of legacy (just for development, but shhhhhh). It became legacy :( And problematic to start with.

## A journey

As none of the authors had time for supporting the previous project and no one had the will to upgrade the development experience for this project, it became a hot potato. 
Only after one year, I had an opportunity to fix things up. It was interesting to see it becoming 'cool' again. Like (spoiler alert) Pinocchio becoming a boy. Or The Ugly Duckling (and again! c'mon) becoming a swan. Or like Cinderella... Stop! You know what is going on. 

Changing Vagrant based local setup to `docker-compose` was not an issue at all. I removed a few files, added one .yml config and it was done. 
The first real problem was to change the operating system since we used a short-term support version of Ubuntu. Spinning up a container with 14.04 was our first small success. 
Suddenly instead of HTML for the index or any other page, the server returned the content of the PHP file. I figured out that Apaches' FPM configuration changed meanwhile and we included an installation of the latest version of Apache. Yeah, locking the dependency version was crucial here and that was missed for sure. Fortunately, our NodeJS environment became usable after updating all packages to the latest version. This time, our project was locked with a solid [npm shrinkwrap](https://docs.npmjs.com/cli/shrinkwrap). 

It took around one day to solve the major issues with the project dependencies. After next two days, we were ready to deploy. Continuous delivery configured a long time ago was still valid, and pushing a new image to the production server succeeded without any problems. Developers wanting to start with our project were asked to run a single `docker-compose up -d`. Hurray!

## Lessons learned

I would definitely use a cutting edge solution for that project again. The things we learned during development were super useful for all the other projects I had an opportunity to work on. 
What I would have absolutely changed today are dependency locks. Now I appreciate the `composer` or `bundler` built-in behavior to lock version. From now on all my projects will get a proper `npm-shrinkwrap.json`. 
