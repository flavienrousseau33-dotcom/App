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
- **Un séjour n'est visible que par son propriétaire, et par une connexion acceptée uniquement
  si ce séjour est proche géographiquement d'un des siens.** Voir `stays` dans
  `supabase/schema.sql` (fonction `stays_are_close` + policy RLS) : être ami ne donne pas accès à
  tout l'historique de localisation de l'autre — seuls les séjours à moins de 20 km (ou dans la
  même ville si les coordonnées manquent) d'un de tes propres séjours sont renvoyés par la base.
  Tous les autres restent invisibles, y compris via une requête directe à l'API (pas seulement
  filtrés côté app). Il n'y a par ailleurs aucune découverte libre de croisement avec un inconnu.
- **Les croisements ne se calculent qu'entre connexions mutuelles** (modèle "demande d'ami" :
  `connections.status = 'accepted'`), jamais entre deux comptes qui ne se sont pas ajoutés.
- **Paramètres (roue crantée en haut) > Lieux cachés** : Maison (adresse déclarée, masqué par défaut), Travail
  (adresse déclarée, visible par défaut) et Lieux fréquents (détectés automatiquement — tout lieu
  visité 3 fois ou plus, visible par défaut). Chacun a son propre interrupteur ; masquer un lieu
  le rend invisible pour toute connexion, quelle que soit la distance, et s'applique à tous les
  séjours actuels et futurs à cet endroit — jamais à ta propre vue de tes propres séjours. Rien
  n'est jamais masqué sans que tu n'actionnes toi-même l'interrupteur.
- **Chaque séjour individuel peut aussi être masqué à la main** (`stays.is_hidden`, bouton dans
  Mon trajet), indépendamment des lieux déclarés ci-dessus.

Si tu ouvres cette app à d'autres personnes, garde ce principe : ne jamais exposer la localisation
d'un utilisateur à quelqu'un qu'il n'a pas explicitement accepté, et même entre amis, ne jamais
exposer plus que les lieux réellement proches — ni les lieux que la personne a explicitement
masqués.

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

> Si tu as déjà exécuté une version précédente de `schema.sql` sur un projet en cours d'usage,
> ré-exécuter tout le fichier renverra des erreurs "policy already exists" sur les politiques
> inchangées. Dans ce cas, n'exécute que la partie modifiée depuis ta dernière exécution
> (repère-la avec `git diff` sur `supabase/schema.sql`).

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
- **Croisements** : pour chaque ami connecté, deux listes calculées par `lib/crossings.ts` —
  celles où vous étiez au même endroit en même temps (triée par distance, la plus proche
  d'abord), et celles où vous êtes passés au même endroit à des dates différentes, à 7 jours
  d'écart maximum (triée par écart de jours, le plus proche d'abord) — au-delà, ce n'est plus un
  vrai "presque croisé". La distance utilise les coordonnées précises du séjour quand elles
  existent, avec repli sur le nom de ville sinon.
- **Paramètres > Lieux cachés** (accessible via l'icône roue crantée en haut, pas un onglet) :
  Maison / Travail (adresse déclarée) et Lieux fréquents (détectés automatiquement,
  `lib/homeDetection.ts`), chacun avec un interrupteur visible/masqué (`lib/savedPlaces.ts`
  synchronise l'état vers les séjours concernés). Chaque séjour a aussi son propre bouton
  "Masquer ce lieu" dans Mon trajet, indépendamment des lieux déclarés.
- **Photo de profil** : modifiable depuis l'onglet Profil (choix dans la photothèque), affichée
  aussi dans Amis et dans les fils de croisement. Sans photo, un avatar coloré à l'initiale du nom
  est utilisé partout à la place (`components/Avatar.tsx`).
- Profil avec statistiques (nombre de séjours, nombre d'amis) et déconnexion
- Un compte suspendu depuis le back office est automatiquement déconnecté à la prochaine
  ouverture de l'app.
- **Centre de notifications** (icône cloche en haut, à côté de la roue crantée) : demandes/acceptations d'amis
  en direct, et croisements détectés (voir section 11) — avec badge du nombre de non-lus et
  marquage lu au clic ou via "Tout marquer comme lu".
- **Fil de croisement** ("Voir le fil" sur une entrée de Croisements) : j'aime, commentaires et
  partage de photos entre les personnes concernées par ce croisement précis (voir section 12).

## 5. Comment fonctionne le scan de photos

1. `lib/photoScan.ts` demande la permission photothèque (+ localisation, requise par l'API de
   géocodage inverse) puis énumère jusqu'à 1500 photos récentes via `expo-media-library`.
2. Pour chaque photo, on lit sa date de prise et ses coordonnées GPS (si présentes dans l'EXIF).
3. `lib/geo.ts` (`clusterPhotoPoints`) regroupe les photos consécutives (par date) qui restent
   proches géographiquement (< 15 km par défaut du centroïde courant du cluster) en "clusters" —
   un cluster = un séjour candidat. Ce rayon volontairement petit (échelle d'une ville) permet à
   un même voyage ayant touché plusieurs lieux distincts (deux villes à 20 km l'une de l'autre,
   par exemple) de produire des séjours séparés et précisément localisés plutôt qu'un centroïde
   moyen qui ne correspondrait à aucun des deux.
4. Chaque cluster est converti en ville/pays via la géolocalisation inverse du système
   (`expo-location`, gratuite, sans clé API).
5. Le résultat (ville, pays, dates, nombre de photos) est synchronisé dans la table `stays` avec
   `source = 'photos'`, en remplaçant le résultat du scan précédent.

Limite connue pour la v1 : le scan lit jusqu'à 1500 photos et fait un appel natif par photo pour
la localisation, ce qui peut prendre du temps sur une grosse photothèque — acceptable pour un
premier jet, à optimiser plus tard (cache incrémental, ne scanner que les nouvelles photos).

Un séjour ajouté manuellement (`app/stay/new.tsx`) est lui aussi géocodé (ville → coordonnées,
via `expo-location`) au moment de l'enregistrement, pour qu'il participe au calcul de distance
dans "Croisements" au même titre qu'un séjour détecté depuis les photos. Si ce géocodage initial
échoue (ville ambiguë, réseau indisponible…), `lib/backfillCoordinates.ts` réessaie
automatiquement et silencieusement à chaque ouverture de l'écran Mon trajet, jusqu'à ce que les
coordonnées soient trouvées — un séjour ne reste jamais durablement sans coordonnées si ça peut
être évité.

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

## 10. Back office (admin)

Un site web séparé (`admin/`), indépendant de l'app mobile — jamais soumis à l'App Store /
Play Store, se déploie et se met à jour instantanément. Il permet de suivre les statistiques
clés de la plateforme et de modérer les comptes (suspendre, supprimer).

**Sécurité : aucune clé secrète n'est nécessaire côté back office.** Toutes les actions
privilégiées (stats globales, suspension, suppression) passent par des fonctions SQL
`security definer` (`supabase/schema.sql`, section 4) qui vérifient elles-mêmes, côté base de
données, que l'appelant est un administrateur (`profiles.is_admin`) avant d'agir. Le back office
n'utilise que la clé publique `anon`, exactement comme l'app mobile — la clé `service_role` ne
doit jamais être placée dans une app qui tourne dans un navigateur.

### Créer le premier compte admin

Un compte devient admin uniquement via une commande SQL manuelle (aucune inscription ne peut se
donner ce rôle elle-même) :

```sql
update public.profiles set is_admin = true where username = 'tonpseudo';
```

### Lancer le back office en local

```bash
cd admin
npm install
cp .env.example .env   # renseigne VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY (même projet Supabase)
npm run dev
```

### Déployer le back office

C'est une app Vite statique ordinaire : `npm run build` dans `admin/` produit `admin/dist/`,
déployable sur Vercel, Netlify, Cloudflare Pages, etc. — indépendamment de l'app mobile.
Renseigne les mêmes variables d'environnement (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
dans la configuration de l'hébergeur.

### Fonctionnalités actuelles

- **Statistiques** : utilisateurs totaux, nouveaux (7j/30j), comptes suspendus, séjours totaux
  (et par source), connexions acceptées/en attente.
- **Utilisateurs** : recherche par pseudo/email, suspendre/réactiver un compte, supprimer un
  compte (cascade sur ses séjours et connexions). Un admin ne peut pas s'auto-suspendre ni
  s'auto-supprimer.

## 11. Centre de notifications et vérification quotidienne des croisements

En plus des croisements déjà visibles à tout moment dans l'onglet Croisements, l'app construit
un **fil continu** : chaque nuit, une fonction SQL vérifie si de nouveaux croisements (ou
presque-croisements) sont apparus depuis la veille, et notifie les utilisateurs concernés — sans
jamais renotifier deux fois le même croisement.

- **`notifications`** (`supabase/schema.sql`, section 5) : table par utilisateur (type, titre,
  corps, lu/non lu), avec RLS limitant chacun à ses propres notifications. Un trigger sur
  `connections` crée automatiquement une notification à la demande de connexion et à son
  acceptation.
- **`notified_crossings`** : table de déduplication (une ligne par paire de séjours déjà
  notifiée). `check_daily_crossings()` ne crée une notification que pour les croisements
  réellement nouveaux — les anciens ne sont jamais supprimés ni renvoyés, ce qui construit un
  historique additif ("thread continu") au fil du temps.
- **`check_daily_crossings()`** (fonction `security definer`) : à exécuter une fois par jour, à
  partir de minuit, pour vérifier les croisements de la journée précédente (recoupement ou
  proximité de dates) en plus des croisements déjà passés.

### Activer la vérification quotidienne

Deux options, au choix, dans le dashboard Supabase du projet :

1. **`pg_cron`** (si l'extension est disponible sur ton plan) : `supabase/schema.sql` tente
   d'enregistrer automatiquement le job quotidien (`0 0 * * *`) si `pg_cron` est déjà activé
   (Database > Extensions) — sinon ce bloc ne fait rien, sans erreur, et il suffit de l'activer
   puis de rejouer `schema.sql` pour que la planification se mette en place.
2. **Dashboard > Integrations > Cron Jobs** (plus simple, sans extension à activer) : crée un
   job planifié sur `0 0 * * *` (tous les jours à minuit) exécutant :
   ```sql
   select public.check_daily_crossings();
   ```

Côté app, `hooks/useNotifications.tsx` s'abonne en temps réel (Supabase Realtime) aux nouvelles
lignes de `notifications`, donc les notifications créées par ce job apparaissent dans le centre
de notifications sans avoir à rouvrir l'app.

## 12. Fil de croisement (j'aime, commentaires, photos)

Chaque croisement (bouton "Voir le fil" dans Croisements, ou tap sur une notification de
croisement) ouvre un **fil** dédié — `app/crossing/thread.tsx` — où les personnes concernées
peuvent aimer, commenter et partager une photo autour de ce moment précis.

- **Un fil peut réunir plus de deux personnes.** Il démarre entre toi et un ami, mais si le
  séjour de l'un de vous croise *aussi* celui d'une troisième personne (ex : trois amis qui
  étaient tous à Lisbonne la même semaine, sans être tous connectés entre eux), cette personne
  rejoint automatiquement le même fil au lieu d'en créer un nouveau — voir
  `upsert_crossing_thread_pair()` dans `supabase/schema.sql`.
- **Anonymisation entre non-amis.** Être dans le même fil ne veut pas dire être ami avec tout le
  monde qui s'y trouve : deux participants peuvent tous les deux te connaître sans se connaître
  entre eux. La règle du reste du schéma s'applique donc ici aussi — c'est le statut de connexion
  (`are_connected()`), pas la simple appartenance au fil, qui donne accès à l'identité de
  quelqu'un. Concrètement : le nom, le pseudo et l'avatar d'un participant qui n'est pas ton ami
  (et n'est pas toi) sont remplacés par "Un autre voyageur" — y compris sur ses commentaires et
  ses photos — par `get_thread_overview()`, `get_thread_comments()` et `get_thread_photos()`.
  Ces trois fonctions (`security definer`) sont le *seul* moyen de lire ces données : les tables
  brutes (`crossing_thread_members`, `crossing_thread_comments`, `crossing_thread_photos`) n'ont
  volontairement aucune policy RLS de lecture, pour qu'il soit impossible de contourner
  l'anonymisation en interrogeant la table directement.
- **Photos** : stockées dans un bucket Supabase Storage privé (`thread-photos`), organisé en
  `{thread_id}/...` — l'accès est vérifié par thread (n'importe quel membre peut voir toutes les
  photos du fil), jamais par utilisateur, pour ne pas avoir à révéler qui a posté quoi en dehors
  du chemin anonymisé ci-dessus. Sélection depuis la photothèque via `expo-image-picker`.
- **J'aime et commentaires** passent par de simples policies RLS (poster/supprimer sa propre
  ligne), puisque ça ne révèle jamais l'identité de quelqu'un d'autre.

## 13. Photo de profil

`profiles.avatar_url` existait déjà dans le schéma mais n'était encore relié à rien — il n'y avait
aucun moyen de le renseigner. Contrairement aux photos de fil de croisement, un avatar est public
par nature (les profils sont déjà publics pour permettre la recherche par pseudo), donc :

- **Bucket Storage public** (`avatars`, `supabase/schema.sql` section 7) : lecture ouverte à tous,
  écriture limitée à son propre dossier (`{user_id}/...`) via policy RLS sur `storage.objects`.
- Chemin fixe par utilisateur (`{user_id}/avatar.{ext}`) : changer sa photo remplace l'ancienne au
  lieu d'en accumuler, `lib/profile.ts` (`uploadAvatar`/`removeAvatar`) gère l'upload et met à jour
  `profiles.avatar_url` (avec un paramètre anti-cache pour éviter de continuer à voir l'ancienne
  photo après un remplacement).
- `components/Avatar.tsx` : composant réutilisé partout où une identité peut s'afficher (Profil,
  Amis, participants d'un fil de croisement) — image si `avatar_url` existe, sinon un rond coloré à
  l'initiale du nom (couleur dérivée du nom, stable dans le temps).

## Structure du projet

```
app/
  (auth)/        écrans de connexion / inscription
  (tabs)/        Trajet (index), Croisements, Amis, Profil — les 4 onglets de la barre
  stay/new.tsx   formulaire modal d'ajout manuel de séjour
  crossing/map.tsx  carte OpenStreetMap d'un croisement
  notifications.tsx  centre de notifications (modal, ouvert depuis l'icône cloche)
  settings.tsx   Lieux cachés (modal, ouvert depuis l'icône roue crantée — pas un onglet)
  crossing/thread.tsx  fil d'un croisement : j'aime, commentaires, photos (modal)
components/NotificationBellButton.tsx  icône cloche + badge non-lus, dans le header
components/SettingsGearButton.tsx  icône roue crantée, dans le header
components/Avatar.tsx  photo de profil ou rond coloré à l'initiale, réutilisé partout
lib/geo.ts        clustering géographique des photos + calcul de recoupement de dates
lib/photoScan.ts  orchestration du scan de la photothèque + sync Supabase
lib/crossings.ts  calcul des croisements entre mes séjours et ceux d'un ami
lib/threads.ts    appels RPC/Storage pour le fil d'un croisement
lib/profile.ts    upload/suppression de la photo de profil
lib/homeDetection.ts     détection des lieux visités 3 fois ou plus
lib/savedPlaces.ts       synchronise Maison/Travail/Lieux fréquents vers stays.is_hidden
lib/backfillCoordinates.ts  regéocode les séjours manuels sans coordonnées
lib/format.ts     formatage des dates en français
hooks/useAuth.tsx contexte d'authentification Supabase (bloque aussi les comptes suspendus)
hooks/useNotifications.tsx  contexte du centre de notifications (fetch + Realtime)
lib/supabase.ts   client Supabase
supabase/schema.sql  schéma SQL (profiles, stays, connections, saved_places, fonctions admin)
types/database.ts    types TypeScript partagés

admin/             back office web séparé (Vite + React), voir section 10
  src/pages/       Login, Dashboard, Users
  src/hooks/useAdminAuth.ts  vérifie profiles.is_admin après connexion
```
