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

## Regles de build - Module Rendez-vous / Calendrier

Avant chaque run lie a `Appointment`, `TherapySession`, `CalendarConnection`, Apple Calendar ou au planning, Codex doit verifier :

1. Le changement respecte-t-il le modele suivant ?
   - `CalendarEvent` externe
   - `Appointment`
   - `TherapySession`
   - `Prescription`
   - CNS tracking
2. Le changement renforce-t-il le cockpit agenda comme interface principale du praticien ?
3. Le changement evite-t-il les sources de verite concurrentes ?
4. Le changement evite-t-il de stocker de la logique technique dans les notes visibles ?
5. Le changement evite-t-il une desynchronisation Apple Calendar / Hugo ?
6. Le changement prepare-t-il le futur bidirectionnel au lieu de creer un bricolage local ?
7. Le changement est-il compatible avec la roadmap ?
   - Calendar Sync Foundation
   - Apple Calendar Write
   - Cockpit Agenda
   - Drag & Drop
   - Assistant planning

Priorite produit pour le planning :
1. Coherence calendrier / `Appointment`
2. Synchronisation externe fiable
3. Vue cockpit agenda
4. Actions rapides praticien
5. Intelligence / automatisation

Regle de blocage :
Ne pas implementer de drag & drop, deplacement automatique ou modification locale d'evenement externe sans :
- mapping externe propre
- queue de synchronisation
- strategie de push externe
- gestion minimale des conflits ou erreurs

Regle de prompt :
Chaque futur prompt Codex lie au planning doit preciser :
- source concernee : `MANUAL`, `APPLE_CALENDAR`, `DOCTENA`
- effet attendu cote `Appointment`
- effet attendu cote `TherapySession`
- effet attendu cote calendrier externe
- risque de desynchronisation
- validation build obligatoire

### Cron Apple Calendar

Le cron de synchronisation sortante Apple Calendar doit rester controle :
- `CRON_SECRET` doit etre configure dans les variables d'environnement Vercel.
- Le cron ne doit jamais exposer les secrets CalDAV.
- Le traitement automatique reutilise les validations du helper de push et ne remplace pas les controles manuels.
- Le cron `calendar-sync` traite le push Hugo -> Apple Calendar et le pull Apple Calendar -> Hugo via `.ics`.
- Le pull entrant ne doit jamais ecraser une modification locale `LOCAL_PENDING`.

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
