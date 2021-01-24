---
title: Exploration of web notifications
permalink: exploration-of-web-notifications
updated: '2021-01-23 20:01:14'
date: 2021-01-23 20:01:14
featured_image: /content/2021/notifications.jpeg
---

What I see a lot is a popup asking me to allow notification for a website. If the popup attacks me
right after I just opened the page, I have no interest in enabling them without knowing 
what I actually can expect and intuitively click 'No'. That way I've never received a notification 
from a website. Are they inevitably bad and should be avoided at any cost? I decided to check it out.  

<!-- more -->

## How does it work?

![](/content/2021/example_notification.jpg)

I was wondering how it works though and that curiosity led to creating a simple 
[demo page](https://notifications-demo.ertrzyiks.me/). The source code of the demo page is 
available on Github: [https://github.com/ertrzyiks/web-push-demo](https://github.com/ertrzyiks/web-push-demo)
 
I found out that web push notifications are a combination of three browser APIs.
 
### Service workers

[Service Worker API docs](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)

It's essential in a way that the other two APIs are available only in the Service Worker.
The responsibility of the worker is to first set up an event listener for the push messages.
It allows background processing so the message can be received even if the user does not actively
use the website.

The Service Worker integration can become very overwhelming, especially if it includes network interception
and cache management. It requires well thought through update strategy and it's worth considering some additional
library to deal with that complexity, for example [Workbox](https://developers.google.com/web/tools/workbox/).
In case of using a Service Worker purely for notifications we can make some shortcuts to keep it simple. 
Specifically, we can force activate a new worker version as soon as it's updated.

```javascript
self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting())
})
``` 

The recommended way to activate a new worker is to [offer a page refresh](https://developers.google.com/web/tools/workbox/guides/advanced-recipes#offer_a_page_reload_for_users),
because, at times, instant activation may cause incompatibility problems.
 
### Push API

[Push API docs](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)

This experimental API allows us to push a message from a server directly to the browser.
However, the message alone does not show a system notification. It only wakes up the worker so
it can react to the message and execute some code on the user's device.

First of all, we need to get a user subscription:

```javascript
await registration.pushManager.subscribe({
  userVisibleOnly: true | false,
  applicationServerKey: ...
})
```

This will prompt the user permission dialog and if accepted we get the subscription object which we can then
send to the server for further interaction. One option is to use the [web-push](https://github.com/web-push-libs/web-push)
library on the server-side to send messages to such a subscription.

The next step is to set up a messages handler. 
In the worker code, it boils down to configuring a `push` event listener.

```javascript
self.addEventListener('push', event => {
  let data = {}
  if (event.data) {
    data = event.data.json()
  }

  event.waitUntil((async () => {
    // ... do some processing here
  })())
})
```

This handler will be called every time the worker receives a message for the user subscription.
For this research I was purely interested in displaying a system notification and fortunately that 
is possible with the third API. 

### Notification

[Notification API docs](https://developer.mozilla.org/en-US/docs/Web/API/Notification)

Finally, after receiving a message from the server we can display a system notification. It can be slightly 
customized, but the general look and feel depends on the operating system.

```javascript
await self.registration.showNotification(data.title, {
  body: data.message,
  data: { redirect_url: data.redirect_url }
})
```

Notifications are usually configurable per application, so the user may decide to turn them off for a web browser.
In such case, the notification won't be displayed even if we have user permission and the subscription object.

## Summary

The Push API is widely supported and free of charge, but [forget about Safari (both Mac and iOS)](https://developer.mozilla.org/en-US/docs/Web/API/Push_API#browser_compatibility).

Push messages can bring the user back to the website even when they are not using a web browser at that moment.

It's possible to ask the user to grant notification permissions in some context, for example after a button click.
This way they don't need to be that intrusive.
