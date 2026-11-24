# Ez-Kahoot Companion 1.6.0

**Créé par thomas marsa.** Rejoins ta partie : le panneau s’ouvre automatiquement et recherche les réponses d’un quiz public. Aucun serveur Python, code de connexion ou compte supplémentaire n’est nécessaire pour ce mode.

## Installer ou mettre à jour

1. Décompresse l’archive et conserve le dossier contenant `manifest.json`.
2. Ouvre `chrome://extensions` dans Chrome ou `edge://extensions` dans Edge ; active **Mode développeur**.
3. Clique **Charger l’extension non empaquetée** et sélectionne ce dossier. Pour une mise à jour, remplace les fichiers et actualise la carte de l’extension. Les nouvelles permissions donnent accès aux pages Kahoot et à la recherche publique.
4. Recharge les onglets Kahoot déjà ouverts, puis rejoins ta partie.

## Utiliser

Le panneau démarre automatiquement sur `kahoot.it` et `play.kahoot.it`. Il suit les questions et affiche les réponses confirmées. Fermer le panneau arrête son suivi jusqu’au rechargement de la page ou à une relance volontaire depuis le popup.

**Ouvrir automatiquement sur Kahoot** active ou désactive ce comportement et applique le réglage aux onglets ouverts. **Lancer sur Kahoot** permet de rouvrir le panneau. **Alt+Maj+K** ouvre le popup si ce raccourci est disponible.

L’Auto-clic est facultatif et désactivé au départ. Il exige une question exacte et unique, toutes les corrections connues, une seule bonne réponse et des boutons identifiés par leurs textes. Les réponses multiples restent affichées pour une sélection manuelle.

## Comment les réponses sont retrouvées

- Si la page transmet l’UUID public du quiz, l’extension en charge le corrigé public.
- Sinon, elle recherche un candidat à partir de la question et de ses propositions reçues ou visibles. Elle vérifie au plus vingt candidats issus de trois recherches, avec comparaison exacte des textes, des choix et du nombre d’éléments de la partie lorsqu’il est disponible. Plusieurs candidats compatibles restent signalés comme ambigus.
- Un corrigé retrouvé reste utilisable pour les questions suivantes. Les appels identiques sont regroupés et mis en cache ; une limitation de fréquence de Kahoot suspend les nouvelles requêtes.
- Le texte reçu dans l’état de la page peut compléter une question sans titre visible uniquement si le numéro de manche correspond et pendant trois secondes au maximum. Ce complément sert à l’affichage, sans autoriser de clic.

Un PIN seul ne contient pas les réponses. Aucun fonctionnement universel n’est garanti pour un quiz privé, une question uniquement en image, une recherche sans candidat confirmé ou une page ne transmettant pas assez d’informations. Une **Correction reçue après la question** concerne une manche terminée et ne constitue pas une réponse anticipée.

## Quiz importé et connexion locale (facultatif)

Pour utiliser un JSON importé : lance le panel Ez-Kahoot, charge le quiz, puis **Compagnon → Envoyer ce quiz au compagnon**. Dans le popup, ouvre **Quiz importé et connexion locale**, clique **Connexion rapide**, puis **Lancer sur Kahoot**.

La connexion rapide utilise `http://127.0.0.1:8765`. Pour un autre port, colle le code `EZK1.…` du panel. Le serveur doit rester ouvert pour ce mode local ; son redémarrage invalide l’ancien code. **Déconnecter** supprime l’association locale, sans désactiver le mode autonome.

## Permissions et données

- `scripting` et l’accès aux hôtes `kahoot.it` / `play.kahoot.it` permettent le démarrage et la lecture automatiques du panneau. `activeTab` conserve le lancement manuel.
- L’accès à `create.kahoot.it` permet de lire les quiz publics et leurs résultats de recherche directement depuis l’extension, avec `credentials: omit`. Aucun cookie ni identifiant de connexion n’est transmis.
- La sonde `MAIN` lit uniquement des métadonnées de quiz, du texte de question et des corrections déjà révélées. Le panneau reste dans le contexte isolé de l’extension.
- `storage` conserve le réglage automatique et l’éventuelle connexion locale. `http://127.0.0.1/*` sert uniquement au panel facultatif.

## Développement

Depuis la racine du projet complet :

```sh
python3 scripts/build_companion.py
python3 -m unittest discover -s tests -v
node --test extension/tests/*.test.mjs
```

Les fichiers générés sont `live-runtime.js`, `probe-runtime.js` et `public/shared/`. Les tests sont inclus dans l’archive du projet complet, pas dans le ZIP d’installation de l’extension.

## Liens, OCR et mémoire — 1.6

Ouvre **Liens, OCR et mémoire** dans le popup. Charge un lien de quiz accessible, puis choisis l’onglet joueur auquel l’associer. Les liens de devoir et les PIN sont distingués des liens de quiz.

Pour une question en image : importe un PNG/JPEG/WebP ou utilise **Capturer un écran ou un onglet**, puis **Lire le texte**. Vérifie la séparation question/propositions avant **Rechercher le corrigé**. L’image reste locale ; seuls les termes de la question servent aux recherches publiques. Aucun service d’IA générative.

La mémoire conserve les corrections reçues après résultat (100 entrées / 1 Mo). Les contradictions bloquent la réutilisation ; tu peux consulter, supprimer et exporter les entrées. Le diagnostic affiche les métadonnées de quiz reçues, sans journal réseau brut ni données de compte.

L’OCR, les langues français/anglais et les licences sont dans `vendor/ocr/`. Conserve le dossier complet lors de l’installation. Recharge les onglets Kahoot pour que le récepteur passif démarre avant les connexions du jeu. Un corrigé privé non transmis reste inaccessible.
