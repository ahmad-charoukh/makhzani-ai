"use client";
import { FileText } from "lucide-react";
import type { Snapshot } from "./types";
import DraftsPanel from "./drafts-panel";
export default function SettingsPanel({
  data,
  notify,
  changed,
}: {
  data: Snapshot;
  notify: (message: string) => void;
  changed: () => void;
}) {
  return (
    <>
      <DraftsPanel
        data={data}
        changed={() => {
          changed();
          notify("تمت مزامنة المسودة وتحديث المخزون");
        }}
      />
      <div className="management-grid">
        <section className="panel">
          <h2>قراءة الفواتير</h2>
          <p className="muted">
            قراءة الفواتير تلقائيًا غير مفعّلة حاليًا. سجّل البضاعة من طلبات
            البضاعة وراجع الكميات قبل الاستلام.
          </p>
          <span className="badge neutral">
            <FileText size={15} /> غير مفعّل
          </span>
        </section>
        <section className="panel">
          <h2>WhatsApp Business</h2>
          <p className="muted">
            تنبيهات WhatsApp غير مفعّلة حاليًا. يمكنك متابعة النواقص ومواعيد
            الصلاحية داخل مخزني.
          </p>
          <span className="badge neutral">غير متصل</span>
        </section>
      </div>
    </>
  );
}
