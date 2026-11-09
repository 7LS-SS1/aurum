import {requireMinRole} from "@/lib/authz";
import {WebsiteServiceRequests} from "@/components/services/WebsiteServiceRequests";
export default async function Page(){await requireMinRole("MANAGER");return <WebsiteServiceRequests admin/>;}
