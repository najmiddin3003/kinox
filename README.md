# KINOX — Node.js movie platform

KINOX — Node.js + Express + MongoDB Atlas asosidagi kino katalogi. Loyihada login/register, autentifikatsiya, nom bo‘yicha qidiruv, janr filtri, OCR orqali screenshot ichidagi matnni qidirish va admin panel mavjud.

## 1. Kerakli dasturlar
- Node.js 20 yoki undan yangi
- MongoDB Atlas akkaunti (bepul cluster ham yetadi)
- VS Code

## 2. MongoDB Atlas sozlash
1. https://www.mongodb.com/atlas saytida cluster yarating.
2. Database Access bo‘limida database user yarating.
3. Network Access bo‘limida IP manzilingizni ruxsat eting (yoki vaqtincha test uchun `0.0.0.0/0`; ishga tushgach cheklang).
4. Connect → Drivers → Node.js orqali connection string nusxalang.
5. Loyihadagi `.env` faylida `MONGODB_URI=` qatoriga connection stringni qo‘ying. `YOUR_ATLAS_USER`, `YOUR_ATLAS_PASSWORD`, `YOUR_CLUSTER` qismlarini o‘zingiznikiga almashtiring.

## 3. Ishga tushirish
Terminalda KINOX papkasiga kiring va quyidagilarni bajaring:

```bash
npm install
npm run dev
```

Brauzerda `http://localhost:3000` ni oching.

## 4. Admin kirish
`.env` faylida quyidagi qiymatlar boshlang‘ich admin uchun sozlangan:
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`

Birinchi ishga tushishda admin akkaunti avtomatik yaratiladi va parol bcrypt bilan hash qilinadi. `.env` faylini hech qachon GitHub'ga yuklamang yoki boshqalarga yubormang. Ishga tushirgandan keyin admin parolini kuchli, unikal parolga almashtirish tavsiya etiladi.

## 5. 100 ta kino haqida
MongoDB bo‘sh bo‘lsa, dastur avtomatik ravishda 100 ta kino nomi bilan katalog yaratadi. Posterlar hozircha placeholder rasmlar. Haqiqiy poster va rasmiy tomosha manbalarini qo‘shish uchun admin paneldan kino yaratish mumkin.

### TMDB orqali poster topish (ixtiyoriy)
1. https://www.themoviedb.org/ saytida akkaunt ochib API key oling.
2. `.env` faylidagi `TMDB_API_KEY=` qatoriga API keyni yozing.
3. TMDB qidiruv endpointi `/api/tmdb/search?q=Interstellar` autentifikatsiyadan keyin ishlaydi. Bu endpoint poster va tavsif ma'lumotlarini qaytaradi; hozirgi interfeysda kino qo‘shish formasiga poster URL'ni qo‘lda qo‘yish mumkin.

TMDB ma'lumotlari va rasmlari TMDB shartlariga bo‘ysunadi. Bu loyiha TMDB tomonidan tasdiqlanmagan yoki homiylik qilinmagan.

## 6. Screenshot qidiruvi
Rasm yuklanadi va brauzerda Tesseract OCR yordamida rasm ichidagi ko‘rinadigan matn aniqlanadi. Aniqlangan so‘zlar katalogdagi kino nomlari bo‘yicha qidiriladi. Bu sahna tasvirini AI orqali tanib olish emas; matn bo‘lmagan skrinshotlarda natija topilmasligi mumkin.

## 7. Muhim xavfsizlik eslatmalari
- `SESSION_SECRET` qiymatini uzun tasodifiy qiymatga almashtiring.
- `.env` faylini ommaga tarqatmang.
- Ishlab chiqarish serverida HTTPS yoqing va `NODE_ENV=production` qiling.
- Video URL maydoniga faqat o‘zingiz tarqatishga huquqingiz bo‘lgan yoki rasmiy manbalarni joylang. KINOX film fayllarini noqonuniy joylashtirmaydi.
- Ushbu demo admin panel foydalanuvchilarni ko‘rish, bloklash/ochildi va o‘chirish, kinolarni qo‘shish/o‘chirish imkonini beradi.

## 8. Internetga joylash (deploy)

Kerakli environment variables (`.env.example` faylida namuna bor):

| Nomi | Majburiy | Izoh |
|---|---|---|
| `MONGODB_URI` | ha | MongoDB Atlas connection string. Atlas → Network Access'da `0.0.0.0/0` ruxsat bering (Render/Vercel IP'lari doimiy emas). |
| `ADMIN_PASSWORD` | ha | Kamida 8 belgi. |
| `SESSION_SECRET` | ha | Uzun tasodifiy qiymat. |
| `ADMIN_USERNAME` | yo‘q | Standart: `admin`. |
| `NODE_ENV` | yo‘q | `production` (Vercel o‘zi qo‘yadi). |
| `TMDB_API_KEY` | yo‘q | TMDB qidiruvi uchun. |
| `BLOB_READ_WRITE_TOKEN` | Vercel'da fayl yuklash uchun | Vercel Blob store ulanganda avtomatik qo‘shiladi. |

### Render
1. https://render.com → **New → Blueprint** → shu GitHub repo'ni tanlang (`render.yaml` avtomatik o‘qiladi).
2. `MONGODB_URI` va `ADMIN_PASSWORD` qiymatlarini kiriting → **Apply**.
3. Eslatma: Render bepul tarifida disk vaqtinchalik — `uploads/` ga yuklangan fayllar qayta deploy/uyqudan keyin o‘chadi. Doimiy saqlash uchun `BLOB_READ_WRITE_TOKEN` (Vercel Blob) qo‘shing yoki Render Disk ulang.

### Vercel
1. https://vercel.com → **Add New → Project** → shu GitHub repo'ni import qiling. Framework: **Other** (`vercel.json` hamma narsani sozlaydi).
2. **Settings → Environment Variables**'ga yuqoridagi qiymatlarni kiriting.
3. **Storage → Create → Blob** qilib loyihaga ulang — bu `BLOB_READ_WRITE_TOKEN`ni qo‘shadi va admin paneldan rasm/video yuklash ishlaydi (fayllar brauzerdan to‘g‘ridan-to‘g‘ri Blob'ga yuklanadi).
4. **Redeploy** qiling.

Vercel cheklovlari: serverless funksiyalar sababli "online" foydalanuvchilar soni va jonli yangilanishlar taxminiy ishlaydi (ulanish har ~50 soniyada qayta ochiladi). Blob ulanmasa, fayl o‘rniga video/poster URL kiriting.
