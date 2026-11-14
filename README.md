# Chap Reader

قارئ مانغا/مانهوا محلي يقرأ من موقع Atsumaru (atsu.moe).

## التشغيل

```bash
npm install
npm start
```

ثم افتح: **http://localhost:3000**

## المميزات

- تصفح وفلترة حسب التصنيف (Genre) والتاقات والنوع
- بحث بالاسم
- صفحة تفاصيل المانغا مع قائمة الفصول
- قارئ بوضعين:
  - **Scroll** (افتراضي) – مناسب للمانهوا
  - **Page** – صفحة صفحة مع أسهم الكيبورد
- الوضع يُحفظ تلقائياً

## بنية الملفات

```
Chap/
├── server.js        ← سيرفر Express يعمل كبروكسي لـ atsu.moe
├── package.json
└── public/
    ├── index.html
    ├── style.css
    └── app.js
```

## التشغيل على Termux (أندرويد)

```bash
pkg update -y && pkg upgrade -y
pkg install -y nodejs git
git clone https://github.com/akuyakii/Chap
cd Chap
git checkout ccr-c3019501-oykvh7
npm install
npm start
```
ثم افتح المتصفح على الموبايل: `http://localhost:3000`

- يعرض المانجا الرومانسية فقط (Genre 9). لتغيير التصنيف: `GENRE_ID=39 npm start`
- لإيقاف السيرفر: `Ctrl+C`
- لتحديث المشروع لاحقًا: `cd Chap && git pull && npm install`
