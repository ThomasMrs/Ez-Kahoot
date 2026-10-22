# Sources et crédits — 1.2.0

**Projet : Ez-Kahoot** · **Création : thomas marsa**

## Quiz publics

- [Kahoot](https://create.kahoot.it/) fournit les documents de quiz. Le serveur utilise `https://create.kahoot.it/rest/kahoots/{UUID}`, après validation de l’identifiant, sans récupération d’URL arbitraire.
- [brainwave](https://create.kahoot.it/details/77c46705-dab1-4ca1-a435-c287194db522) est le quiz public d’exemple.

Questions, réponses et illustrations appartiennent à leurs auteurs respectifs. Les indicateurs de correction reprennent la configuration du quiz et ne constituent pas une validation scientifique indépendante.

## Références de code consultées

- [thinesjs/kahootyoinker](https://github.com/thinesjs/kahootyoinker), notamment [son contrôleur](https://github.com/thinesjs/kahootyoinker/blob/master/app/Http/Controllers/KahootAPIController.php), pour la lecture publique par UUID.
- [unixpickle/kahoot-hack](https://github.com/unixpickle/kahoot-hack), comme contexte historique. Ses fonctions de perturbation de partie ne sont pas intégrées.

Le serveur et le compagnon ont été écrits pour Ez-Kahoot. Aucun code de ces dépôts n’est téléchargé ou exécuté par l’application.

## Compagnon et protocole

- [Kahoot : questions sur l’appareil des participants](https://support.kahoot.com/hc/en-us/articles/115003197928-How-to-enable-See-questions-on-participant-s-screen-in-Kahoot-live-games) décrit l’option affichant question et choix aux joueurs ; cela ne promet pas la réception du corrigé.
- [Kahoot : PIN de partie](https://support.kahoot.com/hc/en-us/articles/360000109048-How-to-find-Kahoot-PIN) décrit un code de session temporaire, distinct d’un UUID de document public.
- [Chrome : activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab) documente l’accès temporaire à l’onglet invoqué.
- [Chrome : API scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting) documente l’injection et les contextes d’exécution. Ez-Kahoot lit le DOM en contexte isolé et utilise une sonde ciblée `MAIN` pour les métadonnées du client.
- Le [contrôleur public Kahoot](https://assets-cdn.kahoot.it/controller/v2/assets/controller-DxhMbHmU.js), importé par [son point d’entrée](https://assets-cdn.kahoot.it/controller/v2/assets/index-B5kiYxLj.js), a été examiné statiquement le 22 octobre 2026. Il associe `gameApiId` aux événements gameplay, tandis que `quizId` est un champ distinct des statistiques de classement final. Les champs `correctChoices` sont exploités après la révélation de réponse. Cette lecture ne prouve pas qu’un corrigé complet est envoyé avant chaque question.

La découverte d’Ez-Kahoot recherche des champs de quiz explicites, refuse de transformer un identifiant générique de joueur ou de partie en UUID de quiz et ne retourne pas les identifiants de connexion. Les données absentes restent signalées. La sonde et le panneau sont du code local, sans chargement de script tiers à l’exécution.

Le script console embarque le quiz choisi et les mêmes moteurs de lecture et de décision, sans requête réseau une fois généré. Le pont local utilise un jeton éphémère ; la connexion rapide est réservée à une origine d’extension valide et lie la première origine qui la demande pour l’instance.

## Ressources livrées

- Polices Geist : licence dans `public/fonts/LICENSE.txt`.
- GSAP 3.12.5 : notice dans `public/vendor/GSAP-NOTICE.txt`. La bibliothèque est incluse localement et ne requiert pas de CDN à l’exécution.

Le serveur utilise la bibliothèque standard de Python. `scripts/build_companion.py` génère les runtimes et fichiers partagés sans dépendance tierce.
