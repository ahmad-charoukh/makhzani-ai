"use client";
import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { ArrowUpRight, Search, Warehouse } from "lucide-react";
import { ErrorBox, Modal, ProductIcon } from "./primitives";
import { get, number, type Product, type Snapshot } from "./types";

export default function CommandMenu({data, pages, close, navigate, action, product, warehouse}: {
  data: Snapshot;
  pages: readonly {key: string; label: string}[];
  close: () => void;
  navigate: (view: string) => void;
  action: (kind: string) => void;
  product: (p: Product) => void;
  warehouse: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const term = query.trim().toLocaleLowerCase();
  useEffect(() => {
    if (!term) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void get("dashboard&q=" + encodeURIComponent(term), controller.signal)
        .then(result => { if (!controller.signal.aborted) setProducts(result.products.slice(0,8)); })
        .catch(e => { if (!controller.signal.aborted) setError((e as Error).message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 180);
    return () => {clearTimeout(timer);controller.abort();};
  }, [term]);
  const matches = (text: string) => !term || text.toLocaleLowerCase().includes(term);
  const actions = [
    {key:"in",label:"إدخال مخزون",keywords:"stock in giriş"},
    {key:"out",label:"إخراج مخزون",keywords:"stock out çıkış"},
    {key:"count",label:"جرد المخزون",keywords:"inventory count sayım"},
    {key:"transfer",label:"نقل بين المستودعات",keywords:"transfer aktarım"},
    ...(data.role !== "employee" ? [{key:"product",label:"إضافة منتج",keywords:"new product ürün"}] : []),
  ].filter(item=>matches(item.label+" "+item.keywords));
  const warehouses = data.warehouses.filter(w=>matches(w.name+" "+w.branch));
  const destinations = pages.filter(p=>matches(p.label+" "+p.key));
  return <Modal title="البحث والأوامر السريعة" close={close}>
    <Command className="mk-command" shouldFilter={false} loop>
      <div className="command-search"><Search size={20} aria-hidden="true" />
        <Command.Input autoFocus value={query} onValueChange={value=>{setQuery(value);setProducts([]);setError("");setLoading(!!value.trim());}} placeholder="ابحث عن منتج، مستودع، صفحة أو عملية…" aria-label="البحث السريع" />
      </div>
      <ErrorBox error={error}/>
      {loading && <div className="command-loading" role="status">جارٍ البحث في المنتجات…</div>}
      <Command.List aria-label="نتائج البحث والأوامر">
        {!loading && !error && <Command.Empty>لا توجد نتائج. جرّب اسم المنتج أو الباركود.</Command.Empty>}
        {!!products.length && <Command.Group heading="المنتجات">
          {products.map(p=><Command.Item key={p.id} value={"product:"+p.id} onSelect={()=>product(p)}>
            <ProductIcon p={p}/><span><b>{p.name}</b><small>{p.sku || p.barcode || "بدون رمز"}</small></span>
            <span className="command-meta">{number(p.quantity/1000)} {p.unit}</span>
          </Command.Item>)}
        </Command.Group>}
        {!!actions.length && <Command.Group heading="عملية جديدة">{actions.map(item=><Command.Item key={item.key} value={"action:"+item.key} onSelect={()=>action(item.key)}><ArrowUpRight size={18}/><span>{item.label}</span></Command.Item>)}</Command.Group>}
        {!!destinations.length && <Command.Group heading="الصفحات">{destinations.map(p=><Command.Item key={p.key} value={"page:"+p.key} onSelect={()=>navigate(p.key)}><Search size={17}/><span>{p.label}</span></Command.Item>)}</Command.Group>}
        {!!warehouses.length && <Command.Group heading="المستودعات">{warehouses.map(w=><Command.Item key={w.id} value={"warehouse:"+w.id} onSelect={()=>warehouse(w.id)}><Warehouse size={18}/><span>{w.name}<small>{w.branch}</small></span></Command.Item>)}</Command.Group>}
      </Command.List>
      <div className="command-footer"><span>↑ ↓ للتنقل · Enter للاختيار</span><span>Esc للإغلاق</span></div>
    </Command>
  </Modal>;
}
