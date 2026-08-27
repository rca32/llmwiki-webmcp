import { describe,expect,it } from 'vitest';
import { capabilitiesFor } from './contracts';

describe('role capability matrix',()=>{
  it('keeps anonymous and viewer sessions read-only',()=>{expect(capabilitiesFor(null)).toMatchObject({can_read:false,can_write:false,can_import:false});expect(capabilitiesFor('viewer')).toMatchObject({can_read:true,can_write:false,can_restore:false,can_manage_attachments:false,can_soft_delete:false});});
  it('allows editors to mutate content but not members or full backups',()=>{expect(capabilitiesFor('editor')).toMatchObject({can_read:true,can_write:true,can_restore:true,can_manage_attachments:true,can_soft_delete:true,can_manage_members:false,can_full_backup:false,can_import:false});});
  it('reserves membership, full backup, and import administration for owners',()=>{expect(capabilitiesFor('owner')).toMatchObject({can_write:true,can_manage_members:true,can_full_backup:true,can_import:true});});
  it('grants bootstrap separately from active-wiki permissions',()=>{expect(capabilitiesFor(null,true)).toMatchObject({can_bootstrap:true,can_read:false,can_write:false,can_import:false});});
});
