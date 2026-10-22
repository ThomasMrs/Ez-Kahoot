# Ez-Kahoot 1.4.1

Un panel local en français avec quatre vues : **Explorer**, **Compagnon**, **Bibliothèque** et **Boîte à outils**. Consulte les corrigés de quiz publics ou importés, retrouve une réponse dans ton onglet Kahoot et conserve tes quiz. Créé par **thomas marsa**.

Le thème violet et blanc reprend les quatre couleurs de réponse, avec un monogramme **K⚡** et une police Montserrat embarquée. Le même habillage est appliqué au panel, au popup et au panneau flottant.

## Démarrer

Python **3.10 ou plus récent** est nécessaire. Aucun compte, clé API ou paquet `pip`/`npm` à installer.

- **macOS :** double-clique sur `Lancer.command`.
- **Windows :** double-clique sur `Lancer.bat`.
- **Linux :** exécute `python3 server.py` depuis ce dossier.

Le panel s’ouvre à <http://127.0.0.1:8765>. Garde le terminal ouvert ; **Ctrl+C** arrête le serveur. Si le lanceur macOS s’ouvre dans un éditeur, lance `python3 server.py` depuis un terminal dans ce dossier.

Pour un autre port ou sans ouverture automatique :

```sh
python3 server.py --port 8766 --no-browser
```

Si le port est occupé par Ez-Kahoot, le lanceur rouvre le panel existant. Sinon, un port disponible est affiché. Après une mise à jour, arrête l’ancienne instance et relance le serveur.

## Le compagnon sur Kahoot

1. Télécharge le compagnon depuis la vue **Compagnon** et décompresse l’archive. Le dossier `extension/` de cette distribution convient aussi.
2. Dans Chrome, ouvre `chrome://extensions`, active **Mode développeur**, clique **Charger l’extension non empaquetée** et sélectionne le dossier contenant `manifest.json`. Dans Edge, utilise `edge://extensions`.
3. Épingle l’extension. Avec Ez-Kahoot lancé, ouvre son icône et clique **Connexion rapide**.
4. Place-toi dans ton onglet Kahoot et clique **Lancer sur Kahoot**. Le petit panneau suit les questions et affiche les réponses connues.
5. Active **Auto-clic** si tu souhaites envoyer une réponse vérifiée. Fermer le panneau arrête le suivi et les clics.

Après une mise à jour de l’extension, clique sur **Actualiser** sur sa carte dans `chrome://extensions`, puis relance le panneau sur Kahoot. Le raccourci **Alt+Maj+K** ouvre l’extension si le navigateur ne l’utilise pas déjà.

Si la page transmet l’identifiant d’un quiz public, le compagnon peut charger son corrigé automatiquement. Si aucun identifiant n’est reçu mais que le joueur reçoit le texte et les choix d’une question, le compagnon recherche aussi un candidat dans les quiz publics. Il compare la question, toutes les propositions et le nombre d’éléments de la partie ; il vérifie au plus dix candidats et signale la provenance « Candidat public retrouvé par question ». Plusieurs candidats compatibles ne sont pas départagés automatiquement. Si aucun candidat n’est confirmé, ouvre le quiz dans **Explorer**, puis clique **Envoyer ce quiz au compagnon** dans **Compagnon**. La recherche ponctuelle se trouve dans **Rechercher une question**, repliée dans le popup.

La recherche utilise les informations reçues par l’onglet invoqué et ne nécessite pas de consulter la fenêtre de l’animateur. Si le joueur ne reçoit ni texte ni choix, elle ne peut pas identifier le quiz. Si ces informations arrivent après le résultat, la recherche démarre à ce moment ; cela ne donne pas la réponse à l’avance pour la question terminée.

### Quand le clic est possible

L’Auto-clic est désactivé au lancement. Il exige une question exacte et unique, un corrigé entièrement renseigné, une seule réponse correcte et une correspondance complète des textes des choix avec des boutons actifs. La question et la manche sont revérifiées avant le clic. Les paires booléennes complètes **True/False** et **Vrai/Faux** sont reconnues même lorsque les boutons sont inversés. L’ordre et les couleurs ne sont pas supposés ; un bouton n’est pas envoyé à répétition.

Les correspondances approximatives ou ambiguës, les réponses uniquement en images et les sélections multiples restent manuelles. Sur `/answer/result`, une correction déjà reçue est indiquée comme **Correction reçue après la question** ; elle ne déclenche aucun clic et ne sert pas à anticiper la suivante. Le score dépend des règles de la partie et du réseau.

### Connexion avancée

**Connexion rapide** cherche le serveur sur le port **8765**. Elle associe la première origine d’extension valide qui la demande pour cette instance. Si tu utilises un autre port, une autre installation d’extension ou si la connexion échoue, ouvre **Connexion avancée** et colle le code `EZK1.…` visible dans **Code et connexion avancée** du panel.

Un redémarrage du serveur ou **Régénérer le code** invalide le code précédent. **Déconnecter** efface l’association enregistrée dans l’extension. Le quiz envoyé au compagnon reste uniquement en mémoire du serveur jusqu’à son arrêt.

## Explorer et conserver un quiz

Colle un lien public Kahoot ou un UUID dans **Explorer**, importe un JSON, ou essaie le quiz d’exemple **brainwave**. Révèle les réponses, recherche dans le corrigé et exporte en TXT, CSV, JSON ou impression/PDF. Le bouton d’enregistrement conserve le quiz dans **Bibliothèque**. La **Boîte à outils** propose quatre bruitages, avec volume réglable et arrêt immédiat.

Les imports acceptent un document Kahoot brut ou un export Ez-Kahoot : **8 Mo**, **500 éléments** et **20 choix par question** au maximum. Les diapositives et les formats sans choix sont comptés séparément. Les corrections non renseignées restent inconnues. Les textes, images et durées sont conservés lorsqu’ils sont disponibles.

La bibliothèque conserve jusqu’à 24 quiz dans ce navigateur. Changer de port, de profil ou de navigateur peut afficher une autre bibliothèque ; exporter en JSON permet de garder une copie. Effacer les données du site efface aussi cette bibliothèque.

## Script console ponctuel

Après avoir chargé un quiz, utilise **Compagnon → Copier le script** ou **Télécharger .js**. Le script embarque ce corrigé et le même panneau, avec Auto-clic facultatif. Une fois généré, il n’effectue aucune requête réseau et ne contient pas le code de connexion. Il faut le relancer après un changement complet de page.

## Données et limites

Le serveur écoute seulement sur `127.0.0.1`. Le chargement d’un quiz public contacte `create.kahoot.it` ; les illustrations peuvent contacter leurs hébergeurs. L’import JSON reste local. Les quiz déjà chargés, la bibliothèque et les exports fonctionnent sans connexion ; certaines images peuvent manquer.

Le lecteur utilise le texte visible. Un second lecteur ciblé examine les métadonnées disponibles dans la page, la session de jeu et l’état du client pour extraire le titre ou l’UUID de quiz et, sur la page de résultat, une correction déjà révélée. Il ne transmet pas de cookie ni d’identifiant de connexion au serveur local. Les échanges du compagnon utilisent un jeton éphémère et refusent les origines de pages web ordinaires ; aucune règle CORS `*` n’est utilisée.

Un PIN ou une URL générique ne garantit pas l’accès au corrigé. Un identifiant de joueur ou de partie n’est pas traité comme un UUID de quiz. Si le client ne reçoit ni le texte, ni l’identifiant public, ni le corrigé, le panneau indique ce manque. Les quiz privés ou inaccessibles ne sont pas chargés par l’API publique. La compatibilité peut évoluer avec Kahoot.

## Reconstruction et tests

Après modification des modules lisibles dans `extension/`, régénère les runtimes et fichiers partagés :

```sh
python3 scripts/build_companion.py
python3 -m unittest discover -s tests -v
node --test extension/tests/*.test.mjs
```

Node est facultatif et ne sert qu’aux tests ; aucun paquet n’est nécessaire. Les tests et leurs limites sont détaillés dans `VERIFICATION.md`. Les sources et licences incluses sont décrites dans `SOURCES.md`.

**Ez-Kahoot — thomas marsa.** Projet indépendant, non affilié à Kahoot.
