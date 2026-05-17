# JoleDrive d.o.o - Evidencija vozila

## Struktura projekta

```
joledrive-app/
├── frontend/          # React + Vite aplikacija (za web hosting)
│   ├── src/
│   │   ├── components/    # Layout, Sidebar
│   │   ├── pages/         # Sve stranice
│   │   ├── context/       # AuthContext, ThemeContext
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
├── backend/           # Node.js + Express API (za Railway)
│   ├── src/
│   │   ├── routes/        # API rute
│   │   ├── middleware/    # Auth middleware
│   │   ├── config/        # Database config
│   │   └── server.js
│   ├── package.json
│   └── .env.example
└── database/
    └── schema.sql      # SQL za kreiranje baze
```

## Tehnologije

- **Frontend**: React 18, Vite, Tailwind CSS, Recharts, Axios
- **Backend**: Node.js, Express, MySQL2, JWT, bcryptjs
- **Baza**: MySQL (Railway)
- **Deploy**: Frontend → Web hosting, Backend → Railway

## Entiteti

1. **Dashboard** - Obavijesti, nadolazeći servisi, analiza prihoda/troškova
2. **Vozila** - Evidencija svih vozila s povijesti servisa
3. **Dokumenti** - Upload, pregled, printanje dokumenata
4. **Servis** - Zakazivanje, potvrda, završetak servisa
5. **Računi** - Učitavanje, plaćanje, ponavljanje računa
6. **Korisnici** - Upravljanje korisnicima i dozvolama
7. **Skladište** - Evidencija dijelova, niska zaliha

## Sigurnost

- JWT autentikacija
- 2FA podrška
- Role-based access control (RBAC)
- Auto-logout nakon 15 min neaktivnosti
- Environment variables za sve tajne
- HTTPS
- Rate limiting
- Helmet security headers
