const fs = require('fs')
const path = require('path')
const webpack = require('webpack')
const middleware = require('webpack-dev-middleware')
const webpackConfig = require('./webpack.config.js')
const compiler = webpack(webpackConfig)
const express = require('express')
const mkdirp = require('mkdirp')
const app = express()

const instance = middleware(compiler, {
  publicPath: '/'
})

app.use(instance)
app.use(express.json())

app.use('/assets', express.static('src/assets'))

app.get('/editor', (req, res) => {
  res.sendFile(path.resolve('./src/editor.html'))
})

app.get('/', (req, res) => {
  instance.waitUntilValid(() => {
    res.send(instance.fileSystem.readFileSync(path.resolve('.git-deploy/index.html')).toString())
  })
})

app.get('/levels', (req, res) => {
  const jsonFiles = fs.readdirSync('./src/game/main/boards/').filter(fileName => fileName.match(/\.json$/i))
  res.send({
    levels: jsonFiles.map(fileName => fileName.substr(0, fileName.length - 5))
  })
})

app.get('/levels/:name', (req, res) => {
  const name = req.params.name
  res.sendFile(path.resolve(`./src/game/main/boards/${name}.json`))
})

app.put('/levels/:name', (req, res) => {
  const name = req.params.name
  const filePath = path.resolve(`./src/game/main/boards/${name}.json`)
  fs.writeFileSync(filePath, JSON.stringify(req.body || {}))

  const assetsFolder = path.resolve(`./src/assets/${name}`)
  const assetsPath = path.resolve(`${assetsFolder}/files.txt`)
  const allTextures = (req.body.tiles || []).reduce((list, item) => {
    if (!list.includes(item.textureName)) {
      return list.concat(item.textureName)
    }

    return list
  }, [])

  mkdirp.sync(assetsFolder)
  fs.writeFileSync(assetsPath, allTextures.map(name => `${name}.png`).join('\n'))

  res.sendFile(filePath)
})

app.listen(1234, () => {
  console.log('Example app listening on port 1234!')
  require('opn')('http://localhost:1234')
})
