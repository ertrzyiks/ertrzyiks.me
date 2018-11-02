import './styles.sass'

const warriors = document.getElementById('warriors')

function onClick(e: MouseEvent) {
  warriors.removeEventListener('click', onClick)

  const link = e.target as HTMLElement
  const el = link.parentNode as HTMLElement
  el.classList.add('is-animated')

  import('./game_loader').then(m => {
    el.classList.remove('is-animated')
    m.initialize(e.clientX, e.clientY)
  })
}
warriors.addEventListener('click', onClick)
