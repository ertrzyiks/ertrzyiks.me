---
title: New life
permalink: new-life/
updated: '2019-08-09 18:13:14'
date: 2019-08-09 18:13:14
featured_image: /content/2019/new-life.jpeg
---

It's been a while since my last post. I was about to write a summary of the
things that happened to me in 2018, but January was too eager to end.
We have August now, but who cares.

<!-- more -->

## Summary of 2018

I finally moved from Kraków to Gdańsk. Air pollution in Kraków was too painful to stay.
Me and my wife had ~600km trip with our stuff in a rented minivan first.
We also used a bunch of parcel packages to move
some of the most important things like a few 100g bags of rice. No food must be wasted.
First we rented an apartment for a year with a plan to finally find our own
place to live. After taking a deep breath on the seaside, juggling our
requirements and wishes about our new perfect home and months of searching through
the offers we finally found it. About the same time we bought an apartment
we discovered a new development and potentially a major event of the upcoming
2019 year - my wife was pregnant.

## New life

To the main topic. It's our first child, hence we took a course on newborn baby care.
Then we started another one. Fully unprepared we picked a hospital,
nurse and we were waiting for it.

They said to go to the hospital when contractions are regular and the interval is under 10min.
First we used a pen and a piece of paper to keep track of them
but it wasn't that handy. Since we carry smartphones everywhere we go,
why not use them. After an hour of hacking, our simple contractions tracking
tool was born: https://ertrzyiks.github.io/interval-meter/
It's basically what you can do with a timer app, but with a better experience.
It turned out the app was of limited use to us. The same evening it was created,
we were on the road to the hospital where after only 5 hours our son was born.

It was three weeks ago. The very first days
I was totally occupied with the boy. I was about to cry, but I had no
time to drink anything so my body had not enough water to produce tears.
It's getting more and more managable. I have time to drink and code even more.

The simple intervalometer app created to support us before the big day
got a twin brother. Our child was extremely sleepy and we had to wake him up for feeding.
It was important to repeat that at least every 3.5h. That way the idea of tracking time between events
was reused to keep track of feeding sessions. This time the app is more sofisticated
since we wanted to share information between devices. The back-end is a graphql
endpoint with SQLite storage. The client uses
[Apollo](https://github.com/apollographql/apollo-client) to connect with the back-end.
I feel like the most complicated part of the app was to adjust Apollo cache
after item's removal. When the deletion mutation is executed, Apollo still
remembers the item on the list view and even though the list is updated, the removed item is still there.
At least our experience is top notch with an almost instant navigation between pages.

## The mural

I live in a district where all buildings have huge murals on them, covering both sides
of the building. One of them hit me on our recent walk. We walked there countless times already,
but this time I actually saw what it shows.

![](/content/2019/mural.jpg)

With both parents being software engineers we are afraid our son may fall into coding as well.
A programmer or not, one thing I wish to share with him is passion to create.
