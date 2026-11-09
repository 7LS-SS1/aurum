import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireMinRole } from '@/lib/authz';
import { apiError, ApiError, jsonOk } from '@/lib/api-response';
import { readSiteAnalytics, syncSiteAnalytics } from '@/lib/site-analytics';
import { readServicePageBody,servicePageOriginAllowed } from '@/lib/service-page-request';
export async function GET(){try{await requireMinRole('MANAGER');return jsonOk({sites:await readSiteAnalytics()},{headers:{'Cache-Control':'private, no-store'}});}catch(e){return apiError(e);}}
export async function POST(req:NextRequest){try{await requireMinRole('MANAGER');if(!servicePageOriginAllowed(req.headers.get('origin'),req.url))throw new ApiError('invalid_origin',403);const {siteId}=z.object({siteId:z.string().min(1).max(100)}).strict().parse(await readServicePageBody(req));return jsonOk(await syncSiteAnalytics(siteId));}catch(e){return apiError(e);}}
