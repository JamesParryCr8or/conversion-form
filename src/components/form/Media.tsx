import {
  Briefcase, Building2, Calendar, Camera, Check, Clock, Globe, Heart, Home, Lightbulb, Mail, Megaphone,
  MessageCircle, Phone, Rocket, Search, Settings, ShieldCheck, ShoppingCart, Sparkles, Star, Target,
  ThumbsUp, TrendingUp, Users, Wrench, Zap, type LucideIcon,
} from "lucide-react";

/** Curated icon set (keeps the public bundle small). Anything else renders as text/emoji. */
const ICONS: Record<string, LucideIcon> = {
  briefcase: Briefcase, building: Building2, calendar: Calendar, camera: Camera, check: Check, clock: Clock,
  globe: Globe, heart: Heart, home: Home, lightbulb: Lightbulb, mail: Mail, megaphone: Megaphone,
  message: MessageCircle, phone: Phone, rocket: Rocket, search: Search, settings: Settings,
  shield: ShieldCheck, cart: ShoppingCart, sparkles: Sparkles, star: Star, target: Target,
  thumbsup: ThumbsUp, trending: TrendingUp, users: Users, wrench: Wrench, zap: Zap,
};

export type MediaValue =
  | { kind: "image"; url: string; alt?: string }
  | { kind: "icon"; name: string }
  | undefined;

export function Media({ media, className = "" }: { media: MediaValue; className?: string }) {
  if (!media) return null;
  if (media.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={media.url} alt={media.alt ?? ""} className={`rounded-xl object-cover ${className}`} loading="lazy" />;
  }
  const Icon = ICONS[media.name.toLowerCase()];
  return Icon ? <Icon aria-hidden className={className} /> : <span aria-hidden className={className}>{media.name}</span>;
}
