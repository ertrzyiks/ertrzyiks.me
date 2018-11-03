#!/bin/sh

function build {
  file_list_txt=./src/assets/${1}/files.txt
    echo "> Build ${1}"

    if [[ ! -f "$file_list_txt" ]]; then
      echo "${file_list_txt} is missing, skipping ${1}"
      return
    fi

  ALL_PATHS=""
  while read p; do
    ALL_PATHS="${ALL_PATHS} ./node_modules/pixel-hex-tileset/$p"
  done <./src/assets/${1}/files.txt

  TexturePacker --format json --trim-sprite-names --sheet ./src/assets/sprites/${1}.png --data ./src/assets/sprites/${1}.json ${ALL_PATHS}
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
