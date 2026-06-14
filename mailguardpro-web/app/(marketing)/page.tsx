"use client";

import { ABTestProvider, useABTest } from "@/components/marketing/landing/ABTestProvider";
import { VariantA } from "@/components/marketing/landing/VariantA";
import { VariantB } from "@/components/marketing/landing/VariantB";

function LandingPageContent() {
  const { variant } = useABTest();
  return variant === "A" ? <VariantA /> : <VariantB />;
}

export default function LandingPage() {
  return (
    <ABTestProvider>
      <LandingPageContent />
    </ABTestProvider>
  );
}
