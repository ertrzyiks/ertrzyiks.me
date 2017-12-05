var Raven = require('raven-js')

Raven
  .config(process.env.SENTRY_PUBLIC_DSN)
  .install({
    environment: process.env.NODE_ENV
  })
