import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CustomerInput =
  | string
  | {
      id?: string;
      name?: string;
      full_name?: string;
      phone?: string;
    };

type AssistantResult = {
  action:
    | "add_transaction"
    | "add_customer"
    | "get_balance"
    | "set_balance"
    | "get_top_debtor"
    | "create_check"
    | "create_reminder"
    | "unknown";
  type: "debt" | "payment" | null;
  amount: number;
  customer_name: string;
  description: string;
  phone: string;
  needs_confirmation: boolean;
  confidence: number;
  message: string;
  date_text: string;
  date_iso: string;
  due_at: string;
  remind_days_before: number;
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function normalizePersianDigits(value: string): string {
  const fa = "۰۱۲۳۴۵۶۷۸۹";
  const ar = "٠١٢٣٤٥٦٧٨٩";
  return value
    .replace(/[۰-۹]/g, (d) => String(fa.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(ar.indexOf(d)));
}

function normalizeText(value: unknown): string {
  return normalizePersianDigits(String(value ?? ""))
    .replace(/\u200c/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeCustomers(value: unknown): Array<{
  id: string;
  name: string;
  phone: string;
}> {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, 500)
    .map((item: CustomerInput, index) => {
      if (typeof item === "string") {
        return {
          id: String(index),
          name: normalizeText(item),
          phone: "",
        };
      }

      return {
        id: normalizeText(item?.id ?? index),
        name: normalizeText(item?.name ?? item?.full_name ?? ""),
        phone: normalizeText(item?.phone ?? ""),
      };
    })
    .filter((item) => item.name);
}

function clamp(value: unknown, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function cleanResult(value: unknown): AssistantResult {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  const allowedActions = new Set([
    "add_transaction",
    "add_customer",
    "get_balance",
    "set_balance",
    "get_top_debtor",
    "create_check",
    "create_reminder",
    "unknown",
  ]);

  const action = allowedActions.has(String(raw.action))
    ? (String(raw.action) as AssistantResult["action"])
    : "unknown";

  const type =
    raw.type === "debt" || raw.type === "payment"
      ? raw.type
      : null;

  return {
    action,
    type,
    amount: Math.max(0, Math.round(Number(raw.amount) || 0)),
    customer_name: normalizeText(raw.customer_name),
    description: normalizeText(raw.description),
    phone: normalizeText(raw.phone),
    needs_confirmation:
      typeof raw.needs_confirmation === "boolean"
        ? raw.needs_confirmation
        : true,
    confidence: clamp(raw.confidence, 0, 1),
    message:
      normalizeText(raw.message) ||
      "نتیجه آماده شد؛ پیش از ثبت آن را بررسی و تأیید کن.",
    date_text: normalizeText(raw.date_text),
    date_iso: normalizeText(raw.date_iso),
    due_at: normalizeText(raw.due_at),
    remind_days_before: Math.max(0, Math.round(Number(raw.remind_days_before) || 2)),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { ok: false, error: "فقط درخواست POST مجاز است." },
      405,
    );
  }

  try {
    const authorization = req.headers.get("Authorization") ?? "";

    if (!authorization) {
      return jsonResponse(
        { ok: false, error: "کاربر وارد حساب نشده است." },
        401,
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
      "";
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY") ?? "";

    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonResponse(
        {
          ok: false,
          error: "تنظیمات Supabase در تابع کامل نیست.",
        },
        500,
      );
    }

    if (!geminiApiKey) {
      return jsonResponse(
        {
          ok: false,
          error:
            "کلید GEMINI_API_KEY در بخش Edge Function Secrets ذخیره نشده است.",
        },
        500,
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return jsonResponse(
        {
          ok: false,
          error: "نشست کاربر معتبر نیست؛ دوباره وارد حساب شو.",
        },
        401,
      );
    }

    const body = await req.json().catch(() => ({}));
    const text = normalizeText(body?.text);
    const audioBase64 = String(body?.audio_base64 ?? "").trim();
    const audioMimeType = normalizeText(body?.audio_mime_type) || "audio/webm";
    const customers = sanitizeCustomers(body?.customers);
    const currentDate = normalizeText(body?.current_date) || new Date().toISOString();
    const timezone = normalizeText(body?.timezone) || "Asia/Tehran";

    if (!text && !audioBase64) {
      return jsonResponse(
        { ok: false, error: "فرمان متنی یا صوتی دریافت نشد." },
        400,
      );
    }
    if (audioBase64.length > 20_000_000) {
      return jsonResponse(
        { ok: false, error: "فایل صوتی بیش از حد بزرگ است؛ فرمان را کوتاه‌تر ضبط کن." },
        413,
      );
    }

    const customerNames = customers.map((item) => item.name);

    const systemPrompt = `
تو دستیار هوشمند اپ حسابداری فروشگاه «حسابدار» هستی.
فرمان فارسی کاربر را تحلیل کن و فقط مطابق JSON Schema خروجی بده.

قواعد:
1) مبلغ نهایی همیشه بر حسب تومان و به‌صورت عدد صحیح باشد.
2) «هزار» یعنی ضربدر 1000 و «میلیون» یعنی ضربدر 1000000.
3) بدهی، نسیه، برد، خرید کرد و حسابش کن => type برابر debt.
4) پرداخت، واریز، تسویه، داد و حساب کرد => type برابر payment.
5) اقلام یا علت خرید را در description نگه دار؛ نام مشتری را داخل description تکرار نکن.
6) نام مشتری را تا حد ممکن از فهرست مشتریان انتخاب کن.
7) اگر مشتری قطعی نیست یا چند نام مشابه وجود دارد، needs_confirmation=true.
8) هیچ تراکنشی را خودت ثبت نکن؛ فقط نتیجه پیشنهادی تولید کن.
9) action:
   - ثبت بدهی یا پرداخت: add_transaction
   - ساخت مشتری: add_customer
   - پرسش مانده مشتری: get_balance
   - تغییر مانده حساب مشتری به مبلغ مشخص: set_balance
   - بدهکارترین مشتری: get_top_debtor
   - ثبت چک با تاریخ سررسید: create_check
   - ساخت یادآوری: create_reminder
   - نامشخص: unknown
اگر عملیات بدهی یا پرداخت نیست، مقدار type را "none" بگذار.
10) confidence عددی بین صفر و یک باشد.
11) پیام کوتاه و فارسی باشد.
12) برای پرسش مانده تا تاریخ مشخص، date_iso را به شکل YYYY-MM-DD برگردان. اگر کاربر گفت تا امروز، تاریخ امروز را برگردان.
13) برای چک و یادآوری، due_at را حتماً ISO 8601 کامل برگردان. اگر ساعت گفته نشد، ساعت 09:00 محلی را در نظر بگیر.
14) برای چک، remind_days_before پیش‌فرض 2 است مگر کاربر عدد دیگری بگوید.
15) متن فارسی تاریخ فهمیده‌شده را در date_text نگه دار.
16) برای یادآوری، شرح کامل کار را در description بگذار.
17) اگر کاربر در یک فرمان گفت مشتری جدید بساز و هم‌زمان مانده/بدهی اولیه هم گفت، action را add_customer بده، مبلغ را در amount و type را debt قرار بده. مثال: «یک مشتری جدید به اسم رضا با مانده بدهی یک میلیون تومان تا امروز ایجاد کن» => action:add_customer, customer_name:رضا, amount:1000000, type:debt.
18) هر فرمانی که واژه «چک» و تاریخ سررسید دارد حتماً create_check است، نه add_transaction. نام صاحب چک در customer_name، مبلغ در amount و موعد در due_at باشد.
19) هر فرمانی که با «یادم بنداز»، «یادآوری کن» یا «یادآور» بیان شده حتماً create_reminder است. متن کاری که باید انجام شود در description و زمان در due_at باشد.
20) اگر کاربر گفت «سه‌شنبه» بدون واژه آینده، نزدیک‌ترین سه‌شنبه بعد از زمان فعلی را انتخاب کن.
21) برای create_check و create_reminder، date_text و due_at هرگز خالی نباشند. اگر ساعت گفته نشد 09:00 محلی بگذار.
22) اگر ورودی صوتی است، هیچ تبدیل گفتار به متن مرورگر وجود ندارد؛ خودت فایل صوتی را مستقیماً و کامل گوش کن. مکث، لهجه و گفتن چند قلم کالا نباید باعث حذف بخشی از فرمان شود.
23) تمام اقلام گفته‌شده را بدون خلاصه‌سازی ناقص در description نگه دار و اگر کاربر جمع کل را گفته همان مبلغ را مبنا قرار بده.
24) منظور طبیعی کاربر مهم‌تر از عبارت‌های ثابت است؛ فرمان را مثل یک دستیار حسابدار واقعی تفسیر کن.
25) اگر کاربر گفت «مانده حساب فلانی را به مبلغ X تغییر بده/تنظیم کن/بکن»، action حتماً set_balance باشد، customer_name نام مشتری و amount مانده نهایی موردنظر باشد. این فرمان add_transaction یا get_balance نیست. مثال: «مانده حساب رجب امرایی رو به 15 میلیون و 100 هزار تومان تغییر بده» => action:set_balance, amount:15100000.
`.trim();

    const userPrompt = `
فرمان متنی کاربر:
${text || "فرمان به‌صورت فایل صوتی ارسال شده است؛ ابتدا خود صدا را دقیق بشنو و سپس منظور کامل کاربر را تحلیل کن."}

تاریخ و ساعت فعلی:
${currentDate}
منطقه زمانی: ${timezone}

فهرست نام مشتریان موجود:
${customerNames.length ? customerNames.join(" | ") : "خالی"}

نمونه‌های قطعی:
- «مشتری جدید رضا با مانده بدهی یک میلیون بساز» => add_customer با amount=1000000 و type=debt
- «چک رضا 100 میلیون برای 25 مهر ثبت کن» => create_check
- «سه شنبه یادم بنداز برای علی پول بزنم» => create_reminder
`.trim();

    const responseSchema = {
      type: "object",
      required: [
        "action",
        "type",
        "amount",
        "customer_name",
        "description",
        "phone",
        "needs_confirmation",
        "confidence",
        "message",
        "date_text",
        "date_iso",
        "due_at",
        "remind_days_before",
      ],
      properties: {
        action: {
          type: "string",
          enum: [
            "add_transaction",
            "add_customer",
            "get_balance",
            "set_balance",
            "get_top_debtor",
            "create_check",
            "create_reminder",
            "unknown",
          ],
        },
        type: {
          type: "string",
          enum: ["debt", "payment", "none"],
        },
        amount: {
          type: "integer",
          minimum: 0,
        },
        customer_name: {
          type: "string",
        },
        description: {
          type: "string",
        },
        phone: {
          type: "string",
        },
        needs_confirmation: {
          type: "boolean",
        },
        confidence: {
          type: "number",
          minimum: 0,
          maximum: 1,
        },
        message: { type: "string" },
        date_text: { type: "string" },
        date_iso: { type: "string" },
        due_at: { type: "string" },
        remind_days_before: { type: "integer", minimum: 0, maximum: 30 },
      },
    };

    const model = "gemini-3.5-flash";
    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const requestBody = JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: "user",
          parts: [
            { text: userPrompt },
            ...(audioBase64
              ? [{ inlineData: { mimeType: audioMimeType, data: audioBase64 } }]
              : []),
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 1200,
        responseMimeType: "application/json",
        responseSchema,
      },
    });

    async function callGemini() {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiApiKey,
        },
        body: requestBody,
      });
      const data = await response.json().catch(() => ({}));
      return { response, data };
    }

    function getRetryDelaySeconds(data: any): number {
      const message = String(data?.error?.message ?? "");
      const messageMatch = message.match(/retry\s+in\s+([0-9.]+)s/i);
      if (messageMatch) return Math.ceil(Number(messageMatch[1]) || 0);

      const details = Array.isArray(data?.error?.details) ? data.error.details : [];
      for (const detail of details) {
        const retryDelay = String(detail?.retryDelay ?? "");
        const detailMatch = retryDelay.match(/([0-9.]+)s/i);
        if (detailMatch) return Math.ceil(Number(detailMatch[1]) || 0);
      }
      return 0;
    }

    let { response: geminiResponse, data: geminiData } = await callGemini();

    // در محدودیت موقت سهمیه، فقط یک بار پس از زمان پیشنهادی Gemini تلاش مجدد می‌کنیم.
    if (geminiResponse.status === 429) {
      const suggestedDelay = getRetryDelaySeconds(geminiData);
      const retryAfter = Math.min(35, Math.max(2, suggestedDelay || 5));
      console.warn(`Gemini quota reached; retrying once after ${retryAfter}s`);
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      ({ response: geminiResponse, data: geminiData } = await callGemini());
    }

    if (!geminiResponse.ok) {
      console.error(
        "Gemini API error:",
        geminiResponse.status,
        JSON.stringify(geminiData),
      );

      if (geminiResponse.status === 429) {
        const retryAfter = Math.max(5, getRetryDelaySeconds(geminiData) || 30);
        return jsonResponse(
          {
            ok: false,
            code: "GEMINI_QUOTA_EXCEEDED",
            retry_after_seconds: retryAfter,
            error: `دستیار فعلاً شلوغ است. حدود ${retryAfter} ثانیه دیگر دوباره امتحان کن.`,
          },
          429,
        );
      }

      return jsonResponse(
        {
          ok: false,
          error:
            geminiData?.error?.message
              ? "در ارتباط با دستیار هوشمند مشکلی پیش آمد. کمی بعد دوباره امتحان کن."
              : `خطای Gemini با کد ${geminiResponse.status}`,
        },
        geminiResponse.status,
      );
    }

    const content =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content || typeof content !== "string") {
      console.error("Empty Gemini response:", JSON.stringify(geminiData));
      return jsonResponse(
        { ok: false, error: "پاسخ Gemini خالی بود." },
        502,
      );
    }

    let parsed: unknown;

    try {
      // Gemini گاهی JSON را داخل code fence یا همراه متن اضافه برمی‌گرداند.
      // این بخش پاسخ را تمیز می‌کند و اولین شیء JSON معتبر را بیرون می‌کشد.
      const cleaned = content
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");
      const candidate =
        firstBrace >= 0 && lastBrace > firstBrace
          ? cleaned.slice(firstBrace, lastBrace + 1)
          : cleaned;

      try {
        parsed = JSON.parse(candidate);
      } catch {
        // اصلاح خطاهای رایج: ویرگول اضافه، کوتیشن هوشمند و بسته‌نشدن آکولاد.
        let repaired = candidate
          .replace(/[“”]/g, '"')
          .replace(/[‘’]/g, "'")
          .replace(/,\s*([}\]])/g, "$1");

        const opens = (repaired.match(/{/g) || []).length;
        const closes = (repaired.match(/}/g) || []).length;
        if (opens > closes) repaired += "}".repeat(opens - closes);

        parsed = JSON.parse(repaired);
      }
    } catch (error) {
      console.error("Gemini JSON parse error:", error, content);
      return jsonResponse(
        {
          ok: false,
          error: "پاسخ Gemini ناقص بود؛ دوباره فرمان را ارسال کن.",
        },
        502,
      );
    }

    const result = cleanResult(parsed);

    return jsonResponse({
      ok: true,
      server_version: "v1.2.4",
      result,
    });
  } catch (error) {
    console.error("hesabdar-ai unexpected error:", error);

    return jsonResponse(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "خطای ناشناخته در دستیار حسابدار.",
      },
      500,
    );
  }
});
