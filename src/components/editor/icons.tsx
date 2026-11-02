import {
  AlignLeft, BarChart3, Calendar, CheckSquare, ChevronDown, EyeOff, Hash, Heading, Image as ImageIcon, List, ListChecks,
  Mail, MapPin, Phone, PoundSterling, Star, TextCursorInput, ToggleLeft, type LucideIcon,
} from "lucide-react";
import type { Question } from "@/lib/funnel/schema";

export const BLOCK_ICONS: Record<string, LucideIcon> = {
  mail: Mail, phone: Phone, "map-pin": MapPin, "text-cursor": TextCursorInput, "align-left": AlignLeft, list: List,
  image: ImageIcon, "list-checks": ListChecks, "chevron-down": ChevronDown, "toggle-left": ToggleLeft, hash: Hash,
  "pound-sterling": PoundSterling, calendar: Calendar, star: Star, "bar-chart": BarChart3, heading: Heading,
  "check-square": CheckSquare, "eye-off": EyeOff,
};

/** Icon for a question already in the form. */
export function iconFor(q: Question): LucideIcon {
  switch (q.type) {
    case "email": return Mail;
    case "phone": return Phone;
    case "address": return MapPin;
    case "short_text": return TextCursorInput;
    case "long_text": return AlignLeft;
    case "single_choice": return q.layout === "cards" ? ImageIcon : List;
    case "multiple_choice": return ListChecks;
    case "dropdown": return ChevronDown;
    case "yes_no": return ToggleLeft;
    case "number": return q.prefix === "£" ? PoundSterling : Hash;
    case "date": return Calendar;
    case "rating": return Star;
    case "statement": return Heading;
    case "consent": return CheckSquare;
    case "hidden": return EyeOff;
  }
}
