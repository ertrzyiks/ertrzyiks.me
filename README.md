# ertrzyiks.me

## Installation

You need NodeJS 6.x or newer.

To install all dependencies run:
```
npm install
```

## Blog (blog.ertrzyiks.me)

It's a [Hexo](https://hexo.io/) blog with a custom theme.

To start local server watching for changes run:

```
npm run blog:start
```

### Deployment

It uses Hexo's git deployment feature, [see](https://hexo.io/docs/deployment.html#Git).
Make sure you have access to `dokku` user on the destination Dokku server and run:

```
npm run blog:deploy
```
