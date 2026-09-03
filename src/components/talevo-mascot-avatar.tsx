import Image from "next/image";
import { Sparkles } from "lucide-react";

export type MascotAvatarSize = "xs" | "sm" | "md" | "lg";

export function TalevoMascotAvatar({
  size = "sm",
  className = "",
  priority = false,
  decorative = true,
  alt = "TALEVO AI",
  showSparkle = false,
}: {
  size?: MascotAvatarSize;
  className?: string;
  priority?: boolean;
  decorative?: boolean;
  alt?: string;
  showSparkle?: boolean;
}) {
  const isLg = size === "lg";
  const isSm = size === "sm";
  const imageSizes = isLg
    ? "(max-width: 699px) 68px, 80px"
    : isSm
      ? "(max-width: 699px) 44px, 50px"
      : "34px";

  return (
    <span
      className={`talevo-mascot-avatar avatar-${size} ${className}`.trim()}
      aria-hidden={decorative ? "true" : undefined}
    >
      <span className="talevo-avatar-bg" aria-hidden="true" />
      <span className="talevo-avatar-inner">
        {/* Approved base asset: /brand/talevo-mascot-head.png (legacy reference) */}
        {/* Official AI Logo: /brand/talevo-ai-logo.png (1160x1160 safe canvas) */}
        <Image
          src="/brand/talevo-ai-logo.png"
          alt={decorative ? "" : alt}
          width={1160}
          height={1160}
          className="talevo-avatar-img"
          sizes={imageSizes}
          priority={priority}
          loading={priority ? "eager" : "lazy"}
        />
      </span>
      {showSparkle && (
        <span className="talevo-avatar-sparkle" aria-hidden="true">
          <Sparkles />
        </span>
      )}
    </span>
  );
}
