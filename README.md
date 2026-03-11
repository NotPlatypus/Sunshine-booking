# 🌟 Sunshine Ladies — Booking Sistem

Kompletan sistem za rezervaciju termina čišćenja.

---

## 🚀 Pokretanje (korak po korak)

### 1. Instaliraj pakete
```
npm install
```

### 2. Napravi .env fajl
Kopiraj `.env.example` i preimenuj ga u `.env`:
```
copy .env.example .env
```
Otvori `.env` i unesi svoj Resend API key.

### 3. Pokreni server
```
npm start
```

### 4. Otvori u browseru

| Stranica | URL |
|----------|-----|
| Booking forma (korisnici) | http://localhost:3000/booking.html |
| Admin login | http://localhost:3000/admin.html |
| Admin dashboard | http://localhost:3000/dashboard.html |

---

## 🔐 Admin kredencijali

```
Username: admin
Password: admin123
```

---

## 📁 Struktura projekta

```
sunshine-booking/
├── server.js              ← Backend (Express + SQLite + Resend)
├── package.json
├── .env                   ← Tvoji tajni podaci (NE deli ovo!)
├── .env.example           ← Primer .env fajla
├── .gitignore
├── baza.db                ← Automatski se kreira
└── public/
    ├── booking.html       ← Forma za korisnike
    ├── admin.html         ← Login za admina
    └── dashboard.html     ← Admin dashboard
```

---

## 📧 Email podešavanje

1. Idi na resend.com
2. Registruj se (besplatno)
3. Napravi API key
4. Unesi ga u .env kao `RESEND_API_KEY=re_xxxx...`

**Napomena:** Na besplatnom Resend planu možeš slati samo na email koji si verifikovao.
Da bi slao na bilo koji email, trebaš dodati i verifikovati domenu na Resend.

---

## 🔗 API Rute

| Metoda | URL | Opis |
|--------|-----|------|
| GET | /api/available-slots?date=YYYY-MM-DD | Slobodni termini |
| POST | /api/booking | Nova rezervacija |
| POST | /api/admin/login | Admin login |
| POST | /api/admin/logout | Admin odjava |
| GET | /api/admin/check | Provera logina |
| GET | /api/reservations | Sve rezervacije |
| PUT | /api/reservations/:id/confirm | Potvrdi |
| PUT | /api/reservations/:id/cancel | Otkaži |
| POST | /api/block-date | Blokiraj datum |
| DELETE | /api/block-date/:id | Odblokiraj |
| GET | /api/blocked-dates | Svi blokirani datumi |
