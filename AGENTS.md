# Recruitment Intelligence — développement

## Sources et branches

GitHub `Easygoingdude/recruitment-intelligence-v12` est la référence du code. Sources applicatives dans `site/` ; conserver `plugin/` et les preuves immuables de `recovery/`.
Site existant : `appgprj_6ad5dccbb9048191a5490c8054dd89a8`.

- `main` : versions stables validées, aucune écriture directe.
- `develop` : intégration ; partir de sa dernière version pertinente.
- `feature/*`, `fix/*` : une branche dédiée par changement, commit explicite et PR vers `develop`.
- Promotion de `develop` vers `main` par PR après validation ; aucun force-push.
- Conserver `recovery/v12.8`. Les tags désignent des versions effectivement validées, avec périmètre de validation documenté.

## Avant et après chaque tâche

Lire les instructions applicables, actualiser les refs GitHub et ouvrir le dépôt source Sites actuel avec la compétence Sites avant tout changement hébergé. Comparer les deux sources, préserver les changements concurrents ; ne jamais écraser une divergence silencieusement. Ne pas répéter la fusion de récupération.

Terminer les changements autorisés, vérifier le diff, exécuter les tests pertinents, TypeScript et le build pour une livraison applicative. `python3 tools/check.py --build` fournit une commande reproductible après installation des dépendances. Les tests utilisent des réponses IA simulées et une base en mémoire ; ils ne remplacent pas la recette fonctionnelle.

Commits et pushes de routine sur branche dédiée autorisés sans nouvelle confirmation. Créer une PR et relire les fichiers distants ; rapporter commit, PR, résultats et limites. Fusionner après validation. La protection de branche n'est pas actuellement imposée par GitHub : cette règle reste procédurale tant qu'une protection n'est pas disponible.

Exclure secrets, jetons, fichiers `.env`, CV, données candidats, exports de base, dépendances, caches et archives générées. Ne pas supprimer les fichiers historiques de récupération. Tout changement de stockage, authentification ou données de production nécessite une analyse d'impact préalable.

## Synchronisation et publication

Voir `docs/DEVELOPMENT.md`. GitHub et Sites ont des dépôts et des historiques distincts. Aucun service de synchronisation automatique n'est installé.
Après validation de GitHub, transférer uniquement les sources applicatives vers le checkout du même projet Sites, vérifier ajouts/modifications/suppressions et empreintes. Conserver le project_id, l'audience et les liaisons de stockage. Ne pas envoyer le monorepo entier à Sites.
Ne pas publier, migrer ni remplacer le Site sans accord explicite de l'utilisateur. Ne jamais demander `publish_on_push` dans ce workflow. Après accord, suivre la compétence Sites : commit source poussé, archive correspondante, version enregistrée, déploiement explicite, contrôle de son statut et recette publiée. Enregistrer les deux commits GitHub/Sites et la version effectivement publiée. Ne jamais annoncer une synchronisation complète si une étape reste bloquée.

## IA et confidentialité

Préserver les règles métier, RAG ciblé, harness, schémas et validation humaine. Pseudonymiser avant transmission, isoler sessions/recrutements et minimiser les journaux. Profils Luna Low et Sol Medium maximum ; vérifier les identifiants API avant toute évolution du routage. Aucun appel réel ni modèle plus coûteux pour une simple vérification du workflow.
