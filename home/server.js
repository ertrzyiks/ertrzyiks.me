const path = require('path')
const webpack = require('webpack')
const middleware = require('webpack-dev-middleware')
const webpackConfig = require('./webpack.config.js')
const compiler = webpack(webpackConfig)
const express = require('express')
const app = express()

const instance = middleware(compiler, {
  publicPath: '/'
})

app.use(instance)

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
  res.send({
    levels: ['board1']
  })
})

app.get('/levels/:name', (req, res) => {
  const name = req.params.name
  res.sendFile(path.resolve(`./src/game/main/boards/${name}.json`))
})

app.put('/levels/:name', (req, res) => {
  const name = req.params.name
  res.sendFile(path.resolve(`./src/game/main/boards/${name}.json`))
})

app.listen(1234, () => {
  console.log('Example app listening on port 1234!')
  require('opn')('http://localhost:1234')
})
