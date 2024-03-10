#!/bin/sh

function build {
  sprite_name="$1"
  file_list_txt=./assets/${1}/files.txt
  echo "> Build ${1}"

  if [[ ! -f "$file_list_txt" ]]; then
    echo "${file_list_txt} is missing, skipping ${1}"
    return
  fi

  ALL_PATHS=""
  while read p; do
    ALL_PATHS="${ALL_PATHS} ./assets/all/$p"
  done < ./assets/${1}/files.txt

  echo $ALL_PATHS

  TexturePacker --format json --multipack --trim-sprite-names --sheet "./assets/sprites/${sprite_name}-{n}.png" --data "./assets/sprites/${sprite_name}-{n}.json" ${ALL_PATHS}
}

for dir in ./assets/*
do
  test -d "$dir" || continue
  dir_name="${dir##*/}"

  if [ "$dir_name" == "sprites" ]
  then
    continue
  fi

  build $dir_name
done
