import {describe,it,expect,vi,afterEach} from 'vitest';
import {searchBinding} from './search-console';
afterEach(()=>vi.unstubAllEnvs());
describe('Search Console multi-account mapping',()=>{
 it('allows properties under different Google owners to use separate identities',()=>{vi.stubEnv('SEARCH_CONSOLE_PROPERTIES_JSON',JSON.stringify({a:{property:'sc-domain:one.test',account:'ownerA'},b:{property:'https://two.test/',account:'ownerB'}}));expect(searchBinding('a')?.account).toBe('ownerA');expect(searchBinding('b')?.account).toBe('ownerB');expect(searchBinding('missing')).toBeNull();});
 it('supports one shared read-only identity across properties',()=>{vi.stubEnv('SEARCH_CONSOLE_PROPERTIES_JSON',JSON.stringify({a:{property:'sc-domain:one.test'},b:{property:'sc-domain:two.test'}}));expect(searchBinding('a')?.account).toBe('default');expect(searchBinding('b')?.account).toBe('default');});
});
