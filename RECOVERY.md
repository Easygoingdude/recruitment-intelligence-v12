# Recruitment Intelligence V12.8 — récupération de l’original

Le code original de la version publiée a été retrouvé dans le dépôt source Sites, au commit `405f5403230ecb813bb821efc62b4ec95a4df818`. La récupération conserve **196 fichiers et 28 commits**, sans reconstruction fonctionnelle. `main` GitHub et l’application en production ne sont pas modifiés.

- `site/` contient les 193 fichiers texte originaux, sans modification.
- `recovery/bundle/` conserve le dépôt Git original complet, encodé sans perte en Base64.
- `recovery/manifest.json` donne les empreintes SHA-256, les modes et les identifiants Git des 196 fichiers.
- Les deux polices TTF et le modèle XLSX sont dans le paquet Git. Le connecteur GitHub disponible n’écrit que du texte UTF-8 : ils sont restitués localement par la commande ci-dessous.
- `plugin/` et le README préexistant sont conservés depuis `main`.

## Restituer les trois ressources binaires dans `site/`

À la racine de ce dépôt, avec Python 3.9+ et Git :

```bash
python3 recovery/restore_original.py --assets-only
```

Le script vérifie le paquet, les 28 commits et les 196 fichiers. Il ne télécharge rien, ne modifie aucune branche distante et refuse de remplacer un binaire différent.

## Retrouver le dépôt Sites exact et tout son historique

Choisir un nouveau répertoire vide :

```bash
python3 recovery/restore_original.py --checkout ../recruitment-intelligence-v12.8-original
```

Ce dépôt autonome contient les fichiers binaires natifs et l’historique Git original, sur sa branche locale `recovery/v12.8`. Le commit et l’arbre Git doivent correspondre au manifeste. Aucun secret ou fichier de base de données n’est requis pour cette restitution.

Le paquet Git natif peut aussi être extrait :

```bash
python3 recovery/restore_original.py --bundle-output ../recruitment-intelligence-v12.8-original.bundle
```

## Vérification effectuée

Les 18 suites originales passent, ainsi que TypeScript et la compilation de production. Les appels IA sont simulés et les bases de test sont en mémoire ; aucune donnée de production n’a été exportée. La restitution a été testée dans un répertoire indépendant, avec vérification octet par octet des 196 fichiers.

La visite authentifiée de l’application publiée reste à terminer : le navigateur affiche la connexion ChatGPT et le contrôle automatique a refusé le clic de connexion. Aucun module publié n’a été visité dans cette session. Le rapport distingue les observations du code et la recette navigateur restante.

Voir [le rapport de récupération](recovery/REPORT.md) et [les vérifications](recovery/verification.json).

Cette branche prépare la récupération. Elle ne déclenche aucune publication, migration de production, modification de droits ou reconstruction. Le manifeste d’hébergement original reste lié au Site existant : toute publication ultérieure doit être une action distincte et explicite.
