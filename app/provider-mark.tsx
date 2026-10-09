import type { ProviderColours } from "@/lib/models";

// The provider's name in a small coloured mark. Names, not logos: the marks
// are text on a tinted pill, so they need no image file and make no claim to
// be anyone's brand asset.
export function ProviderMark({ provider, colours }: { provider: string; colours: ProviderColours }) {
  const tint = colours[provider];
  return (
    <span
      className="inline-block rounded-full px-2 py-px text-[11.5px] font-semibold leading-snug"
      style={tint ? { background: tint.background, color: tint.text } : undefined}
    >
      {provider}
    </span>
  );
}
