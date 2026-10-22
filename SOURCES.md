# Sources et crédits

**Nom du projet : Ez-Kahoot**  
**Crédit : thomas marsa**

## Lecture de quiz publics

- Service source : [Kahoot](https://create.kahoot.it/).
- Point de lecture public utilisé : `https://create.kahoot.it/rest/kahoots/{UUID}`. Le serveur ne construit cette adresse qu’après validation d’un UUID ; il ne récupère pas une URL arbitraire fournie par l’utilisateur.
- Exemple public demandé dans la conversation : [brainwave](https://create.kahoot.it/details/77c46705-dab1-4ca1-a435-c287194db522).

Les questions, réponses et illustrations appartiennent à leurs auteurs ou ayants droit respectifs. Les indications « correct » reprennent la configuration du quiz source et ne constituent pas une validation scientifique indépendante.

## Projets consultés comme références

- [thinesjs/kahootyoinker](https://github.com/thinesjs/kahootyoinker) : référence pour l’idée de lire un quiz public par UUID. Le contrôleur du dépôt montre un appel au document public : [KahootAPIController.php](https://github.com/thinesjs/kahootyoinker/blob/master/app/Http/Controllers/KahootAPIController.php).
- [unixpickle/kahoot-hack](https://github.com/unixpickle/kahoot-hack) : contexte historique uniquement. Les fonctionnalités de perturbation de partie de ce dépôt ne sont pas intégrées au projet.

Le serveur Python et les modules du panel ont été écrits pour Ez-Kahoot. Aucun script de ces dépôts n’est téléchargé ou exécuté par l’application. Le serveur utilise la bibliothèque standard de Python ; il n’installe aucune dépendance tierce.

## Compagnon navigateur — sources primaires

- [Kahoot : affichage des questions sur l’appareil des participants](https://support.kahoot.com/hc/en-us/articles/115003197928-How-to-enable-See-questions-on-participant-s-screen-in-Kahoot-live-games) : l’option de l’hôte affiche le texte et les propositions sur les appareils des joueurs. Cette documentation ne promet pas la transmission des indicateurs de correction.
- [Kahoot : fonctionnement du PIN](https://support.kahoot.com/hc/en-us/articles/360000109048-How-to-find-Kahoot-PIN) : un PIN est un code temporaire pour rejoindre une session. Ez-Kahoot ne le traite pas comme un UUID de document public.
- [Chrome : permission activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab) : accès temporaire à l’onglet invoqué par l’utilisateur ; évite de demander l’autorisation globale `<all_urls>`.
- [Chrome : API scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting) : injection par `executeScript` et contexte `ISOLATED` par défaut, utilisé pour lire le DOM sans partager les variables JavaScript de la page.

La préférence pour une extension invoquée explicitement plutôt qu’une commande de console répétée est un choix de conception fondé sur ces mécanismes. Le compagnon est du code local écrit pour Ez-Kahoot ; il ne charge aucun script distant. Le pont utilise un jeton éphémère généré par la bibliothèque standard de Python et conserve le quiz préparé en mémoire.

L’alternative console embarque le quiz sélectionné et les mêmes mécanismes de lecture et de rapprochement. Elle fonctionne sans requête réseau ; elle ne cherche pas de contenu privé et ne remplace pas le texte absent de la page.

## Ressources incluses dans l’interface

- Les polices livrées avec le panel conservent leur licence dans `public/fonts/LICENSE.txt`.
- GSAP 3.12.5 est inclus localement pour les transitions de l’interface. Sa notice est conservée dans `public/vendor/GSAP-NOTICE.txt` ; aucune connexion à un CDN n’est nécessaire à l’exécution.
