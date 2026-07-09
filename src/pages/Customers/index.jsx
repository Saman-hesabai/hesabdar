export default function Customers() {
  return (
    <div className="customers-page" dir="rtl">
      <h1>👥 مشتری‌ها</h1>

      <div className="search-box">
        <input placeholder="جستجوی نام یا شماره موبایل..." />
      </div>

      <div className="empty-state">
        فعلاً لیست مشتری‌ها از نسخه قبلی داخل داشبورد اصلی است.
        در مرحله بعد، اطلاعات واقعی مشتری‌ها را به این صفحه منتقل می‌کنیم.
      </div>
    </div>
  )
}
