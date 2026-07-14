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
    | "get_top_debtor"
    | "unknown";
  type: "debt" | "payment" | null;
  amount: number;
  customer_name: string;
  description: string;
  phone: string;
  needs_confirmation: boolean;
  confidence: number;
  message: string;
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
    "get_top_debtor",
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
    const customers = sanitizeCustomers(body?.customers);

    if (!text) {
      return jsonResponse(
        { ok: false, error: "متن فرمان خالی است." },
        400,
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
   - بدهکارترین مشتری: get_top_debtor
   - نامشخص: unknown
10) confidence عددی بین صفر و یک باشد.
11) پیام کوتاه و فارسی باشد.
`.trim();

    const userPrompt = `
فرمان کاربر:
${text}

فهرست نام مشتریان موجود:
${customerNames.length ? customerNames.join(" | ") : "خالی"}
`.trim();

    const responseSchema = {
      type: "object",
      additionalProperties: false,
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
      ],
      properties: {
        action: {
          type: "string",
          enum: [
            "add_transaction",
            "add_customer",
            "get_balance",
            "get_top_debtor",
            "unknown",
          ],
        },
        type: {
          type: ["string", "null"],
          enum: ["debt", "payment", null],
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
        message: {
          type: "string",
        },
      },
    };

    const model = "gemini-3.5-flash";
    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const geminiResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiApiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: userPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 1200,
          responseMimeType: "application/json",
          responseSchema,
        },
      }),
    });

    const geminiData = await geminiResponse.json().catch(() => ({}));

    if (!geminiResponse.ok) {
      console.error(
        "Gemini API error:",
        geminiResponse.status,
        JSON.stringify(geminiData),
      );

      return jsonResponse(
        {
          ok: false,
          error:
            geminiData?.error?.message ??
            `خطای Gemini با کد ${geminiResponse.status}`,
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
      parsed = JSON.parse(content);
    } catch (error) {
      console.error("Gemini JSON parse error:", error, content);
      return jsonResponse(
        {
          ok: false,
          error: "پاسخ ساختاریافته Gemini قابل خواندن نبود.",
        },
        502,
      );
    }

    const result = cleanResult(parsed);

    return jsonResponse({
      ok: true,
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
