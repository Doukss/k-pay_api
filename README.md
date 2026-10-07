# KeurGuiPay — backend agence

API REST Express organisée par fonctionnalités, Prisma ORM 7 et PostgreSQL. Le frontend n’est pas connecté à cette API ; ses pages et son store restent autonomes.

## Démarrage local

Dans `Soutenance_api` :

```powershell
npm install
npm run dev
```

Le serveur écoute sur `http://localhost:3000`. Swagger UI : `http://localhost:3000/api-docs` ; document OpenAPI : `http://localhost:3000/api-docs.json`.

Le fichier `.env` doit définir `DATABASE_URL`, `JWT_SECRET` et éventuellement `PORT`, `CLIENT_URL` et `BUSINESS_TIME_ZONE` (défaut : `Africa/Dakar`). Pour l’envoi automatique WhatsApp, renseigner aussi les variables `WHATSAPP_*` de `.env.example` avec les identifiants Cloud API et le nom du modèle approuvé. Les secrets restent dans `.env`, qui est ignoré par Git. `npm run dev` ne réinitialise pas la base.

## Modèle et migrations

Le schéma est dans `prisma/schema.prisma`. Les migrations sont versionnées dans `prisma/migrations` et appliquées avec :

```powershell
npm exec prisma migrate deploy
npm exec prisma generate
```

La migration `existing_database_baseline` correspond aux trois tables PostgreSQL historiques (`users`, `tenants`, `payments`). Elle est marquée appliquée dans la base de développement déjà existante ; les environnements neufs l’exécutent avant `agency_features`. La migration agence ajoute les profils, abonnements, factures, réglages, notifications, activités et relances, et conserve l’historique des paiements quand un locataire est supprimé.

## Fonctionnalités exposées

- **Auth** : inscription d’agence, connexion, compte courant et changement de mot de passe. L’ancien hash scrypt du compte existant reste vérifiable et est converti en bcrypt après sa prochaine connexion. L’inscription démarre un essai Starter de 30 jours.
- **Locataires** : liste filtrée/paginée, création, édition, suppression, détection des doublons d’email et de téléphone, contrôle du quota du forfait.
- **Retards** : le jour d’échéance mensuel reprend le jour local d’enregistrement du locataire (un enregistrement le 31 donne le dernier jour des mois plus courts). Le retard est calculé selon cette échéance et les encaissements du mois.
- **Encaissements** : un paiement de loyer par locataire et par mois, référence unique, méthode contrôlée, mise à jour du statut, notification, activité et journal consultable.
- **Relances** : envoi WhatsApp Cloud API automatique à J−3 et J+3 de l’échéance, avec déduplication par locataire et période ; les liens `wa.me` individuels ou groupés restent disponibles pour les relances manuelles.
- **Notifications et activités** : filtres, recherche, lecture individuelle ou groupée, suppression et fil des dernières actions.
- **Paramètres agence** : profil, passerelles activées, porteur des frais, activation des rappels J−3/J+3, langue et préférence 2FA.
- **Abonnements** : Starter (15 000 FCFA/50 locataires), Business (25 000 FCFA/100) et Pro (60 000 FCFA/illimité), essai, renouvellement et factures.
- **Dashboard** : loyers attendus, collecte du mois, impayés, retards, six mois de revenus, cinq paiements et activités récentes.

Les routes privées attendent `Authorization: Bearer <token>`. Les locataires, encaissements, notifications, paramètres et abonnements sont isolés par le compte agence authentifié.

## Limites actuelles

Les validations d’abonnement Wave/Orange Money sont des **simulations** : elles écrivent une facture et une référence de démonstration, sans appeler un prestataire ni débiter un compte. L’ordonnanceur WhatsApp vérifie les dates chaque minute et n’envoie rien tant que les identifiants Cloud API et le modèle approuvé ne sont pas configurés. Le modèle Meta doit être approuvé pour la langue configurée et avoir six variables de corps dans cet ordre : nom du locataire, montant, bien, date d’échéance, lien de paiement et nom de l’agence. Les réglages J−3/J+3 sont appliqués. La préférence 2FA est enregistrée, sans envoi ni vérification d’un code SMS.

Le endpoint de santé `/api/health` vérifie également la connexion à PostgreSQL et renvoie `503` si elle est indisponible.
