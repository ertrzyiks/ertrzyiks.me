#!/bin/sh

rm -fr ./.git-deploy
npm run build
touch ./.git-deploy/.static
cd .git-deploy
git init
pwd
git remote add dokku dokku@ertrzyiks.me:home
git add .
git commit -m 'Update'
git push dokku master --force
