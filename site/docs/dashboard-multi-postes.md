# Postes candidatures et agenda

La navigation distingue les postes, les candidatures et l’agenda. Chaque poste conserve son dossier M1 à M3. Nouveau poste reprend seulement les préférences de style. Changer de poste ou de module attend la sauvegarde du dossier et de l’entretien. Une erreur conserve le contexte actif ; un appel IA actif bloque le changement.

## Une candidature et plusieurs entretiens

`recruitment_applications` porte une fiche par poste avec une référence aléatoire pseudonymisée. Une candidature peut exister avant l’entretien. Plusieurs rendez-vous et rapports partagent son `applicationId` et comptent une seule candidature. Les sources historiques actives sont reprises idempotemment ; les initiales seules ne déclenchent aucun rapprochement.

Le tableau Candidatures filtre par poste et état, indique le nombre d’entretiens et ouvre le bon rapport. Planifier reprend la candidature sélectionnée. Regrouper deux anciennes références exige le même poste, les mêmes initiales et une confirmation qu’il s’agit de la même personne. La référence et la décision de la cible sont conservées. Les alias gardent les anciens rattachements lisibles et empêchent leur recréation.

## Décision et réouverture

Go et No Go dans l’agenda décrivent une étape. Le statut global apparaît séparément. M5 prévaut sur ces résultats ; un Go tardif ne rouvre pas une candidature clôturée. Embauché et Ne pas poursuivre en M5 protègent la décision finale. Le suivi direct ne remplace pas une décision M5.

La réouverture est explicite avec un motif contrôlé : Nouvelle information, Erreur de saisie ou Nouvel échange. Le serveur trace auteur et date. Les décisions antérieures ne se réappliquent pas au rechargement. No Go et Ne pas poursuivre demandent `Are you sure?`. Aucun message candidat ni décision automatique n’est déclenché.

## Compteurs conservation et historique

Les compteurs courants utilisent les candidatures canoniques non expirées. No Go, Ne pas poursuivre et Embauché sont clôturées. Ils restent indisponibles tant que les sources ne sont pas chargées. Les anciens compteurs manuels restent séparés.

Les comptes rendus, preuves et CV gardent leur échéance propre de 14 jours, sans prolongation par modification. Les rendez-vous expirent 14 jours après leur date. Les métadonnées de candidature expirent 14 jours après leur création, ou à la dernière échéance d’un entretien rattaché si elle est ultérieure. Cette extension ne prolonge jamais un rapport ni un CV.

À l’expiration des métadonnées, un déclencheur SQL supprime la fiche et ajoute une seule fois des totaux par utilisateur, poste et mois de création à `recruitment_application_history`. Les alias sont exclus. Ces totaux ne contiennent ni initiales, ni référence, ni identifiant de candidature, ni preuve, ni CV. L’état retenu est celui de l’expiration. L’historique commence à son activation ; il ne reconstitue pas les données déjà purgées et reste séparé des compteurs courants.

## Agenda et actualisation

L’agenda couvre aujourd’hui à J+3 inclus dans Europe/Paris, avec changement d’heure. Le nombre d’entretiens réunit rendez-vous et rapports sans doubler un rapport lié à un rendez-vous. Les sessions sans poste restent accessibles jusqu’à leur rattachement explicite.

Les écritures sont authentifiées, isolées par utilisateur et protégées par révision optimiste. Le regroupement utilise un lot SQL atomique avec gardes de révision. L’écriture d’une source et sa synchronisation de candidature sont séquentielles : un échec partiel est signalé et réparé par réconciliation au chargement ou via Actualiser. Les changements de la session rafraîchissent le suivi et une lecture légère des métadonnées intervient toutes les 60 secondes. Tous les écrans ne sont pas synchronisés instantanément entre fenêtres.

## Vérification

La migration `0003_spotty_komodo` ajoute les deux tables et le déclencheur. `test-candidature-workflow.ts` utilise les migrations réelles et SQLite transactionnel : trois entretiens pour une candidature, protection M5, réouverture sans rejeu, regroupement explicite, isolation, conflits et purge sans identifiants dans l’historique. Les suites existantes couvrent aussi l’agenda et la conservation. `lib/application-tracking.ts` reste une projection V12.7 de compatibilité ; l’interface utilise les fiches persistées.

Aucun appel IA n’est nécessaire pour ces parcours. La recette navigateur de cette révision n’a pas pu être achevée dans l’environnement de développement.
