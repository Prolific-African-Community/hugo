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
2. Lancer un seul prompt Codex.
3. Relire le resultat.
4. Lancer npm run build.
5. Corriger seulement si necessaire.
6. Valider humainement.
7. Passer au run suivant uniquement apres validation.

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
