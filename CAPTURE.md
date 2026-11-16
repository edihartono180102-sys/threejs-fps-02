# DUSTLINE — cara ambil 4 screenshot (di mesin Richard, bukan di VM)

VM Muse tidak bisa capture: WebGL-nya NULL dan percobaan browser 15 Nov 19:44 WIB gagal
(tab tidak terbuka). Game ini punya mode capture deterministik, jadi di mesin yang
punya Chrome + WebGL 2 tinggal buka 4 URL ini dan screenshot.

## Yang dibutuhkan
- Chrome desktop (atau browser lain dengan WebGL 2 + hardware acceleration nyala)
- Node 22, atau Python 3 (buat serve file statis — game pakai ES modules, jadi TIDAK
  bisa dibuka langsung lewat file://, harus lewat http://localhost)

## Langkah
1. Unzip `dustline-game.zip`, masuk ke folder `game/`.
2. Jalankan salah satu (di folder `game/`):
   - `npx serve . -l 8080` , atau
   - `python3 -m http.server 8080` , atau
   - `node ../serve.ts` (dari folder entry; serve di port 8080)
3. Buka Chrome, atur ukuran jendela sekitar **1280 x 800** (lebar jangan lebih dari
   1280 — itu batas gate; tinggi minimal 480).
4. Buka 4 URL ini satu per satu, tunggu sampai scene-nya stabil (mode capture
   otomatis menata scene; seed 1 = hasil yang sama setiap kali):
   - http://localhost:8080/?shot=start&seed=1  -> simpan sebagai `1-start.jpg`
   - http://localhost:8080/?shot=buy&seed=1    -> simpan sebagai `2-buy.jpg`
   - http://localhost:8080/?shot=play&seed=1   -> simpan sebagai `3-play.jpg`
   - http://localhost:8080/?shot=end&seed=1    -> simpan sebagai `4-end.jpg`
5. Screenshot pakai screenshot bawaan OS/browser (bukan foto layar pakai HP).
   Simpan sebagai JPG/PNG, **masing-masing maksimal 256 KiB**, sisi panjang
   maksimal 1280 px, sisi pendek minimal 480 px. Kalau file kegedean, turunkan
   kualitas JPG ke ~80.
6. Kirim keempat file itu balik ke Muse — Muse yang masukin ke `screenshots/`,
   rebuild dossier, lalu submit.

## Kalau scene gelap / hitam
- Cek `chrome://gpu` — WebGL 2 harus "Hardware accelerated".
- Nyalakan hardware acceleration di Settings Chrome, restart Chrome.
- Pastikan tidak ada flag `--disable-gpu` aktif.

## Deadline
threejs-fps-02 tutup **Senin 17 Nov 2026 jam 04:30 WIB**. Screenshot harus sudah
di tangan Muse beberapa jam sebelumnya, karena setelah itu masih ada: rebuild
dossier + push GitHub + submit.
