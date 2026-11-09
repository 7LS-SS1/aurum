import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({site:vi.fn(),previous:vi.fn(),upsert:vi.fn(),claim:vi.fn(),update:vi.fn(),search:vi.fn(),decrypt:vi.fn()}));
vi.mock('./prisma',()=>({prisma:{targetSite:{findUniqueOrThrow:mocks.site},siteAnalytics:{findUnique:mocks.previous,upsert:mocks.upsert,updateMany:mocks.claim,update:mocks.update}}}));
vi.mock('./crypto',()=>({decrypt:mocks.decrypt}));
vi.mock('./search-console',()=>({fetchSearchConsole:mocks.search}));
import {syncSiteAnalytics} from './site-analytics';
beforeEach(()=>{vi.resetAllMocks();mocks.site.mockResolvedValue({id:'site',isActive:true,baseUrl:'https://example.test',authType:'APP_PASSWORD',wpUsername:'test',credentialEnc:'x',credentialIv:'x',credentialTag:'x'});mocks.previous.mockResolvedValue({searchSyncedAt:new Date()});mocks.claim.mockResolvedValue({count:1});mocks.decrypt.mockReturnValue('secret-test-only');});
describe('destination snapshot sync',()=>{
 it('preserves successful data when a remote endpoint fails; never writes fake zeros',async()=>{const fetcher=vi.fn().mockResolvedValue({ok:false,status:403});vi.stubGlobal('fetch',fetcher);await syncSiteAnalytics('site');expect(mocks.update).toHaveBeenCalledWith({where:{siteId:'site'},data:{error:'wp_http_403'}});expect(fetcher.mock.calls[0]![1].redirect).toBe('error');vi.unstubAllGlobals();});
 it('does not fetch a site already claimed by another worker',async()=>{mocks.claim.mockResolvedValue({count:0});const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);expect(await syncSiteAnalytics('site')).toEqual({siteId:'site',skipped:true});expect(fetcher).not.toHaveBeenCalled();vi.unstubAllGlobals();});
 it('does not overwrite metrics with malformed remote data',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({views:0})}));await syncSiteAnalytics('site');expect(mocks.update.mock.calls[0]![0].data).toEqual({error:'connection_or_format_error'});vi.unstubAllGlobals();});
 it('refuses to send WordPress credentials over HTTP',async()=>{mocks.site.mockResolvedValue({isActive:true,baseUrl:'http://example.test'});const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);await syncSiteAnalytics('site');expect(fetcher).not.toHaveBeenCalled();expect(mocks.update.mock.calls[0]![0].data.error).toBe('https_required');vi.unstubAllGlobals();});
});

