const fs = require('fs')
const path = require('path')

// Add .static file to the root to make use of https://github.com/dokku/buildpack-nginx
hexo.extend.filter.register('after_generate', function () {
  fs.writeFileSync(path.join(__dirname, '..', 'public', '.static'), '')
});
