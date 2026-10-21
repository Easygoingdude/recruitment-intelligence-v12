# Continuité GitHub et ChatGPT Sites

Audit du 21 octobre 2026. Aucune publication ni migration pendant cet audit.

## État vérifié

| Élément | Résultat |
| --- | --- |
| GitHub privé, droits | Lecture et écriture disponibles ; droits admin annoncés |
| `main` | `c173a4305831953cc9181dc68b3c70b0b4344991`, parent du commit : fusion `083e7a8a873483c15d41e3a25b881c683a1d7603` |
| Récupération | `recovery/v12.8` à `dc404d4ea36f9f4bc4602e36aa7029731a56b5fa`, ancêtre de main ; seul ajout de fichier depuis cette branche : AGENTS.md |
| Original Sites | `405f5403230ecb813bb821efc62b4ec95a4df818`, arbre `f9dc624ef690907308077ab8d0bdbca02a114149` |
| Correspondance GitHub | 193/193 blobs de `site/` identiques aux originaux ; aucun fichier supplémentaire |
| Binaires | Deux TTF et modèle XLSX absents de `site/`, mais présents dans le bundle vérifié ; restauration indépendante de 196 fichiers et 28 commits réussie |
| Source Sites actuelle | Ouverture via le helper Sites et credential natif réussie ; HEAD identique à la version 27 |
| Version 27 | Source `405f540…`, déploiement `appgdep_6ad7d2adaaac8191a668a0d7f5c24da9`, statut `succeeded`, URL existante conservée |
| Vérifications réexécutées | 18/18 suites, TypeScript sans émission et build de production réussis ; IA simulée, aucune publication |
| Branche principale | Non protégée (`protected: false`). Lecture des rulesets refusée : GitHub demande une offre Pro pour ce dépôt privé. Aucune protection technique configurée |
| Navigateur | Écran de connexion observé. Le contrôle automatique a refusé le clic de connexion faute d'autorisation explicite du compte ; éditeur et parcours authentifiés non inspectés |

Les 196 fichiers du checkout Sites ouvert correspondent également aux SHA-256 du manifeste. Les 28 commits originaux sont préservés dans un bundle autonome : ils ne sont pas tous intégrés comme ancêtres de l'historique GitHub. `RECOVERY.md` décrit la situation avant fusion ; lire ce document d'audit pour l'état actuel, sans réécrire les preuves historiques.

## Architecture constatée dans les sources

React 19.2.6, TypeScript 5.9.3, conventions Next.js 16.3.4 via Vinext 1.0.0-beta.5 / Vite 8.0.13 ; exécution Worker Cloudflare, Drizzle 0.45.2 et liaison D1 `DB`. Serveur MCP dans `lib/mcp-server.ts`, dispatch dans `build/sites-worker.ts`, quatre migrations SQL. Lockfile pnpm présent ; `packageManager` fixe pnpm 11.25.0. Le package demande Node >=22.13, mais le chargeur de tests utilise `registerHooks` et les suites SQLite : employer Node 24, utilisé pendant cet audit.

Entrées UI : `app/page.tsx`, `components/recruitment-job-app.tsx`, `components/recruitment-intelligence-app.tsx`, `components/assessment-workspace.tsx`. M1 besoin/offre, M2 scorecard/Excel, M3 sourcing à trois axes, M4 entretiens et preuves ; suivi postes/candidatures/agenda, évaluation et compte rendu présents. Cette présence et les tests ne constituent pas une recette visuelle complète. M7/M8 et RAG documentaire sémantique étendu restent des cibles, pas des fonctionnalités validées ici.

RAG lexical de style et corpus méthodologique ciblé, caches, schémas et contrôles de sortie sont conservés. Routage existant par variables `OPENAI_LUNA_MODEL` / `OPENAI_SOL_MODEL` et alias par défaut ; disponibilité API non vérifiée, aucun identifiant modifié ni appel réel. Raisonnement Low/Medium préservé. Audit de vulnérabilités des dépendances non effectué ; aucune conclusion de sécurité générale à déduire du build. Avertissements de build : chunks >500 kB et classification de route Vinext indéterminée ; pas d'échec de compilation.

## Développement reproductible

1. Actualiser GitHub et comparer `develop`, `main` et la source actuelle Sites avant toute intervention. Conserver `recovery/v12.8` sans modification.
2. Créer `feature/<sujet>` ou `fix/<sujet>` depuis la dernière base pertinente. Modifier le minimum nécessaire.
3. Restaurer les ressources manquantes avant installation/build. Pour la baseline intacte : `python3 recovery/restore_original.py --assets-only`. Après évolution des textes, utiliser `tools/check.py`, qui restaure seulement les binaires absents et ne remplace aucun fichier existant.
4. Installer les dépendances dans `site/` avec la compétence Sites et son installateur, en respectant le lockfile et le profil de l'environnement. Ne pas importer de secrets de production. Aucune mise à jour de dépendance opportuniste.
5. Depuis la racine GitHub : `python3 tools/check.py --build`. Le chargeur de récupération neutralise fetch réel par défaut et retire OPENAI_API_KEY ; tests avec mocks et SQLite mémoire. La suite PDF conserve un chemin historique absolu `/workspace/scratch/7a4c868771a2/pdf-qa` ; il faut pouvoir y écrire. Portabilité de cette suite à corriger séparément avant généralisation aux runners externes.
6. Revoir le diff, committer, pousser sur la branche dédiée, PR vers `develop`. Après validation, PR de promotion vers `main`. Vérifier les refs et fichiers distants après chaque écriture.
7. Tagger une version réellement validée et documenter la recette. Le tag `v12.8` n'est pas créé ici : la recette authentifiée et les appels IA réels restent à vérifier. GitHub Actions n'est pas configuré par cette PR ; aucune CI distante n'est présentée comme validée.

`tools/check.py` et le modèle de PR ne fusionnent, ne déploient et ne migrent rien. La procédure de branches est actuellement une discipline de travail ; un blocage serveur exige une protection GitHub disponible et configurée.

## Transfert GitHub vers le projet Sites original

Le connecteur Sites fournit un accès au dépôt Git interne du projet. Son ouverture a réussi pendant cette session. Il ne s'agit pas du dépôt GitHub : les SHA des commits diffèrent après import, même pour un contenu identique.

Aucun bouton d'import GitHub dans l'éditeur, webhook ni synchronisation native automatique n'a été vérifié. Le chemin supporté par la compétence Sites permet de préparer une mise à jour du même projet depuis son checkout. Le transfert de modifications et la publication n'ont volontairement pas été testés sur la production.

Procédure pour la prochaine livraison autorisée :

1. Identifier le commit GitHub validé et son inventaire applicatif complet, binaires inclus. Lire le Site et la version publiée ; conserver leurs identifiants exacts. Ouvrir sa source avec `get_site`, `create_source_repository_write_credential` (sans `publish_on_push`) et le helper Sites courant. Garder les credentials uniquement en mémoire/stdin.
2. Comparer la source Sites à la dernière version synchronisée. Si l'éditeur a apporté des changements indépendants, les réconcilier d'abord dans une branche/PR GitHub ; ne pas copier par-dessus.
3. Dans le checkout Sites ouvert, appliquer uniquement le contenu applicatif de `site/` : nouveaux fichiers, modifications et suppressions intentionnelles. Conserver `.openai/hosting.json`, le project_id exact, `d1: DB`, l'audience et les bindings existants. Exclure les fichiers GitHub `plugin/`, `recovery/`, les outils de workflow, `.git`, dépendances et état local. Ne pas faire de suppression globale par rsync non examinée.
4. Comparer l'inventaire, les modes et les empreintes des deux sources. Exécuter les contrôles adaptés et préparer le build avec les helpers Sites actuels. Le helper source peut committer/pousser ; ne lancer cette phase qu'une fois les différences revues.
5. Obtenir l'accord explicite de publication, puis utiliser la procédure Sites de sauvegarde de version et déploiement avec le même project_id et la même audience. L'archive doit correspondre exactement au commit source poussé. Toute URL de déploiement Sites est une production, pas un environnement de recette isolé.
6. Contrôler statut terminal, commit source de la version, URL et parcours fonctionnels. Consigner commit GitHub, commit Sites, version Sites, déploiement, contrôles et limites dans un enregistrement de livraison. Ne pas annoncer « synchronisé » avant cette vérification.

L'identité actuelle du projet et son URL peuvent être conservées par ce mécanisme de mise à jour en place ; aucune création de Site n'est nécessaire. La conservation effective des données n'est pas démontrée par la récupération du code : préserver la liaison DB est nécessaire mais ne remplace pas la vérification des schémas, de la compatibilité et d'une sauvegarde restaurable. Ne jamais exporter de données candidats dans le dépôt.

## Retour arrière et points ouverts

Conserver le couple commit GitHub / version Sites pour chaque livraison. Une ancienne version sauvegardée et son archive correspondante peuvent servir au redéploiement via Sites, après accord. Ni git revert ni le redéploiement du code ne restaurent une base modifiée : toute migration doit avoir sa propre analyse d'impact et sa stratégie de restauration validée.

À valider avant livraison : accès authentifié à l'éditeur et aux modules, import et recette d'un changement autorisé, compatibilité des données et sauvegarde/restauration, disponibilité des modèles API et qualité métier réelle, protection de branche si l'offre GitHub le permet. Aucun secret ni ligne de production n'a été consulté ou exporté pendant cet audit.
