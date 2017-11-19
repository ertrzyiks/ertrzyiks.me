---
title: Lazy iteration with RxSwift
permalink: lazy-iteration-with-rxswift
updated: '2017-11-11 21:17:33'
date: 2015-11-11 10:32:05
tags: 
  - swift
  - reactive extensions
---

I am totally frontend guy and used to work on web frontends. Last weeks were time of dev experiment for my team. For me? The buzzer in my Challenge Detector is going to be quite tired soon. 
<!-- more -->

## The loop

Idea is to get 3 items of given type from mixed, paginated list. Our problem was that method for listing entities has no filter option. Don't ask why. We can not add new option since API is not under our control. We decided to go for client side filtering. Load first page, filter out other items, load second page etc until we have array of 3. Sounds like a great case for ReactiveExtensions. To be more precise, I mean [RxSwift](https://github.com/ReactiveX/RxSwift/)

My understanding of RX (or sense of it) suggested me theoretically infinite loop of http requests, one after another, with increasing pagination params. Loop should stop after retrieving third item. After minutes of exploring RxSwift repo, I've found promising `generate` method. First attempt was something like this:

```swift
var page = 0

generate(
    empty(), 
    condition: { _ -> Bool in true },
    iterate: { _ in self.loadPage(page++) }
)
.flatMap { items in items }
.filter { item in item.type == "GivenType" }
.take(3)
```

There are serious problems with that solution. First of all, `generate` is synchronous and keeps generating new `Observable` streams infinitely. Additionally each of streams trigger http request, so this way we are on good way to kill server. 

After hours of struggling with available operators I accepted the answer that I have no idea how to solve this properly. Yet! 

## The Monster

For now let's make it work, thats all. With Promises it would be easier I think. Recursive, chained Promise object, which calls next page until we have 3 items in resolved data. Is it really so hard to chain `Observables`? 

Finally, ugly creature appeared. It was born to solve an issue and did it's job quite good. Idea was to feed observer continuously with more and more data. Request for next page was triggered when previous one received answer from the server. Everything recursively chained by `Disposal` objects. Like this:

```swift
func getIterator() -> Observable<TopStoryInfo> {
    return create {
        observer in return self.loadMore(observer)
    }
}

func loadMore(observer: AnyObserver<TopStoryInfo>, page: Int = 0) -> Disposable {
    var internalDisposable:Disposable!
        
    let disposable = loadPage(page).subscribe(
        onNext: { item in observer.onNext(item) },
        onCompleted: {
            internalDisposable = self.loadMore(observer, page: page + 1)
        }
    )
        
    return AnonymousDisposable {
        disposable.dispose()
        internalDisposable?.dispose()
    }
}
```

Loop is stopped after retrieving third item, thanks to `take` operator:

```swift
getIterator().filter { .... }.take(3)
```

With very little satisfaction I had to admit: good enough.

## The inspiration

I could not find the answer. Developers I talked with neither. One day, friend was happy to rebuild piece of application using `concatMap` operator. I asked what is that operator for. Answer suggested it is alias for `flatMap` I used before. Digging into details turned out that `concatMap` is... lazy! It's my chance now! The only problem is there is no `concatMap` operator in `RxSwift`. Hmm. That damn, small detail, which breaks everything one step before reaching the goal. 

Idea of using `generate` was almost dead anyway, I focused on limited range of pages. Common sense suggested that `concatMap` is kind of combination of `concat` and `map` operators, both available. Thanks to XCode prompt I've found parameter-less version of `concat`. That's it!

The solution is:
```swift
let maxTries = 3

return range(0, maxTries)
    .map({ page in self.loadPage(page) })
    .concat()
    .take(3)
```

First two lines produces `Observable`s for all range of pages we go through. Http is not issued until we subscribe for result and that part is handled by `concat` operator. New stream is not subscribed until old one is completed. Combined stream is closed when we find 3 items. Yay!

I was happy as hell when found out it works like intended. Is it monster now? I don't think so :)
