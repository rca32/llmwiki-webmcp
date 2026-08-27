import { describe,expect,it } from 'vitest';
import { extractWikiLinks,operationId,slugify,stableJson } from './validation';

describe('wiki validation',()=>{
  it('normalizes safe Unicode slugs and strips path separators',()=>{ expect(slugify(' 운영 / 복구 가이드 ')).toBe('운영-복구-가이드'); });
  it('rejects non UUID operation identifiers',()=>{ expect(()=>operationId('retry-me')).toThrow(/operation_id/); });
  it('deduplicates wikilinks while preserving their text',()=>{ expect(extractWikiLinks('[[아키텍처]] [[아키텍처|설계]] [[운영]]')).toEqual(['아키텍처','운영']); });
  it('stabilizes object key order for idempotency hashes',()=>{ expect(stableJson({b:2,a:{d:4,c:3}})).toBe(stableJson({a:{c:3,d:4},b:2})); });
});
