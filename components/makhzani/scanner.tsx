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
  const [starting, setStarting] = useState(true);
  const [attempt, setAttempt] = useState(0);
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
        else setStarting(false);
      })
      .catch(() => {
        if (done) return;
        setStarting(false);
        setError("تعذر فتح الكاميرا. اسمح بالوصول أو أدخل الباركود يدويًا.");
      });
    return () => {
      done = true;
      controls?.stop();
    };
  }, [attempt]);
  return (
    <div className="scanner-frame">
      <video
        ref={video}
        className="scanner-video"
        muted
        playsInline
        aria-label="معاينة الكاميرا لمسح الباركود"
      />
      {starting && (
        <p className="muted" role="status">
          جارٍ تشغيل الكاميرا…
        </p>
      )}
      <ErrorBox error={error} />
      {error && (
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setError("");
            setStarting(true);
            setAttempt((value) => value + 1);
          }}
        >
          إعادة تشغيل الكاميرا
        </button>
      )}
      <p className="muted">وجّه الكاميرا نحو الباركود أو QR</p>
    </div>
  );
}
