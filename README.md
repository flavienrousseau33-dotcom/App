# Communo

Application mobile sociale (fil d'actualité, publications, profils) construite avec
[Expo](https://expo.dev) + [Expo Router](https://docs.expo.dev/router/introduction/) et
[Supabase](https://supabase.com) (auth + base de données + stockage d'images).

Un seul code source pour iOS et Android, publiable sur l'App Store et le Google Play Store
via [EAS Build / Submit](https://docs.expo.dev/eas/).

## 1. Prérequis

- Node.js 20+
- Un compte [Supabase](https://supabase.com) (gratuit)
- Pour builder/publier réellement sur les stores :
  - Un compte [Apple Developer](https://developer.apple.com/programs/) (99 $/an) — obligatoire pour l'App Store
  - Un compte [Google Play Console](https://play.google.com/console/) (25 $, paiement unique) — obligatoire pour le Play Store
  - Un compte [Expo (EAS)](https://expo.dev/eas) (gratuit pour démarrer)

Ces comptes doivent être créés directement par toi (paiement + vérification d'identité requis) ;
je ne peux pas les créer à ta place.

## 2. Configurer le backend Supabase

1. Crée un nouveau projet sur [supabase.com](https://supabase.com).
2. Dans **SQL Editor**, exécute le contenu de [`supabase/schema.sql`](./supabase/schema.sql).
   Cela crée les tables `profiles`, `posts`, `likes`, `follows`, les politiques de sécurité (RLS)
   et le bucket de stockage `post-images`.
3. Dans **Project Settings > API**, récupère `Project URL` et `anon public key`.
4. Copie `.env.example` vers `.env` et renseigne ces deux valeurs :

   ```bash
   cp .env.example .env
   ```

   ```
   EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=xxxx
   ```

## 3. Lancer l'app en local

```bash
npm install
npm start
```

Scanne le QR code avec l'app **Expo Go** (iOS/Android) pour tester instantanément, ou lance
`npm run ios` / `npm run android` si tu as les simulateurs installés.

## 4. Fonctionnalités actuelles

- Inscription / connexion par email + mot de passe (Supabase Auth)
- Fil d'actualité avec les posts de tous les utilisateurs
- Création de post (texte + image optionnelle)
- Likes
- Profil utilisateur avec ses propres publications et déconnexion

## 5. Avant de publier sur les stores

Le projet est un template fonctionnel. Avant une vraie publication, personnalise :

- `app.json` : `name`, `slug`, `ios.bundleIdentifier` et `android.package` doivent être uniques
  (actuellement `com.flavienrousseau.communo` — à changer si ce nom est déjà pris).
- `assets/images/icon.png`, `splash-icon.png`, `android-icon-*.png` : remplace par tes propres visuels.
- Ajoute une politique de confidentialité (obligatoire pour Apple et Google dès qu'il y a des comptes utilisateurs).

## 6. Builder avec EAS

```bash
npx eas-cli login          # une seule fois
npx eas-cli build:configure

npm run build:android      # build de production Android (.aab)
npm run build:ios          # build de production iOS (.ipa)
```

Le premier build EAS te guide pour créer automatiquement les certificats de signature
(iOS) et le keystore (Android) si tu ne les as pas déjà — inutile de les gérer à la main.

## 7. Publier sur les stores

### Google Play Store

1. Crée l'application dans la [Google Play Console](https://play.google.com/console/).
2. Génère une clé de service (Setup > API access) et sauvegarde-la en local sous
   `google-service-account.json` (déjà ignoré par git).
3. Publie :
   ```bash
   npm run submit:android
   ```
4. Complète la fiche store (description, captures d'écran, politique de confidentialité,
   classification du contenu) dans la console, puis soumets à la revue.

### Apple App Store

1. Crée l'app dans [App Store Connect](https://appstoreconnect.apple.com/).
2. Renseigne dans `eas.json` (`submit.production.ios`) ton `appleId`, `ascAppId` et `appleTeamId`.
3. Publie :
   ```bash
   npm run submit:ios
   ```
4. Complète la fiche store (description, captures d'écran, politique de confidentialité,
   questionnaire de confidentialité) dans App Store Connect, puis soumets à la revue.

Les délais de revue sont généralement de quelques heures à 1-2 jours (Apple) et de quelques
heures à 1 jour (Google), hors premier envoi qui peut être plus long.

## Structure du projet

```
app/
  (auth)/        écrans de connexion / inscription
  (tabs)/        fil, création de post, profil (navigation principale)
components/social/  composants réutilisables (carte de post, etc.)
hooks/useAuth.tsx    contexte d'authentification Supabase
lib/supabase.ts      client Supabase
supabase/schema.sql  schéma SQL à exécuter dans Supabase
types/database.ts    types TypeScript partagés
```
