"use client";
import { useEffect, useRef, useState } from "react";
import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";
import { ErrorBox } from "./primitives";
export default function Scanner({
  onScan,
}: {
  onScan: (text: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const callback = useRef(onScan);
  const [error, setError] = useState("");
  useEffect(() => {
    callback.current = onScan;
  }, [onScan]);
  useEffect(() => {
    let controls: IScannerControls | undefined;
    let done = false;
    const reader = new BrowserMultiFormatReader();
    reader
      .decodeFromVideoDevice(undefined, video.current!, (result) => {
        if (result && !done) {
          done = true;
          controls?.stop();
          callback.current(result.getText());
        }
      })
      .then((c) => {
        controls = c;
        if (done) c.stop();
      })
      .catch(() =>
        setError("تعذر فتح الكاميرا. اسمح بالوصول أو أدخل الباركود يدويًا."),
      );
    return () => {
      done = true;
      controls?.stop();
    };
  }, []);
  return (
    <div>
      <video ref={video} className="scanner-video" muted playsInline />
      <ErrorBox error={error} />
      <p className="muted">وجّه الكاميرا نحو الباركود أو QR</p>
    </div>
  );
}
