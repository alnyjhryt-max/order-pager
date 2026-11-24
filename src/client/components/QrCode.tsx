import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Spinner } from "@/client/components/ui/spinner";

/** A QR code for `value`, drawn in the browser. */
export function QrCode({
  value,
  label,
  size = 220,
}: {
  value: string;
  label: string;
  size?: number;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void QRCode.toDataURL(value, { width: size, margin: 1 }).then((url) => {
      if (live) setSrc(url);
    });
    return () => {
      live = false;
    };
  }, [value, size]);
  if (!src)
    return (
      <div
        className="flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <Spinner />
      </div>
    );
  return (
    <img
      src={src}
      alt={label}
      width={size}
      height={size}
      className="rounded-md border border-border"
    />
  );
}
