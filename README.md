# ertrzyiks.me

## Installation

You need NodeJS 6.x or newer.

To install all dependencies run:
```
npm install
```

## Home (ertrzyiks.me)

To start local server watching for changes run:
```
cd home
npm start
```

### Deployment
```
cd home
npm run deploy
```

## Blog (blog.ertrzyiks.me)

It's a [Hexo](https://hexo.io/) blog with a custom theme.

To start local server watching for changes run:

```
cd blog
npm run build:prod
npm run deploy
```

### Deployment

It uses Hexo's git deployment feature, [see](https://hexo.io/docs/deployment.html#Git).
Make sure you have access to `dokku` user on the destination Dokku server and run:

```
cd blog
npm start
```
