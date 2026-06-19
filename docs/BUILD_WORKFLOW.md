# Hugo - Build Workflow

## Methode de travail

Un run Codex = un objectif verifiable.

Ne jamais melanger inutilement :
- UI
- Prisma
- API
- logique metier
- refactor
- design
- integration externe

## Regles

1. Definir un objectif unique avant chaque run.
2. Verifier la coherence avec la Vision Produit dans docs/HUGO_CONTEXT.md.
3. Verifier que le run ne recree pas une fonctionnalite dont la source de verite est externe.
4. Lancer un seul prompt Codex.
5. Relire le resultat.
6. Lancer npm run build.
7. Corriger seulement si necessaire.
8. Valider humainement.
9. Passer au run suivant uniquement apres validation.

## Avant chaque run

Verifier :
- l'objectif est compatible avec Hugo comme assistant operationnel intelligent
- Doctena reste la source de verite cible de l'agenda patient
- Apple Calendar est la couche de synchronisation cible pour les rendez-vous
- la CNS reste la source de verite de la facture officielle
- Hugo ne se transforme pas en agenda concurrent, ERP, comptabilite ou logiciel de facturation legale
- le run ajoute une couche d'assistance, de suivi, d'alerte, d'archivage ou de rapprochement utile au cabinet

## Format attendu apres chaque run

Codex doit resumer :
- fichiers crees
- fichiers modifies
- fichiers supprimes
- logique ajoutee
- risques restants
- resultat du build

## Interdictions

Ne pas :
- modifier Prisma sans instruction explicite
- creer une migration sans instruction explicite
- toucher a l'auth sans instruction explicite
- refactoriser globalement sans instruction explicite
- creer plusieurs modules metier dans un meme run
- developper une integration externe sans validation

## Priorites

1. Stabilite
2. Simplicite
3. Vitesse
4. UX claire
5. Fonctionnalites utiles au kine

## Workflow de validation

Apres chaque run :
- si build vert et objectif atteint : validation
- si build rouge : correction ciblee
- si objectif partiellement atteint : run correctif
- si Codex a fait trop large : rollback ou nettoyage cible

Critere de validation :
- docs/HUGO_CONTEXT.md existe.
- docs/BUILD_WORKFLOW.md existe.
- aucun fichier applicatif n'a ete modifie.
- npm run build passe ou reste inchange.
- resume final clair.
