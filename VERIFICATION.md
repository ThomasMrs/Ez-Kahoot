# Vérifications de livraison — 1.3.0

Ez-Kahoot — thomas marsa · 22 octobre 2026

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
