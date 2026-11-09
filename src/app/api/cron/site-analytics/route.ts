import { NextRequest } from 'next/server';
import { requireSystemKey } from '@/lib/authz';
import { jsonOk,apiError } from '@/lib/api-response';
import { syncNextAnalyticsSite } from '@/lib/site-analytics';
export async function POST(req:NextRequest){try{requireSystemKey(req);return jsonOk(await syncNextAnalyticsSite());}catch(e){return apiError(e);}}
