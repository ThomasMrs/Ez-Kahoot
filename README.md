# Ez-Kahoot 1.6.0

Un panel local en français avec quatre vues : **Explorer**, **Compagnon**, **Bibliothèque** et **Boîte à outils**. Consulte les corrigés de quiz publics ou importés, retrouve une réponse dans ton onglet Kahoot et conserve tes quiz. Créé par **thomas marsa**.

Le thème violet et blanc reprend les quatre couleurs de réponse, avec un monogramme **K⚡** et une police Montserrat embarquée. Le même habillage est appliqué au panel, au popup et au panneau flottant.

## Réponses automatiques sur Kahoot

Installe le dossier `extension/` dans Chrome ou Edge, puis rejoins ta partie sur **kahoot.it**. Le panneau s’ouvre tout seul et recherche le corrigé public, sans lancer Python, sans code de connexion et sans coller un lien de quiz. Après installation ou mise à jour, recharge les onglets Kahoot déjà ouverts.

Les réponses s’affichent lorsque le quiz public est identifié et que la question correspond. Un PIN seul ne donne pas accès à tous les corrigés : si la partie ne transmet ni UUID public, ni question avec ses propositions, ou si le quiz est privé, aucune réponse anticipée n’est garantie.

## Nouveautés 1.6 — sans génération de réponses par IA

Le bouton **Liens, OCR et mémoire** du popup ouvre les nouveaux outils. Ils fonctionnent sans serveur Python.

- **Recherche croisée** : jusqu’à six questions de la partie, trois recherches publiques et vingt candidats vérifiés. Les choix et le nombre d’éléments doivent correspondre. Les questions peuvent être mélangées. Une ambiguïté reste indiquée, sans choisir arbitrairement.
- **Liens accessibles** : UUID, liens de détails, de partage et liens animateur contenant un UUID. Un quiz non répertorié peut être chargé si son lien permet une lecture anonyme. Associe-le à l’onglet joueur choisi. Les liens de devoir et les PIN sont reconnus séparément et ne sont pas convertis en UUID de quiz.
- **Réception passive** : un script installé au chargement de la page lit les champs de quiz des messages WebSocket entrants Kahoot. Il complète la lecture DOM/état de la page sans modifier les messages envoyés. Le diagnostic indique les données disponibles ; recharge la page après installation pour activer ce récepteur.
- **OCR local français/anglais** : importe une image ou capture explicitement un écran/onglet. Clique **Lire le texte**, puis vérifie la question et les propositions avant la recherche. Tesseract, son moteur et ses données linguistiques sont embarqués. Aucun LLM, service de résolution ni clé API ; la reconnaissance optique utilise des modèles de caractères locaux. L’image n’est pas envoyée à un service.
- **Mémoire des résultats** : seules les corrections reçues après résultat, liées à la même manche visible et à des propositions connues, sont sauvegardées. Jusqu’à 100 corrections et 1 Mo, sur cet appareil. Une contradiction bloque la réutilisation. Consultation, suppression individuelle, effacement confirmé et export JSON sont disponibles. Le JSON exporté est une sauvegarde consultable ; la réimportation n’est pas proposée.

Les images acceptées sont PNG/JPEG/WebP, 10 Mo et 40 mégapixels maximum ; elles sont réduites à 4 mégapixels pour la lecture. L’OCR est annulable et s’arrête après une minute. La capture cesse dès que l’image est obtenue. Une correction mémorisée reste une donnée historique : l’auteur peut avoir changé son corrigé entre deux parties.

Les liens associés et observations récentes sont séparés par onglet ; les observations sont réinitialisées au lobby, au changement de quiz, au retour à une manche précédente ou après dix minutes d’inactivité. Un lien reste associé jusqu’à son retrait, la fermeture de l’onglet ou l’expiration de sa session. Les corrections persistent jusqu’à leur suppression ou l’effacement des données de l’extension.

Un quiz privé qui ne transmet pas son corrigé et ne possède pas de source accessible reste indisponible. Il n’existe pas ici de contournement d’authentification ni de promesse de répondre à tous les tests.

## Démarrer le panel local (facultatif)

Pour Explorer, importer des quiz ou utiliser la bibliothèque, Python **3.10 ou plus récent** est nécessaire. Aucun compte, clé API ou paquet `pip`/`npm` à installer.

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
3. Rejoins une partie sur Kahoot. Le panneau apparaît automatiquement ; le serveur local est facultatif.
4. Laisse **Ouvrir automatiquement sur Kahoot** activé dans le popup. **Lancer sur Kahoot** permet de rouvrir un panneau fermé.
5. Active **Auto-clic** si tu souhaites envoyer une réponse vérifiée. Fermer le panneau arrête le suivi et les clics.

Après une mise à jour de l’extension, clique sur **Actualiser** sur sa carte dans `chrome://extensions`, puis recharge les onglets Kahoot ouverts. Le raccourci **Alt+Maj+K** ouvre l’extension si le navigateur ne l’utilise pas déjà.

Si la page transmet l’identifiant d’un quiz public, le compagnon peut charger son corrigé automatiquement. Si aucun identifiant n’est reçu mais que le joueur reçoit le texte et les choix d’une question, le compagnon recherche aussi un candidat dans les quiz publics. Il compare la question, toutes les propositions et le nombre d’éléments de la partie ; il vérifie au plus vingt candidats issus de trois recherches et signale la provenance « Candidat public retrouvé par questions ». Plusieurs candidats compatibles ne sont pas départagés automatiquement. Pour utiliser un corrigé importé en complément, ouvre le quiz dans **Explorer**, puis clique **Envoyer ce quiz au compagnon** dans **Compagnon**, puis utilise **Connexion rapide** et **Lancer sur Kahoot** dans l’extension. La recherche ponctuelle se trouve dans **Rechercher une question**, repliée dans le popup.

La recherche utilise les informations reçues dans l’onglet joueur ou son texte visible et ne nécessite pas de consulter la fenêtre de l’animateur. Si le joueur ne reçoit ni texte ni choix, elle ne peut pas identifier le quiz. Si ces informations arrivent après le résultat, la recherche démarre à ce moment ; cela ne donne pas la réponse à l’avance pour la question terminée.

### Quand le clic est possible

L’Auto-clic est désactivé au lancement. Il exige une question exacte et unique, un corrigé entièrement renseigné, une seule réponse correcte et une correspondance complète des textes des choix avec des boutons actifs. La question et la manche sont revérifiées avant le clic. Les paires booléennes complètes **True/False** et **Vrai/Faux** sont reconnues même lorsque les boutons sont inversés. L’ordre et les couleurs ne sont pas supposés ; un bouton n’est pas envoyé à répétition.

Les correspondances approximatives ou ambiguës, les réponses uniquement en images et les sélections multiples restent manuelles. Sur `/answer/result`, une correction déjà reçue est indiquée comme **Correction reçue après la question** ; elle ne déclenche aucun clic et ne sert pas à anticiper la suivante. Le score dépend des règles de la partie et du réseau.

### Connexion locale facultative

Ouvre **Quiz importé et connexion locale** dans le popup pour utiliser le serveur et un quiz préparé. Le mode automatique autonome continue à fonctionner sans cette association.

**Connexion rapide** cherche le serveur sur le port **8765**. Elle associe la première origine d’extension valide qui la demande pour cette instance. Si tu utilises un autre port, une autre installation d’extension ou si la connexion échoue, ouvre **Quiz importé et connexion locale** et colle le code `EZK1.…` visible dans **Code et connexion avancée** du panel.

Un redémarrage du serveur ou **Régénérer le code** invalide le code précédent. **Déconnecter** efface l’association enregistrée dans l’extension. Le quiz envoyé au compagnon reste uniquement en mémoire du serveur jusqu’à son arrêt.

## Explorer et conserver un quiz

Colle un lien public Kahoot ou un UUID dans **Explorer**, importe un JSON, ou essaie le quiz d’exemple **brainwave**. Révèle les réponses, recherche dans le corrigé et exporte en TXT, CSV, JSON ou impression/PDF. Le bouton d’enregistrement conserve le quiz dans **Bibliothèque**. La **Boîte à outils** propose quatre bruitages, avec volume réglable et arrêt immédiat.

Les imports acceptent un document Kahoot brut ou un export Ez-Kahoot : **8 Mo**, **500 éléments** et **20 choix par question** au maximum. Les diapositives et les formats sans choix sont comptés séparément. Les corrections non renseignées restent inconnues. Les textes, images et durées sont conservés lorsqu’ils sont disponibles.

La bibliothèque conserve jusqu’à 24 quiz dans ce navigateur. Changer de port, de profil ou de navigateur peut afficher une autre bibliothèque ; exporter en JSON permet de garder une copie. Effacer les données du site efface aussi cette bibliothèque.

## Script console ponctuel

Après avoir chargé un quiz, utilise **Compagnon → Copier le script** ou **Télécharger .js**. Le script embarque ce corrigé et le même panneau, avec Auto-clic facultatif. Une fois généré, il n’effectue aucune requête réseau et ne contient pas le code de connexion. Il faut le relancer après un changement complet de page.

## Données et limites

Le mode autonome interroge directement les endpoints publics de `create.kahoot.it`, sans cookie ni authentification. Il garde des caches bornés en mémoire, regroupe les requêtes identiques et respecte les réponses de limitation de fréquence. La recherche examine au plus vingt candidats issus de trois recherches et n’affirme pas l’unicité parmi tous les quiz de Kahoot.

Le serveur écoute seulement sur `127.0.0.1`. Le chargement d’un quiz public contacte `create.kahoot.it` ; les illustrations peuvent contacter leurs hébergeurs. L’import JSON reste local. Les quiz déjà chargés, la bibliothèque et les exports fonctionnent sans connexion ; certaines images peuvent manquer.

Le lecteur utilise le texte visible. Si le texte de la question est reçu dans l’état de la page mais absent du DOM, il peut servir à afficher une réponse pendant trois secondes au maximum, uniquement lorsque le numéro de question visible correspond ; cette donnée seule ne permet pas de cliquer.

Un second lecteur ciblé examine les métadonnées disponibles dans la page, la session de jeu et l’état du client pour extraire le titre ou l’UUID de quiz et, sur la page de résultat, une correction déjà révélée. Il ne transmet pas de cookie ni d’identifiant de connexion au serveur local. Les échanges du compagnon utilisent un jeton éphémère et refusent les origines de pages web ordinaires ; aucune règle CORS `*` n’est utilisée.

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

## Reconstruction et validation

```sh
python3 scripts/build_companion.py
python3 -m unittest discover -s tests
node --test extension/tests/*.test.mjs
```

Les dépendances OCR sont déjà livrées. Pour les reconstruire avec leurs versions verrouillées :

```sh
npm ci --ignore-scripts --prefix scripts/ocr
python3 scripts/vendor_ocr.py
```

Tests navigateur reproductibles (profil temporaire isolé, aucune vraie partie rejointe) :

```sh
npm ci --ignore-scripts --prefix tests/browser
cd tests/browser
npx playwright install chromium
node features.mjs
node public-smoke.mjs
```

`features.mjs` contrôle les nouveaux outils avec des échanges de quiz simulés ; `public-smoke.mjs` utilise une recherche publique réelle et nécessite Internet. Les captures sont écrites dans `.browser-results/`. Détails et limites dans `VERIFICATION.md`.
