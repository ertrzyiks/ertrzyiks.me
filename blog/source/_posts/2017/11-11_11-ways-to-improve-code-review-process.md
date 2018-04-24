---
title: 11 ways to improve code review process
permalink: 11-ways-to-improve-code-review-process
updated: '2017-11-13 09:34:27'
date: 2017-11-11 12:18:57
tags: testing
featured_image: /content/2017/approved.jpg
comment_id: 25
---

Regardless of the team size, before any code can be merged to the version control system it should be reviewed. It's a great way to communicate, improve the code and share knowledge across the team. 

Here is my subjective list of things you can do to improve that process.

<!-- more -->

## 1. Take your time
Code reviews are often second-class citizens. Programmers' duty is to deliver code and we don't have many occasions to write anything during the review process. I've noticed a desire in myself and my teammates to go through it as quickly as possible and go back to coding. 

Unfortunately, it has a negative impact on the review quality. Instead, think of it as another task to do. Don't be afraid to report that your progress since the previous day has been 'just' doing a review. Don't let anything make you rush through the process to do the real job - you are doing it with your review!


## 2. It's OK to be second

<div style="max-width:300px; min-height:212px; margin:0 auto">
  <img src="/content/2017/ok-job.jpg">
</div>

It may be demotivating to see that the Pull Request you are going to review has already been approved. Another guy spent who-knows-how-much time on the review already, why should you waste your time then?

You may easily overlook something and the same can happen to the previous reviewer(s). It's almost impossible that two people will check the code in exactly the same way. The second and each next review is as important as the first one.

## 3. Check with requirements

It may sound trivial, but it happens quite often to have a Pull Request implementing functionality in a different way than it was requested in the task description.The issue can be an incorrect copy used in some paragraph or the whole feature working in a completely wrong way. 

Don't assume that the author read the task description and programmed everything accordingly - verify that!

## 4. Check with a reference point

<div style="max-width:300px; min-height:212px; margin:0 auto">
 <img src="/content/2017/reference.jpg">
</div>

If everything works great and just like specified in requirements, the code may still be incorrect. The solution can have unintentional changes to the parts of the application that were supposed to be left untouched.

It's difficult to catch such changes by looking at the new version alone, but they become quite obvious if you compare it with a reference version of the application. You may use a master branch locally or some staging server. For read-only operations, it may even be ok to compare with a production server.

## 5. Check overall quality

Code review is also a great opportunity to prevent a lacking solution from being shipped. The newly implemented feature can fulfill all requirements, be free from unintentional changes, but may have yet another defect. As you put yourself in the user role you may find an unhandled corner case or a user interface inconvenience.

It may be the last chance to stop a buggy solution. Try to do something against rules described on the ticket: Provide unexpected input or click some button 10 times to see if it's frustration-proof.

## 6. Check performance

<div style="max-width:300px; min-height:212px; margin:0 auto">
 <img src="/content/2017/performance.jpg">
</div>

Any kind of slowness will annoy your users. Report any performance issues you notice. It can be a slow server response, a lagging user interface or choppy animations.

For browser testing, make full use of the Chrome tools and throttle your CPU to see the actual performance on slower machines. Observe CPU usage, for example in Chrome Task Manager.

## 7. Notes on code changes

As to me, going through the code changes is the easiest part of Code Review and usually, I start the whole process with it. To be honest, it was also the last part of my very first reviews. 
I gradually enhanced my approach by the rest of the points on this list but found that also this core part of Code Review can be done more consciously. Here is my 'algorithm' for code analysis:

- Verify consistency with guidelines/rest of the code

  It's not about checking spaces vs tabs, we have linters to do so. I mean ensuring that the proposed solution is consistent with the rest of the application. You may refer to general project guidelines or compare with similar cases you see in the repository. 

- Assume code to be wrong/incomplete
  
  You need to trust your colleague intentions of course. Still, their code can be unintentionally harmful. When you see a method being renamed - verify that all occurrences have been renamed. When you see something has been removed - verify if it's really unused.

- Raise questions if something is unclear

  Sometimes it's worth digging on your own for a while to see what those 3 strange lines you see in the diff do. If the answer does not pop up quickly it may be better to leave a question and come back to this part later. It's possible that you'll find a piece of code with low discoverability - it may deserve further changes, better naming or a simple comment added to the source code.
  
- Suggest improvements

  If you think that you know a better/faster/safer way to achieve the same result - don't be shy and share it! It may improve the final code, but even if your suggestion is not followed, your team have a chance to at least discuss it.

## 8. Review all affected parts

Code Review can occasionally reveal a problem unrelated to the code changes. Since you've already spent some time on preparations and manual testing, it's nice to keep an eye on all parts of the application that are indirectly related to the new functionality or bug fix. 

If you test a new button added to the bottom of some page, scan the whole page looking for visual glitches. Testing an isolated scenario can be a good excuse to validate all steps required to reproduce it.

## 9. Ask (even more?) questions

I already mentioned that in point #7, but I believe it deserves a separate point too. It happens that you can help also by not knowing things. You are not alone! There are more people who don't know things. Making the code easier to understand is beneficial to everyone involved, now and in the future. 

Maybe I've just been super lucky, but I don't remember any questions that were left unanswered. Even if it was just a link to the documentation explaining what is going on in this piece of code.

Actually, that was my only input to the code changes when as a front-end developer I had to review back-end related Pull Requests. I learned a lot from my patient teammates those days. 

## 10. Take a few passes

<div style="max-width:300px; min-height:212px; margin:0 auto">
 <img src="/content/2017/step-by-step.jpg">
</div> 

Code Review process can take hours. Sometimes, it is even more time-consuming than the actual implementation. It's really hard to stay focused for so long and the quality of the review decreases over time.

For big reviews, it may be beneficial to take multiple passes. First, you can check just the code changes. Later, you can test it manually, carefully comparing with the task description. This way it's also possible to interweave Code Review with other responsibilities.

## 11. Check if covered by automated tests

Last but not least, verify that all changes are reflected in the automated test suite. Is the new code covered by specs? Are all changes in the logic followed by corresponding changes in their tests?

More about how important it is to have automated tests in place can be found in my other post: [An idea around specs](https://blog.ertrzyiks.me/an-idea-around-specs/)

