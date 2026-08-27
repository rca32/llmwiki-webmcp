import { describe,expect,it } from 'vitest';
import { readTools,writeTools } from './site-tools';

describe('WebMCP descriptor contract',()=>{
  const tools=[...readTools(),...writeTools()];
  it('has stable unique names',()=>{ const names=tools.map((tool)=>tool.name); expect(new Set(names).size).toBe(names.length); expect(names).toEqual(['wiki_get_context','wiki_list_pages','wiki_search','wiki_get_page','wiki_get_neighbors','wiki_list_revisions','wiki_create_page','wiki_update_page','wiki_append_page','wiki_move_page','wiki_link_pages','wiki_restore_revision']); });
  it('closes every top-level input schema',()=>{ for(const tool of tools)expect(tool.inputSchema.additionalProperties,tool.name).toBe(false); });
  it('marks reads and mutations accurately',()=>{ for(const tool of readTools())expect(tool.annotations.readOnlyHint,tool.name).toBe(true); for(const tool of writeTools())expect(tool.annotations.readOnlyHint,tool.name).toBe(false); });
  it('requires concurrency and idempotency for existing-page writes',()=>{ for(const tool of writeTools().filter((item)=>item.name!=='wiki_create_page')){ const required=tool.inputSchema.required as string[]; expect(required,tool.name).toContain('expected_version'); expect(required,tool.name).toContain('operation_id'); } });
});
