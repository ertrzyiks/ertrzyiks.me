#!/bin/sh

function build {
  echo "> Build ${1}"
  TexturePacker --format json --trim-sprite-names --sheet ./src/assets/sprites/${1}.png --data ./src/assets/sprites/${1}.json ./src/assets/${1}/*.png
}

for dir in ./src/assets/*
do
  test -d "$dir" || continue
  dir_name="${dir##*/}"

  if [ "$dir_name" == "sprites" ]
  then
    continue
  fi

  build $dir_name
done
