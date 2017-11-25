hexo.extend.filter.register('template_locals', function(locals){
    if (!locals.page) return locals
    if (locals.page.tag != 'bdd-course') return locals
    if (!locals.page.posts) return locals

    locals.page.posts = locals.page.posts.reverse()

    return locals
});
