const throttle = require('lodash.throttle')

const header = document.querySelector('.single_post-header')
fadeOutOnScroll(header)

function fadeOutOnScroll(el) {
  var elementOffset = getOffsetTop(el)
  var elementHeight = el.clientHeight
  var elementLastDistance = null

  function getOffsetTop(el) {
    return el.offsetTop + el.parentNode.offsetTop
  }

  function applyProgress(distance) {
    if (elementLastDistance != distance) {
      el.style.opacity = Math.max(0, 1 - distance * 1.3).toFixed(3)
      elementLastDistance = distance
    }
  }

  function updateElementState() {
    const pageOffset = window.pageYOffset

    if (pageOffset < elementOffset) {
      applyProgress(0)
      return
    }

    if (pageOffset > (elementOffset + elementHeight)) {
      applyProgress(1)
      return
    }

    const diff = pageOffset - elementOffset
    const progress = Math.max(0.0, Math.min(diff / elementHeight, 1.0))

    applyProgress(progress)
  }

  window.addEventListener('resize', throttle(function() {
    elementOffset = getOffsetTop(el)
    elementHeight = el.clientHeight
    updateElementState()
  }, 100))

  document.addEventListener('scroll', updateElementState)
}
