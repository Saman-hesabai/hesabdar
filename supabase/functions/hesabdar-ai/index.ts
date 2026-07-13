import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ۀة]/g, "ه")
    .replace(/\u200c/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanJson(value: unknown) {
  return String(value ?? "")
    .replace(/^\s*```json\s*/i, "")
    .replace(/^\s*```\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function normalizeCustomers(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, 500)
    .map((customer) => {
      if (typeof customer === "string") {
        return {
          id: "",
          name: normalizeText(customer),
          phone: "",
        };
      }

      if (customer && typeof customer === "object") {
        const item = customer as Record<string, unknown>;

        return {
          id: String(item.id ?? "").trim(),
          name: normalizeText(item.name),
          phone: String(item.phone ?? "").trim(),
        };
      }

      return {
        id: "",
        name: "",
        phone: "",
      };
    })
    .filter((customer) => customer.name);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      {
        ok: false,
        error: "فقط درخواست POST مجاز است.",
      },
      405,
    );
  }

  try {
    const authorization =
      req.headers.get("Authorization") ?? "";

    if (!authorization.startsWith("Bearer ")) {
      return jsonResponse(
        {
          ok: false,
          error: "کاربر وارد حساب نشده است.",
        },
        401,
      );
    }

    const supabaseUrl =
      Deno.env.get("SUPABASE_URL") ?? "";

    const supabaseAnonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const geminiApiKey =
      Deno.env.get("GEMINI_API_KEY") ?? "";

    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonResponse(
        {
          ok: false,
          error: "تنظیمات داخلی Supabase کامل نیست.",
        },
        500,
      );
    }

    if (!geminiApiKey) {
      return jsonResponse(
        {
          ok: false,
          error:
            "کلید GEMINI_API_KEY در بخش Secrets ذخیره نشده است.",
        },
        500,
      );
    }

    const supabase = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: {
            Authorization: authorization,
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const {
      data: userData,
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      console.error(
        "User verification error:",
        userError,
      );

      return jsonResponse(
        {
          ok: false,
          error:
            "نشست کاربر معتبر نیست؛ دوباره وارد حساب شوید.",
        },
        401,
      );
    }

    const body = await req
      .json()
      .catch(() => ({}));

    const command = normalizeText(body?.text);
    const customers = normalizeCustomers(
      body?.customers,
    );

    if (!command) {
      return jsonResponse(
        {
          ok: false,
          error: "متن فرمان خالی است.",
        },
        400,
      );
    }

    const prompt = `
تو دستیار هوشمند فارسی برنامه فروشگاهی «حسابدار» هستی.

فرمان کاربر را تحلیل کن و فقط JSON معتبر برگردان.
هیچ توضیح، Markdown یا کدبلاک ننویس.

قواعد:

- واحد مبلغ تومان است.
- اعداد فارسی، انگلیسی و حروفی را درست تشخیص بده.
- صد و پنجاه و سه هزار یعنی 153000.
- ۱۵۳ هزار یعنی 153000.
- صد تومن در گفتار فروشگاهی معمولاً یعنی 100000.
- یک میلیون و دویست هزار یعنی 1200000.

debt یعنی:
نسیه، طلب، بدهی، خرید روی حساب، به حساب اضافه کن، برد.

payment یعنی:
پرداخت، تسویه، پول داد، واریز، از حساب کم کن.

نام مشتری را از فهرست مشتریان انتخاب کن.
اگر تلفظ نام کمی اشتباه بود، نزدیک‌ترین نام موجود را انتخاب کن.
اقلام خرید را فقط در description قرار بده.
نام مشتری، مبلغ و کلمات فرمان را داخل description نگذار.
چیزی را از خودت اختراع نکن.

action فقط یکی از این موارد است:
add_transaction
get_balance
today_report
highest_debtor
add_customer
unknown

type فقط یکی از این موارد است:
debt
payment
null

نمونه:

فرمان:
۱۵۳ هزار تومان پفک و چیپس برای رضا نسیه ثبت کن

خروجی:
{
  "action": "add_transaction",
  "type": "debt",
  "amount": 153000,
  "customer_name": "رضا",
  "description": "پفک و چیپس",
  "phone": "",
  "needs_confirmation": true,
  "confidence": 0.95,
  "message": ""
}

فرمان واقعی کاربر:
${JSON.stringify(command)}

مشتریان موجود:
${JSON.stringify(customers)}

فقط همین ساختار JSON را برگردان:
{
  "action": "unknown",
  "type": null,
  "amount": 0,
  "customer_name": "",
  "description": "",
  "phone": "",
  "needs_confirmation": true,
  "confidence": 0,
  "message": ""
}
`.trim();

    const model = "gemini-2.5-flash";

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiApiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.05,
            topP: 0.8,
            maxOutputTokens: 1024,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    const geminiData = await geminiResponse
      .json()
      .catch(() => ({}));

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
            geminiData?.error?.message ||
            `ارتباط با Gemini انجام نشد. کد خطا: ${geminiResponse.status}`,
        },
        geminiResponse.status,
      );
    }

    const content =
      geminiData?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) =>
          part?.text ?? ""
        )
        .join("")
        .trim() ?? "";

    if (!content) {
      console.error(
        "Empty Gemini response:",
        JSON.stringify(geminiData),
      );

      return jsonResponse(
        {
          ok: false,
          error: "پاسخ Gemini خالی بود.",
        },
        502,
      );
    }

    let parsed: Record<string, unknown>;

    try {
      parsed = JSON.parse(cleanJson(content));
    } catch (error) {
      console.error(
        "Gemini JSON parse error:",
        error,
        content,
      );

      return jsonResponse(
        {
          ok: false,
          error: "پاسخ Gemini قابل پردازش نبود.",
          raw: content,
        },
        502,
      );
    }

    const allowedActions = [
      "add_transaction",
      "get_balance",
      "today_report",
      "highest_debtor",
      "add_customer",
      "unknown",
    ];

    const requestedAction =
      String(parsed.action ?? "").trim();

    const action = allowedActions.includes(
      requestedAction,
    )
      ? requestedAction
      : "unknown";

    const type =
      parsed.type === "debt" ||
      parsed.type === "payment"
        ? parsed.type
        : null;

    const rawAmount = Number(parsed.amount ?? 0);

    const amount = Number.isFinite(rawAmount)
      ? Math.max(0, Math.round(rawAmount))
      : 0;

    const rawConfidence = Number(
      parsed.confidence ?? 0,
    );

    const confidence =
      Number.isFinite(rawConfidence)
        ? Math.max(0, Math.min(1, rawConfidence))
        : 0;

    const result = {
      action,
      type,
      amount,
      customer_name: normalizeText(
        parsed.customer_name,
      ),
      description: normalizeText(
        parsed.description,
      ),
      phone: String(parsed.phone ?? "").trim(),
      needs_confirmation:
        action === "add_transaction"
          ? true
          : parsed.needs_confirmation !== false,
      confidence,
      message: normalizeText(parsed.message),
    };

    console.log(
      "hesabdar-ai success:",
      JSON.stringify({
        action: result.action,
        type: result.type,
        amount: result.amount,
        customer_name: result.customer_name,
        confidence: result.confidence,
      }),
    );

    return jsonResponse({
      ok: true,
      result,
    });
  } catch (error) {
    console.error(
      "hesabdar-ai unexpected error:",
      error,
    );

    return jsonResponse(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "خطای ناشناخته در دستیار هوشمند.",
      },
      500,
    );
  }
});
// trigger deploy Tue Jul 14 00:22:36 +0330 2026
