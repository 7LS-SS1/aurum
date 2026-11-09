import {redirect} from "next/navigation";
import {getViewerFromCookies} from "@/lib/viewer-auth";
import {getServicePage} from "@/lib/service-page-store";
import {WebsiteServiceRequests} from "@/components/services/WebsiteServiceRequests";
import {MemberShell} from "@/components/public/ServiceChrome";
export const dynamic="force-dynamic";
export const metadata={title:"บริการ Website API ของฉัน | AURUM",robots:{index:false,follow:false}};
export default async function Page(){if(!await getViewerFromCookies())redirect("/login?callbackUrl=%2Faccount%2Fwebsite-services");const {config}=await getServicePage();return <MemberShell><main style={{maxWidth:1000,margin:"2rem auto",padding:24}}><a href="/account">← บัญชีของฉัน</a><WebsiteServiceRequests config={config}/></main></MemberShell>;}
