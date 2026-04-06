# CLAUDE.md — Instructions pour l'IA (Sasalele / Koalisons)

Lis ce fichier en entier avant de toucher quoi que ce soit.

---

## Contexte

**Sasalele** est une application web de gestion associative pour **les Koalisons** (collectif / asso événementielle, lieu Le Plex).
Stack : **React 18 + Vite 5 + Recharts**. Pas de framework CSS. Pas de base de données — persistance via fichiers JSON lus/écrits par un middleware Vite côté serveur.

---

## Architecture réelle

### Ce qui fait tourner l'app

```
/home/koalisons/site/
├── src/
│   ├── main.jsx           # Bootstrap React — monte <App /> dans #root, rien d'autre
│   └── koalitales.jsx     # ⭐ MONOLITHE ~9000 lignes — TOUTE l'app est ici
├── vite.config.js         # Config Vite + middleware API (toutes les routes /api/*)
├── index.html             # Shell HTML
├── package.json
├── install.sh             # Script d'installation automatique (bash)
└── data/                  # Données persistantes — NON versionnées (gitignored)
    ├── data.json          # Données applicatives principales
    ├── users.json         # Comptes utilisateurs (hash, token, permissions)
    ├── invites.json       # Codes d'invitation
    ├── roles.json         # Rôles personnalisés
    ├── logs.json          # Journal d'activité
    └── uploads/           # Fichiers uploadés (logos, avatars, PDFs)
```

**Il n'y a pas de** `src/constants.js`, `src/styles.js`, `src/store.js`, `src/roles.js`, ni de `src/components/`. Tout est dans `koalitales.jsx`.

### Démarrage

```bash
# Le service systemd tourne déjà en prod :
systemctl status sasalele

# Pour dev / tester une modif :
cd /home/koalisons/site
npm run dev    # Vite sur port 3000 (iptables redirige 80 → 3000 en prod)
```

### Serveur

L'app tourne en **mode dev Vite** (pas un build statique). C'est intentionnel : le middleware `configureServer` dans `vite.config.js` expose toutes les routes `/api/*`. Un `vite build` + `vite preview` **ne fonctionnerait pas** (pas d'API).

---

## Structure de koalitales.jsx

Dans l'ordre du fichier :

| Section | Contenu |
|---------|---------|
| `const C = {...}` | Design tokens (couleurs, polices) — objet module-level |
| Utilitaires | `fmt`, `sumArr`, `uid`, `today`, `hashPw`, `renamePersonInData` |
| `const s = {...}` | Helpers CSS-in-JS : `s.btn()`, `s.inp()`, `s.card()`, `s.label` |
| `const store` | Couche API : `load()`, `save()`, `loadUsers()`, `saveUsers()`, `uploadFile()`, etc. |
| `const auth` | Auth : `setup()`, `login()`, `check()`, `logout()`, `createUser()`, etc. |
| `function App()` | Composant racine — gère session, routing, data globale |
| `function SetupPage()` | Page de première configuration (si aucun utilisateur) |
| `function LoginPage()` | Connexion + inscription par code d'invitation |
| `function Nav()` | Sidebar desktop + drawer mobile |
| Pages | `DashboardPage`, `EventsPage`, `FacturesPage`, `InventairePage`, `ReunionsPage`, `PrestationsPage`, `ContactsPage`, `DepensesPage`, `ComptaPage`, `JournalPage`, `AssociationPage`, `UsersPage`, `MaintenancePage`, `SuggestionsPage`, `TodosPage` |

---

## Tokens de design (objet `C`)

```javascript
C.bg        = "#080810"   // Fond principal
C.sidebar   = "#0c0c16"   // Fond sidebar
C.card      = "#111120"   // Fond carte
C.card2     = "#181828"   // Fond carte secondaire
C.border    = "#22223a"   // Bordures
C.accent    = "#9d6fe8"   // Violet — actions principales
C.accentBg  = "#1e1030"   // Fond accent
C.danger    = "#ff4d72"   // Rouge — destructif
C.dangerBg  = "#2a0f18"
C.warn      = "#ffb84d"   // Orange — avertissement
C.info      = "#4db8ff"   // Cyan — info
C.text      = "#eff0ff"   // Texte principal
C.muted     = "#7878a0"   // Texte secondaire
C.font      = "'DM Sans', sans-serif"
C.mono      = "'DM Mono', monospace"
C.display   = "'Syne', sans-serif"
```

Patterns fréquents dans le code :
- `${C.accent}18` → accent à ~10% opacité (hex alpha)
- `${C.accent}40` → accent à ~25% opacité
- `${C.danger}12` → danger très transparent

---

## Flux de données

```
Navigateur
  → React (koalitales.jsx)
  → fetch('/api/data')   → vite.config.js → data/data.json
  → fetch('/api/users')  → vite.config.js → data/users.json
  → fetch('/api/logs')   → vite.config.js → data/logs.json
```

### Modifier les données depuis un composant

```javascript
// update() est fourni par App en prop à chaque page
update({ assoc: { ...data.assoc, name: "Nouveau nom" } })

// Avec entrée de journal (optionnel mais recommandé)
update(
  { events: [...data.events, newEvent] },
  { action: "AJOUT", target: "Événements", details: `Création de "${newEvent.name}"` }
)
```

**Toutes les mutations** passent par `update(patch, logEntry?)`. Jamais d'écriture directe.

---

## Authentification

- Token aléatoire stocké dans `localStorage` (clé `kt_token`)
- Hash mot de passe : `btoa(unescape(encodeURIComponent(pw + "_k0ali")))`
- Premier utilisateur créé via `SetupPage` (affiché si `users.json` est vide) — rôle `root`
- Inscription par code d'invitation uniquement (sauf premier user)
- Déconnexion automatique à minuit (cron root qui met tous les tokens à `null`)

---

## Permissions (RBAC)

Vérification : `can("nom_permission")` — `can` est destructuré depuis `session` dans chaque page.

| Permission | Description |
|---|---|
| `create_event` | Créer des événements |
| `edit_event` | Modifier / supprimer des événements |
| `invoices` | Gérer les factures |
| `settings` | Modifier les paramètres association |
| `catalog` | Gérer le catalogue tarifaire |
| `manage_users` | Gérer les utilisateurs et rôles |
| `manage_inventory` | Gérer l'inventaire matériel |
| `manage_meetings` | Gérer les réunions |
| `manage_prestations` | Gérer les prestations |
| `manage_depenses` | Gérer dépenses et remboursements |
| `manage_treasury` | Comptabilité — confirmer remboursements |
| `web_admin` | Administration (maintenance, sauvegardes, mises à jour) |

Le rôle `root` (premier compte créé) a toutes les permissions.

---

## Routes API (vite.config.js)

| Endpoint | Méthode | Description |
|---|---|---|
| `/api/data` | GET / POST | Données principales (data.json) |
| `/api/users` | GET / POST | Utilisateurs (users.json) |
| `/api/invites` | GET / POST | Codes d'invitation |
| `/api/roles` | GET / POST | Rôles personnalisés |
| `/api/logs` | GET / POST | Journal d'activité |
| `/api/upload` | POST | Upload fichier → `data/uploads/` |
| `/api/delete-upload` | POST | Supprime un fichier uploadé |
| `/uploads/<fichier>` | GET | Sert les fichiers uploadés |
| `/api/export` | GET | Télécharge `data/` en `.tar.gz` |
| `/api/import` | POST | Restaure une archive `.tar.gz` |
| `/api/update-check` | GET | Vérifie si des commits sont dispo sur origin/main |
| `/api/update-apply` | POST | `git pull` + `npm install` si besoin + restart |
| `/api/qonto-config` | GET / POST | Config API Qonto (secrets hors dossier site) |
| `/api/qonto-sync` | POST | Synchronise le solde bancaire depuis Qonto |
| `/api/notify` | POST | Envoie une notification Telegram |

---

## Schéma `data.json`

```javascript
{
  assoc: { name, logo, address, email, phone, iban, siret, note, bankBalance, bankThreshold, bankLastSync },
  events: [{
    id, name, date, budget,
    team: [{ id, name }],
    gear: [{ id, name, qty }],
    members: [{ id, name }],                  // pool tricount de l'event
    expenses: [{ id, label, amount, category, paidBy, date, bankCoverage }],
    revenues: [{ id, label, type, amount, date }],
    settlements: [{ id, settled, settledDate, confirmed?, confirmedBy?, confirmedDate? }],
    financiallyClosed?
  }],
  catalog: [{ id, name, unitPrice, unit, description }],
  invoices: [{ id, number, clientName, clientAddress, date, items[], notes, createdAt }],
  inventory: [{ id, name, category, qty, price, priceType, location }],
  meetings: [{ id, date, location, agenda, attendees, notes, crFile?: { name, url }, createdAt }],
  prestations: [{ id, label, statut, date, client{}, team[], gear[], services[], expenses[] }],
  contacts: [{ id, name, type, description, address, email, phone, createdAt }],
  depenses: [{
    id, label, amount, category, paidBy, date, bankCoverage, archived?,
    participants: [{ name }],
    reimbursements: [{ id, from, to, amount, settled, settledDate, confirmed?, confirmedBy?, confirmedDate? }]
  }],
  depensesPool: [{ name }],    // pool global pour le tricount asso
  maintenance: { enabled, message },
  notification: { active, message, date },
  todos: [{ id, text, done, createdAt }],
  tickets: [{ id, title, body, status, createdAt }],
  locations: [],
}
```

---

## Infra VPS

- **OS** : Ubuntu/Debian
- **User système** : `koalisons` (non-root) — le service tourne sous ce user
- **Dossier app** : `/home/koalisons/site/`
- **Repo git** : dans `/home/koalisons/site/` (remote : `https://github.com/Le-plex/sasalele.git`)
- **Service** : `sasalele.service` (systemd) — `Restart=on-failure`
- **Port** : Vite écoute sur 3000, iptables redirige 80 → 3000
- **Secrets Qonto** : `/home/koalisons/qonto-secrets.json` (hors dossier site, hors scope Vite)
- **Telegram** : bot `@k0al1bot`, token dans `/etc/telegram.conf`, script `/usr/local/bin/tg-notify`
- **Déconnexion auto** : cron root — `0 0 * * *` → `/usr/local/bin/sasalele-logout-all`

---

## Règles pour les modifications

1. **Tout modifier dans `/home/koalisons/site/src/koalitales.jsx`** et/ou `vite.config.js` — c'est là que tourne l'app
2. **Après chaque session de modifs** : copier les fichiers dans `/root/` puis commit + push sur `Le-plex/sasalele`
   ```bash
   cp /home/koalisons/site/src/koalitales.jsx /root/src/
   cp /home/koalisons/site/vite.config.js /root/
   git -C /root add src/koalitales.jsx vite.config.js
   git -C /root commit -m "feat: ..."
   git -C /root push origin main
   ```
3. **Ne jamais faire `npm run build`** — inutile et trompeur, l'app tourne en dev Vite
4. **Ne jamais modifier `data/*.json` directement** — passer par l'API ou l'interface
5. **CSS inline uniquement** — pas de fichiers `.css`, tout en objet JS avec `s.btn()`, `s.inp()`, `s.card()`
6. **Pas de librairies supplémentaires** sans en discuter — le projet est intentionnellement minimaliste
7. **IDs** : `uid()` (8 chars base36). **Dates** : `today()` (ISO YYYY-MM-DD). **Montants** : `fmt(n)` (locale fr-FR €)

---

## Pièges à éviter

- Le `git safe.directory` doit être configuré pour `/home/koalisons/site` : `git config --system --add safe.directory /home/koalisons/site`
- Le `.git` dans `/home/koalisons/site/` doit appartenir à `koalisons` : `chown -R koalisons:koalisons /home/koalisons/site/.git`
- `${C.accent}50` est une concaténation de chaîne hex — ça ne fonctionnerait pas avec des CSS variables
- L'app gère les fichiers uploadés en base64 legacy (anciens enregistrements) ET en URL `/uploads/xxx` (nouveau) — penser à la rétrocompat : `item.crFile?.url || item.crFile?.data`
- `depensesPool` et les noms dans `depenses` sont liés — utiliser `renamePersonInData()` pour les renommer de manière cohérente
