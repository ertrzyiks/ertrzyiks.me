---
title: How I moved my blog from Ghost to Hexo
permalink: how-i-moved-my-blog-from-ghost-to-hexo
updated: '2017-12-02 19:18:57'
date: 2017-12-02 19:18:57
tags: devops
featured_image: /content/2017/powered.jpg
---

I used to use a self-hosted [Ghost](https://ghost.org/) blogging platform the last two years. I managed to ship it with my own theme and a few applications, even though they were experimental. The version 0.11 is abandoned now as its [LTS support](https://dev.ghost.org/lts/) expired on 20th of March 2017. I also had a lot of problems with updating to the 1.0 branch, so I decided to move on to [Hexo](https://hexo.io/) - a static page generator.

<!-- more -->

### Problems

What did prevent me from migrating to Ghost 1.0? First of all, the database. My favourite PostgreSQL server is no longer supported by Ghost. I was happy with the setup I had and didn't want to apply any changes to the infrastructure which worked well. Ok, ok, I admit that changing the database software was not a technical blocker but rather a friction.

The real blocker was the fact that I used Ghost installed as a node package and it caused a lot of problems with paths, like [this](https://github.com/TryGhost/Ghost/issues/8754). Also my applications didn't work after migration: Suddenly all `require` calls were stubbed and some extra logic was applied there which made all my applications fail to launch. Finally, my theme used custom helpers and you cannot simply activate such themes in the new Ghost [(see)](https://github.com/TryGhost/gscan/pull/91).

### Content

The next step was to migrate my content - 13 posts in total. I exported all data from Ghost to JSON using the built-in exporter. Using [hexo-migrator-ghost](https://www.npmjs.com/package/hexo-migrator-ghost) made the migration easier, but not fully automatic. I used Cloudinary storage, so I had to fix all the URLs of my images.
Timestamps were also not correctly applied and I had to fix the publish date for every post. I had to migrate the tags manually. Also I had custom code to embed Tommy The Runner, but this part of the process is described below.

### Tommy

To make my testing course more enjoyable and engaging I added a simple playground environment a while ago. You can see an example at the bottom of the [Introduction to the BDD c(o)urse](http://localhost:4000/introduction-to-the-bdd-c-o-urse/). This playground is powered by [Tommy The Runner](https://github.com/tommy-the-runner/) and is embedded via slug. It used to be an HTML comment with the id of the exercise in my blog post. With Hexo I embed them using the [Tag Plugin](https://hexo.io/docs/tag-plugins.html). Now it looks like this: 

```js
{% tommy_example mocha-chai-sinon %}
```

And I like it!

### Theme

My custom `nono` theme was written using [Handlebars](http://handlebarsjs.com/). During the migration I converted it to [Pug](https://pugjs.org/api/getting-started.html). For each Ghost variable I had to find a corresponding function in Hexo environment. I expected this part to be the most complicated, but it turned out to be fairly simple.
 
### Still with Dokku

As I'm a happy user of [Dokku](https://github.com/dokku/dokku) since its early stages, I'm not going to drop it anytime soon. To serve the blog I use `hexo generate` to build static files and serve the content using [nginx buildpack](https://github.com/dokku/buildpack-nginx). I had to adjust the default configuration for nginx a bit though. I fixed the redirects by adding: 

```js
port_in_redirect off;
```

Without it all redirects were going to `https://blog.ertrzyiks.me:5000` by default. Also I had to modify the fallback for `try_files` to properly handle 404 errors.

```js
# Original config
try_files $uri $uri/ /index.html; 

# With proper 404
try_files $uri $uri/ /404.html;
```

### That's it

I miss the nice editor I had in Ghost, but other aspects are just better now:

 - Static content is faster
 - Hexo configuration is easy to maintain
 - I have an automatic backup of my posts and assets (in git repository).
