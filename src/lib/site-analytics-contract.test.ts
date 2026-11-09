import {describe,it,expect} from 'vitest';
import {topSites,siteSnapshotSchema,type SiteReport} from './site-analytics-contract';
const fixture=(id:string,views:number,likes:number,likeAdapter=true):SiteReport=>({id,name:id,baseUrl:'https://example.test',isActive:true,snapshot:{version:1,from:'2026-11-01',to:'2026-11-28',startedAt:'2026-11-01',visitors:2,views,likes,topViews:[],topLikes:[],publishedVideos:1,nativePlayer:true,iframeTracking:false,likeAdapter},syncedAt:null,error:null,search:null,searchError:null,searchSyncedAt:null});
describe('measured network rankings',()=>{
 it('sorts numeric totals descending and takes exactly five sites',()=>{const rows=[fixture('a',9,90),fixture('b',100,1),fixture('c',50,3),fixture('d',30,4),fixture('e',20,6),fixture('f',10,8)];expect(topSites(rows,'views').map(s=>s.id)).toEqual(['b','c','d','e','f']);expect(topSites(rows,'likes')[0]!.id).toBe('a');});
 it('does not turn missing data or unsupported likes into real zeros',()=>{const a=fixture('a',0,0);const b={...fixture('b',999,999),snapshot:null};const c=fixture('c',500,500,false);expect(topSites([a,b,c],'likes').map(s=>s.id)).toEqual(['a']);});
 it('rejects fabricated formats and invalid negative counters',()=>{expect(siteSnapshotSchema.safeParse({...fixture('a',1,2).snapshot,views:-1}).success).toBe(false);expect(siteSnapshotSchema.safeParse({views:0}).success).toBe(false);});
});
