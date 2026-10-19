#!/bin/bash
# pair.sh <dir> <scene> <labelA> <labelB> <out.png>: stack two renders (A over B) at half size for eyeballing
convert "$1/$2-$3.png" "$1/$2-$4.png" -resize 50% -append "$5"
