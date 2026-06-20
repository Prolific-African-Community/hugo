# Hugo - Product Context

Hugo est un assistant operationnel intelligent pour cabinet de kinesitherapie au Luxembourg.

Hugo est un outil prive concu pour le cabinet d'un kinesitherapeute nomme Hugo. Il reduit la charge administrative quotidienne en reliant les informations utiles du cabinet, en signalant les oublis possibles et en proposant les prochaines actions.

## Vision Produit

Hugo n'est pas un ERP, pas un logiciel de comptabilite, pas un logiciel de facturation legale et pas un concurrent de Doctena.

Hugo est une couche intelligente au-dessus des outils deja utilises par le cabinet :

```text
Doctena
↓
Apple Calendar
↓
Hugo
```

Pour l'agenda, Hugo doit lire les rendez-vous existants, identifier les patients, detecter les nouvelles seances, creer ou mettre a jour les dossiers patients, puis proposer des actions utiles.

Pour la facturation, Hugo ne genere pas la facture legale. Les factures officielles sont produites via la CNS :

```text
CNS
↓
facture officielle
↓
Hugo recupere / reference / archive / suit
```

Hugo doit suivre les statuts, rappeler les actions, archiver les documents et centraliser les informations. Il peut preparer le travail administratif, mais il ne remplace pas les systemes officiels.

## Vision centrale - Rendez-vous & Calendrier

Le module Rendez-vous / Calendrier est le coeur du produit Hugo.

Le praticien doit pouvoir gerer son quotidien depuis Hugo, sans passer constamment entre Doctena, Apple Calendar, notes papier, suivi des seances et suivi CNS. Le produit ne doit pas devenir une simple base de donnees de patients ou de seances : Hugo doit devenir l'interface principale de travail du cabinet.

Apple Calendar est aujourd'hui la source externe principale des evenements, car Doctena y synchronise deja les rendez-vous. Hugo doit recuperer ces rendez-vous, les comprendre, puis les transformer en objets metier exploitables :
- lecture des rendez-vous Apple Calendar
- reconnaissance patient
- rattachement prescription
- creation ou suivi de seance
- actions rapides
- suivi CNS / facturation a suivre
- preparation future de la synchronisation en ecriture

Modele mental :

```text
CalendarEvent externe = evenement Apple / Doctena
Appointment = rendez-vous operationnel dans Hugo
TherapySession = acte clinique lie a une prescription
Prescription = compteur medical / CNS
Invoice / CNS tracking = suivi administratif, pas facture officielle
```

Regles produit fondamentales :
- `Appointment` est la source de verite du planning cote Hugo.
- `TherapySession` est la source de verite du suivi clinique.
- Toute seance planifiee doit etre liee a un `Appointment`.
- Les UID Apple ou marqueurs techniques ne doivent jamais etre stockes comme logique metier dans les notes visibles.
- Les modifications locales d'un rendez-vous externe doivent etre preparees pour synchronisation vers la source externe.
- Il ne faut pas creer de belle UI drag & drop avant d'avoir une architecture de synchronisation fiable.
- Le cockpit doit evoluer vers une vue agenda operationnelle, pas rester une simple liste.

Ce qui n'est pas l'objectif :
- Ne pas remplacer Doctena immediatement.
- Ne pas creer une facture CNS officielle dans Hugo.
- Ne pas faire un calendrier isole non synchronise.
- Ne pas modifier localement un evenement Apple sans architecture de push.
- Ne pas multiplier les workflows paralleles seance / rendez-vous.

## Objectif

Reduire la charge administrative quotidienne du kine.

Hugo doit aider a :
- suivre les patients
- suivre les prescriptions
- suivre les seances realisees et restantes
- detecter les actions de facturation CNS a faire
- centraliser les documents
- gerer les taches du cabinet
- reduire les oublis
- rendre la journee lisible

## Positionnement

Promesse :
Moins d'administratif. Moins d'oublis. Les bonnes actions au bon moment.

Hugo doit etre :
- operationnel
- intelligent
- discret
- rapide
- fiable
- premium
- rassurant

Hugo ne doit pas devenir :
- un logiciel medical lourd
- un ERP
- un outil administratif froid
- une comptabilite
- un generateur de factures legales
- un agenda concurrent de Doctena

## Utilisateur cible

Kinesitherapeute independant ou petit cabinet de kinesitherapie au Luxembourg.

Profil :
- tres occupe
- agenda rempli dans Doctena / Apple Calendar
- peu de temps pour l'administratif
- besoin de suivre les prescriptions et seances sans tableur
- besoin de savoir quand une action CNS est necessaire
- besoin d'un outil simple, clair et fiable

## Sources de Verite

### Patients

Source de verite actuelle :
- Hugo peut stocker les patients dans son propre modele `Patient`.
- Les patients peuvent etre crees manuellement dans le MVP.

Source de verite cible :
- Hugo doit enrichir et maintenir les dossiers patients a partir des donnees observees dans Apple Calendar / Doctena.
- Hugo reste le dossier operationnel du cabinet, pas le dossier medical complet.

### Prescriptions

Source de verite actuelle :
- Hugo stocke les prescriptions dans `Prescription`.
- Le suivi des seances realisees/restantes est central dans Hugo.

Source de verite cible :
- Hugo reste la source operationnelle pour le suivi des prescriptions, des compteurs de seances et des alertes associees.
- Les documents originaux de prescription doivent etre archives/references dans Hugo.

### Seances

Source de verite actuelle :
- Hugo stocke les seances dans `TherapySession`.
- Les seances peuvent etre ajoutees ou marquees comme realisees manuellement dans le MVP.

Source de verite cible :
- Les seances doivent etre detectees depuis l'agenda, puis rattachees au bon patient et a la bonne prescription.
- Hugo doit recalculer les compteurs et proposer les actions pertinentes.

### Agenda

Source de verite actuelle :
- L'agenda principal existe hors Hugo.
- Hugo peut afficher une vue "Aujourd'hui" a partir de ses donnees internes.

Source de verite cible :
- Doctena reste la source principale des rendez-vous patient.
- Apple Calendar devient la source intermediaire lisible par Hugo.
- Hugo ne doit pas recreer un agenda concurrent ; il doit lire, comprendre et enrichir l'agenda existant.

### Facturation CNS

Source de verite actuelle :
- Hugo utilise `Invoice` comme suivi interne des actions de facturation CNS.
- Ce modele ne represente pas une generation officielle de facture.

Source de verite cible :
- La CNS reste la source officielle de facturation.
- Hugo doit recuperer, referencer, archiver et suivre les documents/statuts CNS.
- Hugo peut signaler "a preparer", "a verifier", "a archiver", "en attente" ou "termine", mais ne doit pas pretendre emettre la facture legale.

## MVP Prioritaire

Le MVP interne doit couvrir :
1. Dossiers patients
2. Prescriptions
3. Seances
4. Compteurs de seances
5. Alertes de facturation CNS
6. Vue Aujourd'hui
7. Documents
8. Taches

## Regle Produit

Chaque fonctionnalite doit reduire une action manuelle du kine.

Si une fonctionnalite n'aide pas a :
- gagner du temps
- eviter un oubli
- suivre une prescription
- preparer une action CNS
- retrouver une information
- clarifier la journee

elle n'est pas prioritaire.

## Experience Attendue

L'interface doit etre :
- premium
- claire
- rapide
- moderne
- simple
- legerement fun
- rassurante
- non medicale froide

Le kine se connecte et voit immediatement :
- ses patients du jour
- les seances a realiser
- les seances restantes par prescription
- les actions CNS a faire
- les documents manquants
- les taches urgentes

## Roadmap

### Phase 1 - Calendar Sync Foundation

Objectif :
Stabiliser la base de synchronisation calendrier avant toute interface avancee.

Priorites :
- `CalendarEventMapping`
- `CalendarSyncAction`
- suppression de la dependance aux UID caches dans les notes
- queue de synchronisation
- preparation bidirectionnelle

### Phase 2 - Apple Calendar Write / CalDAV

Objectif :
Permettre a Hugo d'ecrire proprement vers Apple Calendar quand l'architecture est prete.

Priorites :
- connexion iCloud / CalDAV
- ecriture create / update / delete vers Apple Calendar
- traitement des actions pending
- gestion minimale des erreurs et conflits

### Phase 3 - Cockpit Agenda

Objectif :
Faire du cockpit une vraie vue agenda operationnelle.

Priorites :
- vue jour / 3 jours / semaine
- cards rendez-vous
- actions rapides
- statut seance
- source du rendez-vous

### Phase 4 - Drag & Drop

Objectif :
Autoriser le deplacement fluide des rendez-vous depuis Hugo uniquement quand la synchronisation est fiable.

Priorites :
- deplacement de rendez-vous depuis Hugo
- check chevauchement
- update `Appointment`
- update `TherapySession`
- queue push Apple Calendar

### Phase 5 - Assistant de planning

Objectif :
Aider le praticien a optimiser son planning sans automatisation risquee.

Priorites :
- suggestions intelligentes
- remplacement de rendez-vous annule
- optimisation des trous
- propositions de creneaux
- gestion de reports

### Phase 1 - MVP interne

Objectif :
Construire un outil utile sans integration externe complexe.

Priorites :
- patients
- prescriptions
- seances
- compteur de seances
- cockpit Aujourd'hui
- alertes de facturation CNS
- suivi interne des documents/factures CNS

### Phase 2 - Apple Calendar Sync

Objectif :
Lire l'agenda Apple Calendar pour recuperer les rendez-vous existants.

Hugo doit :
- importer/observer les rendez-vous
- detecter les patients probables
- proposer des rattachements
- creer des seances candidates
- eviter la double saisie

### Phase 3 - Doctena Sync

Objectif :
Exploiter Doctena comme source principale des rendez-vous.

Hugo doit :
- comprendre les rendez-vous Doctena
- synchroniser ou rapprocher les evenements avec Apple Calendar
- ne pas remplacer Doctena
- enrichir les donnees operationnelles du cabinet

### Phase 4 - CNS Document Tracking

Objectif :
Suivre les documents et statuts CNS sans generer la facture legale.

Hugo doit :
- archiver les documents CNS
- referencer les factures officielles
- suivre les statuts
- rappeler les actions a faire
- centraliser les pieces justificatives

### Phase 5 - Assistant intelligent

Objectif :
Transformer les donnees du cabinet en recommandations utiles.

Hugo doit :
- signaler les oublis probables
- proposer les prochaines actions
- anticiper les fins de prescription
- preparer les listes de suivi
- aider a garder la journee fluide

## Ce que Hugo ne fera pas

Hugo ne fera pas :
- comptabilite
- gestion financiere
- facturation legale
- generation officielle de factures CNS
- remplacement de Doctena
- agenda concurrent de Doctena
- ERP cabinet
- dossier medical lourd
- integration externe non validee

## Doctrine MVP

Construire petit mais utile.

Ne pas developper d'integration complexe avant d'avoir :
- patients fonctionnels
- prescriptions fonctionnelles
- seances fonctionnelles
- compteur de seances fiable
- alertes de facturation CNS
- vue Aujourd'hui utile
- dossier patient premium
