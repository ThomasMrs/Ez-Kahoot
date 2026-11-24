# Vérifications de livraison — 1.6.0

Ez-Kahoot — thomas marsa · 24 novembre 2026

## Résultat

**41 tests Python et 96 tests Node réussis.** Extension MV3 chargée dans Chromium 159 avec un profil isolé. Aucun serveur Python ni clé d’IA nécessaire aux nouvelles fonctions.

- Recherche publique réelle depuis un DOM de jeu contrôlé : réponse de la première question, passage à la deuxième, masquage sur changement des choix ou question inconnue. Démarrage automatique, réglage persistant, fermeture et popup 320/380 pixels vérifiés.
- Vrai objet WebSocket du navigateur, trames de test routées par Playwright : réception en monde MAIN, extraction de la question et recherche sans texte de question dans le DOM.
- Résultat reçu avec numéro de manche explicite et compteur DOM correspondant : correction enregistrée, puis retrouvée hors ligne dans une nouvelle phase de jeu. La source mémoire est affichée.
- Revue avant publication : les mises à jour de métadonnées préservent désormais la question sans rajeunir son affichage. Un résultat reçu après 605 secondes conserve ses choix ; le contexte expire après 15 minutes et est réinitialisé au changement de quiz. Les deux tests ciblés échouaient avant le correctif et passent après. La fraîcheur d’affichage reste limitée à 30 secondes.
- Liens : chargement, association et retrait sur un onglet joueur ; classification séparée des devoirs et PIN ; refus des domaines étrangers et identifiants contradictoires. Les quiz non répertoriés et les refus HTTP sont simulés dans les tests unitaires.
- Recherche croisée : deux candidats identiques sur une question sont départagés par une deuxième observation. Les propositions, le nombre d’éléments et l’unicité des questions restent exigés.
- OCR **réel** de l’image de test avec moteur et langues embarqués, requêtes externes bloquées : texte français reconnu, propositions séparées et correction retrouvée dans la mémoire. Annulation pendant le démarrage vérifiée.
- Capture d’écran : tests du cycle de capture avec API simulée, sans audio et arrêt des pistes après image ou erreur. Le sélecteur natif d’écran/onglet n’a pas été manipulé manuellement.
- Mémoire : résultats seulement, mauvaise manche rejetée, propositions changées rejetées, réponses multiples, accès concurrents, plafond de 100 entrées, contradictions bloquantes, export JSON, suppression individuelle et annulation de l’effacement global vérifiés.
- Interface Outils à 320, 768 et 1440 pixels sans débordement horizontal ; inspection visuelle. Audit axe-core WCAG A/AA sans violation détectée sur l’état testé. Aucune erreur JavaScript observée.
- Reconstruction des runtimes et des dépendances OCR verrouillées vérifiée. L’archive d’extension contient tous les modules, moteurs, langues et licences nécessaires ; les dépendances de développement et profils de test sont exclus.

## Limites

Aucune partie réelle avec PIN n’a été rejointe pour cette version. Les échanges réseau des nouvelles fonctions sont des fixtures ; le test de recherche publique utilise l’API réelle. Ces essais ne prouvent pas la compatibilité avec tous les états ou changements futurs du client Kahoot. Le score en partie et le comportement du sélecteur natif de capture restent non vérifiés.

Une question privée sans corrigé reçu, lien accessible ni correction déjà mémorisée reste sans réponse. L’OCR reconnaît du texte ; il ne résout pas une question. Une correction historique peut devenir obsolète si l’auteur change le corrigé. Les observations qui se contredisent bloquent leur réutilisation.

## Reproduire

Les commandes figurent dans `README.md`. `tests/browser/features.mjs` teste les nouvelles fonctions avec des fixtures et peut cibler une archive décompressée via `EZK_EXTENSION_DIR`. `tests/browser/public-smoke.mjs` teste la recherche publique réelle. Le moteur OCR est reproductible via `scripts/ocr/package-lock.json` et `scripts/vendor_ocr.py`.

Les vérifications ci-dessous sont l’historique des versions précédentes.

---

# Vérifications de livraison — 1.5.0

Ez-Kahoot — thomas marsa · 23 novembre 2026

## Mode autonome et démarrage automatique

**41 tests Python et 80 tests Node réussis** après les dernières modifications. La reconstruction des fichiers générés est reproductible et l’archive d’installation contient tous les modules référencés.

- Extension réellement chargée dans Chromium 159 avec un profil de test isolé. Aucun serveur Python, aucune connexion locale et aucune ouverture du popup pour le démarrage initial.
- Page de jeu contrôlée sur une URL Kahoot interceptée par le test : la recherche de `brainwave` a utilisé les endpoints publics réels de Kahoot. La bonne réponse de la première question s’est affichée, puis celle de la deuxième après changement du DOM. Une question inconnue a fait disparaître l’ancienne réponse.
- Désactivation/réactivation via le vrai popup et `chrome.storage`, persistance après rechargement, fermeture du panneau et absence de doublon vérifiées. Auto-clic désactivé par défaut.
- Popup inspecté à 320 et 380 pixels : aucun débordement horizontal ni erreur JavaScript observée.
- La lecture directe du quiz public de démonstration a retourné 20 QCM ; sa recherche à partir d’une question et de ses propositions a également réussi.
- Tests supplémentaires : lecture publique anonyme, normalisation, corrections inconnues, doublons, caches, limites de taille, requêtes groupées, erreurs amont, limitation de fréquence, lancement automatique, observation reçue et rejet d’une manche périmée.

## Limites de cette validation

Une page contrôlée n’est pas une partie réelle : aucune partie avec PIN n’a été rejointe pour cette livraison. Le test navigateur utilise les véritables APIs d’extension et de recherche publique, mais simule le DOM du joueur. Il ne valide donc pas tous les états actuels du client Kahoot. Le mode automatique ne garantit ni l’identification de tous les quiz, ni les réponses à un quiz privé ou sans données suffisantes. Le score en partie n’a pas été testé.

Les vérifications des versions précédentes ci-dessous sont conservées comme historique ; elles ne décrivent pas des essais refaits sur une partie réelle pour la version 1.5.0.

---

# Vérifications de livraison — 1.4.1

Ez-Kahoot — thomas marsa · 22 octobre 2026

## Retrait du générateur — 1.4.1

Le générateur de pseudos, les fonctions de copie et les styles associés ont été supprimés. La vue Outils ne contient plus que quatre bruitages. Syntaxe JavaScript vérifiée ; dans Chrome à 320 et 1440 pixels, aucun contrôle du générateur ne subsiste et aucun débordement horizontal n’est observé. La lecture et l’arrêt des sons ont été exercés à volume nul. Les fonctions du compagnon sont inchangées. Les 40 tests Python et 58 tests Node ont été relancés avec succès pour la livraison 1.4.1.

## Vérifications de la version 1.4

- **40 tests Python et 58 tests Node réussis** : recherche publique, origine et authentification du POST, corps borné, correspondances/ambiguïtés, caches, sondes, compteur réel, HTML inerte, alias booléens et garde-fous de clic. Les appels externes sont simulés dans les tests unitaires.
- Le nouvel endpoint a aussi été testé contre Kahoot avec une question et les quatre choix précédemment reçus par le joueur : un candidat public compatible a été retourné en **1,57 seconde**, sans utiliser l’UUID vu côté animateur. Ce temps est celui d’un essai, pas une garantie de performance.
- Dans Chrome, une page locale contrôlée reproduit le titre dans un en-tête et deux boutons inversés « Faux / Vrai », face au corrigé « True / False ». Les vrais modules lisent la question et envoient exactement un clic sur « Vrai ». Seule l’origine fournie au moteur est simulée pour permettre cette page locale ; ce n’est pas une partie réelle. Capture `Ez-Kahoot-1.4-test-local.jpg`.
- Le panneau a affiché une réponse du candidat avant l’ouverture des boutons de la question 5 dans l’onglet joueur. Le clic automatique après les derniers correctifs n’a pas pu être revalidé sur la partie réelle, car cet onglet a ensuite été fermé. Aucun score réel n’est attribué ici aux correctifs.
- Les runtimes, les copies partagées et le script console ont été reconstruits.

## Vérifications du thème 1.3

- Les quatre vues ont été contrôlées à **320, 768, 1024 et 1440 pixels CSS** : 16 états sans débordement horizontal et sans violation axe-core WCAG A/AA détectée. L’audit a utilisé la préférence de mouvement réduit pour mesurer les états affichés après transition.
- Le popup réel (HTML/CSS, API d’extension simulée sur une page locale) a été contrôlé à **320 et 380 pixels** : aucun débordement et aucune violation axe-core détectée. Le panneau flottant a aussi passé cet audit sur une page locale contrôlée.
- Le SVG K⚡, le thème violet/blanc et le crédit thomas marsa sont affichés dans les trois interfaces. Le panel et le popup chargent Montserrat localement ; le panneau injecté utilise Montserrat si la page hôte la fournit, avec Arial en secours. Les icônes PNG 16, 32, 48 et 128 pixels sont incluses dans le manifeste et l’archive.
- Un corrigé de 20 questions, avec ses 21 choix corrects révélés, a aussi été vérifié à **320 et 1440 pixels** sans débordement ni violation axe-core détectée.
- Les **32 tests Python** et **42 tests Node** restent réussis. Les runtimes et le script console ont été reconstruits ; le script généré est syntaxiquement valide et n’effectue aucun appel réseau.

## Vérifications fonctionnelles conservées

- **32 tests Python** : lecture, import, normalisation, accès local, pont authentifié, contrôle des origines, rotation du code, archives et connexion rapide. Le POST d’association est refusé hors origine d’extension valide ; la première origine associée est conservée et une autre reçoit un refus.
- **42 tests Node** : correspondances, ambiguïtés, exposants et indices, lecture du DOM, décision d’Auto-clic, sélection des boutons et découverte de métadonnées. Les champs génériques de joueur ou de partie ne sont pas acceptés comme UUID de quiz.
- Le lecteur de métadonnées `MAIN` distingue les champs explicites `quizId`/`kahootId`, les données absentes et les identifiants contradictoires. Une correction reçue sur résultat doit appartenir à la manche courante.
- Dans Chrome, sur page contrôlée : le panneau identifie et clique deux bons boutons successifs malgré des choix mélangés. Une question inconnue ne déclenche aucun clic. La fermeture arrête le suivi et les clics ; aucun doublon de panneau n’est conservé.
- Le popup compact a été vérifié dans Chrome à **320 et 380 pixels**, avec une API d’extension simulée : Connexion rapide passe à l’état connecté, le bouton Lancer sur Kahoot est activé et les réglages avancés restent repliés. Les contrôles HTTP d’origine et d’association ont été vérifiés avec des requêtes synthétiques du serveur.
- Panel à **quatre vues** : Explorer chargé, Compagnon, Bibliothèque, Boîte à outils. Chaque vue a été vérifiée dans Chrome à **320, 768, 1024 et 1440 pixels CSS** : **16 états sans débordement horizontal**. Les anciennes routes retirées reviennent à Explorer.
- Audit axe-core : aucune violation WCAG A/AA détectée dans le popup, la vue Compagnon et le panneau superposé testé. Cet audit automatique ne remplace pas un audit humain complet.
- Génération du script console : corrigé embarqué, syntaxe valide, aucun code de connexion ni appel réseau dans le script généré. Les modules partagés et runtimes sont reconstruits avec `scripts/build_companion.py`.
- Import et exports : textes HTML traités sans exécution, comparaisons et sup/sub conservés ; CSV protégé contre l’interprétation de formules. Le quiz public d’exemple brainwave contient 20 questions exploitables, 3 diapositives et 21 choix déclarés corrects.

## Limites de validation

L’installation ou le rechargement de l’extension **actuelle** dans le navigateur personnel reste manuel : l’outil de contrôle du navigateur bloque l’accès à `chrome://extensions`. La connexion rapide depuis une véritable origine d’extension Chrome n’a donc pas été confirmée pour cette version ; les tests HTTP synthétiques et le popup simulé ne constituent pas cette validation.

Les essais d’Auto-clic ont utilisé des pages contrôlées, pas une partie réelle en cours. Le fonctionnement universel sur les quiz privés, les pages sans question lisible ou les configurations ne transmettant pas l’UUID public n’a pas été établi. Une correction reçue après le résultat n’est pas une réponse obtenue à l’avance.

## Relancer

Depuis la racine du projet :

```sh
python3 scripts/build_companion.py
python3 -m unittest discover -s tests -v
node --test extension/tests/*.test.mjs
```

Les tests Python utilisent la bibliothèque standard sans service externe. Node ne sert qu’aux tests JavaScript et n’exige aucun paquet supplémentaire.
