# mg-bash
load all images and calcuate necessary information then save to db

## workflow

1. established connection with postgres
2. loadd images that have no `info` available for now
3. fetch remote image then get size and blur hash, maybe multip threading?
4. load more images and repeate 2 to 3
5. close all connections and say good bye.
