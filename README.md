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
