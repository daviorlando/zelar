"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/zelar/button";

export function PrintButton() {
  return (
    <Button type="button" variant="primary" onClick={() => window.print()}>
      <Printer className="size-4" aria-hidden /> Imprimir
    </Button>
  );
}
