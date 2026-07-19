"use client";

import { type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface SectionHeaderProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  align?: "left" | "center";
}

export function SectionHeader({
  className,
  title,
  description,
  align = "center",
  ...props
}: SectionHeaderProps) {
  return (
    <div
      className={cn("mb-12", align === "center" && "text-center max-w-2xl mx-auto", className)}
      {...props}
    >
      <h2 className="text-3xl font-display font-bold text-[var(--text-primary)]">{title}</h2>
      {description && (
        <p className="mt-3 text-lg text-[var(--text-secondary)] leading-relaxed">{description}</p>
      )}
    </div>
  );
}
