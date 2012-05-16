#!/bin/bash

find . -name '.DS_Store' -prune -o \
       -name '.git' -prune -o \
       -name '.gitignore' -prune -o \
       -name '*~' -prune -o \
       -name '*.swp' -prune -o \
       -print | xargs zip zotero-classify-articles.xpi