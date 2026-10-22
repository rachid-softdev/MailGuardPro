import type { Metadata } from "next";
import { PricingPage } from "@/components/marketing/PricingPage";

export const metadata: Metadata = {
  title: "Pricing — MailGuard Pro",
  description:
    "Simple, honest email validation pricing. Start free with 100 inspections per month, then choose the volume that fits your list.",
};

export default function Page() {
  return <PricingPage />;
}
