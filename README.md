# Ez-Kahoot

Un panel local en français pour explorer un quiz Kahoot public, consulter son corrigé, s’entraîner et conserver ses quiz. La version **1.1.0** ajoute un compagnon pour navigateur. Créé par **thomas marsa**.

## Démarrage rapide

Python **3.10 ou plus récent** doit être installé. Aucun compte, aucune clé API et aucune installation `pip` ou `npm` ne sont nécessaires.

- **macOS :** double-clique sur `Lancer.command`. Le navigateur s’ouvre automatiquement. Si macOS propose un éditeur, ouvre Terminal et exécute `python3 server.py` depuis ce dossier.
- **Windows :** double-clique sur `Lancer.bat`.
- **Linux :** ouvre un terminal dans ce dossier et exécute `python3 server.py`.

Garde la fenêtre du terminal ouverte pendant l’utilisation. Pour arrêter Ez-Kahoot, appuie sur **Ctrl+C** dans cette fenêtre. L’adresse par défaut est <http://127.0.0.1:8765>. Si Ez-Kahoot fonctionne déjà à cette adresse, le lanceur rouvre ce panel pour retrouver la même bibliothèque. Si un autre programme occupe le port, un autre port est choisi et affiché dans le terminal.

Pour choisir une adresse locale ou empêcher l’ouverture automatique du navigateur :

```sh
python3 server.py --port 8766 --no-browser
```

Après une mise à jour des fichiers, arrête l’ancienne instance avec Ctrl+C puis relance le serveur pour charger la nouvelle version.

## Utilisation

1. Colle le lien d’un **quiz public** ou son identifiant UUID dans le champ de recherche. Exemple : `77c46705-dab1-4ca1-a435-c287194db522`.
2. Charge le quiz pour consulter ses questions et les réponses que son créateur a déclarées correctes.
3. Utilise les modes d’entraînement et de fiches pour réviser, puis les exports pour conserver le contenu.
4. Retrouve tes quiz conservés dans la bibliothèque du même navigateur.

Un quiz d’exemple permet de découvrir le panel sans requête réseau. Tu peux aussi importer un fichier JSON Kahoot brut ou un export JSON d’Ez-Kahoot. Les fichiers sont limités à **8 Mo**, **500 éléments** et **20 réponses par question**.

## Ce qui est pris en charge

- Lecture des quiz publics par lien ou UUID.
- Questions à choix multiples et vrai/faux représentées par des choix de réponses.
- Plusieurs réponses déclarées correctes, sans suppression d’un choix valide.
- Texte, illustrations et durée lorsqu’ils sont présents dans la source.
- Import JSON, bibliothèque dans le navigateur, entraînement, fiches et exports.

Les diapositives sont comptées séparément. Les formats sans choix de réponses, comme les puzzles ou les réponses ouvertes, sont signalés comme éléments ignorés. Une réponse sans indication de correction reste **inconnue** : Ez-Kahoot n’invente pas de corrigé. L’entraînement peut demander de sélectionner tous les choix déclarés corrects, même si le quiz d’origine accepte un seul de ces choix à la fois.

Un **PIN de partie** n’est pas un identifiant de quiz. Ez-Kahoot consulte le document public ; il ne rejoint pas de partie en direct et ne répond pas automatiquement dans une session. Un quiz privé, supprimé ou inaccessible ne peut pas être chargé. La disponibilité des données publiques dépend du service Kahoot et peut évoluer.

## Compagnon navigateur : la solution recommandée

Le compagnon ajoute une lecture de l’onglet Kahoot courant et une association avec les questions d’un quiz déjà préparé. Il évite de recoller une commande dans la console à chaque navigation.

1. Charge un quiz dans Ez-Kahoot, puis ouvre la vue **Compagnon** et prépare ce quiz pour l’extension.
2. Télécharge l’archive du compagnon depuis cette vue et décompresse-la. Le dossier `extension/` de cette distribution peut aussi être utilisé directement.
3. Dans Chrome, ouvre `chrome://extensions`, active le **Mode développeur**, puis choisis **Charger l’extension non empaquetée** et sélectionne le dossier qui contient `manifest.json`. Dans Edge, utilise `edge://extensions`.
4. Copie le code de connexion affiché dans Ez-Kahoot et colle-le dans la fenêtre de l’extension. Le serveur local doit rester ouvert.
5. Ouvre ton onglet Kahoot, invoque le compagnon et lance la lecture. Le contenu reconnu est comparé au quiz préparé ; un lien public ou un UUID disponible permet aussi de charger le document public correspondant.

L’autorisation `activeTab` est temporaire et vient du clic sur l’extension. Le lecteur s’exécute dans le contexte isolé prévu par Chrome. Le compagnon ne demande pas l’accès à tous les sites. Son autorisation de communication locale sert uniquement à joindre Ez-Kahoot sur ton appareil.

Le code `EZK1.…` associe le compagnon à l’instance locale en cours. Le bouton de réinitialisation régénère ce code et révoque la connexion précédente, tout en conservant le quiz préparé. Un redémarrage du serveur produit également un nouveau code ; il faut alors reconnecter l’extension. Le quiz préparé n’est gardé qu’en mémoire du serveur.

### Limites de la lecture d’une partie

Le lecteur dispose du contenu présent dans la page du joueur. Si l’hôte n’affiche que les formes des boutons, il peut manquer le texte nécessaire pour reconnaître la question. L’option Kahoot **Show questions & answers on participants’ devices** affiche la question et les propositions ; elle n’annonce pas la transmission du corrigé au joueur. Un PIN reste un code temporaire de session, sans promesse de correspondance universelle avec le document public du quiz.

Les corrections du compagnon viennent donc du quiz préparé ou d’un quiz public lisible. Un contenu manquant, un quiz différent ou une correspondance ambiguë doit être présenté comme tel. Le compagnon n’invente pas de bonne réponse et n’accède pas à un quiz privé.

### Alternative ponctuelle : la console

La vue Compagnon peut aussi préparer un script autonome à copier dans la console de ton onglet Kahoot. Le quiz choisi, le lecteur et la recherche sont embarqués dans ce script : il ne télécharge aucun code et n’envoie pas de requête réseau. Il rapproche la question visible du corrigé déjà chargé, dans une petite fenêtre sur la page. Il faut le relancer après un changement complet de page ; l’extension reste plus pratique pour un usage répété. Les mêmes limites de texte visible, de correction connue et de correspondance ambiguë s’appliquent.

## Données et fonctionnement local

Le serveur écoute uniquement sur `127.0.0.1`. La bibliothèque et les préférences sont enregistrées dans le stockage local du navigateur. Les exports sont téléchargés sur ton appareil. Aucun service d’analyse ou compte utilisateur n’est intégré.

Le chargement par UUID contacte directement `create.kahoot.it` depuis le serveur local. Les illustrations distantes peuvent être chargées depuis leurs hébergeurs. L’import JSON est traité par le serveur local et n’est pas envoyé à Kahoot. L’entraînement, les fiches et les fichiers déjà chargés restent utilisables sans Internet ; les illustrations distantes peuvent alors manquer.

Le pont du compagnon est distinct des routes du panel. Ses lectures demandent un jeton de connexion ; elles n’exposent ni le code de connexion du panel, ni sa bibliothèque. Les origines de pages web ordinaires sont refusées et aucune règle CORS générique `*` n’est utilisée. Le pont ne modifie pas le quiz source : il fournit seulement le quiz préparé ou une lecture publique demandée par UUID.

Le stockage dépend de l’adresse locale : changer de port, de navigateur ou de profil peut afficher une bibliothèque différente. Exporter un quiz en JSON permet de le transférer ou de le sauvegarder. Effacer les données du site dans le navigateur supprime sa bibliothèque locale.

## Vérification technique

Les tests du serveur utilisent uniquement la bibliothèque standard et ne contactent aucun service externe :

```sh
python3 -m unittest discover -s tests -v
```

Les tests facultatifs du lecteur et de la recherche nécessitent Node, sans paquet à installer :

```sh
node --test extension/tests/*.test.mjs
```

Les essais réalisés et leurs limites sont décrits dans `VERIFICATION.md`.

Le code de l’interface se trouve dans `public/`. Le serveur de lecture et d’import est `server.py`. Les lanceurs sont de simples raccourcis vers ce serveur.

## Crédits

**Ez-Kahoot — thomas marsa**

Les sources consultées et inspirations sont détaillées dans `SOURCES.md`. Ez-Kahoot est un projet indépendant ; Kahoot est la marque de son propriétaire respectif.
