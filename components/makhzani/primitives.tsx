"use client";
/* Images are optimized on upload; authenticated private URLs must not use a public optimizer. */
/* eslint-disable @next/next/no-img-element */
import { Package, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
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
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="mk-dialog" dir="rtl">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="sr-only">
          أكمل الحقول وراجع المعلومات قبل التأكيد
        </DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function ProductIcon({ p }: { p: Partial<Product> }) {
  return (
    <span className={`product-thumb tone-${(p.name?.length || 1) % 5}`}>
      {p.image_id ? (
        <img
          src={"/api/images/" + p.image_id}
          alt={p.name || ""}
          loading="lazy"
        />
      ) : (
        <Package size={25} />
      )}
    </span>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
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
      <Package size={36} />
      <h3>{text}</h3>
      {children}
    </div>
  );
}
export function ErrorBox({ error }: { error: string }) {
  return error ? (
    <div className="error-box" role="alert">
      <X size={18} />
      {error}
    </div>
  ) : null;
}
