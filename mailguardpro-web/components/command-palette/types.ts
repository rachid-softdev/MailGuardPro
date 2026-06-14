import { LucideIcon } from "lucide-react";

export type CommandCategory = "navigation" | "actions";

export interface Command {
  id: string;
  label: string;
  description: string;
  category: CommandCategory;
  icon: LucideIcon | null;
  keywords: string[];
  handler: () => void;
  shortcut?: string;
}
