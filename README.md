# Traces

Application mobile qui reconstitue le trajet de vie de chaque personne à partir de ses photos
(villes visitées, dates), et permet de découvrir les moments et lieux où deux personnes qui se
sont mutuellement ajoutées ont pu se croiser par le passé. Construite avec
[Expo](https://expo.dev) + [Expo Router](https://docs.expo.dev/router/introduction/) et
[Supabase](https://supabase.com) (auth + base de données).

Un seul code source pour iOS et Android, publiable sur l'App Store et le Google Play Store
via [EAS Build / Submit](https://docs.expo.dev/eas/).

## Principe de confidentialité (important)

- **Le scan des photos est fait sur l'appareil.** Seuls des résumés dérivés (ville, pays, dates de
  début/fin de séjour) sont envoyés à Supabase — jamais les coordonnées GPS brutes, ni les photos
  elles-mêmes.
- **Un séjour n'est visible que par son propriétaire et par ses connexions acceptées.** Voir
  `stays` dans `supabase/schema.sql` : la policy RLS n'autorise la lecture qu'à `auth.uid() =
  user_id` ou à un utilisateur ayant une connexion `accepted` avec lui. Il n'y a aucune découverte
  libre de croisement avec un inconnu.
- **Les croisements ne se calculent qu'entre connexions mutuelles** (modèle "demande d'ami" :
  `connections.status = 'accepted'`), jamais entre deux comptes qui ne se sont pas ajoutés.

Si tu ouvres cette app à d'autres personnes, garde ce principe : ne jamais exposer les séjours
d'un utilisateur à quelqu'un qu'il n'a pas explicitement accepté.

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
   Cela crée les tables `profiles`, `stays`, `connections` et toutes les politiques de sécurité
   (RLS) décrites ci-dessus.
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

> Le scan de la photothèque (lecture GPS/EXIF) et le géocodage inverse nécessitent des permissions
> natives qui ne fonctionnent pas dans Expo Go sur certains appareils Android récents — un build de
> développement (`eas build --profile development`) est recommandé pour tester cette fonctionnalité
> en conditions réelles.

## 4. Fonctionnalités actuelles

- Inscription / connexion par email + mot de passe (Supabase Auth)
- **Mon trajet** : scan de la photothèque → extraction des photos géolocalisées → regroupement en
  "séjours" (ville + période) → géocodage inverse en ville/pays (voir `lib/geo.ts` et
  `lib/photoScan.ts`) ; ajout manuel d'un séjour (ville, pays, dates)
- **Amis** : recherche par pseudo, demande de connexion, acceptation/refus, liste des amis
- **Croisements** : pour chaque ami connecté, calcule et affiche les séjours qui se recoupent en
  ville et en période (`lib/crossings.ts`)
- Profil avec statistiques (nombre de séjours, nombre d'amis) et déconnexion

## 5. Comment fonctionne le scan de photos

1. `lib/photoScan.ts` demande la permission photothèque (+ localisation, requise par l'API de
   géocodage inverse) puis énumère jusqu'à 1500 photos récentes via `expo-media-library`.
2. Pour chaque photo, on lit sa date de prise et ses coordonnées GPS (si présentes dans l'EXIF).
3. `lib/geo.ts` (`clusterPhotoPoints`) regroupe les photos consécutives (par date) qui restent
   proches géographiquement (< 40 km par défaut) en "clusters" — un cluster = un séjour candidat.
4. Chaque cluster est converti en ville/pays via la géolocalisation inverse du système
   (`expo-location`, gratuite, sans clé API).
5. Le résultat (ville, pays, dates, nombre de photos) est synchronisé dans la table `stays` avec
   `source = 'photos'`, en remplaçant le résultat du scan précédent.

Limite connue pour la v1 : le scan lit jusqu'à 1500 photos et fait un appel natif par photo pour
la localisation, ce qui peut prendre du temps sur une grosse photothèque — acceptable pour un
premier jet, à optimiser plus tard (cache incrémental, ne scanner que les nouvelles photos).

## 6. Feuille de route (pas encore implémenté)

- **Événements** (festivals, etc.) en plus des villes, pour un regroupement plus fin que "même
  ville, même période".
- **Import Strava** : connecter un compte Strava (OAuth) pour retrouver les courses/sorties
  sportives en commun avec un ami.
- **Import Instagram** : connecter un compte Instagram pour ajouter automatiquement des séjours à
  partir des lieux tagués sur les publications.

La table `stays` a déjà une colonne `source` qui accepte `'strava'` et `'instagram'` pour ne pas
avoir à migrer le schéma quand ces intégrations arriveront.

## 7. Avant de publier sur les stores

Le projet est un template fonctionnel. Avant une vraie publication, personnalise :

- `app.json` : `name`, `slug`, `ios.bundleIdentifier` et `android.package` doivent être uniques
  (actuellement `com.flavienrousseau.traces` — à changer si ce nom est déjà pris).
- `assets/images/icon.png`, `splash-icon.png`, `android-icon-*.png` : remplace par tes propres visuels.
- Rédige une politique de confidentialité détaillant précisément l'usage des données de
  localisation dérivées des photos — obligatoire pour Apple et Google, et particulièrement
  scruté par leurs revues pour ce type de données sensibles.

## 8. Builder avec EAS

```bash
npx eas-cli login          # une seule fois
npx eas-cli build:configure

npm run build:android      # build de production Android (.aab)
npm run build:ios          # build de production iOS (.ipa)
```

Le premier build EAS te guide pour créer automatiquement les certificats de signature
(iOS) et le keystore (Android) si tu ne les as pas déjà — inutile de les gérer à la main.

## 9. Publier sur les stores

### Google Play Store

1. Crée l'application dans la [Google Play Console](https://play.google.com/console/).
2. Génère une clé de service (Setup > API access) et sauvegarde-la en local sous
   `google-service-account.json` (déjà ignoré par git).
3. Publie :
   ```bash
   npm run submit:android
   ```
4. Complète la fiche store (description, captures d'écran, politique de confidentialité,
   classification du contenu — signale explicitement la collecte de données de localisation)
   dans la console, puis soumets à la revue.

### Apple App Store

1. Crée l'app dans [App Store Connect](https://appstoreconnect.apple.com/).
2. Renseigne dans `eas.json` (`submit.production.ios`) ton `appleId`, `ascAppId` et `appleTeamId`.
3. Publie :
   ```bash
   npm run submit:ios
   ```
4. Complète la fiche store (description, captures d'écran, politique de confidentialité,
   questionnaire de confidentialité — App Store demande explicitement si l'app collecte la
   localisation et à quelles fins) dans App Store Connect, puis soumets à la revue.

Les délais de revue sont généralement de quelques heures à 1-2 jours (Apple) et de quelques
heures à 1 jour (Google), hors premier envoi qui peut être plus long. Une app qui traite des
données de localisation peut faire l'objet d'un examen plus approfondi.

## Structure du projet

```
app/
  (auth)/        écrans de connexion / inscription
  (tabs)/        Trajet (index), Croisements, Amis, Profil
  stay/new.tsx   formulaire modal d'ajout manuel de séjour
lib/geo.ts        clustering géographique des photos + calcul de recoupement de dates
lib/photoScan.ts  orchestration du scan de la photothèque + sync Supabase
lib/crossings.ts  calcul des croisements entre mes séjours et ceux d'un ami
lib/format.ts     formatage des dates en français
hooks/useAuth.tsx contexte d'authentification Supabase
lib/supabase.ts   client Supabase
supabase/schema.sql  schéma SQL (profiles, stays, connections) à exécuter dans Supabase
types/database.ts    types TypeScript partagés
```
