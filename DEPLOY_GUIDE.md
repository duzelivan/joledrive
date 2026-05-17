# JoleDrive d.o.o - UPUTE ZA DEPLOY

## KORAK 1: Priprema projekta lokalno

### 1.1 Instalacija frontend ovisnosti
```bash
cd frontend
npm install
```

### 1.2 Instalacija backend ovisnosti
```bash
cd backend
npm install
```

### 1.3 Lokalno testiranje
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

Frontend će biti na: http://localhost:3000
Backend će biti na: http://localhost:5000

---

## KORAK 2: Postavljanje MySQL baze na Railway

### 2.1 Kreiraj Railway račun
1. Idi na https://railway.app
2. Prijavi se s GitHub računom

### 2.2 Dodaj MySQL servis
1. Klikni "New Project"
2. Odaberi "Provision MySQL"
3. Pričekaj da se MySQL kreira (zelena ikona)

### 2.3 Pronađi podatke za konekciju
1. Klikni na MySQL servis
2. Idi na tab "Variables"
3. Tu ćeš vidjeti sve varijable:
   - MYSQLHOST (npr. `junction.proxy.rlwy.net`)
   - MYSQLPORT (npr. `54997`)
   - MYSQLUSER (`root`)
   - MYSQLPASSWORD (tvoja lozinka)
   - MYSQLDATABASE (`railway`)
   - MYSQL_URL (cijeli connection string)

### 2.4 Kreiraj tablice
1. Klikni na MySQL servis → tab "Query"
2. Kopiraj cijeli sadržaj iz `database/schema.sql`
3. Zalijepi u Query editor i klikni "Run"
4. Tablice su kreirane!

### 2.5 Kreiraj admin korisnika
U Query editoru pokreni:
```sql
-- Generiraj hash za lozinku "admin123"
-- U backendu se koristi bcrypt, pa moraš generirati hash
-- Najlakše: pokreni backend lokalno jednom i iskoristi njegov endpoint
```

Alternativa: Uđi u backend kod i privremeno izmijeni login da prihvati bilo koju lozinku, kreiraj korisnika, pa vrati nazad.

---

## KORAK 3: Deploy backend-a na Railway

### 3.1 Kreiraj GitHub repozitorij
```bash
# U root folderu projekta (gdje su frontend i backend)
git init
git add .
git commit -m "Initial commit"
git branch -M main

# Kreiraj novi repozitorij na GitHub (bez README, bez .gitignore)
# Zatim:
git remote add origin https://github.com/TVOJE_IME/joledrive-backend.git
git push -u origin main
```

### 3.2 Poveži Railway s GitHub-om
1. U Railway dashboardu, klikni "New Project"
2. Odaberi "Deploy from GitHub repo"
3. Poveži svoj GitHub račun
4. Odaberi repozitorij `joledrive-backend`

### 3.3 Postavi root directory
1. Klikni na backend servis
2. Idi na "Settings"
3. Pod "Root Directory" postavi: `backend`
4. Railway će automatski detektirati Node.js

### 3.4 Postavi environment variables
1. Idi na tab "Variables"
2. Dodaj SVE varijable iz `.env.example`:

```
MYSQLHOST=junction.proxy.rlwy.net       (tvoj host)
MYSQLPORT=54997                          (tvoj port)
MYSQLUSER=root
MYSQLPASSWORD=tvoja-lozinka
MYSQLDATABASE=railway
MYSQL_URL=mysql://root:tvoja-lozinka@junction.proxy.rlwy.net:54997/railway

JWT_SECRET=tvoj-super-tajni-kluc-2024
TOTP_SECRET=totp-secret-key

PORT=5000
NODE_ENV=production
FRONTEND_URL=https://tvoja-domena.com
ADMIN_SETUP_CODE=JoleDrive2024Secure
```

### 3.5 Deploy
Railway će automatski deployati nakon pusha.
Provjeri logs pod "Deployments" tabom.

### 3.6 Pronađi backend URL
1. Klikni na backend servis
2. Idi na "Settings" → "Networking"
3. Railway će generirati URL: `https://tvoj-backend.up.railway.app`
4. Zapiši ovaj URL!

---

## KORAK 4: Build i deploy frontend-a na web hosting

### 4.1 Postavi API URL u frontendu
Prije builda, moraš postaviti backend URL.

U `frontend/vite.config.js`, zamijeni proxy:
```js
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://tvoj-backend.up.railway.app',  // <-- TVOJ BACKEND URL
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: 'dist',
  }
})
```

### 4.2 Buildaj frontend
```bash
cd frontend
npm run build
```

Nastat će `dist/` folder sa statičkim datotekama.

### 4.3 Upload na web hosting
Ovisno o hostingu:

**cPanel:**
1. Uđi u cPanel → File Manager
2. Idi u `public_html` folder
3. Uploadaj SVE datoteke iz `dist/` foldera
4. Ako hosting podržava Node.js, možeš uploadati cijeli frontend folder

**FTP (FileZilla):**
1. Poveži se na FTP
2. Uploadaj `dist/` sadržaj u `public_html`

**Netlify/Vercel (besplatno):**
1. Povuci `dist` folder na Netlify dashboard
2. Ili poveži GitHub repozitorij

---

## KORAK 5: Poveži frontend i backend

### 5.1 Postavi CORS na backendu
Provjeri da je `FRONTEND_URL` varijabla postavljena na tvoj frontend URL.

### 5.2 HTTPS
Railway automatski daje HTTPS.
Web hosting također mora imati HTTPS (Let's Encrypt je besplatan).

---

## KORAK 6: Testiranje

1. Otvori frontend URL u browseru
2. Prijavi se s admin podacima
3. Testiraj sve funkcionalnosti

---

## VAŽNE NAPOMENE

### Sigurnost:
- NIKAD ne uploadaj `.env` datoteku na GitHub
- NIKAD ne objavljuj API ključeve, lozinke, credentials
- Koristi HTTPS
- Baza NIJE javno dostupna (samo preko Railway internal network)

### Environment variables:
Sve tajne su u Railway Variables, NE u kodu.

### Auto-logout:
Aplikacija automatski odjavljuje nakon 15 minuta neaktivnosti.

### 2FA:
U postavkama profila možeš uključiti dvofaktorsku autentikaciju.

### Dokumenti:
Svi uploadani dokumenti se spremaju u `backend/uploads/documents/`.
Na web hostingu, moraš osigurati da ovaj folder ima write permissions.

---

## TROUBLESHOOTING

### Problem: "Cannot connect to database"
- Provjeri jesu li MYSQLHOST, MYSQLPORT, MYSQLPASSWORD ispravni
- Provjeri jesu li tablice kreirane (Query tab)
- Provjeri logs na Railway

### Problem: "CORS error"
- Postavi FRONTEND_URL varijablu točno
- Dodaj `https://` prefix

### Problem: "404 Not Found"
- Provjeri je li backend deployan
- Provjeri API rute

### Problem: "Cannot GET /"
- Frontend mora biti buildan i uploadan
- Backend rade na `/api/*` rutama

---

## KONTAKT
Za pomoć, provjeri Railway dokumentaciju: https://docs.railway.com
