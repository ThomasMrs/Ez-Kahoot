#!/bin/zsh
cd -- "$(dirname -- "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
  exec python3 server.py
else
  print 'Ez-Kahoot nécessite Python 3.10 ou plus récent.'
  print 'Installe Python depuis https://www.python.org/downloads/ puis relance ce fichier.'
  read '?Appuie sur Entrée pour fermer.'
fi
