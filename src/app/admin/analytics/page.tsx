import { requireMinRole } from '@/lib/authz';
import { SiteAnalyticsPanel } from '@/components/admin/SiteAnalyticsPanel';
export default async function Page(){await requireMinRole('MANAGER');return <SiteAnalyticsPanel/>;}
