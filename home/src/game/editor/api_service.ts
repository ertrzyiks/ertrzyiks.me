export interface ApiLevelPayload {
  rows: number,
  cols: number
}

export default class Api {
  static getList() {
    return fetch('/levels').then(res => res.json()).then(data => {
      return data.levels as string[]
    })
  }

  static get(name: string) {
    return fetch(`/levels/${name}`).then(res => res.json())
  }

  static save(name: string, payload: ApiLevelPayload) {
    return fetch(`/levels/${name}`, {
      method: 'PUT',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
  }

  static create(name: string) {
    if (!name) {
      return Promise.reject(new Error('Name is required'))
    }

    return fetch(`/levels/${name}`, {method: 'PUT'})
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          throw data.error
        }
      })
  }

}
