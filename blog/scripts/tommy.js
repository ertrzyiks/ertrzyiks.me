const BASE_URL = process.env.BASE_TOMMY_URL || 'https://tommy-web.ertrzyiks.me/'

hexo.extend.tag.register('tommy_example', function(args){
  const slug = args[0]

  return `
<div class="post-iframe_placeholder--tommy">
  <div class="post-iframe_wrapper--tommy">
    <button class="post-iframe_button--tommy is-hidden" style="display: none;" data-role="load-exercise">Load exercise</button>
    <iframe class="post-iframe--tommy" data-src="${BASE_URL}${slug}" style="width: 100%; height: 600px; border: none;"></iframe>
  </div>
</div>
`
});

hexo.extend.filter.register('after_render:html', function(str){
  const hasTommyExample = str.indexOf('post-iframe_placeholder--tommy') >= 0

  if (hasTommyExample) {
    str = str.replace('</head>', '<link rel="stylesheet" type="text/css" href="/content/assets/css/tommy.css"></head>')
    str = str.replace('</body>', '<script src="/content/assets/js/tommy.js"></script>')
  }

  return str
});
