export interface PC {
  id: number;
  name: string;
  ip_local: string | null;
  online: boolean;
  locked: boolean;
  protected: boolean;
  agent_version: string | null;
  last_seen: string | null;
  group_id: number | null;
}

export type Target = number | number[] | 'all' | { group_id: number };

export interface Group {
  id: number;
  name: string;
  pc_count: number;
}

export interface Program {
  id: number;
  slug: string;
  name: string;
  icon: string | null;
  description: string | null;
  is_active: boolean;
}

export interface CommandRequest {
  command_type: string;
  target_type: 'single' | 'multi' | 'all' | 'group';
  target_pc_id?: number;
  target_pc_ids?: number[];
  target_group_id?: number;
  params?: Record<string, unknown>;
}

export interface AgentToken {
  id: number;
  name: string;
  is_active: boolean;
  pc_id: number | null;
  last_used: string | null;
  created_at: string;
}

export interface CommandResponse {
  command_id: string;
  trace_id: string;
  status: string;
  target_count: number;
}

export interface CommandResultItem {
  pc_id: number;
  pc_name: string;
  success: boolean;
  error: string | null;
  executed_at: string | null;
  result_data: string | null;
}

export interface CommandStatus {
  command_id: string;
  command_type: string;
  status: string;
  results: CommandResultItem[];
  success_count: number;
  fail_count: number;
  created_at: string;
  completed_at: string | null;
}
