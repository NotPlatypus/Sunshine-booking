// ============================================
// SERVER.JS — Glavni backend za booking sistem
// Sunshine Ladies Cleaning Service
// ============================================

// Učitavamo .env fajl — mora biti PRVI red
require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const session    = require('express-session');
const bcrypt     = require('bcryptjs');
const Database   = require('better-sqlite3');
const { Resend } = require('resend');
const path       = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// Resend klijent za slanje mejlova
const resend = new Resend(process.env.RESEND_API_KEY);

// ============================================
// MIDDLEWARE
// ============================================
// CORS — dozvoljava zahteve sa GitHub Pages sajta i lokalnog razvoja
app.use(cors({
  origin: [
    'https://notplatypus.github.io',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ],
  credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session — pamti da li je admin ulogovan
app.use(session({
  secret: process.env.SESSION_SECRET || 'sunshine_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8 sati
}));


// ============================================
// BAZA PODATAKA — SQLite
// ============================================
const db = new Database('baza.db');

// Tabela za rezervacije
db.exec(`
  CREATE TABLE IF NOT EXISTS rezervacije (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    ime            TEXT    NOT NULL,
    email          TEXT    NOT NULL,
    telefon        TEXT    NOT NULL,
    adresa         TEXT    NOT NULL,
    tip_ciscenja   TEXT    NOT NULL,
    datum          TEXT    NOT NULL,
    vreme          TEXT    NOT NULL,
    napomena       TEXT    DEFAULT '',
    status         TEXT    DEFAULT 'pending',
    kreiran_datum  TEXT    DEFAULT (datetime('now'))
  )
`);

// Tabela za blokirane datume (praznici, odmor...)
db.exec(`
  CREATE TABLE IF NOT EXISTS blokirani_datumi (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    datum   TEXT    NOT NULL UNIQUE,
    razlog  TEXT    DEFAULT ''
  )
`);

console.log('✅ Baza podataka je spremna!');


// ============================================
// POMOĆNE FUNKCIJE
// ============================================

// Dostupna vremena tokom dana
const SVA_VREMENA = ['8:30', '10:00', '12:00', '14:00'];

// Provjeri da li je admin ulogovan (middleware za zaštitu ruta)
function adminAuth(req, res, next) {
  if (req.session && req.session.admin) {
    next(); // Ulogovan, nastavi
  } else {
    res.status(401).json({ greska: 'Nisi ulogovan!' });
  }
}

// Pošalji email korisniku — potvrda da je zahtev primljen
async function posaljiEmailKorisniku(rezervacija) {
  try {
    await resend.emails.send({
      from: 'Sunshine Ladies <onboarding@resend.dev>', // Promeni kad dobiješ domenu
      to: rezervacija.email,
      subject: 'Booking Request Received — Sunshine Ladies',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1B2B4B; padding: 24px; text-align: center;">
            <h1 style="color: #F5C300; margin: 0;">Sunshine Ladies</h1>
            <p style="color: #fff; margin: 4px 0 0;">Cleaning Service</p>
          </div>
          <div style="padding: 32px 24px;">
            <h2 style="color: #1B2B4B;">Hi ${rezervacija.ime}!</h2>
            <p>Thank you for booking with Sunshine Ladies Cleaning Service. We've received your request and will confirm your appointment shortly.</p>
            
            <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 24px 0;">
              <h3 style="color: #1B2B4B; margin-top: 0;">Booking Details</h3>
              <p><strong>Service:</strong> ${rezervacija.tip_ciscenja}</p>
              <p><strong>Date:</strong> ${rezervacija.datum}</p>
              <p><strong>Time:</strong> ${rezervacija.vreme}</p>
              <p><strong>Address:</strong> ${rezervacija.adresa}</p>
              ${rezervacija.napomena ? `<p><strong>Notes:</strong> ${rezervacija.napomena}</p>` : ''}
            </div>
            
            <p>If you need to make any changes or have questions, please call us at <strong>(806) 239-2893</strong>.</p>
            <p style="color: #666; font-size: 14px;">You will receive a confirmation email once we review your request.</p>
          </div>
          <div style="background: #1B2B4B; padding: 16px; text-align: center;">
            <p style="color: rgba(255,255,255,0.6); margin: 0; font-size: 13px;">
              Sunshine Ladies Cleaning Service · 82nd St Suite 104, Lubbock, TX 79423
            </p>
          </div>
        </div>
      `
    });
    console.log(`📧 Email poslat korisniku: ${rezervacija.email}`);
  } catch (err) {
    console.error('❌ Greška pri slanju emaila korisniku:', err.message);
  }
}

// Pošalji email adminu — nova rezervacija stigla
async function posaljiEmailAdminu(rezervacija) {
  try {
    await resend.emails.send({
      from: 'Sunshine Ladies Booking <onboarding@resend.dev>',
      to: process.env.ADMIN_EMAIL,
      subject: '🆕 New Booking Request — Sunshine Ladies',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1B2B4B; padding: 24px;">
            <h2 style="color: #F5C300; margin: 0;">New Booking Request!</h2>
          </div>
          <div style="padding: 24px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; font-weight: bold; color: #555; width: 140px;">Name</td>
                <td style="padding: 10px 0;">${rezervacija.ime}</td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; font-weight: bold; color: #555;">Email</td>
                <td style="padding: 10px 0;">${rezervacija.email}</td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; font-weight: bold; color: #555;">Phone</td>
                <td style="padding: 10px 0;">${rezervacija.telefon}</td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; font-weight: bold; color: #555;">Address</td>
                <td style="padding: 10px 0;">${rezervacija.adresa}</td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; font-weight: bold; color: #555;">Service</td>
                <td style="padding: 10px 0;">${rezervacija.tip_ciscenja}</td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; font-weight: bold; color: #555;">Date</td>
                <td style="padding: 10px 0;">${rezervacija.datum}</td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; font-weight: bold; color: #555;">Time</td>
                <td style="padding: 10px 0;">${rezervacija.vreme}</td>
              </tr>
              ${rezervacija.napomena ? `
              <tr>
                <td style="padding: 10px 0; font-weight: bold; color: #555;">Notes</td>
                <td style="padding: 10px 0;">${rezervacija.napomena}</td>
              </tr>` : ''}
            </table>
            <div style="margin-top: 24px;">
              <a href="http://localhost:${PORT}/dashboard.html" 
                 style="background: #F5C300; color: #1B2B4B; padding: 12px 24px; 
                        border-radius: 6px; text-decoration: none; font-weight: bold;">
                Open Dashboard
              </a>
            </div>
          </div>
        </div>
      `
    });
    console.log(`📧 Email poslat adminu`);
  } catch (err) {
    console.error('❌ Greška pri slanju emaila adminu:', err.message);
  }
}

// Pošalji email korisniku — potvrda termina
async function posaljiEmailPotvrdaTermina(rezervacija) {
  try {
    await resend.emails.send({
      from: 'Sunshine Ladies <onboarding@resend.dev>',
      to: rezervacija.email,
      subject: '✅ Your Booking is Confirmed — Sunshine Ladies',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1B2B4B; padding: 24px; text-align: center;">
            <h1 style="color: #F5C300; margin: 0;">Sunshine Ladies</h1>
          </div>
          <div style="padding: 32px 24px;">
            <h2 style="color: #1B2B4B;">Your booking is confirmed! ✅</h2>
            <p>Hi ${rezervacija.ime}, we're looking forward to seeing you!</p>
            <div style="background: #f0fff4; border: 1px solid #68d391; border-radius: 8px; padding: 20px; margin: 24px 0;">
              <h3 style="color: #1B2B4B; margin-top: 0;">Confirmed Appointment</h3>
              <p><strong>Service:</strong> ${rezervacija.tip_ciscenja}</p>
              <p><strong>Date:</strong> ${rezervacija.datum}</p>
              <p><strong>Time:</strong> ${rezervacija.vreme}</p>
              <p><strong>Address:</strong> ${rezervacija.adresa}</p>
            </div>
            <p>Questions? Call us at <strong>(806) 239-2893</strong>.</p>
          </div>
          <div style="background: #1B2B4B; padding: 16px; text-align: center;">
            <p style="color: rgba(255,255,255,0.6); margin: 0; font-size: 13px;">
              Sunshine Ladies Cleaning Service · Lubbock, TX
            </p>
          </div>
        </div>
      `
    });
  } catch (err) {
    console.error('❌ Greška pri slanju emaila potvrde:', err.message);
  }
}

// Pošalji email korisniku — otkazivanje termina
async function posaljiEmailOtkazivanje(rezervacija) {
  try {
    await resend.emails.send({
      from: 'Sunshine Ladies <onboarding@resend.dev>',
      to: rezervacija.email,
      subject: 'Booking Update — Sunshine Ladies',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1B2B4B; padding: 24px; text-align: center;">
            <h1 style="color: #F5C300; margin: 0;">Sunshine Ladies</h1>
          </div>
          <div style="padding: 32px 24px;">
            <h2 style="color: #1B2B4B;">Booking Update</h2>
            <p>Hi ${rezervacija.ime}, unfortunately your booking for <strong>${rezervacija.datum} at ${rezervacija.vreme}</strong> has been cancelled.</p>
            <p>Please contact us to reschedule at your convenience.</p>
            <p><strong>Phone:</strong> (806) 239-2893</p>
            <p><strong>Email:</strong> Sunshineladiescleaningservice@gmail.com</p>
          </div>
        </div>
      `
    });
  } catch (err) {
    console.error('❌ Greška pri slanju emaila otkazivanja:', err.message);
  }
}


// ============================================
// RUTE — Booking (javne, bez logina)
// ============================================

// GET /api/available-slots?date=2024-03-15
// Vraća slobodna vremena za izabrani datum
app.get('/api/available-slots', (req, res) => {
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ greska: 'Datum je obavezan!' });
  }

  // Proveravamo da li je datum blokiran
  const blokiran = db.prepare('SELECT * FROM blokirani_datumi WHERE datum = ?').get(date);
  if (blokiran) {
    return res.json({ slobodna_vremena: [], blokiran: true, razlog: blokiran.razlog });
  }

  // Dohvatamo zauzeta vremena za taj datum (samo potvrđene i pending rezervacije)
  const zauzete = db.prepare(`
    SELECT vreme FROM rezervacije 
    WHERE datum = ? AND status != 'cancelled'
  `).all(date);

  const zauzetaVremena = zauzete.map(r => r.vreme);

  // Filtriramo slobodna vremena
  const slobodna_vremena = SVA_VREMENA.map(vreme => ({
    vreme,
    slobodno: !zauzetaVremena.includes(vreme)
  }));

  res.json({ slobodna_vremena, blokiran: false });
});


// POST /api/booking — Nova rezervacija
app.post('/api/booking', async (req, res) => {
  const { ime, email, telefon, adresa, tip_ciscenja, datum, vreme, napomena } = req.body;

  // Validacija — sve obavezno osim napomene
  if (!ime || !email || !telefon || !adresa || !tip_ciscenja || !datum || !vreme) {
    return res.status(400).json({ greska: 'Sva polja su obavezna!' });
  }

  // Proveravamo da li je termin već zauzet
  const zauzeto = db.prepare(`
    SELECT id FROM rezervacije 
    WHERE datum = ? AND vreme = ? AND status != 'cancelled'
  `).get(datum, vreme);

  if (zauzeto) {
    return res.status(409).json({ greska: 'Taj termin je već zauzet!' });
  }

  // Ubacujemo u bazu
  const rezultat = db.prepare(`
    INSERT INTO rezervacije (ime, email, telefon, adresa, tip_ciscenja, datum, vreme, napomena)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(ime, email, telefon, adresa, tip_ciscenja, datum, vreme, napomena || '');

  const novaRezervacija = db.prepare('SELECT * FROM rezervacije WHERE id = ?').get(rezultat.lastInsertRowid);

  console.log(`✅ Nova rezervacija: ${ime} — ${datum} ${vreme}`);

  // Šaljemo mejlove (ne čekamo da završe — async)
  posaljiEmailKorisniku(novaRezervacija);
  posaljiEmailAdminu(novaRezervacija);

  res.status(201).json({ poruka: 'Rezervacija uspešno kreirana!', id: novaRezervacija.id });
});


// ============================================
// RUTE — Admin (zaštićene loginom)
// ============================================

// POST /api/admin/login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;

  if (
    username === process.env.ADMIN_USERNAME &&
    password === process.env.ADMIN_PASSWORD
  ) {
    req.session.admin = true; // Pamtimo da je admin ulogovan
    console.log('🔐 Admin se ulogovao');
    res.json({ poruka: 'Uspešno ulogovan!' });
  } else {
    res.status(401).json({ greska: 'Pogrešan username ili password!' });
  }
});

// POST /api/admin/logout
app.post('/api/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ poruka: 'Odjavljen!' });
});

// GET /api/admin/check — proveravamo da li je ulogovan
app.get('/api/admin/check', (req, res) => {
  res.json({ ulogovan: !!req.session.admin });
});

// GET /api/reservations — Sve rezervacije (samo admin)
app.get('/api/reservations', adminAuth, (req, res) => {
  const { status, datum } = req.query;

  let upit = 'SELECT * FROM rezervacije WHERE 1=1';
  const params = [];

  if (status) {
    upit += ' AND status = ?';
    params.push(status);
  }

  if (datum) {
    upit += ' AND datum = ?';
    params.push(datum);
  }

  upit += ' ORDER BY datum ASC, vreme ASC';

  const rezervacije = db.prepare(upit).all(...params);
  res.json(rezervacije);
});

// PUT /api/reservations/:id/confirm — Potvrdi rezervaciju
app.put('/api/reservations/:id/confirm', adminAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const rezervacija = db.prepare('SELECT * FROM rezervacije WHERE id = ?').get(id);

  if (!rezervacija) {
    return res.status(404).json({ greska: 'Rezervacija nije pronađena!' });
  }

  db.prepare('UPDATE rezervacije SET status = ? WHERE id = ?').run('confirmed', id);
  console.log(`✅ Rezervacija #${id} potvrđena`);

  // Šaljemo email korisniku
  await posaljiEmailPotvrdaTermina(rezervacija);

  res.json({ poruka: 'Rezervacija potvrđena!' });
});

// PUT /api/reservations/:id/cancel — Otkaži rezervaciju
app.put('/api/reservations/:id/cancel', adminAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const rezervacija = db.prepare('SELECT * FROM rezervacije WHERE id = ?').get(id);

  if (!rezervacija) {
    return res.status(404).json({ greska: 'Rezervacija nije pronađena!' });
  }

  db.prepare('UPDATE rezervacije SET status = ? WHERE id = ?').run('cancelled', id);
  console.log(`❌ Rezervacija #${id} otkazana`);

  await posaljiEmailOtkazivanje(rezervacija);

  res.json({ poruka: 'Rezervacija otkazana!' });
});

// POST /api/block-date — Blokiraj datum
app.post('/api/block-date', adminAuth, (req, res) => {
  const { datum, razlog } = req.body;

  if (!datum) {
    return res.status(400).json({ greska: 'Datum je obavezan!' });
  }

  try {
    db.prepare('INSERT INTO blokirani_datumi (datum, razlog) VALUES (?, ?)').run(datum, razlog || '');
    res.json({ poruka: 'Datum blokiran!' });
  } catch (err) {
    res.status(409).json({ greska: 'Taj datum je već blokiran!' });
  }
});

// DELETE /api/block-date/:id — Odblokiraj datum
app.delete('/api/block-date/:id', adminAuth, (req, res) => {
  const id = parseInt(req.params.id);
  db.prepare('DELETE FROM blokirani_datumi WHERE id = ?').run(id);
  res.json({ poruka: 'Datum odblokiran!' });
});

// GET /api/blocked-dates — Svi blokirani datumi
app.get('/api/blocked-dates', adminAuth, (req, res) => {
  const datumi = db.prepare('SELECT * FROM blokirani_datumi ORDER BY datum ASC').all();
  res.json(datumi);
});


// ============================================
// Pokretanje servera
// ============================================
app.listen(PORT, () => {
  console.log(`🚀 Server radi na: http://localhost:${PORT}`);
  console.log(`📋 Booking forma: http://localhost:${PORT}/booking.html`);
  console.log(`🔐 Admin login: http://localhost:${PORT}/admin.html`);
});
