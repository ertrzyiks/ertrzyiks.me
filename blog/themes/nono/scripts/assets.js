const fs = require('fs')
const path = require('path')

hexo.extend.helper.register('asset_path', function (name) {
  const filename = path.join(__dirname, '..', 'assets.json')
  const jsonString = fs.readFileSync(filename)
  const json = JSON.parse(jsonString)

  if (!json[name]) {
    throw new Error('Can not find asset ' + name)
  }
  return json[name]
})
