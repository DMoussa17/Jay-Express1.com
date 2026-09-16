# Marché Express

Marketplace React + TypeScript + Vite + Firebase.

## Fonctionnalités v1
- Recherche par titre, description, vendeur, catégorie, sous-catégorie et localisation.
- Filtres par état, prix, VIP et stock disponible.
- Contrôle du stock au panier et nouvelle vérification du stock au checkout.
- Notifications in-app persistantes avec compteur non-lues.
- Protection du changement de rôle Admin côté client : un compte non administrateur ne peut pas activer le rôle Admin.
- PWA et configuration Vercel.

## Développement
```bash
npm install
npm run dev
```

## Validation TypeScript
```bash
npm run lint
```

## Build Vercel
```bash
npm run build
```

Dans Vercel : **Framework Preset = Vite**, Build Command = `vite build`, Output Directory = `dist`.

## Variables d'environnement
Copier `.env.example` vers `.env.local` et renseigner uniquement les secrets nécessaires. Les secrets privés ne doivent pas être commités.

## Firebase
Les règles Firestore restent obligatoires côté serveur Firebase. Les contrôles React ne remplacent jamais les règles de sécurité Firestore.
## Déploiement Vercel

1. Créer un projet Vercel depuis ce dépôt.
2. Laisser le build `vite build` et le dossier de sortie `dist`.
3. Ajouter les variables `WAVE_API_KEY`, `WAVE_BUSINESS_MERCHANT_ID`, `WAVE_MERCHANT_NAME`, `WAVE_MERCHANT_FORMATTED` et `APP_URL` lorsque le compte Wave est configuré.
4. Déployer les règles Firestore avec la Firebase CLI.

Le paiement Wave n’est jamais marqué comme réussi lorsque la vérification officielle n’est pas disponible.

## V5.1 – production hardening
- Vite is the default development server; Vercel serves the frontend and `/api/*` functions.
- Wave verification never turns an unavailable/unknown payment into a successful payment.
- Firestore rules restrict products, orders, transactions, users and admin settings by role/ownership.
- Set `WAVE_API_KEY`, `WAVE_WEBHOOK_SECRET`, and `APP_URL` in Vercel environment variables before production.
- ``server.local.ts` is for local legacy testing only and is not part of the Vercel runtime.


## V5.1 production checklist
1. Run `npm install` then `npm run lint` and `npm run build`.
2. Create the Firebase Firestore indexes/rules required by your deployed queries and publish `firestore.rules`.
3. Add Vercel Environment Variables from `.env.example`; keep `WAVE_API_KEY` server-side.
4. Configure the Wave webhook URL to `/api/wave/webhook` and set `WAVE_WEBHOOK_SECRET`.
5. Test authentication, product publication, stock limits, order creation, payment pending/complete flows, and admin access on the deployed URL.
6. Remove any demo/test records before production.

## Validation de production

Avant déploiement Vercel :

```bash
npm ci
npm run validate:production
npm run lint
npm run build
```

Variables Vercel à configurer selon les fonctions utilisées : `APP_URL`, `WAVE_API_KEY`, `WAVE_BUSINESS_MERCHANT_ID`, `WAVE_MERCHANT_FORMATTED`, `WAVE_MERCHANT_NAME`, `WAVE_WEBHOOK_SECRET`. Ne placez jamais la clé Wave dans le frontend.

Vercel utilise Node.js 24.x pour ce projet. Cette version est disponible pour les builds et Functions.
