import { ServiceSelection } from "@/components/services/ServiceSelection";
import { RegisteredSiteShowcase } from "@/components/services/RegisteredSiteShowcase";
export const metadata = { title: "เลือกบริการ | AURUM" };
export const dynamic = "force-dynamic";
export default function SelectServicePage() { return <main><ServiceSelection/><RegisteredSiteShowcase/></main>; }
