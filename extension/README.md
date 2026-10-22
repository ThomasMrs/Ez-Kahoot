# Ez-Kahoot Companion

**Créé par thomas marsa · version 1.1.0**

Ce compagnon associe une question lisible sur ton onglet Kahoot au corrigé d’un quiz public ou importé dans ton panel local Ez-Kahoot. Il lit la page uniquement après ton clic sur **Lire cet onglet**. Aucun script distant n’est téléchargé ; aucun compte, cookie ou stockage de la page Kahoot n’est lu.

## Installer dans Chrome ou un navigateur Chromium

1. Lance Ez-Kahoot avec son lanceur habituel.
2. Ouvre `chrome://extensions` dans Chrome.
3. Active **Mode développeur**.
4. Clique **Charger l’extension non empaquetée**, puis choisis ce dossier `extension`, celui qui contient `manifest.json`.
5. Épingle **Ez-Kahoot Companion** à la barre d’outils. Tu peux aussi l’ouvrir avec **Alt+Maj+K**, si le raccourci n’est pas déjà utilisé. Les raccourcis se règlent dans `chrome://extensions/shortcuts`.

## Connecter et utiliser

1. Dans Ez-Kahoot, charge ton quiz puis ouvre **Compagnon**.
2. Partage ce quiz avec le compagnon depuis le panel, et copie le **code de connexion local**.
3. Ouvre le compagnon dans la barre d’outils, colle le code commençant par `EZK1.`, puis clique **Connecter**.
4. Place-toi sur ton onglet Kahoot et clique **Lire cet onglet**. Le compagnon lit la question et les propositions visibles. Il charge le quiz public si son UUID apparaît dans l’adresse ou dans un lien identifiable ; sinon il utilise le quiz partagé par le panel.
5. Si le texte est absent ou mal détecté, ouvre **Ou saisir la question manuellement**. Le texte saisi sera recherché dans le quiz chargé dans le compagnon. Fermer puis rouvrir le compagnon recharge le quiz partagé depuis le panel.

Une correspondance exacte est indiquée par **Texte identique**. Une question proche est présentée comme une **ressemblance**, à vérifier. Si plusieurs questions se ressemblent, elles restent distinctes. Le compagnon affiche le texte des bonnes réponses configurées par l’auteur du quiz ; il ne suppose pas que les positions ou les couleurs sont identiques à la partie.

## Connexion et permissions

- `activeTab` et `scripting` donnent accès à l’onglet actif après ton action. L’injection du lecteur utilise le contexte isolé par défaut.
- `storage` conserve uniquement l’adresse locale et le code d’association du compagnon.
- La permission d’hôte est limitée à `http://127.0.0.1/*`, pour communiquer avec le serveur Ez-Kahoot de ton appareil.
- Le code d’association est renouvelé au redémarrage du serveur. S’il expire, recopie le nouveau code depuis le panel. **Déconnecter** efface la connexion enregistrée dans l’extension.

## Limites

Un PIN identifie une partie, pas nécessairement le document public de son quiz. Si seules des formes colorées sont affichées, le lecteur ne peut pas reconstituer le texte manquant. Un quiz privé ou un corrigé non transmis à Ez-Kahoot reste indisponible. Les questions uniquement en images doivent être consultées dans le panel. Les pages et les réglages de Kahoot peuvent évoluer ; la lecture réelle d’une partie n’est pas garantie par les seuls tests sur des pages de démonstration.

Le compagnon n’envoie aucune réponse dans la partie. Il ne modifie pas le quiz ni les choix de la page.

## Tests

Les tests sont inclus dans la distribution complète d’Ez-Kahoot, dans `extension/tests/` (pas dans l’archive d’installation de l’extension seule). Depuis le dossier `extension`, sans installer de paquet :

```sh
node --test tests/*.test.mjs
```
