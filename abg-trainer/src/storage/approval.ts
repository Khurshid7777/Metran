import type { ApprovalRecord } from '../core/approval';
import { load, save } from './index';

export const getApprovals = (): Record<string, ApprovalRecord> => load<Record<string, ApprovalRecord>>('approvals', {});
export const saveApprovals = (a: Record<string, ApprovalRecord>) => save('approvals', a);
export const getApprover = (): string => load<string>('approver', '');
export const saveApprover = (name: string) => save('approver', name);
