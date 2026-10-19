import { SiteNav } from "@/components/SiteNav";
import { Hero } from "@/components/Hero";
import {
  AestheticSection,
  CollectionsSection,
  TasteSection,
  ShareSection,
  ClicksSection,
} from "@/components/FeatureSections";
import { FinalCTA } from "@/components/FinalCTA";
import { SiteFooter } from "@/components/SiteFooter";

export default function Page() {
  return (
    <>
      <SiteNav />
      <main id="main">
        <Hero />
        <AestheticSection />
        <CollectionsSection />
        <TasteSection />
        <ShareSection />
        <ClicksSection />
        <FinalCTA />
      </main>
      <SiteFooter />
    </>
  );
}
