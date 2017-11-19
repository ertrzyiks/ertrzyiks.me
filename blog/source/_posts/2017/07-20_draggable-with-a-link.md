---
title: Draggable with a link
permalink: draggable-with-a-link
updated: '2017-07-20 19:44:45'
date: 2017-07-20 16:28:44
tags: snippet
---

## The unwanted behavior

We have a draggable item and a link inside. When a user grabs a link and tries to move it, browsers like Chrome or Firefox provide a default behavior. Thanks to that you can for example move a link to the Bookmarks bar. In our case, it's something we would rather like to avoid.
<!-- more -->

![](https://res.cloudinary.com/dx4fgzy3q/image/upload/v1500566351/l6p4igvuwfv6ymtlvlcq.png)

<p data-height="365" style="min-height: 365px" data-theme-id="0" data-slug-hash="MoNvbg" data-default-tab="html,result" data-user="ertrzyiks" data-embed-version="2" data-pen-title="Drag a link with default behavior" data-preview="true" class="codepen">See the Pen <a href="https://codepen.io/ertrzyiks/pen/MoNvbg/">Drag a link with default behavior</a> by Mateusz Derks (<a href="https://codepen.io/ertrzyiks">@ertrzyiks</a>) on <a href="https://codepen.io">CodePen</a>.</p>

## How to prevent it?

There is a Webkit-specific CSS property, which we can use to disable that behavior:
```css
li[draggable="true"] a {
  -webkit-user-drag: none;
}
```

It works in Chrome and Safari, but not in others. Fortunately, we can explicitly disable draggable behavior on links using the same HTML attribute we used to enable it.

```html
<a draggable="false" href="#">Link 1</draggable>
```

Now, draggable element looks nice even when link is the grabbed element:

![](https://res.cloudinary.com/dx4fgzy3q/image/upload/v1500567404/s7h27esl0is2y90xcadj.png)

<p data-height="365" style="min-height: 365px" data-theme-id="0" data-slug-hash="vZoJZp" data-default-tab="html,result" data-user="ertrzyiks" data-embed-version="2" data-pen-title="Drag a link - fixed" data-preview="true" class="codepen">See the Pen <a href="https://codepen.io/ertrzyiks/pen/vZoJZp/">Drag a link - fixed</a> by Mateusz Derks (<a href="https://codepen.io/ertrzyiks">@ertrzyiks</a>) on <a href="https://codepen.io">CodePen</a>.</p>







<script async src="https://production-assets.codepen.io/assets/embed/ei.js"></script>
