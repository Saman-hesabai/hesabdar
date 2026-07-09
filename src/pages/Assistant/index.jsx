export default function Assistant() {
  return (
    <div className="assistant-page">
      <h2>🤖 دستیار حسابدار</h2>

      <div className="assistant-chat">
        <div className="bot-msg">
          سلام سامان 👋
          <br />
          آماده‌ام تا در ثبت نسیه، پرداخت، گزارش‌ها و حسابداری کمکت کنم.
        </div>
      </div>

      <div className="assistant-input">
        <input placeholder="مثلاً: اکبر ۳۵۰ هزار نسیه" />
        <button>ارسال</button>
      </div>
    </div>
  )
}
