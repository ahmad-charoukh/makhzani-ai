import { normalize } from "./domain";
import { rows, type Context } from "./server";
import { snapshot } from "./read-model";
export type ToolCall = {
  name:
    | "searchStock"
    | "lowStock"
    | "dailySummary"
    | "supplierPrices"
    | "draftMovement";
  arguments: Record<string, unknown>;
};
export interface AssistantProvider {
  interpret(text: string, locale: string): Promise<ToolCall>;
}
export interface InvoiceProvider {
  extract(
    image: ArrayBuffer,
    mime: string,
  ): Promise<{
    supplier: string;
    date: string;
    number: string;
    items: { name: string; quantity: number; price: number }[];
    total: number;
    confidence: number;
  }>;
}
export interface VoiceProvider {
  transcribe(audio: ArrayBuffer, locale: "ar" | "tr" | "en"): Promise<string>;
}
export interface WhatsAppProvider {
  sendApprovedTemplate(
    phone: string,
    template: string,
    parameters: string[],
  ): Promise<{ messageId: string }>;
}
export async function answer(c: Context, question: string) {
  const s = normalize(question);
  const stock = await snapshot(c);
  const isLow = /ناقص|اطلب|ينفد|تخلص|low|reorder|eksik/.test(s);
  if (isLow)
    return {
      text: stock.low.length
        ? stock.low
            .map(
              (p) =>
                `${p.name}: ${Number(p.quantity) / 1000} ${p.unit}، حد التنبيه ${Number(p.minimum) / 1000}`,
            )
            .join("\n")
        : "الكميات أعلى من حدود التنبيه حاليًا.",
      mode: "rules",
    };
  if (/اليوم|today|bugun/.test(s)) {
    const today = stock.daily.find(
      (d) => d.day === new Date().toISOString().slice(0, 10),
    );
    return {
      text: today
        ? `دخل اليوم ${Number(today.incoming) / 1000}، وخرج ${Number(today.outgoing) / 1000}. عدد الحركات: ${today.count}.`
        : "لا توجد حركات اليوم بعد.",
      mode: "rules",
    };
  }
  if (/صلاح|expir|son kullan/.test(s))
    return {
      text: stock.expiry.length
        ? stock.expiry
            .map(
              (b) =>
                `${b.name}: ${b.expires} — ${Number(b.quantity) / 1000} ${b.unit}`,
            )
            .join("\n")
        : "لا توجد دفعات تنتهي خلال 30 يومًا.",
      mode: "rules",
    };
  const all = await rows<{
    id: string;
    name: string;
    unit: string;
    quantity: number;
  }>(
    "SELECT p.id,p.name,p.unit,COALESCE(SUM(b.quantity),0) quantity FROM products p LEFT JOIN batches b ON b.product_id=p.id WHERE p.business_id=? AND p.active=1 GROUP BY p.id LIMIT 1000",
    c.business,
  );
  const found = all.filter((p) =>
    normalize(p.name)
      .split(" ")
      .some((w) => w.length > 2 && s.includes(w)),
  );
  if (/ارخص|سعر|cheapest/.test(s) && c.role !== "employee" && found[0]) {
    const prices = await rows(
      "SELECT sp.price,s.name FROM supplier_prices sp JOIN suppliers s ON s.id=sp.supplier_id WHERE sp.business_id=? AND sp.product_id=? AND sp.rowid=(SELECT MAX(x.rowid) FROM supplier_prices x WHERE x.supplier_id=sp.supplier_id AND x.product_id=sp.product_id) ORDER BY sp.price",
      c.business,
      found[0].id,
    );
    return {
      text: prices.length
        ? prices.map((p) => `${p.name}: ${Number(p.price) / 100}`).join("\n")
        : "لا توجد أسعار مسجلة لهذا المنتج بعد.",
      mode: "rules",
    };
  }
  if (found.length === 1) {
    const p = found[0];
    const qty = Number(s.match(/\d+(?:\.\d+)?/)?.[0]);
    if (qty > 0 && /دخل|ادخل|اخرج|خرج|add|remove/.test(s))
      return {
        text: "راجع المنتج والكمية ثم أكد العملية.",
        draft: {
          productId: p.id,
          quantity: qty,
          kind: /اخرج|خرج|remove/.test(s) ? "out" : "in",
        },
        mode: "rules",
      };
    return {
      text: `لديك ${p.quantity / 1000} ${p.unit} من ${p.name}.`,
      mode: "rules",
    };
  }
  return {
    text:
      found.length > 1
        ? "وجدت أكثر من منتج؛ اكتب الاسم كاملًا."
        : "يمكنك أن تسأل: شو ناقص؟ شو صار اليوم؟ أو قديش عندي مع اسم المنتج. المساعد الحالي يعتمد على قواعد واضحة؛ الربط بنموذج لغوي متاح عبر واجهة مزوّد مستقلة.",
    mode: "rules",
  };
}
