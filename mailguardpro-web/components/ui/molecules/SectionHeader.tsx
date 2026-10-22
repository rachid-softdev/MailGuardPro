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
      className={cn("mb-10", align === "center" && "text-center max-w-2xl mx-auto", className)}
      {...props}
    >
      <h2 className="text-2xl font-display font-semibold text-[var(--ink)] md:text-3xl">{title}</h2>
      {description && (
        <p className="mt-2 max-w-[62ch] text-base text-[var(--ink-2)] leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
}
