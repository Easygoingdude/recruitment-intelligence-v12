# Architecture fonctionnelle V12 8

Cette révision applique les améliorations de navigation et de processus au socle V12. Le projet privé, les données et la pseudonymisation sont conservés.

## Parcours métier

Postes présente les compteurs, le nombre d’entretiens et une prochaine action calculée localement. Cette action ouvre le besoin, l’offre, la grille, le sourcing ou le rapport concerné. Candidatures et Agenda sont accessibles sans ouvrir un poste. Les paramètres IA et de style restent repliables et sont masqués dans les vues globales et les entretiens.

Le Need Builder commence par huit champs essentiels : intitulé, motif, missions, compétences indispensables, objectifs à six mois, localisation, management et salaire. Un filtre n’affiche que les champs essentiels manquants ; le formulaire complet conserve ses dix dimensions et l’import reste disponible.

M2 replie le guide et les ancrages du critère sélectionné. La génération prépare au plus six questions principales pour Jeune diplômé, Opérationnel et Manager, huit pour Direction, une par critère. Une deuxième formulation indépendante sur le transfert reste une alternative facultative. Les alternatives et relances ne s’ajoutent pas au parcours obligatoire. Le contrat à deux champs et les grilles historiques restent compatibles ; les notes sont saisies dans l’entretien.

M4 présente par défaut un critère avec question, preuve, note, progression, état de sauvegarde et boutons précédent et suivant. La vue complète reste accessible. Le CV et la question de transfert sont repliables. Toute note, même zéro, exige une preuve. Les sessions conservent leur grille figée et leur échéance.

## Réécriture de l’offre

Réécrire une section transmet le brief, les réglages de style et le seul texte sélectionné. Le serveur exige exactement l’une des huit sections. L’interface propose Appliquer ou Garder mon texte. Une modification du brief ou du texte depuis l’appel empêche l’application de la proposition. Les autres sections restent identiques et le contrôle qualité complet est recalculé localement.

La sortie est plafonnée à 1 200 tokens contre 3 000 pour une offre complète, sans nouvelle tentative automatique. Ce plafond ne constitue pas une économie exacte en euros. Routage, RAG de style, Harness et isolation du cache restent actifs. Les versions `RI_V12_AI_1_11` et `RI_RESULT_CACHE_10` écartent les anciennes réponses. Le PDF reprend les sections appliquées sans appel IA.

## Stockage et plugin

`dashboard-multi-postes.md` décrit candidatures, alias, décisions, historique et échéances. L’API `/api/applications` est privée. Le serveur MCP 1.6 décrit les nouveaux parcours et limites de questions ; les outils M1 à M6 conservent leurs contrôles IA et aucune action autonome de recrutement n’est ajoutée.

Le nettoyage des entretiens préserve les UUID techniques validés : une terminaison numérique ne doit pas être traitée comme un téléphone et casser la sauvegarde. Les textes libres restent expurgés et contrôlés. Une régression couvre ce cas sur l’API.

## Recette

Les 18 suites de règles, d’API SQLite, de confidentialité et d’exports passent sans appel fournisseur réel. Les deux nouvelles suites couvrent les candidatures et la réécriture ciblée : routage, plafond, cache, mauvaise section rejetée, proposition dépassée refusée et autres sections préservées. TypeScript et la compilation de production complètent les vérifications.

L’aperçu navigateur a été indisponible, puis son accès a été bloqué dans cet environnement. Les interactions visuelles de cette révision restent à recetter dans l’application publiée. Les réponses IA sont simulées ; la qualité rédactionnelle et les coûts réels ne sont pas mesurés par ces tests.
