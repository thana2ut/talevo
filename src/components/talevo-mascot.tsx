import Image from "next/image";
import { MASCOT_ASSETS, type MascotCrop, type MascotVariant } from "@/lib/mascot";

export type MascotSize = "xs" | "sm" | "md" | "lg" | "hero";

export function TalevoMascot({ variant = "neutral", crop = "full", size = "md", priority = false, decorative = false, alt, className = "", sizes }: { variant?: MascotVariant; crop?: MascotCrop; size?: MascotSize; priority?: boolean; decorative?: boolean; alt?: string; className?: string; sizes?: string }) {
  const asset = MASCOT_ASSETS[variant][crop];
  const defaultAlt = crop === "head" ? "มาสคอต TALEVO ส่วนศีรษะ" : crop === "upper" ? "มาสคอต TALEVO ช่วงบน" : "มาสคอต TALEVO เต็มตัว";
  const responsiveSizes = sizes ?? (size === "hero" ? "(max-width: 699px) 260px, (max-width: 1023px) 300px, 350px" : size === "lg" ? "(max-width: 699px) 150px, 230px" : size === "md" ? "112px" : size === "sm" ? "76px" : "48px");
  return (
    <span className={`talevo-mascot talevo-mascot-${size} talevo-mascot-${crop} ${className}`.trim()} aria-hidden={decorative || undefined}>
      <span className="talevo-mascot-frame">
        <Image src={asset.src} alt={decorative ? "" : alt ?? defaultAlt} width={asset.width} height={asset.height} sizes={responsiveSizes} preload={priority} loading={priority ? "eager" : "lazy"} />
      </span>
    </span>
  );
}
