#!/bin/sh

rm -fr ./.git-deploy
mkdir ./.git-deploy
yarn build
touch ./.git-deploy/.static
cd .git-deploy
git init
pwd
git remote add dokku dokku@167.71.190.115:home
git add .
git commit -m 'Update'
git push dokku master --force
