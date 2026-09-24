"use client";
/* Images are optimized on upload; authenticated private URLs must not use a public optimizer. */
/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from "react";
import { CircleAlert, Package, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import type { Product } from "./types";
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
}) {
  const returnFocus = useRef<HTMLElement | null>(
    typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent
        className="mk-dialog"
        dir="rtl"
        showCloseButton={false}
        onCloseAutoFocus={(event) => {
          if (returnFocus.current?.isConnected) {
            event.preventDefault();
            returnFocus.current.focus();
          }
        }}
      >
        <div className="modal-heading">
          <DialogTitle>{title}</DialogTitle>
          <DialogClose asChild>
            <button
              type="button"
              className="icon-button"
              aria-label="إغلاق النافذة"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </DialogClose>
        </div>
        <DialogDescription className="sr-only">
          أكمل الحقول وراجع المعلومات قبل التأكيد
        </DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function ProductIcon({ p }: { p: Partial<Product> }) {
  const [failedImage, setFailedImage] = useState<string>();
  return (
    <span className={`product-thumb tone-${(p.name?.length || 1) % 5}`}>
      {p.image_id && failedImage !== p.image_id ? (
        <img
          src={"/api/images/" + p.image_id}
          alt={p.name || ""}
          loading="lazy"
          decoding="async"
          onError={() => setFailedImage(p.image_id)}
        />
      ) : (
        <Package size={25} aria-hidden="true" />
      )}
    </span>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
}
export function Empty({
  text = "لا توجد بيانات بعد",
  children,
}: {
  text?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Package size={36} aria-hidden="true" />
      <h3>{text}</h3>
      {children}
    </div>
  );
}
export function ErrorBox({ error }: { error: string }) {
  return error ? (
    <div className="error-box" role="alert" aria-atomic="true">
      <CircleAlert size={18} aria-hidden="true" />
      <span>
        {/failed to fetch|fetch failed|networkerror|load failed/i.test(error)
          ? "تعذر الاتصال. تحقق من اتصالك بالإنترنت ثم حاول مجددًا."
          : /unexpected token|json|syntaxerror/i.test(error)
            ? "تعذر قراءة استجابة الخادم. حاول مجددًا بعد قليل."
            : error}
      </span>
    </div>
  ) : null;
}
