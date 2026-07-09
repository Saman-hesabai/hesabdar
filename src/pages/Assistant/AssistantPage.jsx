export default function AssistantPage() {
  return (
    <section className="assistant-page" dir="rtl">
      <div className="assistant-hero">
        <div className="assistant-orb">🤖</div>
        <h2>دستیار حسابدار</h2>
        <p>سلام سامان، امروز چه کاری برات انجام بدم؟</p>
      </div>

      <div className="assistant-chat">
        <div className="bot-msg">می‌تونی بنویسی: برای اکبر ۵۰۰ هزار نسیه ثبت کن</div>
        <div className="bot-msg">یا بپرسی: بدهی اکبر چقدره؟</div>
      </div>

      <div className="assistant-input">
        <input placeholder="فرمانت رو بنویس..." />
        <button>ارسال</button>
        <button className="mic">🎤</button>
      </div>
    </section>
  )
}
