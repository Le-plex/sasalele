# CLAUDE.md — Guide IA pour Sasalele (Koalisons)

Ce fichier est destiné aux modèles IA qui modifient ce projet. Lisez-le en entier avant de faire quoi que ce soit.

---

## 1. Vue d'ensemble du projet

**Sasalele** est une application web de gestion associative pour les Koalisons.
Stack : **React 18 + Vite 5 + Recharts**. Pas de CSS framework. Pas de base de données — persistance via fichiers JSON.

---

## 2. Structure des fichiers

```
/root/
├── index.html              # Shell HTML — point d'entrée du navigateur
├── vite.config.js          # Config Vite + middleware API (lit/écrit les JSON)
├── package.json            # Dépendances (react, react-dom, recharts)
│
├── src/
│   ├── main.jsx            # Bootstrap React (monte <App /> dans #root)
│   ├── koalitales.jsx      # ⭐ FICHIER PRINCIPAL — App complète (monolithe ~5500 lignes)
│   │
│   ├── constants.js        # Couleurs (C), catégories, statuts, schéma de données (INIT)
│   ├── styles.js           # Helpers CSS-in-JS : s.btn(), s.inp(), s.card(), rGrid()
│   ├── utils.js            # Utilitaires : fmt, sumArr, uid, today, getDays, hashPw...
│   ├── store.js            # Couche API : load(), save(), loadUsers(), saveUsers()...
│   ├── roles.js            # RBAC : can(role, perm), getRoles(), setRoles()
│   │
│   ├── components/
│   │   ├── Nav.jsx         # Sidebar desktop + drawer mobile
│   │   ├── shared.jsx      # Composants réutilisables (Badge, Avatar, Modal, etc.)
│   │   └── pages/          # Pages modulaires (refactoring en cours, non connectées au monolithe)
│   │       ├── LoginPage.jsx
│   │       ├── Dashboard.jsx
│   │       ├── EventsPage.jsx
│   │       ├── InventoryPage.jsx
│   │       └── TeamPage.jsx
│   │
│   └── hooks/
│       └── useMobile.js    # Hook responsive : renvoie true si largeur < 768px
│
├── data/                   # ⭐ Données persistantes (ne pas modifier manuellement en prod)
│   ├── data.json           # Données applicatives principales (événements, dépenses, etc.)
│   ├── users.json          # Comptes utilisateurs
│   ├── invites.json        # Codes d'invitation pour l'inscription
│   ├── roles.json          # Config des rôles/permissions (personnalisable)
│   └── logs.json           # Journal d'activité
│
└── dist/                   # Build de production (généré par `npm run build`, ne pas éditer)
```

### Point critique : deux couches coexistent

- **`src/koalitales.jsx`** (monolithe) : c'est le **vrai fichier qui fait tourner l'app**. Il contient tout en un seul fichier (constantes, utilitaires, composants, pages). `main.jsx` l'importe directement.
- **`src/constants.js`, `src/styles.js`, etc.** + **`src/components/pages/*.jsx`** : refactoring modulaire en cours. Ces fichiers existent et sont cohérents mais **ne sont pas encore connectés au monolithe**. Les pages `src/components/pages/` importent bien depuis `src/constants.js`, `src/styles.js`, etc.

---

## 3. Comment l'application fonctionne

### Démarrage
```bash
npm run dev    # Lance Vite sur http://0.0.0.0:80
npm run build  # Build prod dans /dist/
```

### Flux de données
```
Navigateur → React App (src/koalitales.jsx)
          → fetch('/api/data')  → vite.config.js middleware → data/data.json
          → fetch('/api/users') → vite.config.js middleware → data/users.json
```

L'API est simulée par un middleware Vite dans `vite.config.js` :
- `GET /api/xxx` → lit le fichier JSON correspondant dans `data/`
- `POST /api/xxx` → écrit le fichier JSON correspondant dans `data/`

### Authentification
- Pas de JWT, pas de session serveur
- Session stockée dans `localStorage` (`session` key)
- Mot de passe haché : `btoa(unescape(encodeURIComponent(pw + "_k0ali")))`
- Superadmin : username `le_plex` avec rôle `superadmin` (hardcodé)

---

## 4. Système de design

### Palette de couleurs (thème sombre)
```javascript
C.bg        = "#080810"  // Fond principal
C.sidebar   = "#0c0c16"  // Fond sidebar
C.card      = "#111120"  // Fond carte
C.card2     = "#181828"  // Fond carte secondaire
C.border    = "#22223a"  // Bordures
C.accent    = "#9d6fe8"  // Violet — actions principales
C.danger    = "#ff4d72"  // Rouge — actions destructives
C.warn      = "#ffb84d"  // Orange — avertissements
C.info      = "#4db8ff"  // Cyan — info
C.text      = "#eff0ff"  // Texte principal
C.muted     = "#7878a0"  // Texte secondaire
```

### Polices
- `'Syne'` — titres (display)
- `'DM Sans'` — corps de texte
- `'DM Mono'` — nombres, codes

### Helpers de style (dans `src/styles.js`)
```javascript
s.btn(C.accent)   // Bouton avec couleur de fond
s.inp()           // Champ de saisie
s.card()          // Conteneur carte
rGrid(isMobile, cols, gap)  // CSS grid responsive
```

### Responsive
- Breakpoint : 768px
- Hook : `const isMobile = useMobile()`
- En mobile : navigation par drawer, grilles en colonne unique

---

## 5. Règles à respecter lors des modifications

### Règles absolues
1. **Ne jamais redéfinir** `C`, `s`, `store`, `uid`, `today`, `can` dans un composant — toujours importer depuis `src/`.
2. **Toutes les mutations de données** doivent passer par `update(patch, logEntry)` fourni par le composant App.
3. **Format de log** (paramètre optionnel mais recommandé) :
   ```javascript
   update(patch, { action: 'AJOUT' | 'MODIF' | 'SUPPR', target: 'NomPage', details: 'Description' })
   ```
4. **Vérifier les permissions** avant toute action sensible : `can(user.role, 'nomPermission')`.
5. **Nouveaux composants > 300 lignes** → les séparer dans `src/components/`.

### Conventions de code
- CSS inline via objets JavaScript (pas de fichiers `.css`)
- Pas de Redux, pas de Context API — props drilling classique depuis `App`
- IDs générés avec `uid()` (8 chars aléatoires base36)
- Dates au format ISO `YYYY-MM-DD` (via `today()`)
- Montants en euros avec `fmt(n)` (locale fr-FR)

---

## 6. Permissions (RBAC)

| Permission | superadmin | admin | orga | compta | lecture |
|---|---|---|---|---|---|
| manageUsers | ✓ | ✓ | | | |
| manageSettings | ✓ | | | | |
| createEvents | ✓ | ✓ | ✓ | | |
| editEvents | ✓ | ✓ | ✓ | | |
| deleteEvents | ✓ | ✓ | | | |
| addExpenses | ✓ | ✓ | ✓ | | |
| editExpenses | ✓ | ✓ | ✓ | ✓ | |
| addRevenues | ✓ | ✓ | ✓ | | |
| createInvoices | ✓ | ✓ | | ✓ | |
| manageCatalog | ✓ | ✓ | ✓ | ✓ | |
| manageInventory | ✓ | ✓ | ✓ | | |
| managePrestations | ✓ | ✓ | ✓ | | |

Vérification : `if (!can(user.role, 'createEvents')) return null;`

---

## 7. Schéma des données (`data/data.json`)

Structure principale de l'objet `data` :
```javascript
{
  events: [          // Liste des événements
    {
      id, name, date, dateEnd,
      budget, team,  // team: array de usernames
      expenses: [{ id, label, cat, amount, paidBy, date, settled, settledDate }],
      revenues: [{ id, label, type, amount, date }],
      settlements: [{ id, from, to, amount, date }],
      gear: [{ id, itemId, qty, days }],
      lineup: [{ id, artist, set, stage }],
      services: [{ id, label, status, amount, assignedTo }],
    }
  ],
  expenses: [],      // Dépenses globales asso (même structure que events.expenses)
  inventory: [       // Catalogue matériel
    { id, name, cat, qty, price, priceType, location }
    // priceType: '/jour' | '/heure' | '/forfait'
  ],
  invoices: [],      // Factures
  meetings: [],      // Réunions
  prestations: [],   // Prestations avec statut
  settings: {        // Paramètres de l'association
    name, logo, address, email, phone, iban, siret, maintenanceMode
  }
}
```

Catégories de dépenses (`CATS`) : Logistique, Communication, Technique, Restauration, Administratif, Autre
Types de revenus (`REV_TYPES`) : Billetterie, Subvention, Sponsoring, Bénévolat, Autre

---

## 8. Modifications fréquentes — Comment faire

### Ajouter une nouvelle page
1. Créer `src/components/pages/MaPage.jsx`
2. Dans `src/koalitales.jsx`, ajouter dans le `switch(page)` :
   ```javascript
   case 'mapage': return <MaPage data={data} user={user} update={update} />;
   ```
3. Ajouter l'entrée dans le composant `Nav` (tableau `pages`)
4. Ajouter la permission requise si nécessaire dans `roles.js`

### Modifier les couleurs
Éditer l'objet `C` dans `src/koalitales.jsx` (lignes 5-23) **et** dans `src/constants.js` pour cohérence.

### Ajouter un champ à un événement
1. Ajouter dans le schéma `INIT` de `src/constants.js`
2. Ajouter dans le formulaire de création/édition dans `EventsPage`
3. Penser à la migration : les anciens événements n'auront pas ce champ → utiliser `item.monChamp ?? valeurDefaut`

### Modifier les rôles/permissions par défaut
Éditer `PERMS_DEFAULT` et `ROLES_DEFAULT` dans `src/constants.js` (et dans le monolithe si applicable).

---

## 9. Pièges à éviter

- **Ne pas modifier `data/*.json` directement en production** — passer toujours par l'API `/api/xxx`
- **Le build de prod (`/dist/`) n'a pas de backend API** — il faut un serveur Node pour les endpoints `/api/`
- **Le hashPw est Base64, pas bcrypt** — ne jamais exposer en prod réelle sans améliorer ça
- **Pas de protection contre les écritures concurrentes** sur les fichiers JSON — app mono-utilisateur/faible concurrence seulement
- **`/dist/` est généré** — ne jamais éditer les fichiers dans `dist/`, ils seront écrasés au prochain build
- **Les pages dans `src/components/pages/`** n'importent pas depuis le monolithe — elles sont autonomes et utilisent `src/constants.js`, etc.

---

## 10. Commandes utiles

```bash
npm run dev      # Développement sur port 80
npm run build    # Build production → /dist/
npm run preview  # Prévisualiser le build

# Structure des fichiers sources React
src/main.jsx          # Point d'entrée JS
src/koalitales.jsx    # App principale
src/constants.js      # Tokens de design et schéma
src/styles.js         # Helpers de style
src/utils.js          # Fonctions utilitaires
src/store.js          # API persistence
src/roles.js          # Gestion des rôles
```
