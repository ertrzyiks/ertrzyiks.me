const express = require('express')
const app = express()

app.use('/', express.static('.git-deploy'))

app.listen(1234, () => {
  console.log('Example app listening on port 1234!')
  require('opn')('http://localhost:1234')
})
