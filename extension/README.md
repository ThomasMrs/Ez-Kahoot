# Ez-Kahoot Companion 1.3.0

Thème violet et blanc, monogramme K⚡ et police Montserrat livrée localement. Après remplacement des fichiers, actualise la carte de l’extension pour charger les nouveaux visuels.

**Créé par thomas marsa.** Un petit panneau sur ton onglet Kahoot affiche les réponses d’un corrigé public ou importé et propose un Auto-clic facultatif.

## Installer ou mettre à jour

1. Lance le serveur Ez-Kahoot.
2. Dans Chrome, ouvre `chrome://extensions` et active **Mode développeur**. Dans Edge, utilise `edge://extensions`.
3. Clique **Charger l’extension non empaquetée** et choisis ce dossier, contenant `manifest.json`.
4. Épingle **Ez-Kahoot Companion**. **Alt+Maj+K** peut aussi l’ouvrir ; les raccourcis se règlent dans `chrome://extensions/shortcuts`.

Pour mettre à jour une installation existante, remplace ses fichiers, clique **Actualiser** sur sa carte d’extension, puis relance le panneau dans Kahoot.

## Utiliser

1. Ouvre l’extension et clique **Connexion rapide**.
2. Place-toi dans ton onglet Kahoot et clique **Lancer sur Kahoot**.
3. Le petit panneau suit les questions. Active **Auto-clic** pour cliquer une fois sur une réponse entièrement identifiée ; il est désactivé au départ.
4. La croix du panneau arrête la lecture et les clics. Il faut le relancer après un changement complet de page.

Si le client transmet l’UUID d’un quiz public, le compagnon demande son corrigé au serveur local. Il peut aussi utiliser un quiz envoyé depuis la vue **Compagnon** du panel. Si la détection ne fournit pas de corrigé, le panneau l’indique.

**Rechercher une question**, replié sous le bouton de lancement, permet de lire l’onglet ponctuellement ou de saisir la question. Les ressemblances restent signalées et ne déclenchent pas d’Auto-clic.

## Connexion avancée

La connexion rapide utilise `http://127.0.0.1:8765` et associe la première origine d’extension valide qui la demande pour cette instance. Pour un autre port ou une autre installation, ouvre **Connexion avancée** et colle le code `EZK1.…` du panel, puis clique **Utiliser ce code**.

Garde le serveur ouvert. Un redémarrage ou une régénération de code nécessite une nouvelle connexion. **Déconnecter** efface l’association enregistrée dans cette extension.

## Ce que fait l’Auto-clic

Le moteur exige une question exacte et unique, toutes les corrections connues, une seule bonne réponse et une correspondance complète des textes de choix. Il vérifie la manche et le bouton actif juste avant de cliquer. Les couleurs et l’ordre du quiz source ne déterminent jamais le bouton.

Questions ambiguës, ressemblances, choix uniquement en images et réponses multiples restent manuels. Une réponse connue peut s’afficher avant l’activation des boutons, sans clic. Le compagnon utilise les boutons de la page ; il ne modifie ni le quiz ni les règles de score.

Sur `/answer/result`, **Correction reçue après la question** désigne le résultat d’une manche terminée. Il n’est pas réutilisé pour la suivante. Un PIN, une URL générique ou un identifiant de partie ne garantit pas l’UUID public du quiz, ni ses réponses à l’avance.

## Permissions et données

- `activeTab` et `scripting` donnent accès à l’onglet invoqué. Le texte visible est lu en contexte isolé ; la sonde de métadonnées s’exécute en contexte `MAIN` de la page.
- La sonde ne retourne que les métadonnées de quiz et, sur la route de résultat, la correction révélée de la manche. Les cookies et identifiants de connexion ne sont pas retournés.
- `storage` conserve la connexion au serveur local. L’autorisation d’hôte reste limitée à `http://127.0.0.1/*`.

Les pages de Kahoot peuvent changer. La lecture d’une partie réelle dépend des données que son client reçoit ; les tests sur pages contrôlées ne garantissent pas toutes les configurations.

## Développement

Les sources lisibles sont dans ce dossier. Depuis la racine du projet, reconstruis les fichiers générés avec :

```sh
python3 scripts/build_companion.py
```

Les tests sont inclus dans la distribution complète, pas dans l’archive d’installation de l’extension seule. Depuis ce dossier :

```sh
node --test tests/*.test.mjs
```
