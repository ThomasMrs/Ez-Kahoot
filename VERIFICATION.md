# Vérifications de livraison — 1.1.0

Ez-Kahoot — thomas marsa · 22 octobre 2026

- **29 tests Python réussis** : lecture, import, normalisation, accès local, pont du compagnon, validation du jeton et des origines, rotation du code et archive d’extension.
- **Deux suites Node réussies** : recherche exacte/approximative, ambiguïtés, opérateurs, exposants/indices, décodage de connexion et lecteur sur DOM simulé.
- Lecture réelle du quiz public brainwave : 20 questions, 3 diapositives, 21 réponses déclarées correctes.
- Parcours Chrome vérifiés : import, recherche, révélation, presse-papiers, exports, bibliothèque, entraînement 20/20 avec réponses multiples, fiches, pseudos, audio et impression.
- Compagnon vérifié dans le panel : préparation du quiz, recherche exacte, diagnostic et téléchargement du script.
- Extension chargée dans Chrome for Testing : connexion authentifiée au serveur local et lecture d’un onglet déclenchée depuis l’icône réelle de l’extension. La page Kahoot utilisée pour cet essai était une **fixture contrôlée**, pas une partie en direct.
- Script autonome : syntaxe valide, quiz embarqué, aucun appel réseau ni jeton local dans le script généré. Sur fixture : recherche, suivi du changement de question, réexécution sans doublon et arrêt du suivi à la fermeture.
- Régression mathématique dans un vrai DOM : un exposant HTML est conservé, une question sous un ancêtre transparent est écartée et deux choix identiques restent distincts. La question « 5² » retrouve son propre corrigé et ne correspond pas à « 52 ».
- Les cinq vues initiales ont été vérifiées à 320, 768, 1024 et 1440 pixels. La nouvelle vue Compagnon avec navigation à six entrées a été vérifiée à **320, 768 et 1440 pixels CSS**, sans débordement horizontal.
- Audit axe-core : aucune violation WCAG A/AA détectée dans les dix états initiaux et dans la vue Compagnon avec résultat révélé. Cet audit ne remplace pas un audit humain complet.
- Import avec balises non fiables : aucun script exécuté. Export CSV protégé contre l’interprétation de formules. Comparaisons mathématiques et balises sup/sub conservées à l’import.
- Fenêtre d’impression : 20 corrections, interface masquée.

## Relancer les tests

Depuis ce dossier :

```sh
python3 -m unittest discover -s tests -v
node --test extension/tests/*.test.mjs
```

Les tests Python n’utilisent aucun service externe. Node est facultatif et ne sert qu’aux tests de l’extension ; aucune dépendance JavaScript à installer pour utiliser le panel.

## Limites vérifiées

Le compagnon dépend du texte affiché et d’un corrigé public ou importé. Aucune faille d’accès aux quiz privés n’a été établie. Un PIN seul ne fournit pas les réponses. Les essais sur fixtures ne garantissent pas la compatibilité de toutes les pages d’une partie Kahoot réelle ; leurs sélecteurs peuvent évoluer.
