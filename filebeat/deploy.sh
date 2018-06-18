#!/bin/bash

function cleanup() {
  rm -fr .tmp/
}

function deploy() {
  cp -r src/ .tmp

  cd .tmp

  git init
  git add .
  git commit -m 'Update'
  git remote add dokku dokku@ertrzyiks.me:filebeat
  git push dokku master --force
}

cleanup
deploy
cleanup
