# Rapport de récupération — Recruitment Intelligence V12.8

Établi le 21 octobre 2026 (Europe/Paris).

## Résultat

Le dépôt source Sites original est disponible indépendamment de la conversation supprimée. Son HEAD est `405f5403230ecb813bb821efc62b4ec95a4df818`, identique au commit V12.8 du dossier d’architecture actuel et à la source de la version Sites 27 dont le déploiement est réussi.

Les **196 fichiers originaux (4 737 854 octets) et les 28 commits** ont été récupérés. Aucun code métier n’a été réécrit. Le paquet Git est autonome : il conserve les objets, l’historique, les modes et les binaires natifs. Son empreinte et celles de chaque fichier figurent dans `manifest.json`.

Le dépôt GitHub privé était à `f1852ea9c747370b1ee75f62c01fc8852ca7a8d3`, avec un README de démarrage et trois fichiers du plugin. Aucun code applicatif n’y figurait. `recovery/v12.8` est créée depuis ce commit ; les ajouts de récupération sont limités à cette branche. Le README et les fichiers de plugin préexistants sont conservés.

## Exploration et ressources

L’URL publiée a été ouverte dans le navigateur cloud. L’écran « Connectez-vous pour accéder au site » présente « Continuer avec ChatGPT ». Le contrôle automatique a refusé ce clic : il demande une autorisation explicite de connexion et l’identification du compte. La navigation authentifiée M1–M4 n’a donc pas été réalisée. Aucun jeton d’accès n’a été injecté dans le navigateur et aucune protection du site n’a été modifiée.

L’examen suivant provient des **sources récupérées**, du dossier d’architecture V12.8 actuel (version documentaire 6), des métadonnées Sites et des tests exécutés ; il ne constitue pas une observation visuelle des modules publiés.

| Périmètre | Original récupéré | Vérification et recette restante |
| --- | --- | --- |
| Accueil | Postes, candidatures, agenda J à J+3, prochaine action, compteurs et historique agrégé | Tests métier/API passent ; parcours visuel authentifié restant |
| M1 Besoin et offre | Huit champs essentiels, formulaire complet, import PDF textuel/DOCX/TXT, analyse, offre, réécriture d’une section avec proposition à appliquer, export PDF | Contrats IA, invalidation de besoin, section ciblée et PDF testés ; qualité IA réelle et interactions publiées restantes |
| M2 Scorecard | Profils, critères, question principale et alternative de transfert, ordre, ancrages, seuils, export Excel | Tests limites, profils, questions, ordre et Excel passent ; glisser-déposer et affichage publiés à vérifier |
| M3 Sourcing | Trois axes maximum, variantes précises/adjacentes/transférables, neuf jeux de requêtes, adaptation aux plateformes, proposition IA explicite | Tests requêtes, entonnoir et maintien du niveau managérial passent ; interactions publiées à vérifier |
| M4 Entretien | Grille figée, mode un critère, preuves, notes humaines, progression, CV pseudonymisé, préparation des relances | Tests sessions, accès, confidentialité et conservation passent ; parcours visuel et appels IA réels à vérifier |
| M5–M6, au-delà de la visite demandée | Évaluation humaine, protection des décisions, compte rendu et exports | Sources récupérées intégralement et tests existants exécutés |
| Frontend partagé | 74 fichiers TSX, styles, composants UI, SVG, worker PDF, polices et modèle XLSX | Sources et ressources originales vérifiées par empreinte ; aucun besoin de décompilation |
| Serveur et MCP | Worker, API IA, postes, candidatures, rendez-vous, entretiens et outils MCP | Sources récupérées, contrôle TypeScript et compilation réussis |
| Base de données | Schémas Drizzle et quatre migrations SQL | Liaison de production `DB` toujours présente ; tables listées, aucune ligne lue ou exportée |

Entrées principales : `site/app/page.tsx`, `site/components/recruitment-job-app.tsx`, `site/components/recruitment-intelligence-app.tsx`, `site/components/assessment-workspace.tsx`, `site/build/sites-worker.ts`.

## Ce qui est récupéré et ce qui manque

| Élément | État | Suite nécessaire |
| --- | --- | --- |
| Sources de la version publiée | Complet, commit et arbre exacts | Aucune reconstruction |
| Historique original Sites | 28 commits, paquet autonome vérifié | Restituable hors ligne avec le script fourni |
| Ressources frontend originales | Toutes celles suivies par Git sont présentes dans le paquet | Décoder les deux TTF et le XLSX dans `site/` avant utilisation de cette copie ; le dépôt restitué les contient nativement |
| Archive de déploiement originale | Métadonnées récupérées : TAR, 87 fichiers, 9 533 440 octets et SHA-256 connu | Les octets n’ont pas été téléchargés : la tentative de matérialisation a été refusée par la vérification de propriété. Aucun accès alternatif n’a été forcé |
| Compilation locale récupérée | Réussie, environ 9,4 Mo | Cette compilation est une régénération ; elle ne doit pas être présentée comme l’archive déployée originale |
| Données métier de production | Pas de sauvegarde réalisée ; cinq tables de production encore référencées | Export/restauration dédiés à planifier si nécessaire, avec conservation des droits et durées existants |
| Variables et secrets d’exécution | Non exportés, non inspectés | À réutiliser uniquement dans l’environnement autorisé ; ne pas les committer |
| Session et état local du navigateur de l’utilisateur | Non récupérés | Vérifier les dossiers depuis le compte après connexion autorisée |
| RAG documentaire étendu, rôles collaboratifs, M7 et M8 | Fonctionnalités cibles dans le dossier d’architecture | Évolutions futures distinctes de la récupération |

Les tables de production visibles par l’inventaire sont `interviews`, `recruitment_application_history`, `recruitment_applications`, `recruitment_appointments` et `recruitment_jobs`. Cet inventaire ne démontre pas l’intégrité des données ni l’existence d’une sauvegarde.

La tâche quotidienne de suppression des entretiens expirés est toujours déclarée active à 04:00 UTC. Elle n’a pas été modifiée ni déclenchée lors de cette récupération.

## RAG et Harness préservés

Le code de `lib/recruitment-ai.ts`, `lib/assessment-ai.ts`, `lib/assessment-agent-contract.ts`, `lib/ai-contract.ts`, `lib/ai-cache.ts` et `lib/style-reference.ts` est conservé à l’identique.

- M1–M3 : RAG lexical de style, sélection limitée d’extraits, schémas de sortie, contexte rattaché au besoin et caches isolés. Versions `RI_V12_AI_1_11` et `RI_RESULT_CACHE_10`.
- M4–M6 : corpus méthodologique versionné et filtré par tâche, deux passages maximum. Les faits viennent de la grille figée et des preuves sélectionnées ; ni corpus de style ni autres candidats ne sont ajoutés.
- Harness : authentification et origine, validation d’entrée/sortie, contexte borné, un appel maximum, zéro relance automatique, limites de temps/débit, contrôle des références et citations. Les propositions ne modifient pas automatiquement notes ou décision.
- Routage : alias Luna pour les tâches courantes et Sol pour les traitements complexes, raisonnement Low/Medium. Ces alias existants ne sont pas une vérification de leur disponibilité commerciale ; aucun appel réel n’a été effectué.

Le RAG actuel est ciblé et déterministe ; un RAG documentaire sémantique gouverné reste une cible. La récupération conserve ce qui existe sans le présenter comme plus complet.

## Pseudonymisation et limites observées

La règle du plugin et les fonctions serveur sont conservées. Les références sont en initiales prénom puis nom, avec une référence aléatoire pour distinguer les sessions/candidatures. Les fonctions de confidentialité suppriment les coordonnées et identifiants reconnus puis bloquent les motifs résiduels détectés avant appel externe. Les tests couvrent cette suppression, les références et les contrôles d’accès.

Le CV est extrait puis pseudonymisé dans le navigateur, relu et confirmé avant enregistrement. Le fichier brut, le nom de fichier et le nom complet temporaire ne font pas partie du dossier enregistré. Le texte du CV n’est pas ajouté automatiquement au RAG ou aux prompts. Les traitements candidat sont exclus du cache applicatif partagé ; le parcours privé des agents désactive le cache de prompt et utilise `store: false`.

Ces contrôles ne détectent pas tous les noms inconnus, les identifiants indirects ou toutes les variantes linguistiques. La fonction d’initiales repose sur le premier et le dernier élément du nom ; les noms composés nécessitent une recette dédiée. Une confirmation utilisateur n’est pas une garantie exhaustive de minimisation. Le stockage séparé d’une correspondance d’identité avec habilitations reste une cible documentaire ; aucun coffre d’identité complet n’est démontré par cette récupération.

Il s’agit de pseudonymisation, pas d’anonymisation complète. Aucun CV réel, contenu candidat, ligne de production, secret ou correspondance d’identité n’a été ajouté à cette branche.

## Vérifications exécutées

1. HEAD et arbre Git d’origine identifiés, dépôt contrôlé par `git fsck --full`.
2. Paquet Git vérifié autonome ; restitution dans un nouveau répertoire, 28 commits retrouvés et 196 fichiers comparés octet par octet.
3. Les 18 suites originales passent, avec SQLite en mémoire et réponses IA simulées. Le chargeur de test fourni ne modifie pas les sources, supprime `OPENAI_API_KEY` de son processus et interdit le réseau réel par défaut.
4. TypeScript : `tsc --noEmit --incremental false`, succès.
5. Compilation de production par la procédure Sites, succès. Aucun déploiement ni migration de production.
6. Recherche de motifs de secrets dans les 196 fichiers actuels et les 358 blobs historiques : aucun motif trouvé. Cette recherche ciblée ne constitue pas un audit exhaustif de secrets.

Les contrôles n’établissent pas la qualité métier des réponses d’un fournisseur réel, ni le rendu visuel authentifié, ni la restauration des données de production. Les scripts d’origine de recette PDF peuvent écrire leurs sorties temporaires dans un ancien chemin de QA ; ce comportement a été préservé dans l’original.

## Reprise recommandée

La priorité suivante est la visite authentifiée de M1 à M4 sur le site publié, après autorisation de connexion au compte ChatGPT. La version publiée reste inchangée. Les anomalies éventuellement constatées seront traitées dans un travail séparé, à partir de cet original récupéré et vérifié.
