"use client";
import { useEffect, useRef } from "react";
import { number } from "./types";

export function AnimatedNumber({value}: {value:number}) {
  const node = useRef<HTMLSpanElement>(null);
  const previous = useRef(0);
  useEffect(()=>{
    const from=previous.current;
    previous.current=value;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      if(node.current) node.current.textContent=number(value);
      return;
    }
    const start=performance.now();
    let frame=0;
    const tick=(now:number)=>{
      const progress=Math.min(1,(now-start)/420);
      if(node.current) node.current.textContent=number(from+(value-from)*(1-Math.pow(1-progress,3)));
      if(progress<1)frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(frame);
  },[value]);
  return <><span className="sr-only">{number(value)}</span><span ref={node} aria-hidden="true">{number(value)}</span></>;
}
